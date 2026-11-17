/*
 * Filename: import-commit.test.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generationRun, item, topic } from "../db/workspace-schema.js";
import { setLogLevel } from "../logging.js";
import { tempDir } from "../test/helpers.js";
import { World } from "../test/world.js";
import { PREVIEW_MINUTES } from "./service.js";
import { CARD_COLUMNS, QUESTION_COLUMNS } from "./templates.js";

let world: World | undefined;
afterEach(async () => {
  setLogLevel("warn");
  vi.restoreAllMocks();
  await world?.close();
  world = undefined;
});

const setup = (): World => (world = new World());
const importing = (w: World) => w.rig.core.importing;

function file(name: string, content: string): string {
  const path = join(tempDir(), name);
  writeFileSync(path, content);
  return path;
}

const csv = (rows: readonly (readonly string[])[]): string =>
  rows
    .map((row) =>
      row.map((cell) => (/[";\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(";"),
    )
    .join("\r\n");

const card = (front: string, back = "Resposta.", topic = ""): string[] => ["", front, back, topic];
const cards = (rows: string[][]) => csv([[...CARD_COLUMNS], ...rows]);
const preview = (w: World, content: string, kind: "card" | "question" = "card") =>
  importing(w).preview(w.workspaceId, kind, file("arquivo.csv", content));
const imported = (w: World) =>
  w.db
    .select()
    .from(item)
    .all()
    .filter((row) => row.origin === "import");

describe("confirming an import (FR-16, FR-17)", () => {
  it("stores the valid rows as approved items of the import origin, with their topics", async () => {
    const w = setup();
    w.topic("Geografia");
    const result = await preview(
      w,
      cards([
        card("Capital da França?", "Paris.", "geografia"),
        card("Defina entropia.", "Medida de desordem.", "Física"),
        card("Sem tópico?"),
        card("", "Sem frente."),
      ]),
    );
    const outcome = importing(w).commit(w.workspaceId, result.token, []);
    expect(outcome).toEqual({
      imported: 3,
      skippedDuplicates: 0,
      skippedErrors: 1,
      topicsCreated: 1,
    });
    const rows = imported(w);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.status === "approved" && row.approvedAt !== null)).toBe(true);
    expect(
      rows.every((row) => row.chunkId === null && row.quote === "" && row.edited === false),
    ).toBe(true);
    expect(JSON.parse(rows[0]?.payloadJson ?? "{}")).toEqual({
      front: "Capital da França?",
      back: "Paris.",
    });
    const names = new Map(
      w.db
        .select()
        .from(topic)
        .all()
        .map((t) => [t.id, t.name]),
    );
    expect(rows.map((row) => (row.topicId === null ? null : names.get(row.topicId)))).toEqual([
      "Geografia",
      "Física",
      null,
    ]);
    expect(w.db.select().from(topic).all()).toHaveLength(2);
  });

  it("hangs the items on one synthetic run that keeps its counters at zero", async () => {
    const w = setup();
    const result = await preview(w, cards([card("Um?"), card("Dois?")]));
    importing(w).commit(w.workspaceId, result.token, []);
    const runs = w.db
      .select()
      .from(generationRun)
      .all()
      .filter((run) => run.kind === "import");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      generated: 0,
      approved: 0,
      approvedUnedited: 0,
      discardedReview: 0,
      status: "done",
    });
    expect(new Set(imported(w).map((row) => row.runId))).toEqual(new Set([runs[0]?.id]));
    expect(
      w.rig.core
        .generation(w.workspaceId)
        .listRuns()
        .map((run) => run.kind),
    ).not.toContain("import");
    // A second import reuses the same run.
    const again = await preview(w, cards([card("Três?")]));
    importing(w).commit(w.workspaceId, again.token, []);
    expect(
      w.db
        .select()
        .from(generationRun)
        .all()
        .filter((run) => run.kind === "import"),
    ).toHaveLength(1);
  });

  it("serves the imported cards in the study queue and shows them in the items list", async () => {
    const w = setup();
    const result = await preview(w, cards([card("Pergunta importada?")]));
    importing(w).commit(w.workspaceId, result.token, []);
    const next = w.rig.core.study(w.workspaceId).nextCard();
    expect(next?.item.id).toBe(imported(w)[0]?.id);
    expect(w.rig.core.review(w.workspaceId).catalog()).toEqual([
      expect.objectContaining({
        front: "Pergunta importada?",
        origin: "import",
        status: "approved",
      }),
    ]);
  });

  it("leaves duplicates out unless their lines are asked for, and ignores lines that are not duplicates", async () => {
    const w = setup();
    w.rig.core.authoring(w.workspaceId).create({
      draft: { kind: "card", subtype: "qa", front: "Já existe?", back: "x" },
      topic: null,
      origin: "manual",
    });
    const content = cards([
      card("Já existe?"),
      card("Nova?"),
      card("Repetida?"),
      card("repetida?"),
      card(""),
    ]);
    const first = await preview(w, content);
    expect(importing(w).commit(w.workspaceId, first.token, [])).toEqual({
      imported: 2,
      skippedDuplicates: 2,
      skippedErrors: 1,
      topicsCreated: 0,
    });
    const second = await preview(
      w,
      cards([card("Já existe?"), card("Repetida?"), card("repetida?"), card("")]),
    );
    // Line 2 and 4 are duplicates, line 3 is valid, line 5 is an error, line 99 does not exist.
    const outcome = importing(w).commit(w.workspaceId, second.token, [2, 3, 5, 99, 99]);
    expect(outcome.imported).toBe(2);
    expect(outcome.skippedDuplicates).toBe(1);
    expect(
      imported(w).map((row) => (JSON.parse(row.payloadJson) as { front: string }).front),
    ).toEqual(["Nova?", "Repetida?", "Já existe?", "Repetida?"]);
  });

  it("stores questions the way a question written by hand is stored (US-8)", async () => {
    const w = setup();
    const columns = [...QUESTION_COLUMNS];
    const row = (over: Record<string, string>) => columns.map((name) => over[name] ?? "");
    const result = await preview(
      w,
      csv([
        columns,
        row({
          enunciado: "Qual organela produz ATP?",
          alternativa_a: "Mitocôndria",
          motivo_a: "Respira.",
          alternativa_b: "Ribossomo",
          motivo_b: "Proteínas.",
          gabarito: "a",
          explicacao: "Respira.",
          topico: "Biologia",
        }),
        row({ enunciado: "O Sol é uma estrela.", gabarito: "certo", explicacao: "É." }),
      ]),
      "question",
    );
    expect(importing(w).commit(w.workspaceId, result.token, [])).toMatchObject({
      imported: 2,
      topicsCreated: 1,
    });
    const [multiple, truth] = imported(w);
    expect(multiple).toMatchObject({
      kind: "question",
      subtype: "multiple_choice",
      status: "approved",
    });
    expect(JSON.parse(multiple?.payloadJson ?? "{}")).toEqual({
      statement: "Qual organela produz ATP?",
      options: [
        { key: "A", text: "Mitocôndria", why: "Respira." },
        { key: "B", text: "Ribossomo", why: "Proteínas." },
      ],
      answer: "A",
      explanation: "Respira.",
    });
    expect(JSON.parse(truth?.payloadJson ?? "{}")).toMatchObject({
      options: [
        { key: "C", text: "Certo", why: "" },
        { key: "E", text: "Errado", why: "" },
      ],
      answer: "C",
    });
    expect(w.rig.core.practice(w.workspaceId).nextQuestion()).not.toBeNull();
  });

  it("imports the downloaded templates unchanged", async () => {
    const w = setup();
    for (const kind of ["card", "question"] as const) {
      const path = join(tempDir(), `modelo-${kind}.xlsx`);
      await importing(w).writeTemplate(kind, "xlsx", path);
      const result = await importing(w).preview(w.workspaceId, kind, path);
      expect(importing(w).commit(w.workspaceId, result.token, []).imported).toBe(
        result.totals.valid,
      );
    }
    expect(imported(w)).toHaveLength(4);
  });
});

describe("all or nothing (NFR-4)", () => {
  it("saves nothing when the storage fails halfway, and keeps the preview to try again", async () => {
    const w = setup();
    const result = await preview(
      w,
      cards([
        card("Primeira?", "r", "Tema novo"),
        card("Segunda?"),
        card("BOOM terceira?"),
        card("Quarta?"),
      ]),
    );
    const sqlite = w.rig.core.registry.open(w.workspaceId).connection.sqlite;
    sqlite.exec(
      "CREATE TRIGGER falha BEFORE INSERT ON item WHEN NEW.payload_json LIKE '%BOOM%' BEGIN SELECT RAISE(ABORT, 'falha injetada'); END",
    );
    expect(() => importing(w).commit(w.workspaceId, result.token, [])).toThrow(/falha injetada/);
    expect(w.db.select().from(item).all()).toHaveLength(0);
    expect(w.db.select().from(topic).all()).toHaveLength(0);
    expect(
      w.db
        .select()
        .from(generationRun)
        .all()
        .some((run) => run.kind === "import"),
    ).toBe(false);
    // The cause goes away and the same preview can be confirmed.
    sqlite.exec("DROP TRIGGER falha");
    expect(importing(w).commit(w.workspaceId, result.token, [])).toMatchObject({
      imported: 4,
      topicsCreated: 1,
    });
  });

  it("stores 500 items in under five seconds (NFR-1)", async () => {
    const w = setup();
    const result = await preview(
      w,
      cards(
        Array.from({ length: 500 }, (_, i) =>
          card(`Pergunta ${i}?`, "Resposta.", `Tema ${i % 12}`),
        ),
      ),
    );
    const started = performance.now();
    const outcome = importing(w).commit(w.workspaceId, result.token, []);
    expect(performance.now() - started).toBeLessThan(5000);
    expect(outcome).toMatchObject({ imported: 500, topicsCreated: 12 });
  });

  it("stores the 5.000 rows that are the limit", async () => {
    const w = setup();
    const result = await preview(
      w,
      cards(Array.from({ length: 5000 }, (_, i) => card(`Pergunta ${i}?`))),
    );
    const started = performance.now();
    expect(importing(w).commit(w.workspaceId, result.token, []).imported).toBe(5000);
    expect(performance.now() - started).toBeLessThan(20_000);
  });
});

describe("the token", () => {
  it("is used up by an import, and cannot be confirmed again", async () => {
    const w = setup();
    const result = await preview(w, cards([card("Única?")]));
    importing(w).commit(w.workspaceId, result.token, []);
    expect(() => importing(w).commit(w.workspaceId, result.token, [])).toThrow(
      expect.objectContaining({ code: "IMPORT_EXPIRED" }),
    );
    expect(imported(w)).toHaveLength(1);
  });

  it("is refused when it expired, never existed or belongs to another workspace", async () => {
    const w = setup();
    const result = await preview(w, cards([card("Expira?")]));
    expect(() => importing(w).commit(w.workspaceId, "inventado", [])).toThrow(
      expect.objectContaining({ code: "IMPORT_EXPIRED" }),
    );
    expect(() => importing(w).commit(w.workspaceId + 1, result.token, [])).toThrow(
      expect.objectContaining({ code: "IMPORT_EXPIRED" }),
    );
    w.clock.advance(PREVIEW_MINUTES * 60_000 + 1);
    expect(() => importing(w).commit(w.workspaceId, result.token, [])).toThrow(
      expect.objectContaining({ code: "IMPORT_EXPIRED" }),
    );
    expect(imported(w)).toHaveLength(0);
  });

  it("logs the counts and never the content (NFR-3)", async () => {
    const lines: string[] = [];
    for (const level of ["debug", "info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation(
        (...args: unknown[]) => void lines.push(args.join(" ")),
      );
    }
    setLogLevel("debug");
    const w = setup();
    const result = await preview(
      w,
      cards([card("PERGUNTA-SECRETA?", "VERSO-SECRETO", "TEMA-SECRETO")]),
    );
    importing(w).commit(w.workspaceId, result.token, []);
    const text = lines.join("\n");
    expect(text).toContain("[import] import committed");
    expect(text).not.toMatch(/SECRET/);
  });
});
