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
});
