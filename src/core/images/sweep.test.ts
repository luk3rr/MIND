/*
 * Filename: sweep.test.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { existsSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { image } from "../db/workspace-schema.js";
import { WorkspaceRegistry } from "../workspaces/registry.js";
import { exportWorkspace, importWorkspace } from "../workspaces/archive.js";
import { tempDir } from "../test/helpers.js";
import { World } from "../test/world.js";
import { SWEEP_GRACE_MS } from "./service.js";
import type { ImageRef } from "./refs.js";

let world: World | undefined;
const registries: WorkspaceRegistry[] = [];
afterEach(async () => {
  await world?.close();
  world = undefined;
  for (const registry of registries.splice(0)) registry.close();
});

const fixture = (name: string): Buffer => readFileSync(join(import.meta.dirname, "fixtures", name));
const setup = (): World => (world = new World());
const service = (w: World) => w.rig.core.images(w.workspaceId);

function store(w: World, name = "square.png"): ImageRef {
  const result = service(w).put({ bytes: fixture(name) });
  if (!result.stored) throw new Error("not stored");
  return result.ref;
}

/** Makes a stored file look as old as `ageMs` before the world's clock. */
function age(w: World, ref: ImageRef, ext: string, ageMs = SWEEP_GRACE_MS * 2): void {
  const moment = new Date(w.clock.now().getTime() - ageMs);
  utimesSync(join(service(w).directory, `${ref.hash}.${ext}`), moment, moment);
}

const files = (w: World): string[] => {
  const directory = service(w).directory;
  return existsSync(directory) ? readdirSync(directory).sort() : [];
};

const card = (w: World, images: Record<string, ImageRef[]>, front = "F") =>
  w.rig.core.authoring(w.workspaceId).create({
    draft: { kind: "card", subtype: "qa", front, back: "B", images },
    topic: null,
    origin: "manual",
  });

describe("ImageService.sweep (FR-13, NFR-4)", () => {
  it("removes an old picture no item uses and keeps the ones in use, originals included", () => {
    const w = setup();
    const used = store(w, "square.png");
    const original = store(w, "photo.jpg");
    const unused = store(w, "still.gif");
    for (const [ref, ext] of [
      [used, "png"],
      [original, "jpg"],
      [unused, "gif"],
    ] as const) {
      age(w, ref, ext);
    }
    card(w, { front: [{ hash: used.hash, source: original.hash }] });
    expect(service(w).sweep()).toEqual({ removed: 1, freedBytes: fixture("still.gif").length });
    expect(files(w)).toEqual([`${original.hash}.jpg`, `${used.hash}.png`].sort());
    expect(w.db.select().from(image).all()).toHaveLength(2);
  });

  it("is idempotent", () => {
    const w = setup();
    const unused = store(w);
    age(w, unused, "png");
    expect(service(w).sweep().removed).toBe(1);
    expect(service(w).sweep()).toEqual({ removed: 0, freedBytes: 0 });
  });

  it("keeps a recent picture: it may belong to an item that is not saved yet", () => {
    const w = setup();
    const fresh = store(w);
    age(w, fresh, "png", SWEEP_GRACE_MS / 2);
    expect(service(w).sweep().removed).toBe(0);
    expect(files(w)).toHaveLength(1);
    // "Clear now" has no grace.
    expect(service(w).sweep({ graceMs: 0 }).removed).toBe(1);
    expect(files(w)).toEqual([]);
  });

  it("keeps the pictures of a discarded item so that it can come back", () => {
    const w = setup();
    const ref = store(w);
    age(w, ref, "png");
    const { itemId } = card(w, { front: [ref] });
    w.rig.core.review(w.workspaceId).discardApproved(itemId);
    expect(service(w).sweep().removed).toBe(0);
  });

  it("removes the picture when it is taken out of the only item that used it, but not while another does", () => {
    const w = setup();
    const shared = store(w, "square.png");
    const own = store(w, "photo.jpg");
    age(w, shared, "png");
    age(w, own, "jpg");
    const first = card(w, { front: [shared, own] }, "A");
    card(w, { front: [shared] }, "B");
    w.rig.core.review(w.workspaceId).edit(first.itemId, "A", "B", null, { images: {} });
    // Editing sweeps by itself: the picture only the first item had is gone, the shared one stays.
    expect(files(w)).toEqual([`${shared.hash}.png`]);
  });

  it("removes a stale temporary file and a row whose file vanished", () => {
    const w = setup();
    const ref = store(w);
    const directory = service(w).directory;
    const partial = join(directory, `${"f".repeat(64)}.png.123.tmp`);
    writeFileSync(partial, "half");
    const old = new Date(w.clock.now().getTime() - SWEEP_GRACE_MS * 2);
    utimesSync(partial, old, old);
    age(w, ref, "png");
    // The file of the row is removed by hand: the row has nothing left to describe.
    writeFileSync(join(directory, "ignored.txt"), "not a picture");
    service(w).sweep({ graceMs: 0 });
    expect(files(w)).toEqual(["ignored.txt"]);
    expect(w.db.select().from(image).all()).toEqual([]);
  });

  it("leaves a referenced picture whose file is gone for the item to report", () => {
    const w = setup();
    const ref = store(w);
    card(w, { front: [ref] });
    const row = w.db.select().from(image).where(eq(image.hash, ref.hash)).get();
    expect(row).toBeDefined();
    service(w).sweep({ graceMs: 0 });
    expect(files(w)).toHaveLength(1);
  });
});

describe("ImageService.stats and reindex", () => {
  it("counts the pictures and the ones nothing uses", () => {
    const w = setup();
    const used = store(w, "square.png");
    store(w, "photo.jpg");
    card(w, { front: [used] });
    expect(service(w).stats()).toEqual({
      count: 2,
      bytes: fixture("square.png").length + fixture("photo.jpg").length,
      unusedCount: 1,
      unusedBytes: fixture("photo.jpg").length,
    });
  });

  it("gives a row back to a file that has none, and ignores a file that is not what its name says", () => {
    const w = setup();
    const ref = store(w);
    w.db.delete(image).run();
    expect(() => service(w).get(ref.hash)).toThrowError(
      expect.objectContaining({ code: "IMAGE_NOT_FOUND" }),
    );
    writeFileSync(join(service(w).directory, `${"9".repeat(64)}.png`), fixture("photo.jpg"));
    expect(service(w).reindex()).toBe(1);
    expect(service(w).get(ref.hash).mime).toBe("image/png");
    expect(service(w).stats().count).toBe(1);
  });
});

describe("backup and restore keep the pictures (FR-14)", () => {
  it("exports a workspace with pictures and brings them back in the restored one", async () => {
    const data = join(tempDir(), "data");
    const registry = new WorkspaceRegistry(data);
    registries.push(registry);
    const info = registry.create("Imagens");
    const workspace = registry.open(info.id);
    const { ImageService } = await import("./service.js");
    const { ItemAuthoringService } = await import("../authoring/service.js");
    const images = new ImageService(workspace);
    const stored = images.put({ bytes: fixture("photo.jpg") });
    if (!stored.stored) throw new Error("not stored");
    new ItemAuthoringService(workspace).create({
      draft: {
        kind: "card",
        subtype: "qa",
        front: "F",
        back: "B",
        images: { front: [stored.ref] },
      },
      topic: null,
      origin: "manual",
    });
    const target = join(tempDir(), "backup.zip");
    await exportWorkspace(registry, info.id, target);

    const restored = await importWorkspace(registry, target);
    const reopened = new ImageService(registry.open(restored.id));
    expect(reopened.get(stored.ref.hash)).toMatchObject({ mime: "image/jpeg", width: 16 });
    expect(reopened.stats()).toMatchObject({ count: 1, unusedCount: 0 });
    // A restored workspace with the same files but no rows still shows them (older backups).
    registry.open(restored.id).connection.db.delete(image).run();
    expect(new ImageService(registry.open(restored.id)).stats().count).toBe(1);
  });
});
