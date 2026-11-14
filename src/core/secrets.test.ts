/*
 * Filename: secrets.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tempDir } from "./test/helpers.js";
import { AppError } from "./contracts/errors.js";
import { ENV_NAME, SecretStore } from "./secrets.js";

const KEY = "sk-or-v1-abcdef123456";

function store(env: Record<string, string | undefined> = {}) {
  const dir = join(tempDir(), "ai");
  return { dir, store: new SecretStore(dir, env) };
}

describe("SecretStore", () => {
  it("reports nothing when no key is configured", () => {
    const { store: secrets } = store();
    expect(secrets.apiKey()).toBeNull();
    expect(secrets.isConfigured()).toBe(false);
    expect(secrets.source()).toBeNull();
  });

  it("stores the key encrypted with private permissions and reads it back", () => {
    const { dir, store: secrets } = store();
    secrets.save(`  ${KEY}  `);
    expect(secrets.apiKey()).toBe(KEY);
    expect(secrets.source()).toBe("stored");
    for (const file of ["keystore.key", "credentials.enc"]) {
      expect(statSync(join(dir, file)).mode & 0o777).toBe(0o600);
    }
    // Neither file contains the key in clear text.
    for (const file of readdirSync(dir)) {
      expect(readFileSync(join(dir, file)).includes(KEY)).toBe(false);
    }
  });

  it("survives a new instance over the same folder", () => {
    const { dir, store: secrets } = store();
    secrets.save(KEY);
    expect(new SecretStore(dir, {}).apiKey()).toBe(KEY);
  });

  it("lets the environment variable win over the stored key", () => {
    const { store: secrets } = store({ [ENV_NAME]: "sk-or-env" });
    secrets.save(KEY);
    expect(secrets.apiKey()).toBe("sk-or-env");
    expect(secrets.source()).toBe("environment");
  });

  it.each(["", "   ", "has space", "tab\tkey"])("rejects the invalid key %j", (key) => {
    const { store: secrets } = store();
    expect(() => secrets.save(key)).toThrowError(AppError);
    expect(secrets.isConfigured()).toBe(false);
  });

  it("clears the stored key and is a no-op without a file", () => {
    const { store: secrets } = store();
    expect(() => secrets.clear()).not.toThrow();
    secrets.save(KEY);
    secrets.clear();
    expect(secrets.isConfigured()).toBe(false);
  });

  it("treats a tampered credentials file as no key", () => {
    const { dir, store: secrets } = store();
    secrets.save(KEY);
    const path = join(dir, "credentials.enc");
    const data = readFileSync(path);
    data[data.length - 1] = (data[data.length - 1] ?? 0) ^ 0xff;
    writeFileSync(path, data);
    expect(secrets.apiKey()).toBeNull();
  });
});
