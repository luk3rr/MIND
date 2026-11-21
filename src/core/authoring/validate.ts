/*
 * Filename: validate.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { FieldError } from "../contracts/errors.js";
import { cleanImages, textOrImage } from "../images/refs.js";
import type { ItemImages } from "../images/refs.js";
import { payloadProblem } from "../generation/cards.js";
import { CERTO_ERRADO_OPTIONS } from "../generation/questions.js";
import type { CardPayload, CardSubtype, QuestionPayload } from "../generation/schemas.js";
import { FRONT_PROBLEMS, PROBLEM_MESSAGES } from "../review/service.js";
import { normalize } from "../verification/source-checker.js";

const LETTERS = "ABCDE";
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 5;

export interface CardDraft {
  kind: "card";
  subtype: CardSubtype;
  front: string;
  back: string;
  images?: ItemImages | undefined;
}

export interface QuestionDraft {
  kind: "question";
  subtype: "certo_errado" | "multiple_choice";
  statement: string;
  options: { key: string; text: string; why: string }[];
  answer: string;
  explanation: string;
  images?: ItemImages | undefined;
}

export type ItemDraft = CardDraft | QuestionDraft;

/**
 * The first rule a draft breaks, with the field at fault and a message that is safe to show, or
 * null when it can be stored. Used for what a person writes and for what a model proposes.
 */
export function draftProblem(draft: ItemDraft): FieldError | null {
  return draft.kind === "card" ? cardProblem(draft) : questionProblem(draft);
}

function cardProblem(draft: CardDraft): FieldError | null {
  const problem = payloadProblem(
    draft.subtype,
    textOrImage(draft.front, draft.images, "front"),
    textOrImage(draft.back, draft.images, "back"),
  );
  if (problem === null) return null;
  const message = PROBLEM_MESSAGES[problem] ?? "Texto inválido.";
  return { field: FRONT_PROBLEMS.has(problem) ? "front" : "back", message };
}

function questionProblem(draft: QuestionDraft): FieldError | null {
  const fail = (field: string, message: string): FieldError => ({ field, message });
  if (!textOrImage(draft.statement, draft.images, "statement").trim())
    return fail("statement", "O enunciado da questão não pode ficar vazio.");
  if (draft.subtype === "certo_errado") {
    if (draft.options.length > 0) return fail("options", "Certo ou errado não tem alternativas.");
    if (!["C", "E"].includes(draft.answer)) return fail("answer", "Escolha Certo ou Errado.");
  } else {
    const { options } = draft;
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      return fail("options", `Informe de ${MIN_OPTIONS} a ${MAX_OPTIONS} alternativas.`);
    }
    if (options.map((o) => o.key).join("") !== LETTERS.slice(0, options.length)) {
      return fail("options", "As alternativas devem ter as letras A, B, C... em ordem.");
    }
    const seen = new Set<string>();
    for (const [index, option] of options.entries()) {
      if (!textOrImage(option.text, draft.images, `option.${option.key}`).trim()) {
        return fail(`options.${index}.text`, "O texto da alternativa não pode ficar vazio.");
      }
      if (!option.why.trim()) {
        return fail(`options.${index}.why`, "Informe o motivo desta alternativa.");
      }
      const pictures = JSON.stringify(draft.images?.[`option.${option.key}` as "option.A"] ?? []);
      const key = `${normalize(option.text).text}|${pictures === "[]" ? "" : pictures}`;
      if (seen.has(key)) {
        return fail(`options.${index}.text`, "Duas alternativas não podem ser iguais.");
      }
      seen.add(key);
    }
    if (!options.some((o) => o.key === draft.answer)) {
      return fail("answer", "Escolha uma das alternativas como correta.");
    }
  }
  if (!textOrImage(draft.explanation, draft.images, "explanation").trim()) {
    return fail("explanation", "A explicação não pode ficar vazia.");
  }
  return null;
}

/** What is stored in `item.payload_json` for a draft that passed `draftProblem`. */
export function payloadOf(draft: ItemDraft): CardPayload | QuestionPayload {
  const images = cleanImages(draft.images);
  const extra = images ? { images } : {};
  if (draft.kind === "card") {
    return { front: draft.front.trim(), back: draft.back.trim(), ...extra };
  }
  return {
    statement: draft.statement.trim(),
    options:
      draft.subtype === "certo_errado"
        ? CERTO_ERRADO_OPTIONS
        : draft.options.map((o) => ({ key: o.key, text: o.text.trim(), why: o.why.trim() })),
    answer: draft.answer,
    explanation: draft.explanation.trim(),
    ...extra,
  };
}
