/*
 * Filename: reader-windows.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { ReaderWindows, readerRoute } from "./reader-windows.js";
import type { ReaderWindow } from "./reader-windows.js";

class FakeWindow implements ReaderWindow {
  destroyed = false;
  focused = 0;
  loaded: string[] = [];
  private listener: (() => void) | null = null;
  constructor(readonly route: string) {
    this.loaded.push(route);
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
  focus(): void {
    this.focused += 1;
  }
  loadRoute(route: string): void {
    this.loaded.push(route);
  }
  onClosed(listener: () => void): void {
    this.listener = listener;
  }
  close(): void {
    this.destroyed = true;
    this.listener?.();
  }
}

function rig() {
  const created: FakeWindow[] = [];
  const windows = new ReaderWindows((route) => {
    const window = new FakeWindow(route);
    created.push(window);
    return window;
  });
  return { windows, created };
}

describe("reader windows (FR-19, ADR-4)", () => {
  it("builds the in-app reader route, with the page when given", () => {
    expect(readerRoute({ workspaceId: 2, materialId: 9, page: 12 })).toBe(
      "/w/2/library/9/read?page=12",
    );
    expect(readerRoute({ workspaceId: 2, materialId: 9 })).toBe("/w/2/library/9/read");
  });

  it("opens one window per material and focuses it when asked again", () => {
    const { windows, created } = rig();
    windows.open({ workspaceId: 1, materialId: 4 });
    windows.open({ workspaceId: 1, materialId: 4 });
    windows.open({ workspaceId: 1, materialId: 5 });
    expect(created.map((window) => window.route)).toEqual([
      "/w/1/library/4/read",
      "/w/1/library/5/read",
    ]);
    expect(created[0]?.focused).toBe(1);
    expect(windows.count).toBe(2);
  });

  it("moves an open window to the requested page", () => {
    const { windows, created } = rig();
    windows.open({ workspaceId: 1, materialId: 4, page: 2 });
    windows.open({ workspaceId: 1, materialId: 4, page: 7 });
    expect(created).toHaveLength(1);
    expect(created[0]?.loaded).toEqual([
      "/w/1/library/4/read?page=2",
      "/w/1/library/4/read?page=7",
    ]);
  });

  it("forgets a closed window and opens a new one next time", () => {
    const { windows, created } = rig();
    windows.open({ workspaceId: 1, materialId: 4 });
    created[0]?.close();
    expect(windows.count).toBe(0);
    windows.open({ workspaceId: 1, materialId: 4 });
    expect(created).toHaveLength(2);
  });

  it("closes every reader window with the main window", () => {
    const { windows, created } = rig();
    windows.open({ workspaceId: 1, materialId: 4 });
    windows.open({ workspaceId: 1, materialId: 5 });
    windows.closeAll();
    expect(created.every((window) => window.destroyed)).toBe(true);
    expect(windows.count).toBe(0);
  });
});
