/*
 * Filename: electron.vite.config.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CSP } from "./src/main/security.js";

/** Adds the content security policy to the packaged page (the dev server needs inline code). */
const cspMeta = {
  name: "mind-csp-meta",
  transformIndexHtml: {
    order: "post" as const,
    handler(html: string, context: { server?: unknown }): string {
      if (context.server) return html;
      return html.replace(
        "<head>",
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  },
};

const { version } = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
  version: string;
};

export default defineConfig({
  main: {
    build: {
      outDir: "out/main",
      rollupOptions: { input: { index: resolve("src/main/index.ts") } },
    },
  },
  preload: {
    build: {
      outDir: "out/preload",
      // A sandboxed preload must be CommonJS.
      rollupOptions: {
        input: { index: resolve("src/preload/index.ts") },
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [react(), cspMeta],
    build: {
      outDir: "out/renderer",
      rollupOptions: { input: resolve("src/renderer/index.html") },
    },
  },
});
