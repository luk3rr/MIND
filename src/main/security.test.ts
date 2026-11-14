/*
 * Filename: security.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { CSP, isAppUrl, secureWebPreferences } from "./security.js";

describe("secureWebPreferences", () => {
  it("isolates the renderer from Node and the preload", () => {
    const preferences = secureWebPreferences("/app/preload.cjs");
    expect(preferences).toMatchObject({
      preload: "/app/preload.cjs",
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    });
  });
});

describe("isAppUrl", () => {
  it("accepts packaged files and the development server only", () => {
    expect(isAppUrl("file:///opt/mind/resources/app/out/renderer/index.html", undefined)).toBe(
      true,
    );
    expect(isAppUrl("http://localhost:5173/", "http://localhost:5173/")).toBe(true);
    expect(isAppUrl("http://localhost:5173/#/study", "http://localhost:5173/")).toBe(true);
  });

  it("rejects remote and malformed URLs", () => {
    expect(isAppUrl("https://example.com/", undefined)).toBe(false);
    expect(isAppUrl("http://localhost:9999/", "http://localhost:5173/")).toBe(false);
    expect(isAppUrl("http://localhost:5173/", undefined)).toBe(false);
    expect(isAppUrl("not a url", undefined)).toBe(false);
  });
});

describe("CSP", () => {
  it("allows no remote script and no inline script", () => {
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(CSP).toContain("object-src 'none'");
  });
});
