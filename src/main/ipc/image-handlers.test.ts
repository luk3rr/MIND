/*
 * Filename: image-handlers.test.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { OutputOf } from "../../core/contracts/index.js";
import { LARGE_IMAGE_BYTES } from "../../core/images/probe.js";
import { World } from "../../core/test/world.js";
import { createHandlers } from "./handlers.js";
import type { UiBridge } from "./handlers.js";
import { createRouter } from "./router.js";

let world: World | undefined;
const scratch: string[] = [];
afterEach(async () => {
  await world?.close();
  world = undefined;
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const fixture = (name: string): Buffer =>
  readFileSync(join(import.meta.dirname, "../../core/images/fixtures", name));

type Put = OutputOf<"image:put">;

function dispatcher(w: World, ui: Partial<UiBridge> = {}) {
  return createRouter(
    createHandlers(
      w.rig.core,
      { lastRoute: null },
      { pickFiles: () => Promise.resolve([]), ...ui },
    ),
    { error: () => undefined },
  );
}

describe("image:put and image:get channels", () => {
  it("stores pasted bytes and serves them back as a data URL (FR-1, FR-9)", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w);
    const put = await dispatch("image:put", {
      workspaceId: w.workspaceId,
      source: { kind: "bytes", bytes: new Uint8Array(fixture("square.png")) },
    });
    expect(put).toMatchObject({
      ok: true,
      data: { stored: true, cancelled: false, info: { width: 16, height: 12 } },
    });
    const stored = put.ok ? (put.data as Put) : null;
    if (!stored?.ref) throw new Error("not stored");
    const got = await dispatch("image:get", {
      workspaceId: w.workspaceId,
      hash: stored.ref.hash,
    });
    expect(got).toMatchObject({ ok: true, data: { mime: "image/png", width: 16, height: 12 } });
  });

  it("answers a refusal with its own error code (FR-4)", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w);
    const result = await dispatch("image:put", {
      workspaceId: w.workspaceId,
      source: { kind: "bytes", bytes: new Uint8Array(fixture("vector.svg")) },
    });
    expect(result).toMatchObject({ ok: false, error: { code: "IMAGE_UNSUPPORTED" } });
  });

  it("opens the native dialog for a file and reports a cancelled choice", async () => {
    const w = (world = new World());
    const dir = mkdtempSync(join(tmpdir(), "mind-img-"));
    scratch.push(dir);
    const path = join(dir, "chosen.gif");
    writeFileSync(path, fixture("still.gif"));
    let choice: string | null = path;
    const dispatch = dispatcher(w, { pickImage: () => Promise.resolve(choice) });
    const stored = await dispatch("image:put", {
      workspaceId: w.workspaceId,
      source: { kind: "dialog" },
    });
    expect(stored).toMatchObject({ ok: true, data: { stored: true, info: { mime: "image/gif" } } });
    choice = null;
    const cancelled = await dispatch("image:put", {
      workspaceId: w.workspaceId,
      source: { kind: "dialog" },
    });
    expect(cancelled).toMatchObject({ ok: true, data: { cancelled: true, stored: false } });
  });

  it("holds a large file chosen in the dialog by token until the person confirms (FR-5)", async () => {
    const w = (world = new World());
    const dir = mkdtempSync(join(tmpdir(), "mind-img-"));
    scratch.push(dir);
    const path = join(dir, "big.png");
    const png = fixture("square.png");
    writeFileSync(path, Buffer.concat([png, Buffer.alloc(LARGE_IMAGE_BYTES)]));
    const dispatch = dispatcher(w, { pickImage: () => Promise.resolve(path) });
    const warned = await dispatch("image:put", {
      workspaceId: w.workspaceId,
      source: { kind: "dialog" },
    });
    expect(warned).toMatchObject({
      ok: true,
      data: { stored: false, warning: "LARGE_FILE", token: expect.any(String) },
    });
    const token = warned.ok ? (warned.data as Put).token : null;
    if (!token) throw new Error("no token");
    const confirmed = await dispatch("image:put", {
      workspaceId: w.workspaceId,
      source: { kind: "confirm", token },
    });
    expect(confirmed).toMatchObject({ ok: true, data: { stored: true } });
    // The token is single-use and never carries a path the window could choose.
    const again = await dispatch("image:put", {
      workspaceId: w.workspaceId,
      source: { kind: "confirm", token },
    });
    expect(again).toMatchObject({ ok: false, error: { code: "FILE_MISSING" } });
  });

  it("warns about large pasted bytes and stores them on confirmLarge (FR-5)", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w);
    const bytes = new Uint8Array(
      Buffer.concat([fixture("square.png"), Buffer.alloc(LARGE_IMAGE_BYTES)]),
    );
    const first = await dispatch("image:put", {
      workspaceId: w.workspaceId,
      source: { kind: "bytes", bytes },
    });
    expect(first).toMatchObject({ ok: true, data: { stored: false, warning: "LARGE_FILE" } });
    const second = await dispatch("image:put", {
      workspaceId: w.workspaceId,
      source: { kind: "bytes", bytes },
      confirmLarge: true,
    });
    expect(second).toMatchObject({ ok: true, data: { stored: true } });
  });

  it("rejects a request that tries to pass a path from the window (NFR-1)", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w);
    const result = await dispatch("image:put", {
      workspaceId: w.workspaceId,
      source: { kind: "path", path: "/etc/passwd" },
    } as never);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
});

describe("items with images", () => {
  it("creates a card with a picture and reads it back through the study queue (FR-1, FR-9)", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w);
    const put = await dispatch("image:put", {
      workspaceId: w.workspaceId,
      source: { kind: "bytes", bytes: new Uint8Array(fixture("photo.jpg")) },
    });
    const stored = put.ok ? (put.data as Put) : null;
    if (!stored?.ref) throw new Error("not stored");
    const ref = { ...stored.ref, alt: "A figure" };
    const created = await dispatch("items:create", {
      workspaceId: w.workspaceId,
      draft: { kind: "card", subtype: "qa", front: "Look", back: "Seen", images: { front: [ref] } },
      origin: "manual",
    });
    expect(created).toMatchObject({ ok: true });
    const next = await dispatch("study:next", { workspaceId: w.workspaceId });
    expect(next).toMatchObject({
      ok: true,
      data: { card: expect.objectContaining({ images: { front: [ref] } }) },
    });
  });

  it("refuses an item that points to a picture that is not stored", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w);
    const result = await dispatch("items:create", {
      workspaceId: w.workspaceId,
      draft: {
        kind: "card",
        subtype: "qa",
        front: "x",
        back: "y",
        images: { front: [{ hash: "c".repeat(64) }] },
      },
      origin: "manual",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "IMAGE_NOT_FOUND", fields: [{ field: "images.front" }] },
    });
  });

  it("keeps an item without images exactly as before (NFR-5)", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w);
    await dispatch("items:create", {
      workspaceId: w.workspaceId,
      draft: { kind: "card", subtype: "qa", front: "a", back: "b" },
      origin: "manual",
    });
    const next = await dispatch("study:next", { workspaceId: w.workspaceId });
    expect(next).toMatchObject({
      ok: true,
      data: { card: expect.objectContaining({ images: {} }) },
    });
  });
});
