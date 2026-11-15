/*
 * Filename: practice-facets.test.ts
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { generationRig } from "../../core/test/generation-fixture.js";
import type { GenerationRig } from "../../core/test/generation-fixture.js";
import { createHandlers } from "./handlers.js";
import { createRouter } from "./router.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

describe("practice:facets", () => {
  it("lists the topics, materials and types of the approved questions, not of the cards", async () => {
    rig = generationRig();
    const { core, workspaceId, materialId } = rig;
    const dispatch = createRouter(
      createHandlers(core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
      { error: () => undefined },
    );
    expect(await dispatch("practice:facets", { workspaceId })).toMatchObject({
      ok: true,
      data: { topics: [], materials: [], subtypes: [], questions: 0 },
    });
    const run = core.generation(workspaceId).start({
      materialId,
      subtype: "multiple_choice_4",
      quantity: 2,
      kind: "question",
    });
    await core.queue.wait(workspaceId, run.jobId as number);
    core.review(workspaceId).review(
      core
        .review(workspaceId)
        .list({ runId: run.id })
        .map((entry) => entry.id),
    );
    const cards = core.generation(workspaceId).start({
      materialId,
      subtype: "qa",
      quantity: 3,
      kind: "card",
    });
    await core.queue.wait(workspaceId, cards.jobId as number);
    core.review(workspaceId).review(
      core
        .review(workspaceId)
        .list({ runId: cards.id })
        .map((entry) => entry.id),
    );
    expect(await dispatch("practice:facets", { workspaceId })).toMatchObject({
      ok: true,
      data: {
        subtypes: [{ key: "multiple_choice", count: 2 }],
        materials: [{ key: materialId, count: 2 }],
        topics: [{ count: 2 }],
        questions: 2,
        cards: 3,
      },
    });
  });
});
