/*
 * Filename: router.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it, vi } from "vitest";
import { AppError, CONTRACT_VERSION } from "../../core/contracts/index.js";
import { createRouter } from "./router.js";
import type { Handlers } from "./router.js";

function handlers(overrides: Partial<Handlers> = {}): Handlers {
  return {
    "window:getState": () => ({ route: "/library", contractVersion: CONTRACT_VERSION }),
    "window:setLastRoute": () => ({}),
    ...overrides,
  };
}

const quietLogger = { error: vi.fn() };

describe("IPC router", () => {
  it("returns the handler answer wrapped in an ok result", async () => {
    const dispatch = createRouter(handlers(), quietLogger);
    expect(await dispatch("window:getState", {})).toEqual({
      ok: true,
      data: { route: "/library", contractVersion: CONTRACT_VERSION },
    });
  });

  it("rejects an unknown channel and a non-string channel", async () => {
    const dispatch = createRouter(handlers(), quietLogger);
    for (const channel of ["nope", "__proto__", "constructor", 42, null]) {
      const result = await dispatch(channel, {});
      expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    }
  });

  it("rejects an invalid payload with field errors and never calls the handler", async () => {
    const setLastRoute = vi.fn(() => ({}));
    const dispatch = createRouter(handlers({ "window:setLastRoute": setLastRoute }), quietLogger);
    const result = await dispatch("window:setLastRoute", { route: "https://evil.example" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(setLastRoute).not.toHaveBeenCalled();
    const extra = await dispatch("window:setLastRoute", { route: "/ok", extra: 1 });
    expect(extra).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("turns an AppError into a stable error result", async () => {
    const dispatch = createRouter(
      handlers({
        "window:getState": () => {
          throw new AppError("WORKSPACE_NOT_FOUND", "Workspace não encontrado.");
        },
      }),
      quietLogger,
    );
    expect(await dispatch("window:getState", {})).toEqual({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace não encontrado." },
    });
  });

  it("hides unexpected errors behind INTERNAL_ERROR and logs them", async () => {
    const logger = { error: vi.fn() };
    const dispatch = createRouter(
      handlers({
        "window:getState": () => {
          throw new Error("secret detail");
        },
      }),
      logger,
    );
    const result = await dispatch("window:getState", {});
    expect(result).toEqual({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Erro interno." },
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it("rejects an answer that breaks the channel contract", async () => {
    const dispatch = createRouter(
      handlers({
        "window:getState": () => ({ route: 7, contractVersion: 1 }) as never,
      }),
      quietLogger,
    );
    expect(await dispatch("window:getState", {})).toMatchObject({
      ok: false,
      error: { code: "INTERNAL_ERROR" },
    });
  });

  it("supports asynchronous handlers", async () => {
    const dispatch = createRouter(
      handlers({ "window:setLastRoute": async () => Promise.resolve({}) }),
      quietLogger,
    );
    expect(await dispatch("window:setLastRoute", { route: "/study" })).toEqual({
      ok: true,
      data: {},
    });
  });
});
