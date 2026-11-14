/*
 * Filename: stats.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyOverview, installFakeMind } from "../test/fake-mind.js";
import type {
  FakeItem,
  FakeMaterial,
  FakeOverview,
  FakeQuestion,
  FakeState,
} from "../test/fake-mind.js";
import { App } from "./App.js";

// Recharts needs a real layout to measure; the tables carry the same numbers.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };
const material: FakeMaterial = {
  id: 1,
  title: "apostila",
  kind: "pdf",
  filename: "a.pdf",
  status: "indexed",
  pageCount: 3,
  charCount: 10,
  ocrConfidence: null,
  jobId: 1,
  errorCode: null,
  errorDetail: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  sourceUrl: null,
  progress: null,
  chunkCount: 3,
};

const topic = (
  id: number,
  name: string,
  accuracy: number | null,
  events: number,
  smallSample = false,
) => ({
  topicId: id,
  name,
  cardReviews: events,
  cardPasses: events,
  questionAttempts: 0,
  questionCorrect: 0,
  events,
  accuracy,
  cardAccuracy: accuracy,
  questionAccuracy: null,
  smallSample,
});

function overview(): FakeOverview {
  const base = emptyOverview();
  return {
    ...base,
    summary: {
      ...base.summary,
      reviewedToday: 12,
      answeredToday: 3,
      activityToday: 15,
      goal: 40,
      currentStreak: 4,
      longestStreak: 9,
      totalReviews: 120,
      totalAttempts: 30,
    },
    topics: [topic(1, "Células", 0.7, 10), topic(2, "Genética", 0.25, 4, true)],
    weakest: [topic(2, "Genética", 0.25, 4, true)],
    retention: {
      rate: 0.8,
      reviews: 10,
      days: [
        { day: "2026-11-13", reviews: 4, passes: 3, rate: 0.75 },
        { day: "2026-11-14", reviews: 6, passes: 5, rate: 5 / 6 },
      ],
    },
    activity: [
      { day: "2026-11-13", reviews: 4, attempts: 1, total: 5 },
      { day: "2026-11-14", reviews: 6, attempts: 2, total: 8 },
    ],
  };
}

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route, materials: [material], ...initial });
  render(<App />);
  return fake;
}

const topics = [
  { id: 1, name: "Células", cards: 3, questions: 1 },
  { id: 2, name: "Genética", cards: 1, questions: 0 },
];

describe("Stats page (FR-16)", () => {
  it("shows the summary, the streaks and the goal", async () => {
    open("/w/1/stats", { overview: overview(), topicList: topics });
    expect(await screen.findByText("12 / 40")).toBeVisible();
    expect(screen.getByText("4 dia(s)")).toBeVisible();
    expect(screen.getByText("9 dia(s)")).toBeVisible();
    expect(screen.getByText("120 avaliações e 30 respostas no total")).toBeVisible();
  });

  it("gives every chart a description and a table with the same numbers", async () => {
    open("/w/1/stats", { overview: overview(), topicList: topics });
    expect(await screen.findByRole("img", { name: "Retenção (30 dias): 80%" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Atividade (30 dias)" })).toBeVisible();
    const retention = screen.getByRole("table", { name: /Retenção \(30 dias\): Dados do gráfico/ });
    expect(within(retention).getAllByRole("row")).toHaveLength(3);
    expect(within(retention).getByText("75%")).toBeInTheDocument();
    const activity = screen.getByRole("table", { name: /Atividade \(30 dias\): Dados do gráfico/ });
    expect(within(activity).getByText("2026-11-14")).toBeInTheDocument();
  });

  it("shows accuracy by topic and flags small samples", async () => {
    open("/w/1/stats", { overview: overview(), topicList: topics });
    const table = await screen.findByRole("table", { name: "Acerto por tópico" });
    expect(within(table).getByRole("row", { name: /Células.*70%/ })).toBeVisible();
    const small = within(table).getByRole("row", { name: /Genética/ });
    expect(small).toHaveTextContent("25%");
    expect(small).toHaveTextContent("amostra pequena");
  });

  it("edits the daily goal and reports field errors", async () => {
    const fake = open("/w/1/stats", { overview: overview(), topicList: topics });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Editar meta" }));
    const input = screen.getByLabelText("Cards por dia");
    await user.clear(input);
    await user.type(input, "5000");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Meta inválida.");
    await user.clear(input);
    await user.type(input, "25");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(fake.state.overview.summary.goal).toBe(25));
    expect(await screen.findByText("12 / 25")).toBeVisible();
  });

  it("renames a topic and shows the validation message", async () => {
    const fake = open("/w/1/stats", { overview: overview(), topicList: topics });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Renomear Células" }));
    const field = screen.getByLabelText("Nome do tópico");
    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Informe um nome.")).toBeVisible();
    await user.type(field, "Biologia");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("row", { name: /Biologia/ })).toBeVisible();
    expect(fake.state.topicList[0]?.name).toBe("Biologia");
  });

  it("merges a topic into another one", async () => {
    const fake = open("/w/1/stats", { overview: overview(), topicList: topics });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Mesclar Genética" }));
    expect(screen.getByRole("button", { name: "Mesclar" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Mesclar em"), "1");
    await user.click(screen.getByRole("button", { name: "Mesclar" }));
    await waitFor(() => expect(screen.queryByRole("row", { name: /Genética/ })).toBeNull());
    expect(fake.invoke).toHaveBeenCalledWith("topics:merge", {
      workspaceId: 1,
      sourceId: 2,
      targetId: 1,
    });
  });

  it("deletes a topic only after confirmation", async () => {
    const fake = open("/w/1/stats", { overview: overview(), topicList: topics });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Excluir Genética" }));
    expect(
      screen.getByText("Os itens ficam sem tópico. Essa ação não pode ser desfeita."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(fake.state.topicList).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Excluir Genética" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(fake.state.topicList).toHaveLength(1));
    expect(screen.queryByRole("row", { name: /Genética/ })).toBeNull();
  });

  it("does not offer topic actions for items without a topic", async () => {
    const data = overview();
    data.topics = [{ ...topic(1, "x", 0.5, 6), topicId: null, name: null }];
    open("/w/1/stats", { overview: data });
    const table = await screen.findByRole("table", { name: "Acerto por tópico" });
    expect(within(table).getByText("Sem tópico")).toBeVisible();
    expect(within(table).queryByRole("button")).toBeNull();
  });
});

describe("Errors page (FR-15)", () => {
  const entries = [
    {
      itemId: 5,
      front: "Qual organela respira?",
      topic: "Células",
      sourceTitle: "apostila",
      sourcePage: 3,
      fromQuestion: true,
      failures: 0,
      lastErrorAt: "2026-11-14T10:00:00.000Z",
    },
    {
      itemId: 6,
      front: "O que é um gene?",
      topic: "Genética",
      sourceTitle: "apostila",
      sourcePage: 9,
      fromQuestion: false,
      failures: 3,
      lastErrorAt: "2026-11-13T10:00:00.000Z",
    },
  ];

  it("lists the notebook with counters, sources and failures", async () => {
    open("/w/1/errors", { errorEntries: entries, topicList: topics });
    expect(
      await screen.findByText('2 no caderno · 1 de questões · 1 cards com "Errei"'),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Caderno de erros" })).toBeVisible();
    expect(screen.getByText("Qual organela respira?")).toBeVisible();
    expect(screen.getByText(/De questão · Células/)).toBeVisible();
    expect(screen.getByText(/3 vez\(es\) "Errei"/)).toBeVisible();
    expect(screen.getByText(/Fonte: apostila, pág\. 9/)).toBeVisible();
  });

  it("filters by topic", async () => {
    const fake = open("/w/1/errors", { errorEntries: entries, topicList: topics });
    await userEvent.setup().selectOptions(await screen.findByLabelText("Tópico"), "2");
    await waitFor(() => expect(screen.queryByText("Qual organela respira?")).toBeNull());
    expect(screen.getByText("O que é um gene?")).toBeVisible();
    expect(fake.invoke).toHaveBeenCalledWith("errors:list", { workspaceId: 1, topicId: 2 });
  });

  it("explains the empty notebook", async () => {
    open("/w/1/errors");
    expect(await screen.findByText(/Nenhum erro por enquanto/)).toBeVisible();
  });
});

describe("Make a card after a wrong answer (FR-15)", () => {
  const item: FakeItem = {
    id: 7,
    runId: 1,
    kind: "question",
    subtype: "multiple_choice",
    front: "Enunciado 7?",
    back: "c",
    status: "approved",
    topic: "Biologia",
    sourceTitle: "apostila",
    sourcePage: 2,
    quote: "citação",
    chunkId: 1,
    edited: false,
    origin: "generated",
    createdAt: "x",
    approvedAt: "x",
    options: [
      { key: "A", text: "Certa", why: "p" },
      { key: "B", text: "Errada", why: "q" },
    ],
    answer: "A",
  };
  const question: FakeQuestion = { item, attempts: 0, lastCorrect: null };

  it("offers the button only after a wrong answer and creates the card once", async () => {
    const fake = open("/w/1/study/practice", { questions: [question], answerKeys: { 7: "A" } });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 7?");
    await user.click(screen.getByRole("radio", { name: /B · Errada/ }));
    await user.click(screen.getByRole("button", { name: "Responder" }));
    await user.click(await screen.findByRole("button", { name: "Virar card" }));
    expect(await screen.findByText("Card criado no caderno de erros.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Virar card" }));
    expect(await screen.findByText("Esse erro já virou card.")).toBeVisible();
    expect(fake.state.madeCards).toEqual([7]);
  });

  it("does not offer it after a right answer", async () => {
    open("/w/1/study/practice", { questions: [question], answerKeys: { 7: "A" } });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 7?");
    await user.click(screen.getByRole("radio", { name: /A · Certa/ }));
    await user.click(screen.getByRole("button", { name: "Responder" }));
    await screen.findByText(/Resposta correta/);
    expect(screen.queryByRole("button", { name: "Virar card" })).toBeNull();
  });
});
