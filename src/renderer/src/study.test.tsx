/*
 * Filename: study.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type {
  FakeItem,
  FakeMaterial,
  FakeQuestion,
  FakeState,
  FakeStudyCard,
} from "../test/fake-mind.js";
import { App } from "./App.js";
import { parseRoute } from "./router.js";

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

function card(id: number, overrides: Partial<FakeStudyCard> = {}): FakeStudyCard {
  return {
    itemId: id,
    subtype: "qa",
    topic: "Biologia",
    sourceTitle: "apostila",
    sourcePage: 4,
    isNew: true,
    front: [{ text: `Pergunta ${id}?`, hit: false }],
    back: [{ text: `Resposta ${id}`, hit: false }],
    previews: { "1": "1 min", "2": "6 min", "3": "10 min", "4": "3 d" },
    ...overrides,
  };
}

function question(id: number, keys: string[]): FakeQuestion {
  const item: FakeItem = {
    id,
    runId: 1,
    kind: "question",
    subtype: "multiple_choice",
    front: `Enunciado ${id}?`,
    back: "Comentário",
    status: "approved",
    topic: "Biologia",
    sourceTitle: "apostila",
    sourcePage: 2,
    quote: `citação ${id}`,
    chunkId: id,
    edited: false,
    origin: "generated",
    createdAt: "x",
    approvedAt: "x",
    options: keys.map((key) => ({ key, text: `Alternativa ${key}`, why: `Porque ${key}` })),
    answer: "A",
  };
  return { item, attempts: 0, lastCorrect: null };
}

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route, materials: [material], ...initial });
  render(<App />);
  return fake;
}

describe("study routes", () => {
  it("parses the practice sub-screen", () => {
    expect(parseRoute("/w/1/study/practice")).toEqual({
      name: "section",
      workspaceId: 1,
      section: "study",
      practice: true,
    });
    expect(parseRoute("/w/1/library/practice")).toEqual({ name: "unknown" });
    expect(parseRoute("/w/1/study")).toEqual({ name: "section", workspaceId: 1, section: "study" });
  });
});

describe("Study page (FR-12, FR-13, FR-32)", () => {
  it("reveals with the button, then rates and shows the next card", async () => {
    const fake = open("/w/1/study", { studyQueue: [card(1), card(2)] });
    const user = userEvent.setup();
    expect(await screen.findByText("Pergunta 1?")).toBeVisible();
    expect(screen.getByText(/2 restantes/)).toBeVisible();
    expect(screen.queryByText("Resposta 1")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Mostrar resposta/ }));
    expect(screen.getByText("Resposta 1")).toBeVisible();
    expect(screen.getByRole("button", { name: /3 · Bom\s*10 min/ })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /3 · Bom/ }));
    expect(await screen.findByText("Pergunta 2?")).toBeVisible();
    expect(fake.state.reviewedToday).toBe(1);
  });

  it("works with the keyboard: Space reveals and 1 to 4 rate", async () => {
    const fake = open("/w/1/study", { studyQueue: [card(1), card(2)] });
    const user = userEvent.setup();
    await screen.findByText("Pergunta 1?");
    await user.keyboard("3");
    expect(screen.queryByText("Resposta 1")).toBeNull();
    expect(fake.state.reviewedToday).toBe(0);
    await user.keyboard(" ");
    expect(screen.getByText("Resposta 1")).toBeVisible();
    await user.keyboard("3");
    expect(await screen.findByText("Pergunta 2?")).toBeVisible();
    expect(fake.state.reviewedToday).toBe(1);
  });

  it("undoes the last rating with the button or Ctrl+Z", async () => {
    const fake = open("/w/1/study", { studyQueue: [card(1), card(2)] });
    const user = userEvent.setup();
    await screen.findByText("Pergunta 1?");
    await user.keyboard(" 4");
    expect(await screen.findByText("Pergunta 2?")).toBeVisible();
    await user.keyboard("{Control>}z{/Control}");
    expect(await screen.findByText("Pergunta 1?")).toBeVisible();
    expect(fake.state.reviewedToday).toBe(0);
    await user.keyboard(" 1");
    await screen.findByText("Pergunta 2?");
    await user.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(await screen.findByText("Pergunta 1?")).toBeVisible();
  });

  it("hides cloze gaps in the front and shows the filled sentence in the back", async () => {
    open("/w/1/study", {
      studyQueue: [
        card(1, {
          subtype: "cloze",
          front: [
            { text: "A ", hit: false },
            { text: "[…]", hit: true },
            { text: " produz energia.", hit: false },
          ],
          back: [
            { text: "A ", hit: false },
            { text: "mitocôndria", hit: true },
            { text: " produz energia.", hit: false },
          ],
        }),
      ],
    });
    const user = userEvent.setup();
    const front = await screen.findByLabelText("Frente");
    expect(front.querySelector("mark")).toHaveTextContent("[…]");
    await user.keyboard(" ");
    expect(screen.getByLabelText("Verso").querySelector("mark")).toHaveTextContent("mitocôndria");
  });

  it("shows the empty state when there is nothing to study and links to practice", async () => {
    open("/w/1/study", { studyQueue: [] });
    expect(await screen.findByText("Nada para estudar agora")).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Praticar" }));
    expect(await screen.findByRole("heading", { name: "Praticar questões" })).toBeVisible();
  });

  it("offers a filter built from the facets", async () => {
    const fake = open("/w/1/study", { studyQueue: [card(1)] });
    const user = userEvent.setup();
    const select = await screen.findByRole("combobox", { name: "Estudar" });
    await user.selectOptions(select, "topic:1");
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith("study:next", {
        workspaceId: 1,
        filter: { topicId: 1 },
      }),
    );
  });
});

describe("Today page study indicators", () => {
  it("shows due, learning, new, done today, the goal and the study button", async () => {
    open("/w/1/today", {
      studyQueue: [card(1), card(2), card(3)],
      reviewedToday: 5,
      summary: { materials: 1, cards: 3, questions: 0 },
    });
    expect(await screen.findByRole("button", { name: "Estudar agora (3)" })).toBeVisible();
    expect(screen.getByText("Vencidos")).toBeVisible();
    expect(screen.getByText("Feitos hoje")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Meta diária" })).toHaveAttribute("value", "5");
    expect(screen.getByText("5 / 40")).toBeVisible();
  });

  it("offers practice when questions wait", async () => {
    open("/w/1/today", {
      studyQueue: [card(1)],
      questions: [question(7, ["A", "B"])],
      summary: { materials: 1, cards: 1, questions: 1 },
    });
    expect(await screen.findByText(/Questões para praticar: 1/)).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Praticar" }));
    expect(await screen.findByRole("heading", { name: "Praticar questões" })).toBeVisible();
  });
});

describe("Practice page (FR-14)", () => {
  it("answers a question, shows the correction, comments and source, then moves on", async () => {
    const fake = open("/w/1/study/practice", {
      questions: [question(7, ["A", "B", "C", "D"]), question(8, ["A", "B"])],
      answerKeys: { 7: "A", 8: "B" },
    });
    const user = userEvent.setup();
    expect(await screen.findByText("Enunciado 7?")).toBeVisible();
    expect(screen.getByRole("button", { name: "Responder" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /B · Alternativa B/ }));
    await user.click(screen.getByRole("button", { name: "Responder" }));
    expect(await screen.findByText(/Resposta errada\. Gabarito: A/)).toBeVisible();
    expect(screen.getByText("Comentário da questão.")).toBeVisible();
    expect(screen.getByText(/Fonte: apostila, pág\. 2/)).toBeVisible();
    expect(screen.getByRole("radio", { name: /A · Alternativa A.*Porque A/ })).toHaveClass("right");
    expect(screen.getByRole("radio", { name: /B · Alternativa B/ })).toHaveClass("wrong");
    expect(fake.state.answeredToday).toBe(1);
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Enunciado 8?")).toBeVisible();
  });

  it("supports the keyboard: number keys choose and Enter answers", async () => {
    open("/w/1/study/practice", { questions: [question(7, ["A", "B"])], answerKeys: { 7: "B" } });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 7?");
    await user.keyboard("2");
    await user.keyboard("{Enter}");
    expect(await screen.findByText(/Resposta correta! Gabarito: B/)).toBeVisible();
  });

  it("says when there are no questions and goes back to Study", async () => {
    open("/w/1/study/practice", { questions: [] });
    expect(await screen.findByText("Nenhuma questão para praticar agora.")).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Voltar a Estudar" }));
    expect(await screen.findByRole("heading", { name: "Estudar" })).toBeVisible();
  });

  it("shows the counters and the redo option", async () => {
    const fake = open("/w/1/study/practice", { questions: [question(7, ["A", "B"])] });
    const user = userEvent.setup();
    expect(await screen.findByText(/1 novas · 0 para refazer/)).toBeVisible();
    await user.click(screen.getByLabelText("Refazer certas"));
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith("practice:next", { workspaceId: 1, redo: true }),
    );
  });
});

describe("Generate page for questions", () => {
  it("switches to questions, shows the exam profiles and starts a question run", async () => {
    const fake = open("/w/1/generate");
    const user = userEvent.setup();
    await screen.findByLabelText("O que gerar");
    await user.selectOptions(screen.getByLabelText("O que gerar"), "question");
    const profile = screen.getByLabelText("Perfil da questão");
    expect(
      within(profile)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Certo ou errado",
      "Múltipla escolha (4)",
      "Múltipla escolha (5)",
      "Cálculo (4 alternativas)",
      "Cálculo (5 alternativas)",
    ]);
    await user.selectOptions(profile, "multiple_choice_4");
    await user.click(screen.getByRole("button", { name: "Gerar questões" }));
    expect(await screen.findByText("Na fila")).toBeVisible();
    expect(fake.state.runs[0]).toMatchObject({ subtype: "multiple_choice_4" });
    expect(fake.invoke).toHaveBeenCalledWith(
      "generation:start",
      expect.objectContaining({ kind: "question", subtype: "multiple_choice_4" }),
    );
  });
});

describe("Review page for questions", () => {
  it("shows the options, the answer key and the comment of a generated question", async () => {
    const q = question(1, ["A", "B", "C", "D"]).item;
    open("/w/1/generate/1", {
      runs: [
        {
          id: 1,
          kind: "question",
          subtype: "multiple_choice_4",
          materialId: 1,
          pageFrom: null,
          pageTo: null,
          topicId: null,
          model: "m",
          requested: 3,
          generated: 1,
          discardedNoSource: 0,
          discardedInvalid: 0,
          discardedDuplicate: 0,
          discardedUnsupported: 2,
          approved: 0,
          approvedUnedited: 0,
          discardedReview: 0,
          costUsd: 0.02,
          status: "done",
          discardLog: [],
          errorCode: null,
          errorDetail: null,
          jobId: 1,
          createdAt: "2026-03-01T10:00:00.000Z",
          finishedAt: null,
          progress: null,
        },
      ],
      items: [{ ...q, status: "draft", runId: 1 }],
    });
    expect(await screen.findByText("Enunciado 1?")).toBeVisible();
    expect(screen.getByText(/Alternativa A/).closest("li")).toHaveClass("ok");
    expect(screen.getByText(/Porque B/)).toBeVisible();
    expect(screen.getByText("Comentário")).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText("Enunciado")).toBeVisible();
    expect(screen.getByLabelText("Comentário")).toBeVisible();
  });
});
