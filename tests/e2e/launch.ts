/*
 * Filename: launch.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..", "..");

export interface Launched {
  app: ElectronApplication;
  page: Page;
  userData: string;
  /** Milliseconds from the launch call until the first window finished loading. */
  openMs: number;
}

/** The Chromium sandbox helper needs setuid or unprivileged user namespaces, which some CI
 * images forbid; `MIND_E2E_NO_SANDBOX=1` passes `--no-sandbox` there. */
const EXTRA_ARGS = process.env["MIND_E2E_NO_SANDBOX"] === "1" ? ["--no-sandbox"] : [];

export function newProfile(): string {
  return mkdtempSync(join(tmpdir(), "mind-e2e-"));
}

export function removeProfile(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

export async function launch(userData: string = newProfile()): Promise<Launched> {
  const started = Date.now();
  const app = await electron.launch({
    args: [...EXTRA_ARGS, ROOT],
    env: { ...process.env, MIND_USER_DATA_DIR: userData },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("route").waitFor();
  return { app, page, userData, openMs: Date.now() - started };
}
