/*
 * Filename: chat.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeMaterial, FakeReply, FakeState } from "../test/fake-mind.js";
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

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route, materials: [material], ...initial });
  render(<App />);
  return fake;
}

const past: FakeReply = {
  id: 1,
  question: "O que é a mitocôndria?",
  answer: "Organela da respiração celular.",
  supported: true,
  citations: [
    {
      chunkId: 9,
      materialId: 1,
      materialTitle: "apostila",
      page: 3,
      section: null,
      quote: "organela responsável pela respiração",
    },
  ],
  costUsd: 0.002,
  createdAt: "2026-11-13T10:00:00.000Z",
};

describe("Chat page (FR-18)", () => {
  it("shows the history with citations and opens the cited excerpt in the library", async () => {
    const fake = open("/w/1/chat", { chat: [past] });
    const user = userEvent.setup();
    expect(await screen.findByText("O que é a mitocôndria?")).toBeVisible();
    expect(screen.getByText("Organela da respiração celular.")).toBeVisible();
    expect(screen.getByText(/organela responsável pela respiração/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Abrir trecho: apostila, pág\. 3/ }));
    await waitFor(() => expect(fake.state.route).toBe("/w/1/library/1?chunk=9"));
  });

  it("asks a question, shows the answer with its source and clears the field", async () => {
    const fake = open("/w/1/chat");
    const user = userEvent.setup();
    expect(await screen.findByText("Nenhuma pergunta ainda.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Perguntar" })).toBeDisabled();
    const field = screen.getByLabelText("Sua pergunta");
    await user.type(field, "Como funciona?");
    await user.click(screen.getByRole("button", { name: "Perguntar" }));
    expect(await screen.findByText("Resposta para Como funciona?")).toBeVisible();
    expect(screen.getByText(/trecho citado do material/)).toBeVisible();
    expect(field).toHaveValue("");
    expect(fake.invoke).toHaveBeenCalledWith("chat:ask", {
      workspaceId: 1,
      question: "Como funciona?",
    });
  });

  it("highlights an answer without support in the material and shows no citations", async () => {
    open("/w/1/chat", {
      chatReply: () => ({
        answer: "Não encontrei suporte no material para responder a essa pergunta.",
        supported: false,
        citations: [],
        costUsd: 0,
      }),
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Sua pergunta"), "Xilofone?");
    await user.click(screen.getByRole("button", { name: "Perguntar" }));
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent("Sem suporte no material");
    expect(note).toHaveTextContent("Não encontrei suporte no material");
    expect(screen.queryByText("Fontes")).toBeNull();
  });

  it("clears the history only after confirmation", async () => {
    const fake = open("/w/1/chat", { chat: [past] });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Limpar histórico" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(fake.state.chat).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Limpar histórico" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Limpar histórico" }),
    );
    await waitFor(() => expect(fake.state.chat).toHaveLength(0));
    expect(await screen.findByText("Nenhuma pergunta ainda.")).toBeVisible();
  });
});

describe("Semantic search panel", () => {
  it("explains the download, then enables the search and shows the indexing result", async () => {
    const fake = open("/w/1/chat");
    const user = userEvent.setup();
    expect(await screen.findByText("Desativada")).toBeVisible();
    expect(screen.getByText("0 de 3 trechos vetorizados")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Ativar" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/130 MB/)).toBeVisible();
    expect(fake.invoke).not.toHaveBeenCalledWith("embeddings:enable", expect.anything());
    await user.click(within(dialog).getByRole("button", { name: "Ativar" }));
    expect(await screen.findByText("Ativada")).toBeVisible();
    expect(screen.getByText("3 de 3 trechos vetorizados")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Desativar" }));
    expect(await screen.findByText("Desativada")).toBeVisible();
  });

  it("enables without asking again when the model is already on disk", async () => {
    const fake = open("/w/1/chat", {
      embeddings: { modelReady: true, enabled: false, indexed: 0, total: 3, model: "m", job: null },
    });
    await userEvent.setup().click(await screen.findByRole("button", { name: "Ativar" }));
    expect(await screen.findByText("Ativada")).toBeVisible();
    expect(fake.invoke).toHaveBeenCalledWith("embeddings:enable", { workspaceId: 1 });
  });

  it("shows the failure of the download", async () => {
    open("/w/1/chat", { embeddingsFailure: "Sem rede para baixar o modelo." });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Ativar" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ativar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem rede para baixar o modelo.");
    expect(
      screen.getByText("O modelo ainda não foi baixado. Ative de novo para baixá-lo."),
    ).toBeVisible();
  });

  it("shows progress while the job runs and offers to vectorize new chunks later", async () => {
    open("/w/1/chat", {
      embeddings: {
        modelReady: true,
        enabled: true,
        indexed: 1,
        total: 3,
        model: "m",
        job: { state: "running", progress: 0.4, message: "vetorizando trechos", errorDetail: null },
      },
    });
    expect(await screen.findByText("vetorizando trechos")).toBeVisible();
    expect(
      screen.getByRole("progressbar", { name: "Preparando a busca semântica…" }),
    ).toHaveAttribute("value", "0.4");
  });

  it("offers to vectorize chunks imported after the option was turned on", async () => {
    const fake = open("/w/1/chat", {
      embeddings: {
        modelReady: true,
        enabled: true,
        indexed: 2,
        total: 3,
        model: "m",
        job: { state: "done", progress: 1, message: "", errorDetail: null },
      },
    });
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Vetorizar trechos novos" }));
    expect(fake.invoke).toHaveBeenCalledWith("embeddings:enable", { workspaceId: 1 });
  });
});
