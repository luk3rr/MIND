/*
 * Filename: channel-names.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

/** Names of the invoke channels. Kept free of imports so the sandboxed preload can bundle it. */
export const CHANNEL_NAMES = [
  "window:getState",
  "window:setLastRoute",
  "workspace:list",
  "workspace:create",
  "workspace:rename",
  "workspace:delete",
  "today:summary",
  "material:list",
  "material:import",
  "material:importUrl",
  "material:delete",
  "material:chunks",
  "material:search",
  "generation:estimate",
  "generation:start",
  "generation:cancel",
  "generation:list",
  "generation:get",
  "review:list",
  "review:get",
  "review:approve",
  "review:discard",
  "review:approveAll",
  "review:edit",
  "study:today",
  "study:next",
  "study:rate",
  "study:undo",
  "study:saveSettings",
  "practice:next",
  "practice:answer",
  "practice:counts",
  "settings:get",
  "settings:save",
  "settings:clearKey",
  "settings:setConsent",
  "settings:refreshModels",
  "settings:getCost",
] as const;

/** Names of the events pushed from the main process to the window. */
export const EVENT_NAMES = ["window:focus-requested", "job:progress", "job:finished"] as const;

export type ChannelName = (typeof CHANNEL_NAMES)[number];
export type EventName = (typeof EVENT_NAMES)[number];
