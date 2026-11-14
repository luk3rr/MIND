/*
 * Filename: vitest.config.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/index.ts",
        "src/main/window-state.ts",
        "src/renderer/**",
      ],
      reporter: ["text", "html"],
      // The 80% threshold is enforced from UNIT-3 on, once there is product code.
    },
  },
});
