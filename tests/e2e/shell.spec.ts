/*
 * Filename: shell.spec.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { APP_ARGS, launch, newProfile, removeProfile } from "./launch.js";
import type { Launched } from "./launch.js";

let current: Launched | undefined;
const profiles: string[] = [];

function profile(): string {
  const path = newProfile();
  profiles.push(path);
  return path;
}

test.afterEach(async () => {
  await current?.app.close().catch(() => undefined);
  current = undefined;
});

test.afterAll(() => {
  profiles.splice(0).forEach(removeProfile);
});

test("opens a native window within 3 seconds (FR-25, NFR-14)", async () => {
  current = await launch(profile());
  expect(current.openMs).toBeLessThan(3000);
  expect(await current.page.title()).toBe("MIND");
  await expect(current.page.getByRole("heading", { name: "Bem-vindo ao MIND" })).toBeVisible();
});

test("enforces the minimum window size of 960x600 (FR-25)", async () => {
  current = await launch(profile());
  const minimum = await current.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.getMinimumSize(),
  );
  expect(minimum).toEqual([960, 600]);
});

test("uses the secure web preferences and isolates the renderer (NFR-15, FR-31)", async () => {
  current = await launch(profile());
  const preferences = await current.app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const contents = window?.webContents as unknown as
      { getLastWebPreferences(): Record<string, unknown> } | undefined;
    return contents?.getLastWebPreferences();
  });
  expect(preferences).toMatchObject({
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
  });
  const exposed = await current.page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)["require"],
    process: typeof (globalThis as Record<string, unknown>)["process"],
    ipcRenderer: typeof (globalThis as Record<string, unknown>)["ipcRenderer"],
    mind: Object.keys(window.mind).sort(),
  }));
  expect(exposed).toEqual({
    require: "undefined",
    process: "undefined",
    ipcRenderer: "undefined",
    mind: ["invoke", "on"],
  });
});

test("answers typed IPC calls and rejects invalid ones (FR-31)", async () => {
  current = await launch(profile());
  const { page } = current;
  expect(await page.evaluate(() => window.mind.invoke("window:getState", {}))).toEqual({
    ok: true,
    data: { route: null, contractVersion: 2 },
  });
  const invalid = await page.evaluate(() =>
    window.mind.invoke("window:setLastRoute", { route: "https://evil.example" }),
  );
  expect(invalid).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  const unknown = await page.evaluate(async () => {
    try {
      await window.mind.invoke("fs:read" as never, {} as never);
      return "resolved";
    } catch (error) {
      return error instanceof Error ? error.message : "error";
    }
  });
  expect(unknown).toContain("Unknown channel");
});

test("blocks new windows and navigation to remote pages (NFR-15)", async () => {
  current = await launch(profile());
  const { page, app } = current;
  const opened = await page.evaluate(() => window.open("https://example.com") === null);
  expect(opened).toBe(true);
  const before = page.url();
  await page.evaluate(() => {
    window.location.href = "https://example.com/";
  });
  await page.waitForTimeout(500);
  expect(page.url()).toBe(before);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});

test("keeps a single instance and focuses the existing window (FR-26)", async () => {
  const userData = profile();
  current = await launch(userData);
  const executable = await current.app.evaluate(({ app }) => app.getPath("exe"));
  // Playwright starts Electron with --no-sandbox; the same flag keeps the second process alive
  // on machines where the setuid sandbox helper is not configured.
  const second = spawn(executable, ["--no-sandbox", ...APP_ARGS], {
    env: { ...process.env, MIND_USER_DATA_DIR: userData },
    stdio: "ignore",
  });
  const code = await new Promise<number | null>((resolve) => second.on("exit", resolve));
  expect(code).toBe(0);
  expect(
    await current.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
  ).toBe(1);
});

test("remembers the window geometry and the last route (FR-27)", async () => {
  const userData = profile();
  current = await launch(userData);
  await current.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setBounds({ x: 120, y: 90, width: 1100, height: 700 });
  });
  await current.page.evaluate(() =>
    window.mind.invoke("window:setLastRoute", { route: "/library" }),
  );
  await current.app.close();

  current = await launch(userData);
  const bounds = await current.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.getBounds(),
  );
  expect(bounds).toMatchObject({ width: 1100, height: 700 });
  expect(
    await current.page.evaluate(() => window.mind.invoke("window:getState", {})),
  ).toMatchObject({
    ok: true,
    data: { route: "/library" },
  });
});

test("keeps workspaces across restarts in the user data directory (FR-1, NFR-17)", async () => {
  const userData = profile();
  current = await launch(userData);
  const created = await current.page.evaluate(() =>
    window.mind.invoke("workspace:create", { name: "Biologia" }),
  );
  expect(created).toMatchObject({ ok: true, data: { name: "Biologia" } });
  const duplicate = await current.page.evaluate(() =>
    window.mind.invoke("workspace:create", { name: "biologia" }),
  );
  expect(duplicate).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  await current.app.close();

  current = await launch(userData);
  const listed = await current.page.evaluate(() => window.mind.invoke("workspace:list", {}));
  expect(listed).toMatchObject({ ok: true, data: { workspaces: [{ name: "Biologia" }] } });
  expect(existsSync(join(userData, "app.db"))).toBe(true);
});

test("opens no network port (FR-25, SC-2)", async () => {
  // Playwright adds its own debugging ports to the process it launches, so this test starts the
  // app directly and inspects the sockets owned by the whole process family.
  const userData = profile();
  const executable = await (async () => {
    current = await launch(userData);
    const path = await current.app.evaluate(({ app }) => app.getPath("exe"));
    await current.app.close();
    current = undefined;
    return path;
  })();
  const child = spawn(executable, ["--no-sandbox", ...APP_ARGS], {
    env: { ...process.env, MIND_USER_DATA_DIR: userData },
    stdio: "ignore",
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const pid = child.pid;
    expect(pid).toBeDefined();
    const table = execFileSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8" })
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/).map(Number) as [number, number]);
    const family = new Set<number>([pid ?? -1]);
    for (let grew = true; grew;) {
      grew = false;
      for (const [id, parent] of table) {
        if (family.has(parent) && !family.has(id)) {
          family.add(id);
          grew = true;
        }
      }
    }
    expect(family.size).toBeGreaterThan(1);
    const sockets = execFileSync("ss", ["-ltnpH"], { encoding: "utf8" });
    const owned = sockets
      .split("\n")
      .filter((line) =>
        [...line.matchAll(/pid=(\d+)/g)].some((match) => family.has(Number(match[1]))),
      );
    expect(owned).toEqual([]);
  } finally {
    child.kill("SIGTERM");
  }
});
