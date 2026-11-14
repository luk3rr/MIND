/*
 * Filename: log-file.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tempDir } from "../core/test/helpers.js";
import { installFileLog, MAX_LOG_BYTES } from "./log-file.js";
import { installLogRedaction } from "../core/redaction.js";

function fakeConsole() {
  const seen: string[] = [];
  const make =
    () =>
    (...args: unknown[]) =>
      void seen.push(args.join(" "));
  const target = { debug: make(), log: make(), info: make(), warn: make(), error: make() };
  return { target: target as unknown as Console, seen };
}

describe("installFileLog", () => {
  it("writes each console line with time and level, creating the folder", () => {
    const path = join(tempDir(), "logs", "mind.log");
    const { target, seen } = fakeConsole();
    installFileLog(path, target, () => new Date("2026-11-14T12:00:00.000Z"));
    target.error("falhou", { code: 3 });
    target.log("ok");
    expect(readFileSync(path, "utf8")).toBe(
      "2026-11-14T12:00:00.000Z ERROR falhou { code: 3 }\n2026-11-14T12:00:00.000Z LOG ok\n",
    );
    expect(seen).toHaveLength(2);
  });

  it("rotates a file larger than 2 MB", () => {
    const path = join(tempDir(), "mind.log");
    writeFileSync(path, "x".repeat(MAX_LOG_BYTES + 1));
    const { target } = fakeConsole();
    const log = installFileLog(path, target);
    log("novo");
    expect(existsSync(`${path}.1`)).toBe(true);
    expect(readFileSync(path, "utf8")).toMatch(/INFO novo\n$/);
  });

  it("keeps secrets out of the file when the redaction wraps it", () => {
    const path = join(tempDir(), "mind.log");
    const { target } = fakeConsole();
    installFileLog(path, target);
    installLogRedaction({ apiKey: () => "sk-or-secret-123456" } as never, target);
    target.warn("chave sk-or-secret-123456 usada");
    expect(readFileSync(path, "utf8")).not.toContain("sk-or-secret-123456");
  });
});
