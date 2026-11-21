/*
 * Filename: images-screens.test.tsx
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeItem, FakeMaterial, FakeQuestion, FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";

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

const hash = (letter: string): string => letter.repeat(64);

function question(overrides: Partial<FakeItem> = {}): FakeQuestion {
  const item: FakeItem = {
    id: 1,
    runId: 1,
    kind: "question",
    subtype: "multiple_choice",
    front: "Observe o gráfico.",
    back: "Veja a figura do comentário.",
    status: "approved",
    topic: "Economia",
    sourceTitle: "apostila",
    sourcePage: 2,
    quote: "citação",
    chunkId: 1,
    edited: false,
    origin: "manual",
    createdAt: "x",
    approvedAt: "x",
    options: [
      { key: "A", text: "", why: "Porque A" },
      { key: "B", text: "Texto B", why: "Porque B" },
    ],
    answer: "A",
    images: {
      statement: [{ hash: hash("a"), alt: "Gráfico de oferta e demanda" }],
      "option.A": [{ hash: hash("b"), alt: "Curva ascendente" }],
      explanation: [{ hash: hash("c"), alt: "Figura do comentário" }],
    },
    ...overrides,
  };
  return { item, attempts: 0, lastCorrect: null };
}

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route, materials: [material], ...initial });
  render(<App />);
  return fake;
}

beforeEach(() => window.localStorage.clear());

describe("Practice shows the pictures of a question (FR-9)", () => {
  it("shows the statement and the alternative pictures, and the comment's only after answering", async () => {
    open("/w/1/study/practice", { questions: [question()] });
    const user = userEvent.setup();
    expect(await screen.findByRole("img", { name: "Gráfico de oferta e demanda" })).toBeVisible();
    expect(await screen.findByRole("img", { name: "Curva ascendente" })).toBeVisible();
    expect(screen.queryByRole("img", { name: "Figura do comentário" })).toBeNull();
    await user.click(screen.getByRole("radio", { name: /Texto B/ }));
    await user.click(screen.getByRole("button", { name: "Responder" }));
    expect(await screen.findByRole("img", { name: "Figura do comentário" })).toBeVisible();
  });
});

describe("Review shows the pictures of a draft (FR-9)", () => {
  it("shows the statement, alternative and comment pictures", async () => {
    const item: FakeItem = {
      ...question().item,
      status: "draft",
      approvedAt: null,
    };
    open("/w/1/generate/1", {
      runs: [
        {
          id: 1,
          kind: "question",
          subtype: "multiple_choice",
          materialId: 1,
          pageFrom: null,
          pageTo: null,
          topicId: null,
          model: "m",
          requested: 1,
          generated: 1,
          approved: 0,
          approvedUnedited: 0,
          discardedReview: 0,
          discardedSource: 0,
          discardedDuplicate: 0,
          discardedInvalid: 0,
          discardedOutOfScope: 0,
          rounds: 1,
          withAnalysis: false,
          costUsd: 0,
          promptTokens: 0,
          completionTokens: 0,
          status: "done",
          errorCode: null,
          errorDetail: null,
          jobId: 1,
          createdAt: "2026-03-01T10:00:00.000Z",
          finishedAt: "2026-03-01T10:01:00.000Z",
          progress: null,
        } as never,
      ],
      items: [item],
    });
    expect(await screen.findByRole("img", { name: "Gráfico de oferta e demanda" })).toBeVisible();
    expect(await screen.findByRole("img", { name: "Curva ascendente" })).toBeVisible();
    expect(await screen.findByRole("img", { name: "Figura do comentário" })).toBeVisible();
  });
});

describe("Creating a question with pictures (FR-3)", () => {
  async function newQuestion() {
    const fake = open("/w/1/items", {
      catalog: [
        {
          id: 1,
          kind: "card",
          subtype: "qa",
          front: "Pergunta 1",
          back: "Resposta",
          status: "approved",
          topicId: null,
          topic: null,
          materialId: 1,
          material: "Micro",
          edited: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          origin: "generated",
          sourceTitle: "Micro",
          sourcePage: 4,
          hasPdf: true,
        },
      ],
    });
    const user = userEvent.setup();
    await screen.findByRole("table", { name: "Itens" });
    await user.click(screen.getByRole("button", { name: "Novo item" }));
    const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
    await user.click(within(panel).getByRole("radio", { name: "Questão" }));
    return { fake, user, panel };
  }

  it("saves a question whose alternative is only a picture", async () => {
    const { fake, user, panel } = await newQuestion();
    await user.type(within(panel).getByLabelText("Enunciado"), "Qual curva?");
    await user.type(within(panel).getByLabelText("Texto da alternativa B"), "Outra");
    const adds = within(panel).getAllByRole("button", { name: "＋ Imagem" });
    // statement, then the options A..D, then the comment
    await user.click(adds[1] as HTMLElement);
    await user.type(within(panel).getByLabelText("Justificativa da alternativa A"), "Sobe.");
    await user.type(within(panel).getByLabelText("Justificativa da alternativa B"), "Não.");
    await user.type(within(panel).getByLabelText("Justificativa da alternativa C"), "Não.");
    await user.type(within(panel).getByLabelText("Texto da alternativa C"), "C");
    await user.type(within(panel).getByLabelText("Justificativa da alternativa D"), "Não.");
    await user.type(within(panel).getByLabelText("Texto da alternativa D"), "D");
    await user.type(within(panel).getByLabelText("Explicação"), "Veja.");
    await user.click(within(panel).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith(
        "items:create",
        expect.objectContaining({
          draft: expect.objectContaining({
            kind: "question",
            images: { "option.A": [{ hash: "1".padStart(64, "0") }] },
          }),
        }),
      ),
    );
  });

  it("moves the pictures of a field, names them and warns about the answer in the picture (FR-2, FR-8, FR-19)", async () => {
    const { fake, user, panel } = await newQuestion();
    const statementAdd = within(panel).getAllByRole("button", { name: "＋ Imagem" })[0];
    await user.click(statementAdd as HTMLElement);
    await user.click(within(panel).getAllByRole("button", { name: "＋ Imagem" })[0] as HTMLElement);
    await within(panel).findByRole("list", { name: "Imagens" });
    expect(within(panel).getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
    expect(within(panel).getAllByText(/evite que a imagem traga a resposta/)[0]).toBeVisible();
    await user.type(within(panel).getByLabelText("Texto alternativo da imagem 2"), "Segunda");
    await user.click(within(panel).getByRole("button", { name: "Mover a imagem 2 para cima" }));
    // The caption travelled with the picture: it is now the first one.
    expect(within(panel).getByLabelText("Texto alternativo da imagem 1")).toHaveValue("Segunda");
    expect(
      within(panel).getByRole("button", { name: "Mover a imagem 1 para cima" }),
    ).toBeDisabled();
    await user.click(within(panel).getByRole("button", { name: "Remover a imagem 1" }));
    expect(within(panel).getAllByRole("listitem").length).toBe(1);
    expect(fake.state.images.puts).toHaveLength(2);
  });

  it("keeps a picture when it is replaced and shows its caption in the place of a missing file (FR-11)", async () => {
    const { fake, user, panel } = await newQuestion();
    await user.click(within(panel).getAllByRole("button", { name: "＋ Imagem" })[0] as HTMLElement);
    await user.type(await within(panel).findByLabelText("Texto alternativo da imagem 1"), "Mapa");
    await user.click(within(panel).getByRole("button", { name: "Substituir" }));
    await waitFor(() => expect(fake.state.images.puts).toHaveLength(2));
    // Same place, same caption; the picture itself is the new one.
    expect(within(panel).getByLabelText("Texto alternativo da imagem 1")).toHaveValue("Mapa");
    expect(within(panel).getAllByRole("listitem")).toHaveLength(1);
  });
});

describe("Editing an item keeps and changes its pictures", () => {
  it("sends the pictures only when they changed", async () => {
    const draft: FakeItem = {
      id: 1,
      runId: 1,
      kind: "card",
      subtype: "qa",
      front: "Pergunta?",
      back: "Resposta",
      status: "draft",
      topic: null,
      sourceTitle: "apostila",
      sourcePage: 4,
      quote: "citação",
      chunkId: 1,
      edited: false,
      origin: "generated",
      createdAt: "2026-03-01T10:00:00.000Z",
      approvedAt: null,
      options: [],
      answer: null,
      images: { front: [{ hash: hash("d"), alt: "Esquema" }] },
    };
    const run = {
      id: 1,
      kind: "card",
      subtype: "qa",
      materialId: 1,
      pageFrom: null,
      pageTo: null,
      topicId: null,
      model: "m",
      requested: 1,
      generated: 1,
      approved: 0,
      approvedUnedited: 0,
      discardedReview: 0,
      discardedSource: 0,
      discardedDuplicate: 0,
      discardedInvalid: 0,
      discardedOutOfScope: 0,
      rounds: 1,
      withAnalysis: false,
      costUsd: 0,
      promptTokens: 0,
      completionTokens: 0,
      status: "done",
      errorCode: null,
      errorDetail: null,
      jobId: 1,
      createdAt: "2026-03-01T10:00:00.000Z",
      finishedAt: "2026-03-01T10:01:00.000Z",
      progress: null,
    };
    const fake = open("/w/1/generate/1", { runs: [run as never], items: [draft] });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Editar" }));
    const dialog = screen.getByRole("dialog", { name: "Editar" });
    expect(within(dialog).getByLabelText("Texto alternativo da imagem 1")).toHaveValue("Esquema");
    await user.type(within(dialog).getByLabelText("Frente"), " Mais?");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(fake.invoke).toHaveBeenCalledWith("review:edit", expect.anything()));
    const sent = fake.invoke.mock.calls.find(([channel]) => channel === "review:edit")?.[1];
    expect(sent).not.toHaveProperty("images");

    await user.click(await screen.findByRole("button", { name: "Editar" }));
    const again = screen.getByRole("dialog", { name: "Editar" });
    await user.click(within(again).getByRole("button", { name: "Remover a imagem 1" }));
    await user.click(within(again).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith(
        "review:edit",
        expect.objectContaining({ images: {} }),
      ),
    );
  });
});
