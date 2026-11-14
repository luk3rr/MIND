/*
 * Filename: channels.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { CHANNEL_NAMES, channels, CONTRACT_VERSION, ERROR_CODES } from "./index.js";

describe("contracts", () => {
  it("defines a schema for every channel name and nothing else", () => {
    expect(Object.keys(channels).sort()).toEqual([...CHANNEL_NAMES].sort());
  });

  it("keeps the error codes of the Python implementation plus the archive codes", () => {
    expect(ERROR_CODES).toContain("PROVIDER_KEY_MISSING");
    expect(ERROR_CODES).toContain("ARCHIVE_INVALID");
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it("only accepts absolute in-app routes", () => {
    const schema = channels["window:setLastRoute"].input;
    expect(schema.safeParse({ route: "/w/1/study" }).success).toBe(true);
    expect(schema.safeParse({ route: "w/1" }).success).toBe(false);
    expect(schema.safeParse({ route: "//evil.example" }).success).toBe(false);
    expect(CONTRACT_VERSION).toBe(1);
  });
});
