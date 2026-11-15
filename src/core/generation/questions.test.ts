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
import { scriptedCardProvider } from "../llm/scripted.js";
import { studyRig } from "../test/study-fixture.js";
import { QuestionGenerator, payloadFor, questionProblem } from "./questions.js";
import { buildJudgeMessages, buildQuestionMessages } from "./question-prompts.js";
import { selectChunks } from "./planning.js";
import { buildCardMessages } from "./prompts.js";
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

const calc4 = (overrides: Partial<QuestionOut> = {}): QuestionOut => ({
  subtype: "multiple_choice",
  statement:
    "Um capital de R$ 10.000,00 rende 5% ao ano a juros compostos por 3 anos. Qual o montante?",
  options: [
    { key: "A", text: "R$ 11.576,25", why: "Aplica a fórmula.", value: 11576.25 },
    { key: "B", text: "R$ 11.500,00", why: "Juros simples.", value: 11500 },
    { key: "C", text: "R$ 11.025,00", why: "Só dois anos.", value: 11025 },
    { key: "D", text: "R$ 10.500,00", why: "Só um ano.", value: 10500 },
  ],
  answer: "A",
  explanation: "M = C(1+i)^n.",
  topic: "Juros compostos",
  calculation: { expression: "10000*(1+0.05)^3", decimals: 2, unit: "R$" },
  source: { chunk_id: 1, quote: "converte a energia da luz em energia química" },
  ...overrides,
});

describe("calculation questions", () => {
  it("accepts a question whose arithmetic the app confirms", () => {
    expect(questionProblem(calc4(), "calculation_4")).toBeNull();
  });

  it.each([
    [calc4({ calculation: null }), "calc_missing"],
    [calc4({ calculation: { expression: "10000*", decimals: 2 } }), "calc_expression"],
    [calc4({ answer: "B" }), "calc_mismatch"],
    [
      calc4({ options: calc4().options.map((o) => (o.key === "A" ? { ...o, value: 11500 } : o)) }),
      "calc_duplicate_values",
    ],
    [
      calc4({
        options: calc4().options.map((o) => (o.key === "A" ? { ...o, value: undefined } : o)),
      }),
      "calc_missing_value",
    ],
  ] as const)("flags %#", (question, problem) => {
    expect(questionProblem(question as QuestionOut, "calculation_4")).toBe(problem);
  });

  it("still applies the rules of a multiple choice question", () => {
    expect(questionProblem(calc4({ options: calc4().options.slice(0, 3) }), "calculation_4")).toBe(
      "wrong_option_count",
    );
    expect(questionProblem(calc4(), "calculation_5")).toBe("wrong_option_count");
    expect(questionProblem(calc4(), "multiple_choice_4")).toBeNull();
  });

  it("stores the confirmed expression and adds the verified computation to the explanation", () => {
    const payload = payloadFor(calc4());
    expect(payload.calculation).toEqual({
      expression: "10000*(1+0.05)^3",
      decimals: 2,
      unit: "R$",
      result: 11576.25,
    });
    expect(payload.explanation).toContain(
      "Conta conferida pelo app: 10000*(1+0.05)^3 = 11.576,25 R$",
    );
    expect(payload.options.every((o) => !("value" in o))).toBe(true);
    expect(payloadFor(mc4()).calculation).toBeUndefined();
  });

  it("asks for calculation questions with their own instructions and reviewer", () => {
    const messages = buildQuestionMessages("calculation_4", 2, golden.chunks, []);
    expect(messages[0]?.content).toContain("calculation questions");
    expect(messages[1]?.content).toContain('Question type "calculation" with exactly 4 options');
    expect(buildJudgeMessages(golden.judge_items, true)[0]?.content).toContain(
      "arithmetic is verified separately",
    );
    expect(buildJudgeMessages(golden.judge_items)[0]?.content).not.toContain("arithmetic");
  });
});

describe("calculation runs (offline provider)", () => {
  it("generates calculation questions the app has verified, and drops one whose number is wrong", async () => {
    const provider = new FakeProvider({ promptTokens: 5, completionTokens: 5, costUsd: 0.01 });
    const wrong = calc4({
      statement: "Outra pergunta de cálculo com capital diferente?",
      options: calc4().options.map((o) =>
        o.key === "A" ? { ...o, value: 11600, text: "R$ 11.600,00" } : o,
      ),
    });
    provider.script("QuestionBatch", { questions: [calc4(), wrong] });
    provider.script("JudgeBatch", {
      verdicts: [{ index: 0, supported: true, reason: "" }],
    });
    rig = generationRig({ provider });
    const workspace = rig.core.registry.open(rig.workspaceId);
    const run = workspace.connection.db
      .insert(generationRun)
      .values({ kind: "question", subtype: "calculation_4", model: "m", requested: 5 })
      .returning()
      .get();
    const generator = new QuestionGenerator(
      workspace.connection.db,
      workspace.connection.sqlite,
      provider,
    );
    const outcome = await generator.generateBatch({
      runId: run.id,
      profile: "calculation_4",
      count: 2,
      chunks: selectChunks(workspace.connection.db, rig.materialId),
      model: "m",
      judgeModel: "j",
      remaining: () => 5,
    });
    expect(outcome).toMatchObject({ accepted: 1, invalid: 1 });
    expect(outcome.log[0]?.reason).toBe("calc_mismatch");
    const [stored] = workspace.connection.db.select().from(item).all();
    expect(stored?.subtype).toBe("multiple_choice");
    expect(JSON.parse(stored?.payloadJson ?? "{}").calculation.result).toBe(11576.25);
  });

  it("runs end to end with the scripted provider through the generation service", async () => {
    rig = generationRig();
    const generation = rig.core.generation(rig.workspaceId);
    const started = generation.start({
      materialId: rig.materialId,
      subtype: "calculation_5",
      quantity: 3,
      kind: "question",
    });
    await rig.core.queue.wait(rig.workspaceId, started.jobId as number);
    const items = rig.core.review(rig.workspaceId).list({ runId: started.id });
    expect(items).toHaveLength(3);
    expect(
      items.every((entry) => entry.subtype === "multiple_choice" && entry.options.length === 5),
    ).toBe(true);
    expect(items.every((entry) => entry.back.includes("Conta conferida pelo app"))).toBe(true);
  });
});

describe("the person's own request (instructions and variations)", () => {
  it("adds the instructions and the items to vary to the prompts, after the excerpts", () => {
    const base = buildQuestionMessages("multiple_choice_4", 2, golden.chunks, []);
    const asked = buildQuestionMessages("multiple_choice_4", 2, golden.chunks, [], {
      instructions: "  Foque em questões de aplicação.  ",
      seeds: ["O que a fotossíntese converte?"],
    });
    const prompt = asked[1]?.content ?? "";
    expect(prompt.startsWith(base[1]?.content ?? "")).toBe(true);
    expect(prompt).toContain("VARIATIONS of the existing items");
    expect(prompt).toContain("- O que a fotossíntese converte?");
    expect(prompt).toContain("Foque em questões de aplicação.");
    expect(prompt).toContain("never change the source and quote rules");
    expect(asked[0]).toEqual(base[0]);
    expect(buildQuestionMessages("multiple_choice_4", 2, golden.chunks, [], {})).toEqual(base);
    expect(
      buildQuestionMessages("multiple_choice_4", 2, golden.chunks, [], { instructions: "  " }),
    ).toEqual(base);
  });

  it("does the same for cards", () => {
    const asked = buildCardMessages("qa", 2, golden.chunks, [], { instructions: "Só definições." });
    expect(asked[1]?.content).toContain("Só definições.");
    expect(buildCardMessages("qa", 2, golden.chunks)[1]?.content).not.toContain(
      "Extra instructions",
    );
  });

  it("sends the instructions to the model on a run and keeps them out of the stored items", async () => {
    const provider = new FakeProvider({ promptTokens: 5, completionTokens: 5, costUsd: 0.01 });
    provider.script("QuestionBatch", { questions: [ce()] });
    provider.script("JudgeBatch", { verdicts: [{ index: 0, supported: true, reason: "" }] });
    rig = generationRig({ provider });
    const generation = rig.core.generation(rig.workspaceId);
    const started = generation.start({
      materialId: rig.materialId,
      subtype: "certo_errado",
      quantity: 1,
      kind: "question",
      instructions: "  Use pegadinhas sobre exceções.  ",
    });
    await rig.core.queue.wait(rig.workspaceId, started.jobId as number);
    const generationCall = provider.calls.find((call) => call.schemaName === "QuestionBatch");
    expect(generationCall?.messages[1]?.content).toContain("Use pegadinhas sobre exceções.");
    expect(
      JSON.stringify(rig.core.review(rig.workspaceId).list({ runId: started.id })),
    ).not.toContain("pegadinhas");
  });

  it("refuses long instructions and variations when nothing is approved yet", () => {
    rig = generationRig();
    const generation = rig.core.generation(rig.workspaceId);
    const base = { materialId: rig.materialId, subtype: "qa", quantity: 2, kind: "card" as const };
    expect(() => generation.estimate({ ...base, instructions: "x".repeat(501) })).toThrowError(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        fields: [expect.objectContaining({ field: "instructions" })],
      }),
    );
    expect(() => generation.start({ ...base, variations: true })).toThrowError(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        fields: [expect.objectContaining({ field: "variations" })],
      }),
    );
  });

  it("starts variations from the approved items of the material, newest first, instead of the avoid list", async () => {
    const provider = scriptedCardProvider();
    rig = await studyRig(3, {}, provider);
    const generation = rig.core.generation(rig.workspaceId);
    const seeds = generation.variationSeeds({
      materialId: rig.materialId,
      subtype: "qa",
      quantity: 2,
      kind: "card",
    });
    expect(seeds).toHaveLength(3);
    const started = generation.start({
      materialId: rig.materialId,
      subtype: "qa",
      quantity: 2,
      kind: "card",
      variations: true,
      instructions: "Mude os dados.",
    });
    await rig.core.queue.wait(rig.workspaceId, started.jobId as number);
    const call = provider.calls.filter((entry) => entry.schemaName === "CardBatch").at(-1);
    const prompt = call?.messages[1]?.content ?? "";
    expect(prompt).toContain("VARIATIONS");
    for (const seed of seeds) expect(prompt).toContain(`- ${seed}`);
    expect(prompt).toContain("Mude os dados.");
    expect(prompt).not.toContain("do not repeat them");
  });
});
