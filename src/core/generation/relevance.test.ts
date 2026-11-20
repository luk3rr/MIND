/*
 * Filename: relevance.test.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { createCore } from "../core.js";
import type { Core } from "../core.js";
import { chunk, generationRun, item } from "../db/workspace-schema.js";
import { FakeProvider } from "../llm/fake.js";
import { ALLOWED, CASES, REQUIRED, SUBJECT, TARGETS, caseOfText } from "../test/relevance/cases.js";
import { formatScore, score } from "../test/relevance/score.js";
import type { AcceptedItem } from "../test/relevance/score.js";
import { seedHandout } from "../test/relevance/seed.js";
import { tempDir } from "../test/helpers.js";
import { eq } from "drizzle-orm";

/** The excerpts of a prompt as `[excerpt id | label]` blocks, in order. */
function excerptsOf(content: string): { id: number; text: string }[] {
  return [
    ...content.matchAll(
      /\[excerpt (\d+) \|[^\]]*\]\n([\s\S]*?)(?=\n\n\[excerpt |\n\n[A-Z][^\n]*:\n|$)/g,
    ),
  ].map((match) => ({ id: Number(match[1]), text: (match[2] ?? "").trim() }));
}

/**
 * A model that is not careful about the subject: it writes one item from every excerpt it is
 * given, texts of exam questions and pages of the handout included. The reviewers below stand
 * for the judge models: they know what each excerpt is, as the labels of the fixtures say.
 */
function carelessModel(): FakeProvider {
  const provider = new FakeProvider({ promptTokens: 1, completionTokens: 1, costUsd: 0.001 });
  const quoteOf = (text: string): string => text.slice(0, 70);
  provider.script("CardBatch", (messages: readonly { content: string }[]) => ({
    cards: excerptsOf(messages.at(-1)?.content ?? "").map((excerpt, index) => ({
      subtype: "qa",
      front: `Qual é a regra ${index + 1}?`,
      back: "Está no material.",
      topic: "Acentuação",
      source: { chunk_id: excerpt.id, quote: quoteOf(excerpt.text) },
    })),
  }));
  provider.script("QuestionBatch", (messages: readonly { content: string }[]) => ({
    questions: excerptsOf(messages.at(-1)?.content ?? "").map((excerpt, index) => ({
      subtype: "certo_errado",
      statement: `A regra ${index + 1} vale sempre.`,
      options: [],
      answer: "C",
      explanation: "Está no material.",
      topic: "Acentuação",
      source: { chunk_id: excerpt.id, quote: quoteOf(excerpt.text) },
    })),
  }));
  provider.script("RelevanceBatch", (messages: readonly { content: string }[]) => {
    const content = messages.at(-1)?.content ?? "";
    const blocks = content.split(/\[card \d+\]\n/).slice(1);
    return {
      verdicts: blocks.map((block, index) => {
        const role = caseOfText(/^Excerpt:\n([\s\S]*?)\n\nCard:/.exec(block)?.[1] ?? "")?.role;
        const ok = role !== undefined && (ALLOWED.card as readonly string[]).includes(role);
        return { index, in_scope: ok, reason: ok ? "regra da disciplina" : `contexto: ${role}` };
      }),
    };
  });
  provider.script("JudgeBatch", (messages: readonly { content: string }[]) => {
    const content = messages.at(-1)?.content ?? "";
    const blocks = content.split(/\[question \d+\]\n/).slice(1);
    return {
      verdicts: blocks.map((block, index) => {
        const role = caseOfText(/^Excerpt:\n([\s\S]*?)\n\nStatement:/.exec(block)?.[1] ?? "")?.role;
        const ok = role !== undefined && (ALLOWED.question as readonly string[]).includes(role);
        return {
          index,
          supported: ok,
          reason: ok ? "ok" : `out_of_scope: contexto ${role}`,
        };
      }),
    };
  });
  return provider;
}

let core: Core | undefined;
afterEach(async () => {
  await core?.close();
  core = undefined;
});

/** Runs a generation over the handout and returns the accepted items with the text they cite. */
async function generate(
  request: { kind: "card" | "question"; subtype: string; quantity: number },
  options: { analyzed?: boolean; provider?: FakeProvider } = {},
) {
  const provider = options.provider ?? carelessModel();
  core = createCore({ dataDir: tempDir(), env: {}, provider });
  const workspaceId = core.registry.create("Relevância").id;
  const { materialId } = seedHandout(core, workspaceId, {
    ...(options.analyzed ? { analyzed: true } : {}),
  });
  const service = core.generation(workspaceId);
  const run = service.start({ materialId, ...request });
  await core.queue.wait(workspaceId, run.jobId as number);
  const db = core.registry.open(workspaceId).connection.db;
  const accepted: AcceptedItem[] = db
    .select({ sourceText: chunk.text })
    .from(item)
    .innerJoin(chunk, eq(chunk.id, item.chunkId))
    .where(eq(item.runId, run.id))
    .all();
  return { run: service.get(run.id), accepted, db, provider };
}

describe("the labelled handout (FR-17)", () => {
  it("has unique ids, usable quotes and every role", () => {
    expect(new Set(CASES.map((entry) => entry.id)).size).toBe(CASES.length);
    for (const entry of CASES) {
      expect(entry.text.length, entry.id).toBeGreaterThanOrEqual(70);
      expect(entry.text.length, entry.id).toBeLessThanOrEqual(600);
    }
    const roles = new Set(CASES.map((entry) => entry.role));
    expect([...roles].sort()).toEqual(
      ["commentary", "concept", "example", "exam_question", "motivating_text", "other"].sort(),
    );
    expect(REQUIRED).toEqual(["concept"]);
    expect(SUBJECT).toContain("ortografia");
  });

  it("allows an exam question only as the inspiration of a question", () => {
    expect(ALLOWED.card).not.toContain("exam_question");
    expect(ALLOWED.question).toContain("exam_question");
    for (const role of ["motivating_text", "other"] as const) {
      expect(ALLOWED.card).not.toContain(role);
      expect(ALLOWED.question).not.toContain(role);
    }
  });
});

describe("score", () => {
  const textOf = (id: string): string => CASES.find((entry) => entry.id === id)?.text ?? "";

  it("counts an item made from a motivating text as a leak, and an unknown source too", () => {
    const result = score("card", [
      { sourceText: textOf("paroxytone") },
      { sourceText: textOf("motivating-adolescence") },
      { sourceText: "um trecho que não é de nenhum caso" },
    ]);
    expect(result).toMatchObject({ accepted: 3, leaked: 2, covered: 1, required: 6, met: false });
    expect(result.leakedFrom).toEqual(["motivating-adolescence", "unknown"]);
  });

  it("meets the goals with no leak and at least 80% of the content covered", () => {
    const concepts = CASES.filter((entry) => entry.role === "concept").map((entry) => entry.text);
    expect(
      score(
        "card",
        concepts.slice(0, 5).map((sourceText) => ({ sourceText })),
      ),
    ).toMatchObject({
      leaked: 0,
      covered: 5,
      met: true,
    });
    expect(
      score(
        "card",
        concepts.slice(0, 4).map((sourceText) => ({ sourceText })),
      ),
    ).toMatchObject({
      covered: 4,
      met: false,
    });
    expect(TARGETS).toEqual({ leaked: 0, recall: 0.8 });
  });

  it("allows an exam question for questions but not for cards", () => {
    const items = [{ sourceText: textOf("exam-question-1") }];
    expect(score("card", items).leaked).toBe(1);
    expect(score("question", items).leaked).toBe(0);
  });

  it("writes one line for the report", () => {
    const line = formatScore("card", score("card", [{ sourceText: textOf("front-matter") }]));
    expect(line).toContain("fora de escopo que passaram 1 (de: front-matter)");
    expect(line).toContain("meta NÃO atingida");
  });
});

describe("the pipeline on the handout, with a careless model and the reviewers (FR-6, FR-7)", () => {
  it("keeps cards only from content, worked examples and the teacher's comment", async () => {
    const { run, accepted } = await generate({ kind: "card", subtype: "qa", quantity: 60 });
    const result = score("card", accepted);
    expect(result).toMatchObject({ leaked: 0, covered: 6, required: 6, met: true });
    // 15 excerpts, 8 of them allowed: the other 7 were dropped as off the subject.
    expect(run).toMatchObject({ generated: 8, discardedOutOfScope: 7, status: "done" });
    expect(run.discardLog.every((entry) => entry.reason.startsWith("out_of_scope: "))).toBe(true);
  });

  it("keeps questions from the same excerpts plus the exam questions, never the context", async () => {
    const { run, accepted } = await generate({
      kind: "question",
      subtype: "certo_errado",
      quantity: 30,
    });
    const result = score("question", accepted);
    expect(result).toMatchObject({ leaked: 0, covered: 6, met: true });
    expect(run).toMatchObject({ generated: 10, discardedOutOfScope: 5, status: "done" });
  });

  it("does not store anything from a motivating text or a page of the handout", async () => {
    const { db } = await generate({ kind: "card", subtype: "qa", quantity: 60 });
    const stored = db
      .select({ text: chunk.text, status: item.status })
      .from(item)
      .innerJoin(chunk, eq(chunk.id, item.chunkId))
      .all();
    for (const row of stored) {
      expect(["concept", "example", "commentary"]).toContain(caseOfText(row.text)?.role);
    }
    expect(db.select().from(generationRun).all()).toHaveLength(1);
  });
});

describe("the pipeline on the analyzed handout (FR-10, FR-11)", () => {
  const promptsOf = (provider: FakeProvider, schema: string): string[] =>
    provider.calls
      .filter((call) => call.schemaName === schema)
      .map((call) => call.messages.at(-1)?.content ?? "");

  it("never sends a motivating text, an exam question or a page of the handout to write cards", async () => {
    const { run, accepted, provider } = await generate(
      { kind: "card", subtype: "qa", quantity: 60 },
      { analyzed: true },
    );
    const prompts = promptsOf(provider, "CardBatch").join("\n");
    for (const id of ["front-matter", "contents", "motivating-adolescence", "exam-question-1"]) {
      const text = CASES.find((entry) => entry.id === id)?.text ?? "";
      expect(prompts, id).not.toContain(text.slice(0, 40));
    }
    // Content, the worked example and the teacher's comment reach the model, and every item that
    // comes out of them is kept: the reviewers had nothing off the subject left to drop.
    expect(prompts).toContain("| concept]");
    expect(prompts).toContain("| teacher's comment]");
    expect(score("card", accepted)).toMatchObject({ leaked: 0, covered: 6, met: true });
    expect(run).toMatchObject({ generated: 8, discardedOutOfScope: 0, withAnalysis: true });
  });

  it("sends a motivating text to write questions only as context, next to its question", async () => {
    const { run, accepted, provider } = await generate(
      { kind: "question", subtype: "certo_errado", quantity: 30 },
      { analyzed: true },
    );
    const prompts = promptsOf(provider, "QuestionBatch").join("\n");
    expect(prompts).toMatch(/\[context \d+ \| [^\]]*\| motivating text\]/);
    expect(prompts).toContain("Never use one as a source");
    // A motivating text with no question, and the pages that are not content, are not sent at all.
    for (const id of ["motivating-river", "front-matter", "contents"]) {
      const text = CASES.find((entry) => entry.id === id)?.text ?? "";
      expect(prompts, id).not.toContain(text.slice(0, 40));
    }
    expect(score("question", accepted)).toMatchObject({ leaked: 0, covered: 6, met: true });
    expect(run).toMatchObject({ generated: 10, discardedOutOfScope: 0, withAnalysis: true });
  });

  it("discards an item that cites a part sent only as context (FR-11)", async () => {
    const provider = carelessModel();
    provider.script("QuestionBatch", (messages: readonly { content: string }[]) => {
      const content = messages.at(-1)?.content ?? "";
      const contexts = [...content.matchAll(/\[context (\d+) \|[^\]]*\]\n([^\n]+)/g)];
      return {
        questions: contexts.map((match, index) => ({
          subtype: "certo_errado",
          statement: `Afirmação ${index + 1} sobre o texto.`,
          options: [],
          answer: "C",
          explanation: "Está no texto.",
          topic: "Acentuação",
          source: { chunk_id: Number(match[1]), quote: (match[2] ?? "").slice(0, 60) },
        })),
      };
    });
    const { run, accepted } = await generate(
      { kind: "question", subtype: "certo_errado", quantity: 30 },
      { analyzed: true, provider },
    );
    expect(accepted).toHaveLength(0);
    expect(run.discardedNoSource).toBeGreaterThan(0);
    expect(run.discardLog.map((entry) => entry.reason)).toContain("source_is_context");
  });

  it("falls back to the plain batches for a material that was never analyzed (FR-12)", async () => {
    const { run, provider } = await generate({ kind: "card", subtype: "qa", quantity: 60 });
    const prompts = promptsOf(provider, "CardBatch").join("\n");
    // Everything is sent, as an excerpt, with no role: the reviewers do the work.
    expect(prompts).toContain(CASES.find((entry) => entry.id === "contents")?.text.slice(0, 40));
    expect(prompts).not.toContain("| concept]");
    expect(prompts).not.toContain("[context ");
    expect(run).toMatchObject({ withAnalysis: false });
  });
});
