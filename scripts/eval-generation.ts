/*
 * Filename: eval-generation.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

/**
 * Measures how well the generation stays on the subject of a material, with the REAL model.
 *
 * It seeds a temporary workspace with the labelled handout of the relevance fixtures (content,
 * worked example, teacher's comment, exam questions, motivating texts and pages that are not
 * content), runs the real generation for cards and for questions, and reports the two goals:
 *
 * - items from an excerpt that may not be a source (a motivating text, an exam question for a
 *   card, a page of the handout) that still came out: the goal is none;
 * - the share of the content excerpts that gave at least one item: the goal is 80%.
 *
 * It costs real money (a few generation and review calls) and needs the key in the environment,
 * so it is run by hand and never by the tests or the CI:
 *
 *   OPENROUTER_API_KEY=... pnpm eval:generation [--cards 40] [--questions 20]
 *
 * The exit code is 1 when a goal was missed.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { createCore } from "../src/core/core.js";
import { chunk, item } from "../src/core/db/workspace-schema.js";
import { ENV_NAME } from "../src/core/secrets.js";
import { formatScore, score } from "../src/core/test/relevance/score.js";
import type { AcceptedItem } from "../src/core/test/relevance/score.js";
import { TARGETS } from "../src/core/test/relevance/cases.js";
import { seedHandout } from "../src/core/test/relevance/seed.js";

const { values } = parseArgs({
  options: {
    cards: { type: "string", default: "40" },
    questions: { type: "string", default: "20" },
  },
});

if (!process.env[ENV_NAME]) {
  console.error(`Defina ${ENV_NAME} para rodar a avaliação com o modelo real.`);
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), "mind-eval-"));
const core = createCore({ dataDir: dir, env: process.env });
let missed = false;
try {
  // The person has to accept sending excerpts to the provider; here that is the point of running.
  core.llm.consent.give(core.llm.provider.name);
  const workspaceId = core.registry.create("Avaliação").id;
  const { materialId } = seedHandout(core, workspaceId);
  const service = core.generation(workspaceId);
  const db = core.registry.open(workspaceId).connection.db;
  const settings = core.llm.settings.get();
  console.log(
    `Modelos: geração ${settings.generationModel}, juiz ${settings.judgeModel}. ` +
      `Metas: ${TARGETS.leaked} fora de escopo, ${Math.round(TARGETS.recall * 100)}% do conteúdo coberto.\n`,
  );

  const runs = [
    { kind: "card", subtype: "qa", quantity: Number(values.cards) },
    { kind: "question", subtype: "multiple_choice_4", quantity: Number(values.questions) },
  ] as const;
  for (const request of runs) {
    const run = service.start({ materialId, ...request });
    await core.queue.wait(workspaceId, run.jobId as number);
    const done = service.get(run.id);
    const accepted: AcceptedItem[] = db
      .select({ sourceText: chunk.text })
      .from(item)
      .innerJoin(chunk, eq(chunk.id, item.chunkId))
      .where(eq(item.runId, run.id))
      .all();
    const result = score(request.kind, accepted);
    console.log(formatScore(request.kind, result));
    console.log(
      `          pedidos ${done.requested} · gerados ${done.generated} · fora do escopo ${done.discardedOutOfScope} · ` +
        `sem fonte ${done.discardedNoSource} · reprovados ${done.discardedUnsupported} · ` +
        `rodadas ${done.rounds} · custo US$ ${done.costUsd.toFixed(3)}` +
        (done.status === "done" ? "" : ` · status ${done.status} ${done.errorCode ?? ""}`),
    );
    if (!result.met) missed = true;
  }
} finally {
  await core.close();
  rmSync(dir, { recursive: true, force: true });
}
process.exit(missed ? 1 : 0);
