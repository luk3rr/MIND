/*
 * Filename: service.test.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { image } from "../db/workspace-schema.js";
import { World } from "../test/world.js";
import { setLogLevel } from "../logging.js";
import { LARGE_IMAGE_BYTES } from "./probe.js";

let world: World | undefined;
const scratch: string[] = [];
afterEach(async () => {
  await world?.close();
  world = undefined;
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const fixture = (name: string): Buffer => readFileSync(join(import.meta.dirname, "fixtures", name));
const images = (w: World) => w.rig.core.images(w.workspaceId);
const setup = (): World => (world = new World());
const filesOf = (w: World): string[] => {
  const directory = images(w).directory;
  return existsSync(directory) ? readdirSync(directory) : [];
};

/** A valid PNG padded after its end chunk so that it weighs `size` bytes. */
const heavy = (size: number): Buffer =>
  Buffer.concat([fixture("square.png"), Buffer.alloc(size - fixture("square.png").length)]);

describe("ImageService.put", () => {
  it("stores an image by its hash and describes it (FR-1, FR-6)", () => {
    const w = setup();
    const result = images(w).put({ bytes: fixture("square.png") });
    expect(result).toMatchObject({
      stored: true,
      info: { mime: "image/png", width: 16, height: 12, animated: false },
    });
    if (!result.stored) throw new Error("not stored");
    expect(result.ref.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(filesOf(w)).toEqual([`${result.ref.hash}.png`]);
    expect(w.db.select().from(image).all()).toHaveLength(1);
  });

  it("keeps one file when the same picture is attached twice (FR-6)", () => {
    const w = setup();
    const first = images(w).put({ bytes: fixture("square.png") });
    const second = images(w).put({ bytes: fixture("square.png") });
    expect(second).toMatchObject({ stored: true, ref: (first as { ref: object }).ref });
    expect(filesOf(w)).toHaveLength(1);
    expect(w.db.select().from(image).all()).toHaveLength(1);
  });

  it("reads a file chosen with the native dialog by its path", () => {
    const w = setup();
    const dir = mkdtempSync(join(tmpdir(), "mind-img-"));
    scratch.push(dir);
    const path = join(dir, "chosen.jpg");
    writeFileSync(path, fixture("photo.jpg"));
    expect(images(w).put({ path })).toMatchObject({ stored: true, info: { mime: "image/jpeg" } });
    expect(() => images(w).put({ path: join(dir, "missing.png") })).toThrowError(
      expect.objectContaining({ code: "FILE_MISSING" }),
    );
    expect(() => images(w).put({ path: dir })).toThrowError(
      expect.objectContaining({ code: "FILE_MISSING" }),
    );
  });

  it.each([
    ["vector.svg", "IMAGE_UNSUPPORTED"],
    ["truncated.png", "IMAGE_CORRUPT"],
    ["huge-pixels.png", "IMAGE_TOO_LARGE"],
  ])("refuses %s with %s and writes nothing (FR-4, NFR-2)", (name, code) => {
    const w = setup();
    expect(() => images(w).put({ bytes: fixture(name) })).toThrowError(
      expect.objectContaining({ code }),
    );
    expect(filesOf(w)).toEqual([]);
    expect(w.db.select().from(image).all()).toEqual([]);
  });

  it("warns about a large file and stores it only after the person confirms (FR-5)", () => {
    const w = setup();
    const bytes = heavy(LARGE_IMAGE_BYTES + 1);
    const first = images(w).put({ bytes });
    expect(first).toMatchObject({ stored: false, warning: "LARGE_FILE" });
    expect(filesOf(w)).toEqual([]);
    expect(images(w).put({ bytes }, { confirmLarge: true })).toMatchObject({ stored: true });
    expect(filesOf(w)).toHaveLength(1);
  });

  it("leaves no partial file behind", () => {
    const w = setup();
    images(w).put({ bytes: fixture("square.png") });
    expect(filesOf(w).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});

describe("ImageService logging (NFR-6)", () => {
  it("logs sizes only: never the file name, the folder or the hash", () => {
    const w = setup();
    const dir = mkdtempSync(join(tmpdir(), "mind-img-"));
    scratch.push(dir);
    const path = join(dir, "segredo-da-prova.png");
    writeFileSync(path, fixture("square.png"));
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    setLogLevel("info");
    try {
      const result = images(w).put({ path });
      if (!result.stored) throw new Error("not stored");
      const logged = info.mock.calls.map((call) => String(call[0])).join("\n");
      expect(logged).toContain("image stored");
      expect(logged).not.toContain("segredo");
      expect(logged).not.toContain(dir);
      expect(logged).not.toContain(result.ref.hash);
    } finally {
      setLogLevel("warn");
      info.mockRestore();
    }
  });
});

describe("ImageService.get and missing", () => {
  it("returns a data URL with the verified type", () => {
    const w = setup();
    const result = images(w).put({ bytes: fixture("photo.jpg") });
    if (!result.stored) throw new Error("not stored");
    const data = images(w).get(result.ref.hash);
    expect(data).toMatchObject({ mime: "image/jpeg", width: 16, height: 12 });
    expect(data.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(Buffer.from(data.dataUrl.split(",")[1] as string, "base64")).toEqual(
      fixture("photo.jpg"),
    );
  });

  it("says IMAGE_NOT_FOUND for an unknown hash or a file that was removed (FR-11)", () => {
    const w = setup();
    expect(() => images(w).get("a".repeat(64))).toThrowError(
      expect.objectContaining({ code: "IMAGE_NOT_FOUND" }),
    );
    const result = images(w).put({ bytes: fixture("square.png") });
    if (!result.stored) throw new Error("not stored");
    rmSync(join(images(w).directory, `${result.ref.hash}.png`));
    expect(() => images(w).get(result.ref.hash)).toThrowError(
      expect.objectContaining({ code: "IMAGE_NOT_FOUND" }),
    );
    expect(images(w).missing([result.ref.hash, "b".repeat(64)])).toEqual([
      result.ref.hash,
      "b".repeat(64),
    ]);
  });
});
