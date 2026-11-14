/*
 * Filename: env.d.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { MindApi } from "../../core/contracts/api.js";

declare global {
  interface Window {
    mind: MindApi;
  }
  const __APP_VERSION__: string;
}
