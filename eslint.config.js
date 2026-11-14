/*
 * Filename: eslint.config.js
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import js from "@eslint/js";
import security from "eslint-plugin-security";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "legacy/**",
      ".aidlc/**",
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "out/**",
      "test-results/**",
      "playwright-report/**",
      "fixtures/**",
      "samples/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  security.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.es2023 } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      // Object keys are indexed by validated values; the rule produces noise on typed maps.
      "security/detect-object-injection": "off",
    },
  },
  {
    files: ["src/renderer/**"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ["scripts/**"],
    rules: { "security/detect-non-literal-fs-filename": "off" },
  },
);
