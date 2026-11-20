/*
 * Filename: cases.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

/**
 * The fixtures of the relevance checks (FR-17): the excerpts of an invented handout on Portuguese
 * spelling and accentuation, each labelled with what it is. The mix is the one the generation has
 * to cope with: content, worked examples, a teacher's comment, exam questions with their
 * motivating texts, and pages that are not content at all.
 *
 * Everything here is made up for the tests; no excerpt comes from a real material.
 */

/** What an excerpt is, in the words of the analysis of the material. */
export type Role =
  "concept" | "example" | "commentary" | "exam_question" | "motivating_text" | "other";

export interface RelevanceCase {
  id: string;
  role: Role;
  /** The unit of the excerpt in the handout: a motivating text and its question share one. */
  unit: number;
  text: string;
}

/** The subject of the handout, as the person (or the analysis) would name it. */
export const SUBJECT = "Língua Portuguesa: ortografia e acentuação";

export const CASES: readonly RelevanceCase[] = [
  {
    id: "front-matter",
    role: "other",
    unit: 1,
    text: "Apostila de Língua Portuguesa, módulo 2: ortografia e acentuação. Material de apoio das aulas. Todos os direitos reservados. Proibida a reprodução sem autorização.",
  },
  {
    id: "contents",
    role: "other",
    unit: 2,
    text: "Sumário: 1. Acentuação gráfica ........ 3; 2. Hiato e ditongo ........ 7; 3. Uso do hífen ........ 9; 4. Questões comentadas ........ 12; 5. Gabarito ........ 20.",
  },
  {
    id: "paroxytone",
    role: "concept",
    unit: 3,
    text: "As palavras paroxítonas têm a penúltima sílaba tônica. Recebem acento gráfico quando terminam em -l, -n, -r, -x, -ps, -i(s), -us, -um, -ã(s), -ão(s) ou em ditongo oral crescente, como em fácil, hífen, caráter, tórax, bíceps, táxi, ônus, álbum, órfã e órgão.",
  },
  {
    id: "oxytone",
    role: "concept",
    unit: 4,
    text: "As oxítonas são acentuadas quando terminam em a(s), e(s), o(s) e em(ns), como em sofá, você, cipó e armazém. Não se acentuam as oxítonas terminadas em i(s) e u(s), como em aqui e urubu.",
  },
  {
    id: "proparoxytone",
    role: "concept",
    unit: 5,
    text: "Todas as proparoxítonas são acentuadas, como em máximo, lâmpada, árvore e público, porque a antepenúltima sílaba é a sílaba tônica da palavra.",
  },
  {
    id: "hiatus",
    role: "concept",
    unit: 6,
    text: "O i e o u tônicos formam hiato com a vogal anterior e são acentuados quando ficam sozinhos na sílaba ou seguidos de s, como em saída, país, balaústre e baú. Não se acentua o hiato seguido de nh, como em rainha, nem o que vem depois de ditongo, como em feiura.",
  },
  {
    id: "differential",
    role: "concept",
    unit: 7,
    text: "O acento diferencial distingue palavras iguais na escrita: pôr (verbo) e por (preposição), pôde (passado) e pode (presente). Os verbos ter e vir, na terceira pessoa do plural, recebem acento circunflexo: eles têm, eles vêm.",
  },
  {
    id: "hyphen",
    role: "concept",
    unit: 8,
    text: "Usa-se hífen depois dos prefixos ex-, vice-, pós-, pré- e pró- quando eles têm sentido próprio, como em ex-aluno, vice-diretor, pós-graduação e pré-escolar.",
  },
  {
    id: "worked-example",
    role: "example",
    unit: 9,
    text: "Exemplo resolvido: classifique o acento da palavra pôde. Resolução: não é paroxítona terminada em ditongo nem hiato; o acento é diferencial, pois distingue pôde (passado) de pode (presente).",
  },
  {
    id: "teacher-comment",
    role: "commentary",
    unit: 10,
    text: "Comentário do professor: observe que ideia perdeu o acento depois do Acordo Ortográfico, porque é paroxítona com ditongo aberto ei. A regra vale para assembleia, boia e jiboia, mas o acento continua nas oxítonas como papéis, herói e céu.",
  },
  {
    id: "motivating-adolescence",
    role: "motivating_text",
    unit: 11,
    text: "Texto para a questão 1: A adolescência é uma fase de grandes descobertas. O que se desenvolve por volta dos nove ou dez anos acompanha a adolescência e boa parte do início da vida adulta, e envolve mudanças no corpo, nas emoções e nas relações com os amigos e a família.",
  },
  {
    id: "exam-question-1",
    role: "exam_question",
    unit: 11,
    text: "Questão 1. Assinale a alternativa em que todas as palavras são acentuadas pela mesma regra: A) cafés, jacaré, você; B) fácil, hífen, caráter; C) saída, país, baú; D) lâmpada, ideia, herói.",
  },
  {
    id: "motivating-history",
    role: "motivating_text",
    unit: 12,
    text: "Texto para a questão 2: Em 1888, a princesa Isabel assinou a Lei Áurea, que extinguiu a escravidão no Brasil. O documento tinha apenas dois artigos e foi sancionado em 13 de maio, depois de décadas de campanhas e pressões de abolicionistas.",
  },
  {
    id: "exam-question-2",
    role: "exam_question",
    unit: 12,
    text: "Questão 2. Em qual alternativa a palavra está acentuada incorretamente? A) armazém; B) hifen; C) lâmpada; D) saúde. Gabarito: B, porque hífen é paroxítona terminada em n.",
  },
  {
    id: "motivating-river",
    role: "motivating_text",
    unit: 13,
    text: "Leia o trecho a seguir: O rio corria devagar entre as pedras, e a menina, descalça, contava os barcos que passavam em silêncio, sem saber para onde iam nem quando voltariam.",
  },
];

/** The roles an item may come from, by kind; an item from any other role is out of scope. */
export const ALLOWED: Record<"card" | "question", readonly Role[]> = {
  // An exam question is not a card, and neither is a motivating text or a page of the handout.
  card: ["concept", "example", "commentary"],
  // A question may be inspired by an exam question, with new data, but never by the rest.
  question: ["concept", "example", "commentary", "exam_question"],
};

/** The roles that must yield items: what the handout is there to teach. */
export const REQUIRED: readonly Role[] = ["concept"];

/** The goals of the generation on these fixtures (NFR-1). */
export const TARGETS = { leaked: 0, recall: 0.8 } as const;

/** The case an excerpt text belongs to, or undefined when it matches none. */
export function caseOfText(text: string): RelevanceCase | undefined {
  return CASES.find((entry) => entry.text === text);
}
