/*
 * Filename: update-scheduler.test.ts
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECK_INTERVAL_MS, FIRST_CHECK_MS, startUpdateChecks } from "./update-scheduler.js";

afterEach(() => vi.useRealTimers());

describe("startUpdateChecks", () => {
  it("checks shortly after start and then once a day", async () => {
    vi.useFakeTimers();
    const check = vi.fn(() => Promise.resolve());
    const stop = startUpdateChecks(check);
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_MS - 1);
    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 3);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("ignores a check that fails and keeps the schedule", async () => {
    vi.useFakeTimers();
    const check = vi.fn(() => Promise.reject(new Error("offline")));
    const stop = startUpdateChecks(check, { firstDelayMs: 5, intervalMs: 50 });
    await vi.advanceTimersByTimeAsync(110);
    expect(check).toHaveBeenCalledTimes(3);
    stop();
  });

  it("can be stopped before the first check", async () => {
    vi.useFakeTimers();
    const check = vi.fn(() => Promise.resolve());
    startUpdateChecks(check, { firstDelayMs: 100, intervalMs: 1000 })();
    await vi.advanceTimersByTimeAsync(5000);
    expect(check).not.toHaveBeenCalled();
  });
});
