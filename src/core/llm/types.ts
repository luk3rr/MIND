/*
 * Filename: types.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Token usage of one call; `costUsd` is null when the provider did not report it. */
export interface Usage {
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
}

export function emptyUsage(): Usage {
  return { promptTokens: 0, completionTokens: 0, costUsd: null };
}
