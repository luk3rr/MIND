/*
 * Filename: update.test.ts
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCore } from "../core.js";
import type { Core } from "../core.js";
import { fixedClock, tempDir } from "../test/helpers.js";
import { CHECK_TIMEOUT_MS, RELEASES_API } from "./service.js";
import { compareVersions, formatVersion, parseVersion } from "./version.js";

describe("versions", () => {
  it.each([
    ["v1.2.3", "1.2.3"],
    ["0.10.0", "0.10.0"],
    ["2.0.1-rc.1", "2.0.1"],
    [" v3.4.5+build7 ", "3.4.5"],
  ])("reads %s", (text, expected) => {
    expect(formatVersion(parseVersion(text) as never)).toBe(expected);
  });

  it.each(["", "1.2", "1.2.3.4", "a.b.c", "v1.x.3", "1..3", "1.2.3456789", "latest"])(
    "refuses %j",
    (text) => {
      expect(parseVersion(text)).toBeNull();
    },
  );

  it("orders versions by number, not by text", () => {
    const v = (text: string) => parseVersion(text) as NonNullable<ReturnType<typeof parseVersion>>;
    expect(compareVersions(v("0.10.0"), v("0.9.9"))).toBeGreaterThan(0);
    expect(compareVersions(v("1.0.0"), v("0.99.99"))).toBeGreaterThan(0);
    expect(compareVersions(v("0.2.0"), v("0.2.0"))).toBe(0);
    expect(compareVersions(v("0.2.1"), v("0.2.0"))).toBeGreaterThan(0);
    expect(compareVersions(v("0.1.9"), v("0.2.0"))).toBeLessThan(0);
  });
});

let core: Core | undefined;
afterEach(async () => {
  vi.useRealTimers();
  await core?.close();
  core = undefined;
});

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function rig(
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
  appVersion = "0.2.0",
) {
  const found: string[] = [];
  core = createCore({
    dataDir: tempDir(),
    env: {},
    clock: fixedClock("2026-03-01T10:00:00.000Z"),
    appVersion,
    updateFetch: fetchImpl,
    onUpdateAvailable: (release) => found.push(release.version),
  });
  return { updates: core.updates, found };
}

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/luk3rr/MIND/releases/tag/${tag}`,
  ...extra,
});

describe("UpdateService", () => {
  it("finds a newer release, asks for it anonymously and announces it once", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const { updates, found } = rig((url, init) => {
      calls.push({ url, init });
      return Promise.resolve(reply(release("v0.3.0")));
    });
    const first = await updates.check();
    expect(first.outcome).toBe("available");
    expect(first.release?.version).toBe("0.3.0");
    expect(first.state).toEqual({
      enabled: true,
      current: "0.2.0",
      available: {
        version: "0.3.0",
        url: "https://github.com/luk3rr/MIND/releases/tag/v0.3.0",
      },
      checkedAt: "2026-03-01T10:00:00.000Z",
    });
    expect((await updates.check()).outcome).toBe("available");
    expect(found).toEqual(["0.3.0"]);
    expect(calls[0]?.url).toBe(RELEASES_API);
    expect(calls[0]?.init.headers).toEqual({
      Accept: "application/vnd.github+json",
      "User-Agent": "MIND",
    });
    expect(calls[0]?.init.method).toBeUndefined();
    expect(calls[0]?.init.body).toBeUndefined();
    expect(updates.releaseUrl()).toContain("v0.3.0");
  });

  it("says the app is current for the same or an older release", async () => {
    for (const tag of ["v0.2.0", "v0.1.9"]) {
      const { updates, found } = rig(() => Promise.resolve(reply(release(tag))));
      expect((await updates.check()).outcome).toBe("current");
      expect(updates.state().available).toBeNull();
      expect(updates.releaseUrl()).toBeNull();
      expect(found).toEqual([]);
      await core?.close();
    }
    core = undefined;
  });

  it.each([
    ["a draft", release("v9.0.0", { draft: true })],
    ["a pre-release", release("v9.0.0", { prerelease: true })],
    ["a tag that is not a version", release("nightly")],
    [
      "a page outside the repository",
      { tag_name: "v9.0.0", html_url: "https://evil.example/MIND/releases/v9" },
    ],
  ])("ignores %s", async (_name, body) => {
    const { updates, found } = rig(() => Promise.resolve(reply(body)));
    expect((await updates.check()).outcome).toBe("current");
    expect(updates.state().available).toBeNull();
    expect(found).toEqual([]);
  });

  it("reports an error, without throwing, for a failed, malformed or unreachable answer", async () => {
    const failing: ((url: string, init: RequestInit) => Promise<Response>)[] = [
      () => Promise.resolve(reply({ message: "rate limit" }, 403)),
      () => Promise.resolve(new Response("not json", { status: 200 })),
      () => Promise.resolve(reply({ nothing: true })),
      () => Promise.reject(new Error("offline")),
    ];
    for (const fetchImpl of failing) {
      const { updates } = rig(fetchImpl);
      const result = await updates.check();
      expect(result.outcome).toBe("error");
      expect(result.state.checkedAt).toBeNull();
      await core?.close();
    }
    core = undefined;
  });

  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    const { updates } = rig(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const pending = updates.check();
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS + 10);
    expect((await pending).outcome).toBe("error");
  });

  it("obeys the setting for the automatic check but not for a check the person asked for", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(reply(release("v0.3.0"))));
    const { updates } = rig(fetchImpl);
    expect(updates.enabled()).toBe(true);
    expect(updates.setEnabled(false).enabled).toBe(false);
    expect((await updates.check()).outcome).toBe("disabled");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await updates.check(true)).outcome).toBe("available");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(updates.setEnabled(true).enabled).toBe(true);
  });

  it("hides the notice for a dismissed version and shows the next one", async () => {
    let tag = "v0.3.0";
    const { updates, found } = rig(() => Promise.resolve(reply(release(tag))));
    await updates.check();
    expect(updates.dismiss("0.3.0").available).toBeNull();
    const again = await updates.check();
    expect(again.state.available).toBeNull();
    // A check the person asks for still says that a newer version exists.
    expect(again.release?.version).toBe("0.3.0");
    expect(again.outcome).toBe("available");
    tag = "v0.4.0";
    const next = await updates.check();
    expect(next.state.available?.version).toBe("0.4.0");
    expect(found).toEqual(["0.3.0", "0.4.0"]);
  });

  it("keeps the choices after the app restarts", async () => {
    const dir = tempDir();
    const make = () =>
      createCore({
        dataDir: dir,
        env: {},
        appVersion: "0.2.0",
        updateFetch: () => Promise.resolve(reply(release("v0.3.0"))),
      });
    const first = make();
    first.updates.setEnabled(false);
    first.updates.dismiss("0.3.0");
    await first.close();
    core = make();
    expect(core.updates.enabled()).toBe(false);
    await core.updates.check(true);
    expect(core.updates.state().available).toBeNull();
  });
});
