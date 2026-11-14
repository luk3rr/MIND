/*
 * Filename: log-file.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { format } from "node:util";

export const MAX_LOG_BYTES = 2 * 1024 * 1024;
const LEVELS = ["debug", "log", "info", "warn", "error"] as const;

/**
 * Copies everything written through `console` to a log file (the app has no terminal when it is
 * opened from the menu). The file is rotated to `<path>.1` past 2 MB. Install it before the
 * redaction wrapper so the secrets are removed before a line reaches the file.
 */
export function installFileLog(
  path: string,
  target: Console = console,
  now: () => Date = () => new Date(),
): (message: string) => void {
  mkdirSync(dirname(path), { recursive: true });
  const write = (level: string, message: string): void => {
    try {
      if (statSync(path, { throwIfNoEntry: false })?.isFile()) {
        if ((statSync(path).size ?? 0) > MAX_LOG_BYTES) renameSync(path, `${path}.1`);
      }
      appendFileSync(path, `${now().toISOString()} ${level.toUpperCase()} ${message}\n`);
    } catch {
      // Logging must never break the app.
    }
  };
  for (const level of LEVELS) {
    const original = target[level].bind(target) as (...args: unknown[]) => void;
    target[level] = (...args: unknown[]): void => {
      write(level, format(...args));
      original(...args);
    };
  }
  return (message) => write("info", message);
}
