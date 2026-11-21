/*
 * Filename: validate.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { draftProblem } from "../authoring/validate.js";
import type { ItemDraft } from "../authoring/validate.js";
import { MAX_TOPIC_CHARS } from "../generation/cards.js";
import type { ImageField } from "../images/refs.js";
import { CARD_SUBTYPE_NAMES, QUESTION_SUBTYPE_NAMES, columnsOf } from "./templates.js";
import type { ImportKind } from "./templates.js";

const LETTERS = ["a", "b", "c", "d", "e"] as const;
const MAX_TEXT = 5000;
const MAX_OPTION_TEXT = 2000;

/** A column name as the template writes it: no accents, no capitals, `_` instead of spaces. */
export function columnName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

const REQUIRED: Record<ImportKind, readonly string[]> = {
  card: ["frente", "verso"],
  question: ["enunciado", "gabarito", "explicacao"],
};

/** Where each known column is in the header (the first one wins), or why the file is not usable. */
export function mapColumns(
  kind: ImportKind,
  header: readonly string[],
): { columns: Map<string, number> } | { missing: string[] } {
  const columns = new Map<string, number>();
  header.forEach((raw, index) => {
    const name = columnName(raw);
    if (columnsOf(kind).includes(name) && !columns.has(name)) columns.set(name, index);
  });
  const missing = REQUIRED[kind].filter((name) => !columns.has(name));
  return missing.length > 0 ? { missing } : { columns };
}

/** The optional columns that name the picture files of a row, and the field each one fills. */
export const IMAGE_COLUMNS: Record<ImportKind, Record<string, ImageField>> = {
  card: { imagem_frente: "front", imagem_verso: "back" },
  question: {
    imagem_enunciado: "statement",
    imagem_a: "option.A",
    imagem_b: "option.B",
    imagem_c: "option.C",
    imagem_d: "option.D",
    imagem_e: "option.E",
    imagem_explicacao: "explanation",
  },
};

/** Where the picture columns are in the header; empty for a file that has none. */
export function mapImageColumns(
  kind: ImportKind,
  header: readonly string[],
): Map<ImageField, number> {
  const found = new Map<ImageField, number>();
  header.forEach((raw, index) => {
    const field = IMAGE_COLUMNS[kind][columnName(raw)];
    if (field !== undefined && !found.has(field)) found.set(field, index);
  });
  return found;
}

/** The file names of a cell: several are separated by `;`. */
export function fileNames(cell: string): string[] {
  return cell
    .split(";")
    .map((name) => name.trim())
    .filter(Boolean);
}

export interface ParsedRow {
  draft: ItemDraft;
  /** The topic label, already tidied; null when the row has none. */
  topic: string | null;
  /** The picture files the row names, by field; empty when it names none. */
  imageNames: Partial<Record<ImageField, string[]>>;
}

export type RowResult = { ok: true; row: ParsedRow } | { ok: false; problem: string };

const bad = (problem: string): RowResult => ({ ok: false, problem });

/** The topic of a row: tidied the way the rest of the app does, or a reason to refuse it. */
function topicOf(raw: string): { topic: string | null } | { problem: string } {
  const tidy = raw.split(/\s+/).filter(Boolean).join(" ");
  if (tidy.length > MAX_TOPIC_CHARS)
    return { problem: `O tópico tem mais de ${MAX_TOPIC_CHARS} caracteres.` };
  return { topic: tidy || null };
}

function describe(field: string, message: string): string {
  const option = /^options\.(\d+)\./.exec(field);
  return option
    ? `Alternativa ${(LETTERS[Number(option[1])] ?? "").toUpperCase()}: ${message}`
    : message;
}

/** Turns the cells of one row into an item, or says in Portuguese what is wrong with it. */
export function parseRow(
  kind: ImportKind,
  columns: ReadonlyMap<string, number>,
  cells: readonly string[],
  imageColumns: ReadonlyMap<ImageField, number> = new Map(),
): RowResult {
  const get = (name: string): string => {
    const index = columns.get(name);
    return index === undefined ? "" : (cells[index] ?? "").trim();
  };
  const topic = topicOf(get("topico"));
  if ("problem" in topic) return bad(topic.problem);
  const draft = kind === "card" ? cardDraft(get) : questionDraft(get);
  if ("problem" in draft) return bad(draft.problem);
  const imageNames: Partial<Record<ImageField, string[]>> = {};
  for (const [field, index] of imageColumns) {
    const names = fileNames(cells[index] ?? "");
    if (names.length > 0) imageNames[field] = names;
  }
  // A field that names a picture may be only that picture: the names stand in for the pictures
  // while the row is checked, and the real ones replace them once the zip has been read.
  const standIn = { hash: "0".repeat(64) };
  const stood = Object.fromEntries(Object.keys(imageNames).map((field) => [field, [standIn]]));
  const found = draftProblem({ ...draft.draft, images: stood } as ItemDraft);
  if (found !== null) return bad(describe(found.field, found.message));
  return { ok: true, row: { draft: draft.draft, topic: topic.topic, imageNames } };
}

type Get = (name: string) => string;

function cardDraft(get: Get): { draft: ItemDraft } | { problem: string } {
  const raw = columnName(get("subtipo"));
  const subtype = raw === "" ? "qa" : (CARD_SUBTYPE_NAMES[raw] ?? (isCardCode(raw) ? raw : null));
  if (subtype === null) {
    return {
      problem: `Subtipo desconhecido: ${get("subtipo")}. Use pergunta_resposta, lacuna, comparar ou verdadeiro_falso.`,
    };
  }
  const front = get("frente");
  const back = get("verso");
  if (front.length > MAX_TEXT || back.length > MAX_TEXT) {
    return { problem: `O texto tem mais de ${MAX_TEXT} caracteres.` };
  }
  return { draft: { kind: "card", subtype, front, back } };
}

const isCardCode = (value: string): value is "qa" | "cloze" | "compare" | "true_false" =>
  ["qa", "cloze", "compare", "true_false"].includes(value);

function questionDraft(get: Get): { draft: ItemDraft } | { problem: string } {
  const options = LETTERS.map((letter) => ({
    text: get(`alternativa_${letter}`),
    why: get(`motivo_${letter}`),
  }));
  let last = -1;
  options.forEach((option, index) => {
    if (option.text || option.why) last = index;
  });
  const used = options.slice(0, last + 1);
  if (used.some((option) => !option.text && !option.why)) {
    return { problem: "Preencha as alternativas em ordem (A, B, C...), sem pular letras." };
  }
  const raw = columnName(get("subtipo"));
  const subtype =
    raw === ""
      ? used.length > 0
        ? "multiple_choice"
        : "certo_errado"
      : (QUESTION_SUBTYPE_NAMES[raw] ?? (raw === "multiple_choice" ? raw : null));
  if (subtype === null) {
    return {
      problem: `Subtipo desconhecido: ${get("subtipo")}. Use multipla_escolha ou certo_errado.`,
    };
  }
  const statement = get("enunciado");
  const explanation = get("explicacao");
  if (statement.length > MAX_TEXT || explanation.length > MAX_OPTION_TEXT) {
    return {
      problem: `O texto é longo demais (enunciado até ${MAX_TEXT}, explicação até ${MAX_OPTION_TEXT} caracteres).`,
    };
  }
  if (
    used.some(
      (option) => option.text.length > MAX_OPTION_TEXT || option.why.length > MAX_OPTION_TEXT,
    )
  ) {
    return { problem: `Uma alternativa tem mais de ${MAX_OPTION_TEXT} caracteres.` };
  }
  let answer = get("gabarito").toUpperCase();
  if (subtype === "certo_errado") {
    answer = { CERTO: "C", ERRADO: "E" }[answer] ?? answer;
  }
  return {
    draft: {
      kind: "question",
      subtype,
      statement,
      options: used.map((option, index) => ({
        key: (LETTERS[index] ?? "").toUpperCase(),
        ...option,
      })),
      answer,
      explanation,
    },
  };
}
