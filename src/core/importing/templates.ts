/*
 * Filename: templates.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import Papa from "papaparse";

/** The mark that tells Excel a CSV file is UTF-8. */
export const BOM = String.fromCharCode(0xfeff);

export type ImportKind = "card" | "question";
export type TemplateFormat = "csv" | "xlsx";

/** The columns of the card template; the first line of the file. */
export const CARD_COLUMNS = ["subtipo", "frente", "verso", "topico"] as const;

const LETTERS = ["a", "b", "c", "d", "e"] as const;

/** The columns of the question template. */
export const QUESTION_COLUMNS = [
  "subtipo",
  "enunciado",
  ...LETTERS.map((letter) => `alternativa_${letter}`),
  ...LETTERS.map((letter) => `motivo_${letter}`),
  "gabarito",
  "explicacao",
  "topico",
] as const;

export const columnsOf = (kind: ImportKind): readonly string[] =>
  kind === "card" ? CARD_COLUMNS : QUESTION_COLUMNS;

/** Values of the `subtipo` column, as written in the spreadsheet and as stored. */
export const CARD_SUBTYPE_NAMES: Record<string, "qa" | "cloze" | "compare" | "true_false"> = {
  pergunta_resposta: "qa",
  lacuna: "cloze",
  cloze: "cloze",
  comparar: "compare",
  verdadeiro_falso: "true_false",
};
export const QUESTION_SUBTYPE_NAMES: Record<string, "multiple_choice" | "certo_errado"> = {
  multipla_escolha: "multiple_choice",
  certo_errado: "certo_errado",
};

const blank = (count: number): string[] => Array.from({ length: count }, () => "");

const CARD_EXAMPLES: string[][] = [
  ["pergunta_resposta", "Qual é a capital da França?", "Paris.", "Geografia"],
  ["cloze", "A capital da França é {{c1::Paris}}.", "", "Geografia"],
];

const QUESTION_EXAMPLES: string[][] = [
  [
    "multipla_escolha",
    "Qual organela produz a maior parte do ATP da célula?",
    "Mitocôndria",
    "Ribossomo",
    "Lisossomo",
    "",
    "",
    "Realiza a respiração celular.",
    "Sintetiza proteínas.",
    "Digere material.",
    "",
    "",
    "A",
    "A mitocôndria concentra a cadeia respiratória.",
    "Biologia celular",
  ],
  [
    "certo_errado",
    "O núcleo da célula é onde ocorre a respiração celular.",
    ...blank(10),
    "E",
    "A respiração celular ocorre na mitocôndria.",
    "Biologia celular",
  ],
];

export const examplesOf = (kind: ImportKind): string[][] =>
  kind === "card" ? CARD_EXAMPLES : QUESTION_EXAMPLES;

/** The text of the instructions: one line each, written for the person filling the file. */
export function instructionsOf(kind: ImportKind): string[] {
  const common = [
    "Preencha uma linha por item, abaixo do cabeçalho. Apague as linhas de exemplo antes de importar.",
    "Não mude os nomes das colunas (maiúsculas e acentos não importam). Colunas extras são ignoradas.",
    "O arquivo pode ter até 5.000 linhas. Só os valores das células são lidos; fórmulas não são calculadas.",
    "topico (opcional): nome do tópico; se ainda não existir, ele é criado.",
  ];
  if (kind === "card") {
    return [
      "Template de cartões",
      ...common,
      "subtipo (opcional): pergunta_resposta (padrão), lacuna, comparar ou verdadeiro_falso.",
      "frente e verso são obrigatórios, exceto o verso de uma lacuna.",
      "Lacuna: escreva a frente com {{c1::termo}} marcando o que fica escondido.",
      "Verdadeiro ou falso: o verso deve começar por Verdadeiro ou Falso.",
    ];
  }
  return [
    "Template de questões",
    ...common,
    "subtipo (opcional): multipla_escolha (padrão quando há alternativas) ou certo_errado.",
    "enunciado, gabarito e explicacao são obrigatórios.",
    "Múltipla escolha: preencha de 2 a 5 alternativas em ordem (A, B, C...) e o motivo de cada uma; gabarito é a letra da correta.",
    "Certo ou errado: deixe as alternativas em branco; gabarito é C (certo) ou E (errado).",
  ];
}

/** The template as a CSV file: UTF-8 with a BOM and `;` as the separator, which Excel opens in pt-BR. */
export function templateCsv(kind: ImportKind): string {
  const text = Papa.unparse([columnsOf(kind) as string[], ...examplesOf(kind)], {
    delimiter: ";",
    newline: "\r\n",
  });
  return `${BOM}${text}\r\n`;
}
