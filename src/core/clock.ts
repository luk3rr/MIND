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

/** A clock that runs ahead of the system clock by `hours`; end-to-end runs use it to cross a day change. */
export function shiftedClock(hours: number, base: Clock = systemClock): Clock {
  return { now: () => new Date(base.now().getTime() + hours * 3_600_000) };
}
