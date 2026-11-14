/*
 * Filename: drizzle.app.config.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/core/db/app-schema.ts",
  out: "./src/core/db/migrations/app",
});
