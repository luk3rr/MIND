/*
 * Filename: practice-session.test.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeItem, FakeQuestion, FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

function question(id: number, subtype = "multiple_choice"): FakeQuestion {
  const item: FakeItem = {
    id,
    runId: 1,
    kind: "question",
    subtype,
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
    options: [
      { key: "A", text: "Alternativa A", why: "Porque A" },
      { key: "B", text: "Alternativa B", why: "Porque B" },
    ],
    answer: "A",
  };
  return { item, attempts: 0, lastCorrect: null };
}

function open(initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route: "/w/1/study/practice", ...initial });
  render(<App />);
  return fake;
}

const answerCalls = (invoke: { mock: { calls: unknown[][] } }) =>
  invoke.mock.calls.filter(([channel]) => channel === "practice:answer");

describe("filter of the questions (like the cards)", () => {
  it("offers topics, materials and types and restarts the session with the chosen one", async () => {
    const { invoke } = open({
      questions: [question(1, "multiple_choice"), question(2, "certo_errado")],
    });
    const user = userEvent.setup();
    const group = await screen.findByRole("group", { name: "Estudar" });
    const topic = within(group).getByRole("combobox", { name: "Tópico" });
    await user.click(topic);
    expect(screen.getByRole("option", { name: /Biologia/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    const material = within(group).getByLabelText("Material");
    expect(within(material).getByRole("option", { name: /apostila/ })).toBeInTheDocument();
    const type = within(group).getByLabelText("Tipo");
    expect(within(type).getByRole("option", { name: /Múltipla escolha/ })).toBeInTheDocument();
    expect(await screen.findByText("Enunciado 1?")).toBeVisible();
    await user.selectOptions(type, "certo_errado");
    expect(await screen.findByText("Enunciado 2?")).toBeVisible();
    expect(screen.queryByText("Enunciado 1?")).not.toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith(
      "practice:next",
      expect.objectContaining({ filter: { subtype: "certo_errado" } }),
    );
    expect(screen.getByText(/Questão 1 de 1/)).toBeVisible();
  });
});

describe("fixing a question while practicing", () => {
  it("edits the comment and discards the question after answering it", async () => {
    const first = question(1);
    const fake = open({
      questions: [first, question(2)],
      items: [first.item, question(2).item],
    });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    await user.click(screen.getByRole("radio", { name: /Alternativa A/ }));
    await user.click(screen.getByRole("button", { name: "Responder" }));

    await user.click(await screen.findByRole("button", { name: "Editar" }));
    const comment = await screen.findByLabelText("Comentário");
    await user.clear(comment);
    await user.type(comment, "Comentário melhor");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Comentário melhor")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Descartar" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Descartar" }),
    );
    expect(await screen.findByText("Enunciado 2?")).toBeVisible();
    expect(screen.queryByText("Enunciado 1?")).not.toBeInTheDocument();
    expect(fake.state.items[0]?.status).toBe("discarded");
  });
});

describe("skipping and going back", () => {
  it("skips without answering, goes back to the unanswered question and answers it later", async () => {
    const { invoke } = open({ questions: [question(1), question(2)] });
    const user = userEvent.setup();
    expect(await screen.findByText("Enunciado 1?")).toBeVisible();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Pular" }));
    expect(await screen.findByText("Enunciado 2?")).toBeVisible();
    expect(screen.getByText(/Questão 2 de 2/)).toBeVisible();
    expect(answerCalls(invoke)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(await screen.findByText("Enunciado 1?")).toBeVisible();
    expect(screen.getByRole("radio", { name: /^A/ })).not.toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /^A/ }));
    await user.click(screen.getByRole("button", { name: "Responder" }));
    expect(await screen.findByText(/Resposta correta! Gabarito: A/)).toBeVisible();
    expect(answerCalls(invoke)).toHaveLength(1);
  });

  it("shows an answered question as it was when coming back to it", async () => {
    open({ questions: [question(1), question(2)] });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await user.click(screen.getByRole("radio", { name: /^B/ }));
    await user.click(screen.getByRole("button", { name: "Responder" }));
    expect(await screen.findByText(/Resposta errada\. Gabarito: A/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    await screen.findByText("Enunciado 2?");
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(await screen.findByText("Enunciado 1?")).toBeVisible();
    expect(screen.getByText(/Resposta errada\. Gabarito: A/)).toBeVisible();
    expect(screen.getByRole("radio", { name: /^A/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /^B/ })).toHaveAttribute("aria-checked", "true");
  });

  it("reaches the end of the queue and offers to go back to the skipped questions", async () => {
    open({ questions: [question(1), question(2)] });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await user.click(screen.getByRole("button", { name: "Pular" }));
    await screen.findByText("Enunciado 2?");
    await user.click(screen.getByRole("button", { name: "Pular" }));
    expect(await screen.findByText("Você chegou ao fim da fila de questões.")).toBeVisible();
    expect(screen.getByText("2 questões puladas continuam sem resposta.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Voltar às puladas" }));
    expect(await screen.findByText("Enunciado 1?")).toBeVisible();
    expect(screen.getByText(/Questão 1 de 2/)).toBeVisible();
    // The last button of the end card goes back to the last question.
    await user.click(screen.getByRole("button", { name: "Pular" }));
    await user.click(await screen.findByRole("button", { name: "Pular" }));
    await user.click(await screen.findByRole("button", { name: "Anterior" }));
    expect(await screen.findByText("Enunciado 2?")).toBeVisible();
  });

  it("does not offer skipped questions once everything was answered", async () => {
    open({ questions: [question(1)] });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await user.click(screen.getByRole("radio", { name: /^A/ }));
    await user.click(screen.getByRole("button", { name: "Responder" }));
    await user.click(await screen.findByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Você chegou ao fim da fila de questões.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Voltar às puladas" })).not.toBeInTheDocument();
  });

  it("moves with the arrow keys and counts a skipped question as unanswered", async () => {
    const { invoke } = open({ questions: [question(1), question(2)] });
    await screen.findByText("Enunciado 1?");
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(await screen.findByText("Enunciado 2?")).toBeVisible();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(await screen.findByText("Enunciado 1?")).toBeVisible();
    expect(answerCalls(invoke)).toHaveLength(0);
    await waitFor(() => expect(screen.getByText(/Questão 1 de 2/)).toBeVisible());
  });

  it("starts over when the redo option changes", async () => {
    const { invoke } = open({ questions: [question(1), question(2)] });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await user.click(screen.getByRole("button", { name: "Pular" }));
    await screen.findByText("Enunciado 2?");
    await user.click(screen.getByRole("checkbox", { name: "Refazer certas" }));
    expect(await screen.findByText("Enunciado 1?")).toBeVisible();
    expect(screen.getByText(/Questão 1 de 1/)).toBeVisible();
    expect(invoke).toHaveBeenCalledWith("practice:next", expect.objectContaining({ redo: true }));
  });
});
