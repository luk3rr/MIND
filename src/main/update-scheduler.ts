/*
 * Filename: update-scheduler.ts
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

export const FIRST_CHECK_MS = 10_000;
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Runs `check` shortly after start and then once a day. A check that throws is ignored, and the
 * returned function stops the schedule. The timers never keep the process alive.
 */
export function startUpdateChecks(
  check: () => Promise<unknown>,
  options: { firstDelayMs?: number; intervalMs?: number } = {},
): () => void {
  const run = (): void => {
    void check().catch(() => undefined);
  };
  const first = setTimeout(run, options.firstDelayMs ?? FIRST_CHECK_MS);
  const every = setInterval(run, options.intervalMs ?? CHECK_INTERVAL_MS);
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
