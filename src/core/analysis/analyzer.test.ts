/*
 * Filename: analyzer.test.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { asc, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../contracts/errors.js";
import { createCore } from "../core.js";
import type { Core } from "../core.js";
import { chunk, material } from "../db/workspace-schema.js";
import { recoverInterrupted } from "../jobs/store.js";
import { createJob, setState } from "../jobs/store.js";
import { FakeProvider } from "../llm/fake.js";
import { scriptedCardProvider } from "../llm/scripted.js";
import { generationRig } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";
import { tempDir } from "../test/helpers.js";
import { MaterialAnalyzer, analysisOf } from "./analyzer.js";
import type { ROLES } from "./classifier.js";

let rig: GenerationRig | undefined;
let extra: Core | undefined;
afterEach(async () => {
  await rig?.core.close();
  await extra?.close();
  rig = undefined;
  extra = undefined;
});

type Role = (typeof ROLES)[number];

/**
 * A model that classifies by the position of the excerpt in the window: the verdicts of each
 * call come from `roleOf(window number, index)`, the first excerpt of a window opens a unit
 * unless `opens` says otherwise.
 */
function classifier(
  roleOf: (window: number, index: number) => Role = () => "concept",
  subject: string | null = "Língua Portuguesa: acentuação",
): FakeProvider {
  const provider = new FakeProvider({ promptTokens: 1, completionTokens: 1, costUsd: 0.01 });
  provider.script("ClassifyBatch", (messages: readonly { content: string }[]) => {
    const content = messages.at(-1)?.content ?? "";
    const window = Number(/Window (\d+) of/.exec(content)?.[1] ?? 1);
    const total = (content.match(/\[excerpt \d+\]/g) ?? []).length;
    return {
      subject,
      chunks: Array.from({ length: total }, (_, index) => ({
        index,
        role: roleOf(window, index),
        starts_unit: true,
      })),
    };
  });
  return provider;
}

const texts = (count: number): string[] => Array.from({ length: count }, (_, i) => `Trecho ${i}`);

function setup(provider: FakeProvider, count = 5, windowSize?: number, overlap?: number) {
  rig = generationRig({ provider, texts: texts(count) });
  const workspace = rig.core.registry.open(rig.workspaceId);
  const analyzer =
    windowSize === undefined
      ? rig.core.analysis(rig.workspaceId)
      : new MaterialAnalyzer(workspace, rig.core.queue, rig.core.llm, {
          windowSize,
          overlap: overlap ?? 0,
        });
  const db = workspace.connection.db;
  const chunks = () => db.select().from(chunk).orderBy(asc(chunk.ordinal)).all();
  const row = () =>
    db
      .select()
      .from(material)
      .where(eq(material.id, rig?.materialId ?? 0))
      .get();
  const wait = async () => {
    const jobId = row()?.analysisJobId as number;
    await rig?.core.queue.wait(rig.workspaceId, jobId);
  };
  return { analyzer, db, chunks, row, wait, workspace };
}

describe("MaterialAnalyzer", () => {
  it("gives every chunk a role and a unit and infers the subject (FR-8)", async () => {
    const provider = classifier((_, index) => (index % 2 === 0 ? "concept" : "example"));
    const { analyzer, chunks, row, wait } = setup(provider);
    const started = analyzer.start(rig?.materialId ?? 0);
    expect(started.started).toBe(true);
    expect(started.analysis.state).toBe("analyzing");
    await wait();
    expect(chunks().map((c) => [c.role, c.startsUnit, c.unit])).toEqual([
      ["concept", 1, 1],
      ["example", 1, 2],
      ["concept", 1, 3],
      ["example", 1, 4],
      ["concept", 1, 5],
    ]);
    expect(row()).toMatchObject({ subjectInferred: "Língua Portuguesa: acentuação" });
    expect(analyzer.status(rig?.materialId ?? 0)).toMatchObject({ state: "done", progress: null });
    // It uses the judge model, once for a material that fits in a window.
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.model).toBe(rig?.core.llm.settings.get().judgeModel);
  });

  it("reads a long material in windows that overlap (A18)", async () => {
    const provider = classifier();
    const { analyzer, chunks, wait } = setup(provider, 10, 4, 1);
    analyzer.start(rig?.materialId ?? 0);
    await wait();
    // Windows of 4 with 1 in common: 0-3, 3-6, 6-9.
    expect(provider.calls).toHaveLength(3);
    expect(
      provider.calls.map(
        (c) => (c.messages.at(-1)?.content.match(/\[excerpt \d+\]/g) ?? []).length,
      ),
    ).toEqual([4, 4, 4]);
    expect(chunks().every((c) => c.role === "concept" && c.unit !== null)).toBe(true);
    expect(chunks().map((c) => c.unit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("keeps the subject of the first window only", async () => {
    const provider = new FakeProvider();
    let calls = 0;
    provider.script("ClassifyBatch", (messages: readonly { content: string }[]) => {
      calls += 1;
      const total = (messages.at(-1)?.content.match(/\[excerpt \d+\]/g) ?? []).length;
      return {
        subject: calls === 1 ? "Primeiro assunto" : "Outro assunto",
        chunks: Array.from({ length: total }, (_, index) => ({
          index,
          role: "concept",
          starts_unit: true,
        })),
      };
    });
    const { analyzer, row, wait } = setup(provider, 6, 3, 0);
    analyzer.start(rig?.materialId ?? 0);
    await wait();
    expect(calls).toBe(2);
    expect(row()?.subjectInferred).toBe("Primeiro assunto");
  });

  /** A model that classifies every excerpt as an example, failing windows as `failing` says. */
  function flaky(failing: (window: number, call: number) => AppError | null): {
    provider: FakeProvider;
    calls: number[];
  } {
    const provider = new FakeProvider();
    const calls: number[] = [];
    const perWindow = new Map<number, number>();
    provider.script("ClassifyBatch", (messages: readonly { content: string }[]) => {
      const content = messages.at(-1)?.content ?? "";
      const window = Number(/Window (\d+) of/.exec(content)?.[1] ?? 1);
      calls.push(window);
      const call = (perWindow.get(window) ?? 0) + 1;
      perWindow.set(window, call);
      const error = failing(window, call);
      if (error) throw error;
      const total = (content.match(/\[excerpt \d+\]/g) ?? []).length;
      return {
        subject: "Português",
        chunks: Array.from({ length: total }, (_, index) => ({
          index,
          role: "example",
          starts_unit: true,
        })),
      };
    });
    return { provider, calls };
  }
  const timeout = () => new AppError("PROVIDER_ERROR", "O provedor demorou mais de 120 s.");

  it("asks a window again after a failure of the provider, and still finishes (timeouts of a model that reasons)", async () => {
    const { provider, calls } = flaky((window, call) =>
      window === 2 && call < 3 ? timeout() : null,
    );
    const { analyzer, chunks, wait } = setup(provider, 6, 3, 0);
    analyzer.start(rig?.materialId ?? 0);
    await wait();
    expect(analyzer.status(rig?.materialId ?? 0).state).toBe("done");
    // Window 2 failed twice and answered on the third try; window 1 was asked once.
    expect(calls.filter((w) => w === 2)).toHaveLength(3);
    expect(calls.filter((w) => w === 1)).toHaveLength(1);
    expect(chunks().map((c) => c.unit)).toEqual([1, 2, 3, 4, 5, 6]);
    // Every call is capped, and a reasoning model is told not to go on.
    expect(provider.calls.every((c) => c.schemaName === "ClassifyBatch")).toBe(true);
  });

  it("limits what a window may spend and how hard the model reasons", async () => {
    const options: unknown[] = [];
    const provider = classifier();
    const original = provider.complete.bind(provider);
    provider.complete = ((messages, schema, o) => {
      options.push(o);
      return original(messages, schema, o);
    }) as typeof provider.complete;
    const { analyzer, wait } = setup(provider, 3);
    analyzer.start(rig?.materialId ?? 0);
    await wait();
    expect(options[0]).toMatchObject({
      purpose: "analysis",
      maxTokens: 6000,
      reasoningEffort: "low",
    });
  });

  it("keeps what the windows found when one keeps failing, and a new request only does what is left (FR-8, NFR-3)", async () => {
    let healthy = false;
    const { provider, calls } = flaky((window) => (window === 3 && !healthy ? timeout() : null));
    const { analyzer, chunks, row, wait } = setup(provider, 9, 3, 0);
    analyzer.start(rig?.materialId ?? 0);
    await wait();
    const failed = analyzer.status(rig?.materialId ?? 0);
    expect(failed).toMatchObject({
      state: "failed",
      errorCode: "PROVIDER_ERROR",
      analyzedAt: null,
    });
    // The failing window was tried three times, never more.
    expect(calls.filter((w) => w === 3)).toHaveLength(3);
    // The first two windows stay on the chunks; the last one was never classified.
    expect(chunks().map((c) => c.role)).toEqual([...Array(6).fill("example"), null, null, null]);
    expect(chunks().every((c) => c.unit === null)).toBe(true);
    expect(row()).toMatchObject({ analyzedAt: null, status: "indexed", subjectInferred: null });

    // The new request asks again for the first window (it carries the subject) and the one that
    // failed, and skips the window that was already done.
    healthy = true;
    calls.length = 0;
    const again = analyzer.start(rig?.materialId ?? 0);
    expect(again.started).toBe(true);
    await wait();
    expect(analyzer.status(rig?.materialId ?? 0).state).toBe("done");
    expect([...calls].sort()).toEqual([1, 3]);
    expect(chunks().map((c) => c.unit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(row()?.subjectInferred).toBe("Português");
  });

  it("asks a few windows at a time, not all at once", async () => {
    let running = 0;
    let most = 0;
    const provider = new FakeProvider(undefined, 20);
    provider.script("ClassifyBatch", (messages: readonly { content: string }[]) => {
      running += 1;
      most = Math.max(most, running);
      setTimeout(() => (running -= 1), 15);
      const total = (messages.at(-1)?.content.match(/\[excerpt \d+\]/g) ?? []).length;
      return {
        subject: null,
        chunks: Array.from({ length: total }, (_, index) => ({
          index,
          role: "concept",
          starts_unit: true,
        })),
      };
    });
    const { analyzer, wait } = setup(provider, 20, 2, 0);
    analyzer.start(rig?.materialId ?? 0);
    await wait();
    expect(analyzer.status(rig?.materialId ?? 0).state).toBe("done");
    expect(most).toBeGreaterThan(1);
    expect(most).toBeLessThanOrEqual(3);
  });

  it("pauses when the monthly limit is reached (FR-16)", async () => {
    const provider = new FakeProvider();
    provider.script("ClassifyBatch", () => {
      throw new AppError("MONTHLY_LIMIT_REACHED", "Gasto de US$ 5,00 de US$ 5,00.");
    });
    const { analyzer, wait } = setup(provider);
    analyzer.start(rig?.materialId ?? 0);
    await wait();
    expect(analyzer.status(rig?.materialId ?? 0)).toMatchObject({
      state: "paused",
      errorCode: "MONTHLY_LIMIT_REACHED",
    });
    // A limit is not a failure to try again.
    expect(provider.calls).toHaveLength(1);
  });

  it("can be cancelled, and then counts as failed with that reason", async () => {
    const provider = new FakeProvider(undefined, 150);
    provider.script("ClassifyBatch", { subject: null, chunks: [] });
    const { analyzer, wait, row } = setup(provider);
    analyzer.start(rig?.materialId ?? 0);
    const jobId = row()?.analysisJobId as number;
    expect(rig?.core.queue.cancel(rig.workspaceId, jobId)).toBe(true);
    await wait();
    expect(analyzer.status(rig?.materialId ?? 0)).toMatchObject({
      state: "failed",
      errorCode: "CANCELLED",
    });
    expect(row()?.analyzedAt).toBeNull();
  });

  it("does not start a second job while one is running", async () => {
    const provider = new FakeProvider(undefined, 80);
    provider.script("ClassifyBatch", { subject: null, chunks: [] });
    const { analyzer, wait, row } = setup(provider);
    analyzer.start(rig?.materialId ?? 0);
    const first = row()?.analysisJobId;
    const second = analyzer.start(rig?.materialId ?? 0);
    expect(second.started).toBe(false);
    expect(second.analysis.state).toBe("analyzing");
    expect(row()?.analysisJobId).toBe(first);
    await wait();
  });

  it("refuses a material that is not indexed or does not exist", () => {
    const { analyzer, db } = setup(classifier());
    expect(() => analyzer.start(999)).toThrowError(
      expect.objectContaining({ code: "MATERIAL_NOT_FOUND" }),
    );
    expect(() => analyzer.status(999)).toThrowError(
      expect.objectContaining({ code: "MATERIAL_NOT_FOUND" }),
    );
    db.update(material)
      .set({ status: "importing" })
      .where(eq(material.id, rig?.materialId ?? 0))
      .run();
    expect(() => analyzer.start(rig?.materialId ?? 0)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });

  it("has nothing to analyze in a material without chunks, and says it is done", () => {
    const provider = classifier();
    const { analyzer, db } = setup(provider);
    db.delete(chunk).run();
    const result = analyzer.start(rig?.materialId ?? 0);
    expect(result).toMatchObject({ started: false, analysis: { state: "done" } });
    expect(provider.calls).toHaveLength(0);
  });

  it("is refused without a key or consent, unless the person did not ask for it", () => {
    class NeedsKey extends FakeProvider {
      override readonly requiresConsent = true;
    }
    const provider = new NeedsKey();
    const { analyzer, row } = setup(provider);
    expect(() => analyzer.start(rig?.materialId ?? 0)).toThrowError(
      expect.objectContaining({ code: "PROVIDER_KEY_MISSING" }),
    );
    // The automatic start after an import stays quiet: there is just no analysis.
    expect(analyzer.start(rig?.materialId ?? 0, { automatic: true })).toMatchObject({
      started: false,
      analysis: { state: "none" },
    });
    expect(row()?.analysisJobId).toBeNull();
    expect(provider.calls).toHaveLength(0);
  });
});

describe("the state of an analysis", () => {
  it("is worked out from the job, so a restart cannot leave it analyzing (ADR-2)", () => {
    const { db, row } = setup(classifier());
    const job = createJob(db, "analysis");
    setState(db, job.id, "running");
    db.update(material)
      .set({ analysisJobId: job.id })
      .where(eq(material.id, rig?.materialId ?? 0))
      .run();
    expect(analysisOf(db, row() as never).state).toBe("analyzing");
    expect(recoverInterrupted(db)).toBe(1);
    expect(analysisOf(db, row() as never)).toMatchObject({
      state: "failed",
      errorCode: "INTERRUPTED",
    });
  });

  it("is none for a job that is gone or that ended without an analysis", () => {
    const { db } = setup(classifier());
    expect(analysisOf(db, { analyzedAt: null, analysisJobId: 4242 }).state).toBe("none");
    const job = createJob(db, "analysis");
    setState(db, job.id, "done");
    expect(analysisOf(db, { analyzedAt: null, analysisJobId: job.id }).state).toBe("none");
    expect(
      analysisOf(db, { analyzedAt: "2026-11-19T00:00:00.000Z", analysisJobId: null }).state,
    ).toBe("done");
  });
});

describe("the analysis after an import (FR-8)", () => {
  function importCore(provider: FakeProvider): { core: Core; path: string; workspaceId: number } {
    const core = createCore({ dataDir: tempDir(), env: {}, provider });
    extra = core;
    const workspaceId = core.registry.create("Importar").id;
    const path = join(tempDir(), "aula.md");
    writeFileSync(path, "A paroxítona leva acento quando termina em -l, -n, -r ou -x.");
    return { core, path, workspaceId };
  }

  it("starts by itself once the material is indexed, and exposes the subject", async () => {
    const { core, path, workspaceId } = importCore(classifier());
    const info = core.materials(workspaceId).importFile(path);
    await core.queue.wait(workspaceId, info.jobId as number);
    const db = core.registry.open(workspaceId).connection.db;
    const jobId = db.select().from(material).where(eq(material.id, info.id)).get()?.analysisJobId;
    expect(jobId).toBeTypeOf("number");
    await core.queue.wait(workspaceId, jobId as number);
    const view = core.materials(workspaceId).get(info.id);
    expect(view.analysis.state).toBe("done");
    expect(view.subject).toEqual({
      value: "Língua Portuguesa: acentuação",
      source: "inferred",
      informed: null,
      inferred: "Língua Portuguesa: acentuação",
    });
  });

  it("never fails or delays the import when the analysis cannot run", async () => {
    class NeedsKey extends FakeProvider {
      override readonly requiresConsent = true;
    }
    const { core, path, workspaceId } = importCore(new NeedsKey());
    const info = core.materials(workspaceId).importFile(path);
    await core.queue.wait(workspaceId, info.jobId as number);
    const done = core.materials(workspaceId).get(info.id);
    expect(done).toMatchObject({ status: "indexed", errorCode: null });
    expect(done.analysis.state).toBe("none");
    expect(done.subject).toMatchObject({ value: "aula", source: "title" });
  });

  it("is answered by the offline provider too, so offline runs end with an analyzed material", async () => {
    const { core, path, workspaceId } = importCore(scriptedCardProvider());
    const info = core.materials(workspaceId).importFile(path);
    await core.queue.wait(workspaceId, info.jobId as number);
    const db = core.registry.open(workspaceId).connection.db;
    const jobId = db.select().from(material).where(eq(material.id, info.id)).get()?.analysisJobId;
    await core.queue.wait(workspaceId, jobId as number);
    expect(core.materials(workspaceId).get(info.id)).toMatchObject({
      analysis: { state: "done" },
      subject: { source: "title" },
    });
  });

  it("leaves the material indexed when the analysis itself fails", async () => {
    const provider = new FakeProvider();
    provider.script("ClassifyBatch", () => {
      throw new AppError("PROVIDER_ERROR", "O provedor falhou.");
    });
    const { core, path, workspaceId } = importCore(provider);
    const info = core.materials(workspaceId).importFile(path);
    await core.queue.wait(workspaceId, info.jobId as number);
    const db = core.registry.open(workspaceId).connection.db;
    const jobId = db.select().from(material).where(eq(material.id, info.id)).get()?.analysisJobId;
    await core.queue.wait(workspaceId, jobId as number);
    expect(core.materials(workspaceId).get(info.id)).toMatchObject({
      status: "indexed",
      analysis: { state: "failed", errorCode: "PROVIDER_ERROR" },
    });
  });
});
