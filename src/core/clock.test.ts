/*
 * Filename: clock.test.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { shiftedClock } from "./clock.js";

describe("shiftedClock", () => {
  it("runs ahead of the clock it is built on by the given hours", () => {
    const base = { now: () => new Date("2026-03-10T10:00:00.000Z") };
    expect(shiftedClock(36, base).now().toISOString()).toBe("2026-03-11T22:00:00.000Z");
    expect(shiftedClock(0, base).now().toISOString()).toBe("2026-03-10T10:00:00.000Z");
  });

  it("follows the system clock by default", () => {
    const ahead = shiftedClock(1).now().getTime() - Date.now();
    expect(Math.abs(ahead - 3_600_000)).toBeLessThan(1000);
  });
});
