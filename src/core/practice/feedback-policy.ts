/*
 * Filename: feedback-policy.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

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
 * feedback is shown with the answer; the end-of-block feedback waits until the block is released.
 */
export function releaseFor(mode: FeedbackMode, answeredAt: Date): FeedbackRelease {
  switch (mode) {
    case "immediate":
      return { releaseAt: answeredAt.toISOString(), seen: true };
    case "block":
      return { releaseAt: null, seen: false };
    case "next_day":
      // The next-day mode arrives with the pending list (UNIT-4); until then it waits like a block.
      return { releaseAt: null, seen: false };
  }
}
