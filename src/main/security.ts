/*
 * Filename: security.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { WebPreferences } from "electron";

/** Web preferences every window of the app must use (NFR-15). */
export function secureWebPreferences(preloadPath: string): WebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
  };
}

/** Content security policy: only the app's own files, no remote code and no inline scripts. */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; " +
  "form-action 'none';";

/** True only for URLs that belong to the app itself (its packaged files or the dev server). */
export function isAppUrl(url: string, devServerUrl: string | undefined): boolean {
  try {
    const target = new URL(url);
    if (target.protocol === "file:") return true;
    return devServerUrl !== undefined && target.origin === new URL(devServerUrl).origin;
  } catch {
    return false;
  }
}
