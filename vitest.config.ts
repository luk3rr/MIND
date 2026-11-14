/*
 * Filename: vitest.config.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["src/renderer/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/index.ts",
        "src/main/window-state.ts",
        "src/renderer/src/main.tsx",
        "src/renderer/src/env.d.ts",
        "src/renderer/test/**",
        "src/core/test/**",
        "scripts/**",
      ],
      reporter: ["text", "html"],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
