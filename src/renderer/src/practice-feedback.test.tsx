/*
 * Filename: practice-feedback.test.tsx
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeItem, FakeQuestion, FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

function question(id: number): FakeQuestion {
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
    options: [
      { key: "A", text: "Alternativa A", why: "Porque A" },
      { key: "B", text: "Alternativa B", why: "Porque B" },
    ],
    answer: "A",
  };
  return { item, attempts: 0, lastCorrect: null };
}

function open(initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({
    workspaces: [ws],
    route: "/w/1/study/practice",
    practiceSettings: { feedback: "block", confidence: false, interleave: false },
    ...initial,
  });
  render(<App />);
  return fake;
}

async function answer(user: ReturnType<typeof userEvent.setup>, key: string): Promise<void> {
  await user.click(await screen.findByRole("radio", { name: key === "A" ? /^A ·/ : /^B ·/ }));
  await user.click(screen.getByRole("button", { name: "Responder" }));
}

describe("feedback at the end of the block (FR-7, FR-8, FR-11)", () => {
  it("registers the answer without showing the key or the comment", async () => {
    open({ questions: [question(1), question(2)] });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await answer(user, "B");
    expect(await screen.findByText(/Resposta registrada/)).toBeInTheDocument();
    expect(screen.queryByText(/Gabarito/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Comentário da questão/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Porque A/)).not.toBeInTheDocument();
    for (const option of screen.getAllByRole("radio")) expect(option).toBeDisabled();
    expect(screen.getByRole("radio", { name: /^B ·/ })).toBeChecked();
  });

  it("gives the feedback of the answers so far with “Ver o feedback agora”", async () => {
    const { invoke } = open({ questions: [question(1), question(2)] });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await answer(user, "B");
    await user.click(await screen.findByRole("button", { name: "Próxima" }));
    await screen.findByText("Enunciado 2?");
    await answer(user, "A");
    await user.click(await screen.findByRole("button", { name: "Ver o feedback agora" }));
    const block = await screen.findByRole("region", { name: "Feedback do bloco" });
    expect(within(block).getByText("1 de 2 certas")).toBeInTheDocument();
    expect(within(block).getAllByText("Comentário da questão.")).toHaveLength(2);
    expect(within(block).getByText("Errada")).toBeInTheDocument();
    expect(within(block).getByText("Certa")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("practice:releaseBlock", {
      workspaceId: 1,
      attemptIds: [1, 2],
    });
  });

  it("releases the block by itself at the end of the queue", async () => {
    open({ questions: [question(1)] });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await answer(user, "A");
    await user.click(await screen.findByRole("button", { name: "Próxima" }));
    const block = await screen.findByRole("region", { name: "Feedback do bloco" });
    expect(within(block).getByText("1 de 1 certa")).toBeInTheDocument();
  });

  it("turns a wrong answer of the block into a card", async () => {
    const { invoke } = open({ questions: [question(1)] });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await answer(user, "B");
    await user.click(await screen.findByRole("button", { name: "Ver o feedback agora" }));
    const block = await screen.findByRole("region", { name: "Feedback do bloco" });
    await user.click(within(block).getByRole("button", { name: "Virar card" }));
    expect(invoke).toHaveBeenCalledWith("errors:makeCard", { workspaceId: 1, questionId: 1 });
  });

  it("goes back to the question, which now shows its feedback", async () => {
    open({ questions: [question(1)] });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await answer(user, "A");
    await user.click(await screen.findByRole("button", { name: "Ver o feedback agora" }));
    await user.click(await screen.findByRole("button", { name: "Voltar às questões" }));
    expect(screen.queryByRole("region", { name: "Feedback do bloco" })).not.toBeInTheDocument();
    expect(screen.getByText("Comentário da questão.")).toBeInTheDocument();
    expect(screen.queryByText(/Resposta registrada/)).not.toBeInTheDocument();
  });

  it("starts a new block from the feedback", async () => {
    const { invoke } = open({ questions: [question(1)] });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await answer(user, "A");
    await user.click(await screen.findByRole("button", { name: "Ver o feedback agora" }));
    const before = invoke.mock.calls.filter(([name]) => name === "practice:next").length;
    await user.click(await screen.findByRole("button", { name: "Começar novo bloco" }));
    expect(await screen.findByText("Enunciado 1?")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Feedback do bloco" })).not.toBeInTheDocument();
    const after = invoke.mock.calls.filter(([name]) => name === "practice:next").length;
    expect(after).toBeGreaterThan(before);
  });

  it("keeps the immediate mode as it was", async () => {
    open({
      questions: [question(1)],
      practiceSettings: { feedback: "immediate", confidence: false, interleave: false },
    });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await answer(user, "B");
    expect(await screen.findByText(/Resposta errada/)).toBeInTheDocument();
    expect(screen.getByText("Comentário da questão.")).toBeInTheDocument();
    expect(screen.queryByText(/Resposta registrada/)).not.toBeInTheDocument();
  });
});
