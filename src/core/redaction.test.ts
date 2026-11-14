/*
 * Filename: redaction.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it, vi } from "vitest";
import { MASK, installLogRedaction, redact } from "./redaction.js";
import { SecretStore } from "./secrets.js";
import { tempDir } from "./test/helpers.js";
import { join } from "node:path";

const KEY = "sk-or-v1-supersecret";

describe("redact", () => {
  it("masks the current key and anything shaped like an OpenRouter key", () => {
    expect(redact(`token ${KEY} and sk-or-other-123`, KEY)).toBe(`token ${MASK} and ${MASK}`);
    expect(redact("nothing here", null)).toBe("nothing here");
    expect(redact("custom-secret-value", "custom-secret-value")).toBe(MASK);
  });
});

describe("installLogRedaction", () => {
  it("keeps the key out of every console method and restores them", () => {
    const secrets = new SecretStore(join(tempDir(), "ai"), {});
    secrets.save(KEY);
    const lines: string[] = [];
    const target = {
      log: (text: string) => lines.push(text),
      info: (text: string) => lines.push(text),
      warn: (text: string) => lines.push(text),
      error: (text: string) => lines.push(text),
      debug: (text: string) => lines.push(text),
    } as unknown as Console;
    const original = target.log;
    const uninstall = installLogRedaction(secrets, target);
    target.log("a", KEY);
    target.error(`failed with ${KEY}`, { token: KEY });
    target.warn("sk-or-v1-different");
    expect(lines.join("\n")).not.toContain("supersecret");
    expect(lines.join("\n")).not.toContain("different");
    expect(lines[0]).toBe(`a ${MASK}`);
    uninstall();
    expect(target.log).toBe(original);
    const spy = vi.fn();
    target.log = spy as unknown as Console["log"];
    target.log(KEY);
    expect(spy).toHaveBeenCalledWith(KEY);
  });
});
