/*
 * Filename: service.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { image, item } from "../db/workspace-schema.js";
import { logger } from "../logging.js";
import type { OpenWorkspace } from "../workspaces/registry.js";
import { LARGE_IMAGE_BYTES, MAX_IMAGE_BYTES, probeImage } from "./probe.js";
import type { ImageInfo, ProbeFailure } from "./probe.js";
import { hashesOf } from "./refs.js";
import type { ImageRef, ItemImages } from "./refs.js";

const log = logger("images");

/**
 * A file this young is never removed by a sweep: the person may have attached it to an item that
 * is still open in an editor and not saved yet.
 */
export const SWEEP_GRACE_MS = 60 * 60 * 1000;

const IMAGE_FILE = /^([0-9a-f]{64})\.(png|jpg|gif|webp)$/;

export interface ImageStats {
  count: number;
  bytes: number;
  /** Pictures that no item points to (a sweep removes the ones older than the grace). */
  unusedCount: number;
  unusedBytes: number;
}

const FAILURES: Record<ProbeFailure, { code: AppError["code"]; message: string }> = {
  unsupported: {
    code: "IMAGE_UNSUPPORTED",
    message: "Este formato de imagem não é aceito. Use PNG, JPEG, WebP ou GIF.",
  },
  corrupt: { code: "IMAGE_CORRUPT", message: "Não foi possível ler esta imagem." },
  too_large: { code: "IMAGE_TOO_LARGE", message: "A imagem é grande demais para ser anexada." },
};

export interface StoredImageInfo {
  mime: string;
  bytes: number;
  width: number;
  height: number;
  animated: boolean;
}

export type PutInput = { bytes: Buffer } | { path: string };

export type PutResult =
  | { stored: true; ref: ImageRef; info: StoredImageInfo }
  /** The file is large; nothing was written until the person confirms. */
  | { stored: false; warning: "LARGE_FILE"; info: StoredImageInfo };

export interface ImageData {
  dataUrl: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
}

function describe(info: ImageInfo, bytes: number): StoredImageInfo {
  return {
    mime: info.mime,
    bytes,
    width: info.width,
    height: info.height,
    animated: info.animated,
  };
}

/**
 * Stores the images of items: validates them by their bytes, names each file by its hash (so the
 * same picture is kept once) and reads them back. The window never sees a path.
 */
export class ImageService {
  constructor(
    private readonly workspace: OpenWorkspace,
    private readonly clock: Clock = systemClock,
  ) {}

  private get db() {
    return this.workspace.connection.db;
  }

  /** The folder of the image files of this workspace. */
  get directory(): string {
    return join(this.workspace.filesDir, "images");
  }

  private fileOf(hash: string, ext: string): string {
    return join(this.directory, `${hash}.${ext}`);
  }

  private read(input: PutInput): Buffer {
    if ("bytes" in input) {
      if (input.bytes.length > MAX_IMAGE_BYTES) throw failure("too_large");
      return input.bytes;
    }
    let size: number;
    try {
      const stats = statSync(input.path);
      if (!stats.isFile()) throw new Error("not a file");
      size = stats.size;
    } catch {
      throw new AppError("FILE_MISSING", "Não foi possível abrir o arquivo escolhido.");
    }
    // The size is known before anything is allocated.
    if (size > MAX_IMAGE_BYTES) throw failure("too_large");
    try {
      return readFileSync(input.path);
    } catch {
      throw new AppError("FILE_MISSING", "Não foi possível abrir o arquivo escolhido.");
    }
  }

  /**
   * Validates and stores an image. A file of 20 MB or more is stored only when `confirmLarge` is
   * true; until then the result carries the warning and nothing is written.
   */
  put(input: PutInput, options: { confirmLarge?: boolean } = {}): PutResult {
    const bytes = this.read(input);
    const probed = probeImage(bytes);
    if (!probed.ok) throw failure(probed.failure);
    const info = describe(probed.info, bytes.length);
    if (bytes.length >= LARGE_IMAGE_BYTES && options.confirmLarge !== true) {
      return { stored: false, warning: "LARGE_FILE", info };
    }
    const hash = createHash("sha256").update(bytes).digest("hex");
    const target = this.fileOf(hash, probed.info.ext);
    if (!existsSync(target)) {
      mkdirSync(this.directory, { recursive: true });
      // Written beside the target and renamed, so a crash never leaves half an image under a hash.
      const partial = `${target}.${process.pid}.tmp`;
      try {
        writeFileSync(partial, bytes);
        renameSync(partial, target);
      } catch (error) {
        rmSync(partial, { force: true });
        throw error;
      }
    }
    this.db
      .insert(image)
      .values({
        hash,
        ext: probed.info.ext,
        mime: probed.info.mime,
        bytes: bytes.length,
        width: probed.info.width,
        height: probed.info.height,
        animated: probed.info.animated,
        createdAt: this.clock.now().toISOString(),
      })
      .onConflictDoNothing()
      .run();
    log.info("image stored", { bytes: bytes.length, width: info.width, height: info.height });
    return { stored: true, ref: { hash }, info };
  }

  /** The image as a data URL, with the type the core verified (never one the window declared). */
  get(hash: string): ImageData {
    const row = this.db.select().from(image).where(eq(image.hash, hash)).get();
    const path = row ? this.fileOf(row.hash, row.ext) : null;
    if (!row || path === null || !existsSync(path)) {
      throw new AppError("IMAGE_NOT_FOUND", "A imagem não foi encontrada.");
    }
    const bytes = readFileSync(path);
    return {
      dataUrl: `data:${row.mime};base64,${bytes.toString("base64")}`,
      mime: row.mime,
      bytes: row.bytes,
      width: row.width,
      height: row.height,
    };
  }

  /** Every hash that an item points to, including the originals of adjusted pictures. */
  usedHashes(): Set<string> {
    const used = new Set<string>();
    for (const row of this.db.select({ payload: item.payloadJson }).from(item).all()) {
      const images = (JSON.parse(row.payload) as { images?: ItemImages }).images;
      for (const hash of hashesOf(images)) used.add(hash);
    }
    return used;
  }

  private files(): { name: string; hash: string; path: string }[] {
    if (!existsSync(this.directory)) return [];
    return readdirSync(this.directory).flatMap((name) => {
      const match = IMAGE_FILE.exec(name);
      return match ? [{ name, hash: match[1] as string, path: join(this.directory, name) }] : [];
    });
  }

  /**
   * Gives a row to every picture file that has none (a backup made before the table existed, or
   * a row lost with a failed write). A file whose content does not match its name is left alone.
   */
  reindex(): number {
    let added = 0;
    const known = new Set(
      this.db
        .select({ hash: image.hash })
        .from(image)
        .all()
        .map((r) => r.hash),
    );
    for (const file of this.files()) {
      if (known.has(file.hash)) continue;
      const bytes = readFileSync(file.path);
      if (createHash("sha256").update(bytes).digest("hex") !== file.hash) continue;
      const probed = probeImage(bytes);
      if (!probed.ok) continue;
      this.db
        .insert(image)
        .values({
          hash: file.hash,
          ext: probed.info.ext,
          mime: probed.info.mime,
          bytes: bytes.length,
          width: probed.info.width,
          height: probed.info.height,
          animated: probed.info.animated,
          createdAt: this.clock.now().toISOString(),
        })
        .onConflictDoNothing()
        .run();
      added += 1;
    }
    return added;
  }

  stats(): ImageStats {
    this.reindex();
    const used = this.usedHashes();
    const stats: ImageStats = { count: 0, bytes: 0, unusedCount: 0, unusedBytes: 0 };
    for (const row of this.db.select().from(image).all()) {
      stats.count += 1;
      stats.bytes += row.bytes;
      if (!used.has(row.hash)) {
        stats.unusedCount += 1;
        stats.unusedBytes += row.bytes;
      }
    }
    return stats;
  }

  /**
   * Removes the pictures that no item points to. What counts as "pointed to" is read from the
   * items themselves, so nothing can drift out of step. Files younger than `graceMs` stay.
   */
  sweep(options: { graceMs?: number } = {}): { removed: number; freedBytes: number } {
    const grace = options.graceMs ?? SWEEP_GRACE_MS;
    this.reindex();
    const used = this.usedHashes();
    const now = this.clock.now().getTime();
    let removed = 0;
    let freedBytes = 0;
    for (const file of this.files()) {
      if (used.has(file.hash)) continue;
      const stats = statSync(file.path);
      if (now - stats.mtimeMs < grace) continue;
      rmSync(file.path, { force: true });
      this.db.delete(image).where(eq(image.hash, file.hash)).run();
      removed += 1;
      freedBytes += stats.size;
    }
    // A row whose file is gone and that nothing points to has nothing left to keep.
    for (const row of this.db.select().from(image).all()) {
      if (!used.has(row.hash) && !existsSync(this.fileOf(row.hash, row.ext))) {
        this.db.delete(image).where(eq(image.hash, row.hash)).run();
      }
    }
    if (existsSync(this.directory)) {
      for (const name of readdirSync(this.directory)) {
        if (!name.endsWith(".tmp")) continue;
        const path = join(this.directory, name);
        if (now - statSync(path).mtimeMs >= grace) rmSync(path, { force: true });
      }
    }
    if (removed > 0) log.info("images swept", { removed, freedBytes });
    return { removed, freedBytes };
  }

  /** The hashes among `hashes` that have no row or no file. */
  missing(hashes: readonly string[]): string[] {
    return hashes.filter((hash) => {
      const row = this.db.select().from(image).where(eq(image.hash, hash)).get();
      return !row || !existsSync(this.fileOf(row.hash, row.ext));
    });
  }
}

function failure(kind: ProbeFailure): AppError {
  const { code, message } = FAILURES[kind];
  return new AppError(code, message);
}
