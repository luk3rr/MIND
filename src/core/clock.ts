/*
 * Filename: clock.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

/** Isolated clock so tests can control time. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** ISO-8601 UTC timestamp, the format used for every date column. */
export function isoNow(clock: Clock = systemClock): string {
  return clock.now().toISOString();
}
