/*
 * Filename: update-handlers.test.ts
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { createCore } from "../../core/core.js";
import type { Core } from "../../core/core.js";
import { tempDir } from "../../core/test/helpers.js";
import { createHandlers } from "./handlers.js";
import type { UiBridge } from "./handlers.js";
import { createRouter } from "./router.js";

let core: Core | undefined;
afterEach(async () => {
  await core?.close();
  core = undefined;
});

function setup(tag: string | null, ui: Partial<UiBridge> = {}) {
  core = createCore({
    dataDir: tempDir(),
    env: {},
    appVersion: "0.2.0",
    updateFetch: () =>
      tag === null
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(
            new Response(
              JSON.stringify({
                tag_name: tag,
                html_url: `https://github.com/luk3rr/MIND/releases/tag/${tag}`,
              }),
            ),
          ),
  });
  return createRouter(
    createHandlers(core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]), ...ui }),
    { error: () => undefined },
  );
}

describe("update channels", () => {
  it("checks, shows, dismisses and opens the release page by itself", async () => {
    const opened: string[] = [];
    const dispatch = setup("v0.3.0", {
      openExternal: (url) => {
        opened.push(url);
        return Promise.resolve();
      },
    });
    expect(await dispatch("update:state", {})).toMatchObject({
      ok: true,
      data: { enabled: true, current: "0.2.0", available: null },
    });
    expect(await dispatch("update:openRelease", {})).toMatchObject({
      ok: false,
      error: { code: "OPEN_FAILED" },
    });
    expect(await dispatch("update:check", {})).toMatchObject({
      ok: true,
      data: { outcome: "available", state: { available: { version: "0.3.0" } } },
    });
    expect(await dispatch("update:openRelease", {})).toEqual({ ok: true, data: {} });
    expect(opened).toEqual(["https://github.com/luk3rr/MIND/releases/tag/v0.3.0"]);
    expect(await dispatch("update:dismiss", { version: "0.3.0" })).toMatchObject({
      data: { available: null },
    });
  });

  it("turns the automatic check off and reports an offline check as an error", async () => {
    const dispatch = setup(null);
    expect(await dispatch("update:setEnabled", { enabled: false })).toMatchObject({
      data: { enabled: false },
    });
    expect(await dispatch("update:check", {})).toMatchObject({
      ok: true,
      data: { outcome: "error" },
    });
  });

  it("refuses to open anything when the host cannot open addresses, and bad payloads", async () => {
    const dispatch = setup("v0.3.0");
    await dispatch("update:check", {});
    expect(await dispatch("update:openRelease", {})).toMatchObject({
      ok: false,
      error: { code: "OPEN_FAILED" },
    });
    expect(await dispatch("update:openRelease", { url: "https://evil.example" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(await dispatch("update:setEnabled", { enabled: "yes" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });
});
