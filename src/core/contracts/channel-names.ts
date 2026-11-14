/*
 * Filename: channel-names.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

/** Names of the invoke channels. Kept free of imports so the sandboxed preload can bundle it. */
export const CHANNEL_NAMES = ["window:getState", "window:setLastRoute"] as const;

/** Names of the events pushed from the main process to the window. */
export const EVENT_NAMES = ["window:focus-requested"] as const;

export type ChannelName = (typeof CHANNEL_NAMES)[number];
export type EventName = (typeof EVENT_NAMES)[number];
