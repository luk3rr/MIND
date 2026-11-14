/*
 * Filename: questions.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../contracts/errors.js";
import { generationRun, item } from "../db/workspace-schema.js";
import { FakeProvider } from "../llm/fake.js";
import { generationRig, TEXTS } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";
import { Judge } from "./judge.js";
import { QuestionGenerator, payloadFor, questionProblem } from "./questions.js";
import { buildJudgeMessages, buildQuestionMessages } from "./question-prompts.js";
import { selectChunks } from "./planning.js";
import type { QuestionOut } from "./schemas.js";
import { questionBatchSchema } from "./schemas.js";

interface Golden {
  chunks: { id: number; label: string; text: string }[];
  avoid: string[];
  question_count: number;
  question_messages: Record<string, { role: string; content: string }[]>;
  judge_items: {
    excerpt: string;
    statement: string;
    options: [string, string][];
    answer: string;
  }[];
  judge_messages: { role: string; content: string }[];
}

const golden = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "..", "fixtures", "prompts.json"), "utf8"),
) as Golden;

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

describe("question prompts (golden values from the Python implementation)", () => {
  it.each(Object.keys(golden.question_messages))(
    "builds the %s prompt with identical text",
    (profile) => {
      expect(
        buildQuestionMessages(profile, golden.question_count, golden.chunks, golden.avoid),
      ).toEqual(golden.question_messages[profile]);
    },
  );

  it("builds the judge prompt with identical text", () => {
    expect(buildJudgeMessages(golden.judge_items)).toEqual(golden.judge_messages);
  });
});

const mc4 = (overrides: Partial<QuestionOut> = {}): QuestionOut => ({
  subtype: "multiple_choice",
  statement: "O que a fotossíntese converte?",
  options: [
    { key: "A", text: "Luz em energia química", why: "Confere com o trecho." },
    { key: "B", text: "Calor em luz", why: "Não confere." },
    { key: "C", text: "Som em calor", why: "Não confere." },
    { key: "D", text: "Água em ferro", why: "Não confere." },
  ],
  answer: "A",
  explanation: "O trecho diz que converte luz em energia química.",
  topic: "Biologia",
  source: { chunk_id: 1, quote: "converte a energia da luz em energia química" },
  ...overrides,
});

const ce = (overrides: Partial<QuestionOut> = {}): QuestionOut => ({
  subtype: "certo_errado",
  statement: "A fotossíntese ocorre nos cloroplastos.",
  options: [],
  answer: "C",
  explanation: "Está no trecho.",
  topic: null,
  source: { chunk_id: 1, quote: "nos cloroplastos das plantas verdes" },
  ...overrides,
});

describe("questionProblem", () => {
  it("accepts well formed questions of each profile", () => {
    expect(questionProblem(ce(), "certo_errado")).toBeNull();
    expect(questionProblem(mc4(), "multiple_choice_4")).toBeNull();
  });

  it.each([
    [ce({ subtype: "multiple_choice" }), "certo_errado", "wrong_subtype"],
    [ce({ statement: " " }), "certo_errado", "empty_statement"],
    [ce({ explanation: " " }), "certo_errado", "empty_explanation"],
    [ce({ answer: "X" }), "certo_errado", "bad_answer"],
    [mc4({ options: mc4().options.slice(0, 3) }), "multiple_choice_4", "wrong_option_count"],
    [
      mc4({ options: mc4().options.map((o, i) => ({ ...o, key: "ABCE"[i] as string })) }),
      "multiple_choice_4",
      "bad_option_keys",
    ],
    [
      mc4({ options: mc4().options.map((o, i) => (i === 1 ? { ...o, why: " " } : o)) }),
      "multiple_choice_4",
      "empty_option",
    ],
    [
      mc4({
        options: mc4().options.map((o, i) =>
          i === 1 ? { ...o, text: "luz em energia QUÍMICA" } : o,
        ),
      }),
      "multiple_choice_4",
      "duplicate_options",
    ],
    [mc4({ answer: "E" }), "multiple_choice_4", "bad_answer"],
    [mc4(), "multiple_choice_5", "wrong_option_count"],
    [mc4(), "nope", "unknown_profile"],
  ] as const)("flags %#", (question, profile, problem) => {
    expect(questionProblem(question as QuestionOut, profile)).toBe(problem);
  });

  it("builds the stored payload with fixed options for certo/errado", () => {
    expect(payloadFor(ce()).options).toEqual([
      { key: "C", text: "Certo", why: "" },
      { key: "E", text: "Errado", why: "" },
    ]);
    expect(payloadFor(mc4({ statement: "  Pergunta?  " })).statement).toBe("Pergunta?");
  });

  it("parses the batch schema and fills missing options", () => {
    const parsed = questionBatchSchema.parse({
      questions: [
        {
          subtype: "certo_errado",
          statement: "s",
          answer: "C",
          explanation: "e",
          source: { chunk_id: 1, quote: "q" },
        },
      ],
    });
    expect(parsed.questions[0]?.options).toEqual([]);
  });
});

describe("Judge", () => {
  const item = (statement: string) => ({
    excerpt: "x",
    statement,
    options: [] as [string, string][],
    answer: "C",
  });

  it("matches each verdict by index and reports the cost", async () => {
    const provider = new FakeProvider({ promptTokens: 1, completionTokens: 1, costUsd: 0.02 });
    provider.script("JudgeBatch", {
      verdicts: [
        { index: 1, supported: false, reason: "ambígua" },
        { index: 0, supported: true, reason: "" },
      ],
    });
    const result = await new Judge(provider).judge([item("a"), item("b")], "judge/model");
    expect(result).toEqual({
      supported: [true, false],
      reasons: ["supported", "ambígua"],
      costUsd: 0.02,
    });
    expect(provider.calls[0]?.model).toBe("judge/model");
  });

  it("counts missing, repeated or out-of-range verdicts against the question", async () => {
    const provider = new FakeProvider();
    provider.script("JudgeBatch", {
      verdicts: [
        { index: 0, supported: true, reason: "ok" },
        { index: 0, supported: false, reason: "dup" },
        { index: 9, supported: true, reason: "" },
        { index: -1, supported: true, reason: "" },
      ],
    });
    const result = await new Judge(provider).judge([item("a"), item("b")], "m");
    expect(result.supported).toEqual([true, false]);
    expect(result.reasons).toEqual(["ok", "no_verdict"]);
  });

  it("makes no model call when there is nothing to judge", async () => {
    const provider = new FakeProvider();
    expect(await new Judge(provider).judge([], "m")).toEqual({
      supported: [],
      reasons: [],
      costUsd: 0,
    });
    expect(provider.calls).toHaveLength(0);
  });
});

describe("QuestionGenerator", () => {
  function setup(
    questions: QuestionOut[],
    verdicts: { index: number; supported: boolean; reason: string }[],
  ) {
    const provider = new FakeProvider({ promptTokens: 5, completionTokens: 5, costUsd: 0.01 });
    provider.script("QuestionBatch", { questions });
    provider.script("JudgeBatch", { verdicts });
    rig = generationRig({ provider });
    const workspace = rig.core.registry.open(rig.workspaceId);
    const run = workspace.connection.db
      .insert(generationRun)
      .values({ kind: "question", subtype: "certo_errado", model: "m", requested: 5 })
      .returning()
      .get();
    const generator = new QuestionGenerator(
      workspace.connection.db,
      workspace.connection.sqlite,
      provider,
    );
    const chunks = selectChunks(workspace.connection.db, rig.materialId);
    const batch = (profile = "certo_errado") =>
      generator.generateBatch({
        runId: run.id,
        profile,
        count: 3,
        chunks,
        model: "m",
        judgeModel: "j",
        remaining: () => 5,
      });
    return { workspace, batch, provider };
  }

  it("stores only questions the judge supports, with the combined cost", async () => {
    const { workspace, batch } = setup(
      [ce(), ce({ statement: "A respiração ocorre nos cloroplastos.", answer: "E" })],
      [
        { index: 0, supported: true, reason: "" },
        { index: 1, supported: false, reason: "gabarito errado" },
      ],
    );
    const outcome = await batch();
    expect(outcome).toMatchObject({ accepted: 1, unsupported: 1, noSource: 0, costUsd: 0.02 });
    expect(outcome.log[0]?.reason).toBe("unsupported: gabarito errado");
    const [stored] = workspace.connection.db.select().from(item).all();
    expect(stored).toMatchObject({
      kind: "question",
      subtype: "certo_errado",
      status: "draft",
      sourcePage: 1,
    });
    expect(JSON.parse(stored?.payloadJson ?? "{}").answer).toBe("C");
  });

  it("discards invalid, unsourced and duplicate questions before judging", async () => {
    const { batch, provider } = setup(
      [
        ce({ answer: "X" }),
        ce({ source: { chunk_id: 9, quote: "nos cloroplastos das plantas verdes" } }),
        ce({ source: { chunk_id: 1, quote: "frase inventada que não existe aqui" } }),
        ce(),
        ce(),
      ],
      [{ index: 0, supported: true, reason: "" }],
    );
    const outcome = await batch();
    expect(outcome).toMatchObject({ accepted: 1, invalid: 1, noSource: 2, duplicate: 1 });
    expect(provider.calls.filter((c) => c.schemaName === "JudgeBatch")).toHaveLength(1);
  });

  it("does not call the judge when nothing survives the screening", async () => {
    const { batch, provider } = setup([ce({ answer: "X" })], []);
    expect(await batch()).toMatchObject({ accepted: 0, invalid: 1 });
    expect(provider.calls.filter((c) => c.schemaName === "JudgeBatch")).toHaveLength(0);
  });
});

describe("question runs", () => {
  it("generates and judges every batch, then counts rejected questions on the run (FR-9, FR-10)", async () => {
    rig = generationRig();
    const generation = rig.core.generation(rig.workspaceId);
    const run = generation.start({
      materialId: rig.materialId,
      subtype: "multiple_choice_4",
      quantity: 5,
      kind: "question",
    });
    await rig.core.queue.wait(rig.workspaceId, run.jobId as number);
    expect(generation.get(run.id)).toMatchObject({
      status: "done",
      generated: 5,
      kind: "question",
    });
    const items = rig.core.review(rig.workspaceId).list({ runId: run.id });
    expect(items).toHaveLength(5);
    expect(items[0]).toMatchObject({ kind: "question", options: expect.any(Array), answer: "A" });
    expect(items[0]?.options).toHaveLength(4);
  });

  it("validates question requests against their own limits and profiles", () => {
    rig = generationRig();
    const generation = rig.core.generation(rig.workspaceId);
    const base = { materialId: rig.materialId, subtype: "certo_errado", kind: "question" as const };
    expect(() => generation.start({ ...base, quantity: 31 })).toThrowError(AppError);
    expect(() => generation.start({ ...base, quantity: 3, subtype: "qa" })).toThrowError(
      expect.objectContaining({
        fields: [expect.objectContaining({ message: expect.stringMatching(/Perfil de questão/) })],
      }),
    );
    expect(() =>
      generation.start({ ...base, quantity: 3, kind: "card", subtype: "certo_errado" }),
    ).toThrowError(
      expect.objectContaining({
        fields: [expect.objectContaining({ message: expect.stringMatching(/Tipo de card/) })],
      }),
    );
  });

  it("estimates generation plus judging and needs both prices", () => {
    rig = generationRig({ texts: [TEXTS[0] as string, TEXTS[1] as string] });
    const generation = rig.core.generation(rig.workspaceId);
    const request = {
      materialId: rig.materialId,
      subtype: "certo_errado",
      kind: "question" as const,
      quantity: 6,
    };
    expect(generation.estimate(request).estimatedUsd).toBeNull();
    const settings = rig.core.llm.settings.get();
    const insert = rig.core.registry.appDatabase.sqlite.prepare(
      "INSERT INTO model_price (model, prompt_usd_per_token, completion_usd_per_token, fetched_at) VALUES (?, ?, ?, ?)",
    );
    insert.run(settings.generationModel, 0.000001, 0.000002, new Date().toISOString());
    expect(generation.estimate(request).estimatedUsd).toBeNull();
    insert.run(settings.judgeModel, 0.000003, 0.000006, new Date().toISOString());
    const estimate = generation.estimate(request);
    expect(estimate.estimatedUsd).toBeGreaterThan(0);
    expect(estimate.promptChars).toBeGreaterThan(2000);
  });
});
