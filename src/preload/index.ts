/*
 * Filename: index.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { contextBridge, ipcRenderer } from "electron";
import { CHANNEL_NAMES, EVENT_NAMES } from "../core/contracts/channel-names.js";
import type { ChannelName, EventName } from "../core/contracts/channel-names.js";
import type { MindApi } from "../core/contracts/api.js";

const channels: readonly string[] = CHANNEL_NAMES;
const events: readonly string[] = EVENT_NAMES;

const api: MindApi = {
  invoke: (channel: ChannelName, payload) => {
    if (!channels.includes(channel)) {
      return Promise.reject(new Error(`Unknown channel: ${String(channel)}`));
    }
    return ipcRenderer.invoke("mind:invoke", channel, payload);
  },
  on: (event: EventName, handler) => {
    if (!events.includes(event)) throw new Error(`Unknown event: ${String(event)}`);
    const listener = (_event: unknown, payload: unknown): void => handler(payload);
    ipcRenderer.on(event, listener);
    return () => {
      ipcRenderer.removeListener(event, listener);
    };
  },
};

contextBridge.exposeInMainWorld("mind", api);
