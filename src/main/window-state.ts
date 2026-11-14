/*
 * Filename: window-state.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import Store from "electron-store";
import type { Bounds, SavedWindow } from "./window-bounds.js";

interface StateSchema extends SavedWindow {
  lastRoute: string | null;
}

/** Persists the window geometry and the last route per user (FR-27). */
export class WindowState {
  private readonly store: Store<StateSchema>;

  constructor() {
    this.store = new Store<StateSchema>({
      name: "window-state",
      defaults: { bounds: null, maximized: false, lastRoute: null },
    });
  }

  get saved(): SavedWindow {
    return { bounds: this.store.get("bounds"), maximized: this.store.get("maximized") };
  }

  get lastRoute(): string | null {
    return this.store.get("lastRoute");
  }

  set lastRoute(route: string | null) {
    this.store.set("lastRoute", route);
  }

  saveGeometry(bounds: Bounds, maximized: boolean): void {
    this.store.set("bounds", bounds);
    this.store.set("maximized", maximized);
  }
}
