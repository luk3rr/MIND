/*
 * Filename: setup.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  if (typeof document !== "undefined") {
    cleanup();
    delete document.documentElement.dataset["theme"];
    localStorage.clear();
  }
});
