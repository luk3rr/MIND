/*
 * Filename: api.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { ChannelName, EventName } from "./channel-names.js";
import type { InputOf, OutputOf } from "./channels.js";
import type { Result } from "./result.js";

/** The only surface the preload exposes to the window as `window.mind`. */
export interface MindApi {
  invoke<C extends ChannelName>(channel: C, payload: InputOf<C>): Promise<Result<OutputOf<C>>>;
  /** Subscribes to an event pushed by the main process; returns the unsubscribe function. */
  on(event: EventName, handler: () => void): () => void;
}
