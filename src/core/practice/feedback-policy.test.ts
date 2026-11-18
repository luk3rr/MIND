/*
 * Filename: feedback-policy.test.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { releaseFor } from "./feedback-policy.js";

const answeredAt = new Date("2026-03-10T22:15:00.000Z");

describe("releaseFor (FR-7)", () => {
  it("shows the feedback with the answer in the immediate mode", () => {
    expect(releaseFor("immediate", answeredAt)).toEqual({
      releaseAt: "2026-03-10T22:15:00.000Z",
      seen: true,
    });
  });

  it("holds the feedback until the block is released in the block mode", () => {
    expect(releaseFor("block", answeredAt)).toEqual({ releaseAt: null, seen: false });
  });

  it("releases the next-day feedback when the study day turns over, at 4:00", () => {
    expect(releaseFor("next_day", answeredAt, () => 0)).toEqual({
      releaseAt: "2026-03-11T04:00:00.000Z",
      seen: false,
    });
  });

  it("uses the local time: 4:00 at UTC-3 is 7:00 UTC", () => {
    expect(releaseFor("next_day", answeredAt, () => 180).releaseAt).toBe(
      "2026-03-11T07:00:00.000Z",
    );
  });

  it("releases an answer given after midnight but before 4:00 at 4:00 of the same day", () => {
    const late = new Date("2026-03-11T01:30:00.000Z");
    expect(releaseFor("next_day", late, () => 0).releaseAt).toBe("2026-03-11T04:00:00.000Z");
  });

  it("releases an answer given at 4:00 sharp on the following turn-over", () => {
    const sharp = new Date("2026-03-11T04:00:00.000Z");
    expect(releaseFor("next_day", sharp, () => 0).releaseAt).toBe("2026-03-12T04:00:00.000Z");
  });
});
