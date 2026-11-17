/*
 * Filename: import.test.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "../contracts/errors.js";
import { item, topic } from "../db/workspace-schema.js";
import { setLogLevel } from "../logging.js";
import { tempDir } from "../test/helpers.js";
import { World } from "../test/world.js";
import { buildXlsx, zip } from "../test/xlsx-builder.js";
import type { TestCell } from "../test/xlsx-builder.js";
import { PREVIEW_MINUTES, PREVIEW_PAGE } from "./service.js";
import { BOM, CARD_COLUMNS, QUESTION_COLUMNS } from "./templates.js";
import type { ImportKind } from "./templates.js";

let world: World | undefined;
afterEach(async () => {
  setLogLevel("warn");
  vi.restoreAllMocks();
  await world?.close();
  world = undefined;
});

const setup = (): World => (world = new World());
const importing = (w: World) => w.rig.core.importing;

/** Writes a file with the given name in a folder of its own and returns its path. */
function file(name: string, content: string | Buffer): string {
  const path = join(tempDir(), name);
  writeFileSync(path, content);
  return path;
}

const csv = (rows: readonly (readonly string[])[], delimiter = ";"): string =>
  rows
    .map((row) =>
      row
        .map((cell) => (/[";,\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(delimiter),
    )
    .join("\r\n");

const card = (front: string, back = "Resposta.", topic = "", subtype = ""): string[] => [
  subtype,
  front,
  back,
  topic,
];
const preview = (w: World, kind: ImportKind, path: string) =>
  importing(w).preview(w.workspaceId, kind, path);
const refusal = async (promise: Promise<unknown>): Promise<AppError> => {
  try {
    await promise;
  } catch (error) {
    return error as AppError;
  }
  throw new Error("expected the import to be refused");
};

describe("reading the file (FR-14)", () => {
  it("reads a CSV that Excel saved in Brazilian Portuguese: BOM, ; separator, accents", async () => {
    const w = setup();
    const path = file(
      "cartoes.csv",
      `${BOM}${csv([[...CARD_COLUMNS], card("Qual a capital da França?", "Paris.", "Geografia"), card("Defina entropia.", "Medida de desordem.")])}`,
    );
    const result = await preview(w, "card", path);
    expect(result.fileName).toBe("cartoes.csv");
    expect(result.totals).toEqual({ rows: 2, valid: 2, errors: 0, duplicates: 0 });
    expect(result.rows[0]).toMatchObject({
      line: 2,
      status: "valid",
      text: "Qual a capital da França?",
      topic: "Geografia",
      topicIsNew: true,
    });
  });

  it("also reads , as the separator, quotes, commas and line breaks inside a cell", async () => {
    const w = setup();
    const path = file(
      "virgula.csv",
      csv([[...CARD_COLUMNS], card("Liste, com vírgula", 'Ele disse "oi"\ne saiu.')], ","),
    );
    const result = await preview(w, "card", path);
    expect(result.totals).toMatchObject({ rows: 1, valid: 1 });
    expect(result.rows[0]?.text).toBe("Liste, com vírgula");
  });

  it("matches the header without accents or capitals, ignores extra columns and empty rows", async () => {
    const w = setup();
    const path = file(
      "cabecalho.csv",
      csv([
        ["Subtipo", "FRENTE", "Verso", "Tópico", "Observações"],
        ["", "Primeira?", "Sim.", "Tema", "ignorada"],
        ["", "", "", "", ""],
        ["", "Segunda?", "Sim.", "Tema", ""],
      ]),
    );
    const result = await preview(w, "card", path);
    expect(result.totals).toEqual({ rows: 2, valid: 2, errors: 0, duplicates: 0 });
    // The empty row still counts for the position the person sees in the file.
    expect(result.rows.map((row) => row.line)).toEqual([2, 4]);
  });

  it("names the required columns that are missing and points to the template", async () => {
    const w = setup();
    const error = await refusal(
      preview(
        w,
        "card",
        file(
          "a.csv",
          csv([
            ["frente", "outra"],
            ["x", "y"],
          ]),
        ),
      ),
    );
    expect(error).toMatchObject({ code: "IMPORT_FILE_INVALID" });
    expect(error.message).toBe(
      "Colunas obrigatórias ausentes: verso. Baixe o template de cartões.",
    );
    const question = await refusal(
      preview(w, "question", file("q.csv", csv([["enunciado"], ["x"]]))),
    );
    expect(question.message).toBe(
      "Colunas obrigatórias ausentes: gabarito, explicacao. Baixe o template de questões.",
    );
  });

  it("refuses an empty file, a file that is not there and a type that is not accepted", async () => {
    const w = setup();
    expect(await refusal(preview(w, "card", file("vazio.csv", "")))).toMatchObject({
      code: "IMPORT_FILE_INVALID",
    });
    expect(await refusal(preview(w, "card", join(tempDir(), "nao-existe.csv")))).toMatchObject({
      code: "IMPORT_FILE_INVALID",
    });
    for (const name of ["a.xls", "a.txt", "a.pdf", "a"]) {
      expect(await refusal(preview(w, "card", file(name, "x")))).toMatchObject({
        code: "UNSUPPORTED_FILE",
      });
    }
  });

  it("accepts the extension in capitals", async () => {
    const w = setup();
    const path = file("PLANILHA.CSV", csv([[...CARD_COLUMNS], card("Pergunta?")]));
    expect((await preview(w, "card", path)).totals.valid).toBe(1);
  });
});

describe("limits (FR-18, NFR-2)", () => {
  it("takes 5.000 rows and refuses 5.001 before saving anything", async () => {
    const w = setup();
    const rows = (count: number) =>
      csv([[...CARD_COLUMNS], ...Array.from({ length: count }, (_, i) => card(`Pergunta ${i}?`))]);
    expect((await preview(w, "card", file("5000.csv", rows(5000)))).totals.rows).toBe(5000);
    const error = await refusal(preview(w, "card", file("5001.csv", rows(5001))));
    expect(error).toMatchObject({ code: "IMPORT_LIMIT_EXCEEDED" });
    expect(error.message).toContain("5.000 linhas");
    expect(w.db.select().from(item).all()).toHaveLength(0);
  });

  it("refuses a file larger than 10 MB without reading it", async () => {
    const w = setup();
    const big = `${csv([[...CARD_COLUMNS]])}\r\n${"x".repeat(10 * 1024 * 1024 + 1)}`;
    const error = await refusal(preview(w, "card", file("grande.csv", big)));
    expect(error).toMatchObject({ code: "IMPORT_LIMIT_EXCEEDED" });
    expect(error.message).toContain("10 MB");
  });

  it("refuses a spreadsheet that claims to unpack to a huge size (zip bomb)", async () => {
    const w = setup();
    const bomb = buildXlsx([[...CARD_COLUMNS], card("a", "b")], 1_500_000_000);
    const error = await refusal(preview(w, "card", file("bomba.xlsx", bomb)));
    expect(error).toMatchObject({ code: "IMPORT_LIMIT_EXCEEDED" });
  });

  it("refuses a spreadsheet with too many entries", async () => {
    const w = setup();
    const many = zip(
      Array.from({ length: 2001 }, (_, i) => ({ name: `f${i}`, data: Buffer.from("x") })),
    );
    expect(await refusal(preview(w, "card", file("muitos.xlsx", many)))).toMatchObject({
      code: "IMPORT_LIMIT_EXCEEDED",
    });
  });

  it("refuses files that are not what their extension says", async () => {
    const w = setup();
    const notZip = file("falso.xlsx", "isto é texto, não uma planilha");
    expect(await refusal(preview(w, "card", notZip))).toMatchObject({
      code: "IMPORT_FILE_INVALID",
    });
    const truncated = file("cortado.xlsx", buildXlsx([[...CARD_COLUMNS]]).subarray(0, 60));
    expect(await refusal(preview(w, "card", truncated))).toMatchObject({
      code: "IMPORT_FILE_INVALID",
    });
    // A spreadsheet saved with a .csv name is just text to the CSV reader, so its header is wrong.
    const disguised = file("planilha.csv", buildXlsx([[...CARD_COLUMNS], card("a", "b")]));
    expect(await refusal(preview(w, "card", disguised))).toMatchObject({
      code: "IMPORT_FILE_INVALID",
    });
  });
});

describe("spreadsheets (FR-14, NFR-2)", () => {
  const sheet = (rows: readonly (readonly TestCell[])[]) => file("planilha.xlsx", buildXlsx(rows));

  it("reads the values of the first sheet", async () => {
    const w = setup();
    const result = await preview(
      w,
      "card",
      sheet([
        [...CARD_COLUMNS],
        ["", "Pergunta 1?", "Resposta 1.", "Tema"],
        ["", "Pergunta 2?", 42, null],
      ]),
    );
    expect(result.totals).toEqual({ rows: 2, valid: 2, errors: 0, duplicates: 0 });
    expect(result.rows[1]).toMatchObject({ line: 3, status: "valid", topic: null });
  });

  it("never evaluates a formula: only the value the program stored is read", async () => {
    const w = setup();
    const path = sheet([
      [...CARD_COLUMNS],
      ["", "Com valor guardado?", { formula: "1+1", cached: 99 }, ""],
      ["", "Sem valor guardado?", { formula: 'CONCAT("a","b")' }, ""],
      ["", { formula: 'UPPER("x")', cached: "TEXTO GUARDADO" }, "Verso.", ""],
    ]);
    const result = await preview(w, "card", path);
    expect(result.rows[0]).toMatchObject({ status: "valid" });
    expect(result.rows[1]).toMatchObject({
      status: "error",
      problem: "O verso do card não pode ficar vazio.",
    });
    expect(result.rows[2]).toMatchObject({ status: "valid", text: "TEXTO GUARDADO" });
    // The first row stored 99, not the 2 that the formula would give.
    const rows = importing(w).rows(w.workspaceId, result.token, "all", 0, 10);
    expect(rows.rows).toHaveLength(3);
  });

  it("reads the XLSX template exactly as it was downloaded (US-6)", async () => {
    const w = setup();
    for (const kind of ["card", "question"] as const) {
      const path = join(tempDir(), `modelo-${kind}.xlsx`);
      await importing(w).writeTemplate(kind, "xlsx", path);
      const result = await preview(w, kind, path);
      expect(result.totals).toMatchObject({ errors: 0, duplicates: 0 });
      expect(result.totals.valid).toBeGreaterThanOrEqual(2);
    }
  });

  it("reads the CSV template exactly as it was downloaded (US-6)", async () => {
    const w = setup();
    for (const kind of ["card", "question"] as const) {
      const path = join(tempDir(), `modelo-${kind}.csv`);
      await importing(w).writeTemplate(kind, "csv", path);
      const result = await preview(w, kind, path);
      expect(result.totals).toMatchObject({ errors: 0, duplicates: 0 });
      expect(result.totals.valid).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("checking the rows of cards (FR-15)", () => {
  const problems = async (w: World, rows: string[][]) =>
    (await preview(w, "card", file("c.csv", csv([[...CARD_COLUMNS], ...rows])))).rows.map(
      (r) => r.problem,
    );

  it("explains each kind of mistake in Portuguese", async () => {
    const w = setup();
    expect(
      await problems(w, [
        card("", "Verso."),
        card("Frente.", ""),
        card("Sem lacuna", "", "", "lacuna"),
        card("Verso sem veredito", "Talvez.", "", "verdadeiro_falso"),
        card("Pergunta?", "Sim.", "", "inventado"),
        card("Pergunta?", "Sim.", "t".repeat(81)),
        card("x".repeat(5001), "Sim."),
      ]),
    ).toEqual([
      "A frente do card não pode ficar vazia.",
      "O verso do card não pode ficar vazio.",
      "Um card de lacuna precisa de {{c1::termo}} na frente.",
      "O verso deve começar por Verdadeiro ou Falso.",
      "Subtipo desconhecido: inventado. Use pergunta_resposta, lacuna, comparar ou verdadeiro_falso.",
      "O tópico tem mais de 80 caracteres.",
      "O texto tem mais de 5000 caracteres.",
    ]);
  });

  it("accepts every subtype by its name in the template or by its internal name", async () => {
    const w = setup();
    const rows = [
      card("Pergunta 1?", "Sim.", "", "pergunta_resposta"),
      card("Pergunta 2?", "Sim.", "", "qa"),
      card("A {{c1::mitocôndria}} respira.", "", "", "lacuna"),
      card("A {{c1::mito}} é a usina.", "", "", "CLOZE"),
      card("X vs Y", "Diferem.", "", "comparar"),
      card("O Sol é uma estrela.", "Verdadeiro, é.", "", "verdadeiro_falso"),
    ];
    const result = await preview(w, "card", file("s.csv", csv([[...CARD_COLUMNS], ...rows])));
    expect(result.totals).toMatchObject({ valid: 6, errors: 0 });
  });

  it("shows the text of an error row so it can be found in the file, cut to 200 characters", async () => {
    const w = setup();
    const result = await preview(
      w,
      "card",
      file("e.csv", csv([[...CARD_COLUMNS], card("y".repeat(300), "")])),
    );
    expect(result.rows[0]).toMatchObject({ status: "error", text: `${"y".repeat(200)}…` });
  });
});

describe("checking the rows of questions (FR-15)", () => {
  const ROW = (over: Partial<Record<(typeof QUESTION_COLUMNS)[number], string>>): string[] =>
    QUESTION_COLUMNS.map((name) => over[name] ?? "");
  const run = async (w: World, rows: string[][]) =>
    preview(w, "question", file("q.csv", csv([[...QUESTION_COLUMNS], ...rows])));
  const GOOD = {
    enunciado: "Qual organela produz ATP?",
    alternativa_a: "Mitocôndria",
    motivo_a: "Respira.",
    alternativa_b: "Ribossomo",
    motivo_b: "Proteínas.",
    gabarito: "a",
    explicacao: "A mitocôndria respira.",
  } as const;

  it("takes multiple choice by default when there are alternatives, and true or false when not", async () => {
    const w = setup();
    const result = await run(w, [
      ROW(GOOD),
      ROW({ enunciado: "O Sol é uma estrela.", gabarito: "certo", explicacao: "É." }),
      ROW({
        enunciado: "A Lua é uma estrela.",
        gabarito: "E",
        explicacao: "Não é.",
        subtipo: "certo_errado",
      }),
    ]);
    expect(result.totals).toEqual({ rows: 3, valid: 3, errors: 0, duplicates: 0 });
  });

  it("explains each kind of mistake, naming the alternative", async () => {
    const w = setup();
    const result = await run(w, [
      ROW({ ...GOOD, enunciado: "" }),
      ROW({ ...GOOD, explicacao: "" }),
      ROW({ ...GOOD, gabarito: "" }),
      ROW({ ...GOOD, gabarito: "C" }),
      ROW({ ...GOOD, alternativa_c: "Lisossomo", motivo_c: "" }),
      ROW({ ...GOOD, alternativa_d: "Vacúolo", motivo_d: "Guarda água." }),
      ROW({ ...GOOD, alternativa_b: "mitocôndria" }),
      ROW({
        ...GOOD,
        alternativa_a: "",
        alternativa_b: "",
        motivo_a: "",
        motivo_b: "",
        alternativa_c: "x",
        motivo_c: "y",
      }),
      ROW({
        enunciado: "Só uma?",
        alternativa_a: "A",
        motivo_a: "a",
        gabarito: "A",
        explicacao: "x",
      }),
      ROW({ ...GOOD, subtipo: "inventado" }),
      ROW({
        enunciado: "Certo ou errado?",
        alternativa_a: "A",
        motivo_a: "a",
        gabarito: "C",
        explicacao: "x",
        subtipo: "certo_errado",
      }),
      ROW({ enunciado: "Verdade?", gabarito: "Z", explicacao: "x" }),
    ]);
    expect(result.rows.map((row) => row.problem)).toEqual([
      "O enunciado da questão não pode ficar vazio.",
      "A explicação não pode ficar vazia.",
      "Escolha uma das alternativas como correta.",
      "Escolha uma das alternativas como correta.",
      "Alternativa C: Informe o motivo desta alternativa.",
      "Preencha as alternativas em ordem (A, B, C...), sem pular letras.",
      "Alternativa B: Duas alternativas não podem ser iguais.",
      "Preencha as alternativas em ordem (A, B, C...), sem pular letras.",
      "Informe de 2 a 5 alternativas.",
      "Subtipo desconhecido: inventado. Use multipla_escolha ou certo_errado.",
      "Certo ou errado não tem alternativas.",
      "Escolha Certo ou Errado.",
    ]);
  });
});

describe("duplicates and topics (FR-15, FR-17)", () => {
  const authoring = (w: World) => w.rig.core.authoring(w.workspaceId);

  it("marks what already exists in the workspace and what repeats inside the file", async () => {
    const w = setup();
    authoring(w).create({
      draft: { kind: "card", subtype: "qa", front: "Qual a função da mitocôndria?", back: "x" },
      topic: null,
      origin: "manual",
    });
    const result = await preview(
      w,
      "card",
      file(
        "d.csv",
        csv([
          [...CARD_COLUMNS],
          card("  qual a FUNÇÃO da mitocôndria? ", "y"),
          card("Pergunta nova?"),
          card("pergunta NOVA?"),
          card("Outra pergunta?"),
        ]),
      ),
    );
    expect(result.totals).toEqual({ rows: 4, valid: 2, errors: 0, duplicates: 2 });
    expect(result.rows.map((r) => [r.status, r.problem])).toEqual([
      ["duplicate", "Já existe um item igual neste workspace."],
      ["valid", null],
      ["duplicate", "Repetida: igual à linha 3 do arquivo."],
      ["valid", null],
    ]);
  });

  it("does not count a discarded item as an existing one, nor a question as a card", async () => {
    const w = setup();
    const created = authoring(w).create({
      draft: { kind: "card", subtype: "qa", front: "Pergunta antiga?", back: "x" },
      topic: null,
      origin: "manual",
    });
    w.rig.core.review(w.workspaceId).discardApproved(created.itemId);
    authoring(w).create({
      draft: {
        kind: "question",
        subtype: "certo_errado",
        statement: "Texto igual?",
        options: [],
        answer: "C",
        explanation: "x",
      },
      topic: null,
      origin: "manual",
    });
    const result = await preview(
      w,
      "card",
      file("n.csv", csv([[...CARD_COLUMNS], card("Pergunta antiga?"), card("Texto igual?")])),
    );
    expect(result.totals).toMatchObject({ valid: 2, duplicates: 0 });
  });

  it("lists each new topic once and does not call an existing one new, whatever its capitals", async () => {
    const w = setup();
    w.topic("Geografia");
    const result = await preview(
      w,
      "card",
      file(
        "t.csv",
        csv([
          [...CARD_COLUMNS],
          card("P1?", "r", "geografia"),
          card("P2?", "r", "Física"),
          card("P3?", "r", "física"),
          card("P4?", "r", "  Biologia   celular "),
          card("P5?"),
        ]),
      ),
    );
    expect(result.newTopics).toEqual(["Física", "Biologia celular"]);
    expect(result.rows.map((r) => [r.topic, r.topicIsNew])).toEqual([
      ["geografia", false],
      ["Física", true],
      ["física", false],
      ["Biologia celular", true],
      [null, false],
    ]);
  });

  it("stores nothing: no item, no topic, no run (nothing is saved before the confirmation)", async () => {
    const w = setup();
    const before = [w.db.select().from(item).all().length, w.db.select().from(topic).all().length];
    await preview(
      w,
      "card",
      file("p.csv", csv([[...CARD_COLUMNS], card("Pergunta?", "r", "Novo tema")])),
    );
    expect([w.db.select().from(item).all().length, w.db.select().from(topic).all().length]).toEqual(
      before,
    );
  });
});

describe("the preview in memory (ADR-3)", () => {
  const many = (count: number) =>
    csv([
      [...CARD_COLUMNS],
      ...Array.from({ length: count }, (_, i) => card(i % 10 === 0 ? "" : `Pergunta ${i}?`)),
    ]);

  it("sends the first 500 rows and the others by status and page", async () => {
    const w = setup();
    const result = await preview(w, "card", file("m.csv", many(1200)));
    expect(result.rows).toHaveLength(PREVIEW_PAGE);
    expect(result.truncated).toBe(true);
    expect(result.totals).toEqual({ rows: 1200, valid: 1080, errors: 120, duplicates: 0 });
    const errors = importing(w).rows(w.workspaceId, result.token, "error", 0, 50);
    expect(errors.total).toBe(120);
    expect(errors.rows).toHaveLength(50);
    expect(errors.rows.every((r) => r.status === "error")).toBe(true);
    const last = importing(w).rows(w.workspaceId, result.token, "all", 1000, 500);
    expect(last.total).toBe(1200);
    expect(last.rows).toHaveLength(200);
    expect(importing(w).rows(w.workspaceId, result.token, "duplicate", 0, 10)).toEqual({
      rows: [],
      total: 0,
    });
  });

  it("does not send the parsed items to the window, only what the table shows", async () => {
    const w = setup();
    const result = await preview(w, "card", file("m.csv", many(20)));
    expect(Object.keys(result.rows[1] ?? {}).sort()).toEqual(
      ["line", "problem", "status", "text", "topic", "topicIsNew"].sort(),
    );
  });

  it("gives an expired, unknown or foreign token the same answer", async () => {
    const w = setup();
    const result = await preview(w, "card", file("e.csv", many(3)));
    const ask = (workspaceId: number, token: string) =>
      refusal(Promise.resolve().then(() => importing(w).rows(workspaceId, token, "all", 0, 10)));
    expect(await ask(w.workspaceId, "inventado")).toMatchObject({ code: "IMPORT_EXPIRED" });
    expect(await ask(w.workspaceId + 1, result.token)).toMatchObject({ code: "IMPORT_EXPIRED" });
    w.clock.advance(PREVIEW_MINUTES * 60_000 - 1000);
    expect(importing(w).rows(w.workspaceId, result.token, "all", 0, 10).total).toBe(3);
    w.clock.advance(2000);
    expect(await ask(w.workspaceId, result.token)).toMatchObject({
      code: "IMPORT_EXPIRED",
      message: "A prévia expirou. Escolha o arquivo de novo.",
    });
  });

  it("discards a preview, and only for the workspace that made it", async () => {
    const w = setup();
    const result = await preview(w, "card", file("d.csv", many(3)));
    importing(w).discard(w.workspaceId + 1, result.token);
    expect(importing(w).rows(w.workspaceId, result.token, "all", 0, 10).total).toBe(3);
    importing(w).discard(w.workspaceId, result.token);
    importing(w).discard(w.workspaceId, result.token);
    expect(() => importing(w).rows(w.workspaceId, result.token, "all", 0, 10)).toThrow(
      expect.objectContaining({ code: "IMPORT_EXPIRED" }),
    );
  });

  it("keeps at most five previews, dropping the oldest", async () => {
    const w = setup();
    const tokens: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      tokens.push((await preview(w, "card", file(`p${i}.csv`, many(3)))).token);
    }
    expect(() => importing(w).rows(w.workspaceId, tokens[0] as string, "all", 0, 1)).toThrow();
    expect(importing(w).rows(w.workspaceId, tokens[5] as string, "all", 0, 1).total).toBe(3);
  });

  it("shows 500 rows in under three seconds (NFR-1)", async () => {
    const w = setup();
    const path = file(
      "rapido.csv",
      csv([
        [...CARD_COLUMNS],
        ...Array.from({ length: 500 }, (_, i) =>
          card(`Pergunta ${i}?`, "Resposta.", `Tema ${i % 7}`),
        ),
      ]),
    );
    const started = performance.now();
    const result = await preview(w, "card", path);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(result.totals.valid).toBe(500);
  });

  it("logs the totals and never the content of the file (NFR-3)", async () => {
    const lines: string[] = [];
    for (const level of ["debug", "info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation(
        (...args: unknown[]) => void lines.push(args.join(" ")),
      );
    }
    setLogLevel("debug");
    const w = setup();
    await preview(
      w,
      "card",
      file(
        "segredo.csv",
        csv([[...CARD_COLUMNS], card("PERGUNTA-SECRETA?", "VERSO-SECRETO", "TEMA-SECRETO")]),
      ),
    );
    const text = lines.join("\n");
    expect(text).toContain("[import] import previewed");
    expect(text).not.toMatch(/SECRET/);
  });
});
