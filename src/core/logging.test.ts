/*
 * Filename: core/logging.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { formatFields, hostOf, logger, parseLogLevel, setLogLevel } from "./logging.js";

afterEach(() => {
  setLogLevel("warn");
  vi.restoreAllMocks();
});

describe("logging", () => {
  it("formats fields, quoting values with spaces and cutting long ones", () => {
    expect(formatFields({ a: 1, b: 0.5, c: "x y", d: true, e: null, f: undefined })).toBe(
      ' a=1 b=0.5000 c="x y" d=true e=null',
    );
    expect(formatFields({ long: "z".repeat(200) })).toBe(` long=${"z".repeat(80)}…`);
    expect(formatFields(undefined)).toBe("");
  });

  it("writes through console with the scope and respects the level", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const log = logger("llm");
    log.info("hidden by default");
    expect(info).not.toHaveBeenCalled();
    setLogLevel("debug");
    log.info("call", { ms: 12 });
    log.debug("detail");
    expect(info).toHaveBeenCalledWith("[llm] call ms=12");
    expect(debug).toHaveBeenCalledWith("[llm] detail");
    setLogLevel("silent");
    log.info("nothing");
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("parses levels with a fallback and extracts only the host of an address", () => {
    expect(parseLogLevel("DEBUG", "info")).toBe("debug");
    expect(parseLogLevel("loud", "info")).toBe("info");
    expect(parseLogLevel(undefined, "warn")).toBe("warn");
    expect(hostOf("https://openrouter.ai/api/v1/x?q=segredo")).toBe("openrouter.ai");
    expect(hostOf("not a url")).toBe("invalid");
  });
});
