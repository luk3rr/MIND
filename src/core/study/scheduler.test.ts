/*
 * Filename: scheduler.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Rating, Scheduler, dayEnd, formatInterval, studyDay } from "./scheduler.js";
import type { CardSchedule } from "./scheduler.js";

interface Golden {
  start: string;
  scenarios: {
    name: string;
    steps: {
      rating: number;
      reviewed_at: string;
      due: string;
      state: number;
      reps: number;
      lapses: number;
      stability: number;
      difficulty: number;
    }[];
  }[];
  new_card_preview_seconds: Record<string, number>;
}

const golden = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "..", "fixtures", "fsrs.json"), "utf8"),
) as Golden;

const UTC = (): number => 0;
const BRT = (): number => 180;
const NOW = new Date("2026-01-01T12:00:00.000Z");

describe("Scheduler against the FSRS values of the Python implementation", () => {
  const scheduler = new Scheduler(0.9, false);

  for (const scenario of golden.scenarios) {
    it(`reviews "${scenario.name}" with the same states, intervals and memory values`, () => {
      let state: CardSchedule | null = null;
      for (const step of scenario.steps) {
        state = scheduler.review(state, step.rating as Rating, new Date(step.reviewed_at));
        const card = JSON.parse(state.fsrsJson) as { stability: number; difficulty: number };
        expect(state.state).toBe(step.state);
        expect(state.reps).toBe(step.reps);
        expect(state.lapses).toBe(step.lapses);
        // Memory values match exactly. The day-scale interval of a review card may differ by one
        // day between the two FSRS libraries (rounding of the interval ordering rule, R-1).
        const tolerance = step.state === 2 ? 86_400_000 : 500;
        expect(Math.abs(Date.parse(state.due) - Date.parse(step.due))).toBeLessThanOrEqual(
          tolerance,
        );
        expect(card.stability).toBeCloseTo(step.stability, 2);
        expect(card.difficulty).toBeCloseTo(step.difficulty, 2);
      }
    });
  }

  it("previews the interval of each rating for a new card", () => {
    const preview = scheduler.preview(null, new Date(golden.start));
    for (const [rating, seconds] of Object.entries(golden.new_card_preview_seconds)) {
      expect(preview[Number(rating) as Rating] / 1000).toBeCloseTo(seconds, 0);
    }
  });
});

describe("Scheduler behaviour", () => {
  const scheduler = new Scheduler(0.9, false);

  it("puts a new card rated good into learning with a short step", () => {
    const state = scheduler.review(null, Rating.GOOD, NOW);
    expect(state).toMatchObject({ state: 1, reps: 1, lapses: 0 });
    const wait = Date.parse(state.due) - NOW.getTime();
    expect(wait).toBeGreaterThanOrEqual(60_000);
    expect(wait).toBeLessThanOrEqual(600_000);
  });

  it("graduates after two goods and counts a lapse only on review cards", () => {
    const first = scheduler.review(null, Rating.GOOD, NOW);
    const second = scheduler.review(first, Rating.GOOD, new Date(first.due));
    expect(second.state).toBe(2);
    expect(Date.parse(second.due) - Date.parse(first.due)).toBeGreaterThanOrEqual(86_400_000);
    const lapsed = scheduler.review(second, Rating.AGAIN, new Date(second.due));
    expect(lapsed).toMatchObject({ state: 3, lapses: 1 });
    expect(scheduler.review(null, Rating.AGAIN, NOW).lapses).toBe(0);
  });

  it("orders the preview intervals and changes nothing", () => {
    const state = scheduler.review(
      scheduler.review(null, Rating.GOOD, NOW),
      Rating.GOOD,
      new Date("2026-01-01T12:10:00Z"),
    );
    const before = JSON.stringify(state);
    const preview = scheduler.preview(state, new Date(state.due));
    expect(preview[Rating.AGAIN]).toBeLessThan(preview[Rating.GOOD]);
    expect(preview[Rating.HARD]).toBeLessThanOrEqual(preview[Rating.GOOD]);
    expect(preview[Rating.GOOD]).toBeLessThan(preview[Rating.EASY]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("gives shorter intervals to a higher desired retention", () => {
    const interval = (retention: number): number => {
      const engine = new Scheduler(retention, false);
      const learned = engine.review(
        engine.review(null, Rating.GOOD, NOW),
        Rating.GOOD,
        new Date("2026-01-01T12:10:00Z"),
      );
      return engine.preview(learned, new Date(learned.due))[Rating.GOOD];
    };
    expect(interval(0.97)).toBeLessThan(interval(0.8));
  });
});

describe("study day", () => {
  it.each([
    ["2026-03-10T05:00:00Z", "2026-03-09"],
    ["2026-03-10T06:59:00Z", "2026-03-09"],
    ["2026-03-10T07:00:00Z", "2026-03-10"],
    ["2026-03-11T02:59:00Z", "2026-03-10"],
  ])("%s in Brasília belongs to %s (the day turns over at 4 am)", (iso, expected) => {
    expect(studyDay(new Date(iso), BRT)).toBe(expected);
  });

  it("uses UTC when the offset is zero", () => {
    expect(studyDay(new Date("2026-03-10T03:59:00Z"), UTC)).toBe("2026-03-09");
    expect(studyDay(new Date("2026-03-10T04:00:00Z"), UTC)).toBe("2026-03-10");
  });

  it.each([
    ["2026-03-10T05:00:00Z", "2026-03-10T07:00:00.000Z"],
    ["2026-03-10T08:00:00Z", "2026-03-11T07:00:00.000Z"],
    ["2026-03-11T06:59:00Z", "2026-03-11T07:00:00.000Z"],
  ])("the day of %s ends at %s", (iso, expected) => {
    expect(dayEnd(new Date(iso), BRT).toISOString()).toBe(expected);
  });
});

describe("formatInterval", () => {
  it.each([
    [30_000, "< 1 min"],
    [60_000, "1 min"],
    [600_000, "10 min"],
    [3 * 3_600_000, "3 h"],
    [3 * 86_400_000, "3 d"],
    [29 * 86_400_000, "29 d"],
    [60 * 86_400_000, "2 meses"],
    [35 * 86_400_000, "1 mês"],
    [547 * 86_400_000, "1,5 anos"],
    [365 * 86_400_000, "1,0 ano"],
    [800 * 86_400_000, "2,2 anos"],
    [-5, "< 1 min"],
  ])("%i ms is labelled %s", (ms, label) => {
    expect(formatInterval(ms)).toBe(label);
  });
});
