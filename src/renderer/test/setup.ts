/*
 * Filename: setup.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

if (typeof window !== "undefined" && typeof globalThis.ResizeObserver === "undefined") {
  // jsdom has no layout; Recharts only needs the observer to exist.
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

afterEach(() => {
  if (typeof document !== "undefined") {
    cleanup();
    delete document.documentElement.dataset["theme"];
    localStorage.clear();
  }
});
