/*
 * Filename: feedback-policy.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { dayEnd, systemOffset } from "../study/scheduler.js";
import type { TzOffset } from "../study/scheduler.js";
import type { FeedbackMode } from "./settings.js";

/** When the feedback of one answer becomes visible and whether the student already saw it. */
export interface FeedbackRelease {
  /** Null while the feedback waits for the end of the block. */
  releaseAt: string | null;
  /** True when the feedback is shown together with the answer. */
  seen: boolean;
}

/**
 * Decides, for an answer given at `answeredAt`, when its feedback becomes visible. Immediate
 * feedback is shown with the answer; the end-of-block feedback waits until the block is released;
 * the next-day feedback is released when the study day turns over (at 4:00, local time).
 */
export function releaseFor(
  mode: FeedbackMode,
  answeredAt: Date,
  offset: TzOffset = systemOffset,
): FeedbackRelease {
  switch (mode) {
    case "immediate":
      return { releaseAt: answeredAt.toISOString(), seen: true };
    case "block":
      return { releaseAt: null, seen: false };
    case "next_day":
      return { releaseAt: dayEnd(answeredAt, offset).toISOString(), seen: false };
  }
}
