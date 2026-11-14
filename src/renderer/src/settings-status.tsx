/*
 * Filename: settings-status.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { createContext, useContext } from "react";
import type { OutputOf } from "../../core/contracts/index.js";
import type { InvokeState } from "./hooks.js";

export interface SettingsStatus {
  state: InvokeState<OutputOf<"settings:get">>;
  /** Reloads the provider status (the setup banner depends on it). */
  refresh(): void;
}

export const SettingsStatusContext = createContext<SettingsStatus | null>(null);

export function useSettingsStatus(): SettingsStatus {
  const value = useContext(SettingsStatusContext);
  if (!value) return { state: { status: "loading" }, refresh: () => undefined };
  return value;
}
