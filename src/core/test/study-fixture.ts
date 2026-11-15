/*
 * Filename: study-fixture.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { fixedClock } from "./helpers.js";
import type { Provider } from "../llm/provider.js";
import { generationRig } from "./generation-fixture.js";
import type { GenerationRig } from "./generation-fixture.js";

export interface StudyRig extends GenerationRig {
  clock: ReturnType<typeof fixedClock>;
  itemIds: number[];
}

/** A workspace with `count` approved cards (approval times one second apart) and a fixed clock. */
export async function studyRig(
  count = 5,
  options: { newPerDay?: number } = {},
  provider?: Provider,
): Promise<StudyRig> {
  const clock = fixedClock("2026-03-10T15:00:00.000Z");
  const rig = generationRig({ clock, tzOffset: () => 0, ...(provider ? { provider } : {}) });
  const generation = rig.core.generation(rig.workspaceId);
  const run = generation.start({
    materialId: rig.materialId,
    subtype: "qa",
    quantity: count,
    kind: "card",
  });
  await rig.core.queue.wait(rig.workspaceId, run.jobId as number);
  const review = rig.core.review(rig.workspaceId);
  const ids = review.list({ runId: run.id }).map((entry) => entry.id);
  for (const id of ids) {
    clock.advance(1000);
    review.review([id]);
  }
  clock.advance(60_000);
  if (options.newPerDay !== undefined) {
    rig.core.study(rig.workspaceId).updateSettings({ newPerDay: options.newPerDay });
  }
  return { ...rig, clock, itemIds: ids };
}
