/*
 * Filename: helpers.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";

const created: string[] = [];

/** A fresh temporary directory removed after each test. */
export function tempDir(): string {
  const path = mkdtempSync(join(tmpdir(), "mind-test-"));
  created.push(path);
  return path;
}

afterEach(() => {
  for (const path of created.splice(0)) rmSync(path, { recursive: true, force: true });
});

/** A manual clock for deterministic timestamps. */
export function fixedClock(start = "2026-01-01T12:00:00.000Z") {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    advance(ms: number): void {
      current = new Date(current.getTime() + ms);
    },
    set(iso: string): void {
      current = new Date(iso);
    },
  };
}
