/*
 * Filename: feedback-pending.test.tsx
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeFeedback, FakeItem, FakeQuestion, FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";
import { parseRoute } from "./router.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

function pending(id: number, correct: boolean): FakeFeedback {
  return {
    attemptId: id,
    itemId: id,
    statement: `Enunciado ${id}?`,
    correct,
    answer: correct ? "A" : "B",
    correctKey: "A",
    explanation: `Comentário ${id}.`,
    options: [
      { key: "A", text: "Alternativa A", why: "Porque A" },
      { key: "B", text: "Alternativa B", why: "Porque B" },
    ],
    confidence: null,
    answeredAt: "2026-03-10T22:00:00.000Z",
    sourceTitle: "apostila",
    sourcePage: 2,
    quote: `citação ${id}`,
    pdfSource: null,
  };
}

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

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({
    workspaces: [ws],
    route,
    summary: { materials: 1, cards: 0, questions: 2 },
    ...initial,
  });
  render(<App />);
  return fake;
}

describe("pending feedback on Today (FR-10)", () => {
  it("tells how many answers wait for feedback and opens the screen", async () => {
    open("/w/1/today", { pendingFeedback: [pending(1, false), pending(2, true)] });
    const user = userEvent.setup();
    expect(await screen.findByText("2 respostas aguardam feedback.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver feedback" }));
    const list = await screen.findByRole("region", { name: "Respostas liberadas" });
    expect(within(list).getByText("1 de 2 certas")).toBeInTheDocument();
    expect(within(list).getByText("Comentário 1.")).toBeInTheDocument();
    expect(within(list).getByText("Comentário 2.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Feedback pendente" })).toBeInTheDocument();
  });

  it("says one answer in the singular", async () => {
    open("/w/1/today", { pendingFeedback: [pending(1, true)] });
    expect(await screen.findByText("1 resposta aguarda feedback.")).toBeInTheDocument();
  });

  it("shows no notice when nothing waits", async () => {
    open("/w/1/today");
    await screen.findByRole("heading", { name: "Hoje" });
    await waitFor(() => expect(screen.queryByText(/aguarda/)).not.toBeInTheDocument());
  });

  it("marks the answers as seen by opening the screen, and the notice is gone back on Today", async () => {
    const { state } = open("/w/1/study/feedback", { pendingFeedback: [pending(1, true)] });
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Respostas liberadas" });
    expect(state.pendingFeedback).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Voltar a Hoje" }));
    await screen.findByRole("heading", { name: "Hoje" });
    expect(screen.queryByText(/aguarda/)).not.toBeInTheDocument();
  });

  it("explains when there is nothing to see", async () => {
    open("/w/1/study/feedback");
    expect(
      await screen.findByText("Você não tem respostas aguardando feedback."),
    ).toBeInTheDocument();
  });

  it("says how many more are ready when they do not all fit", async () => {
    const many = Array.from({ length: 201 }, (_, index) => pending(index + 1, true));
    open("/w/1/study/feedback", { pendingFeedback: many });
    expect(await screen.findByText(/Ainda há 1 resposta com feedback pronto/)).toBeInTheDocument();
  });
});

describe("the next-day mode in practice (FR-9)", () => {
  it("registers the answer and says when the key comes, without a way to see it now", async () => {
    open("/w/1/study/practice", {
      questions: [question(1)],
      practiceSettings: { feedback: "next_day", confidence: false, interleave: false },
    });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await user.click(screen.getByRole("radio", { name: /^B ·/ }));
    await user.click(screen.getByRole("button", { name: "Responder" }));
    expect(
      await screen.findByText(
        "Resposta registrada. O gabarito fica disponível amanhã, a partir das 4h.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver o feedback agora" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Comentário da questão/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(screen.queryByRole("region", { name: "Feedback do bloco" })).not.toBeInTheDocument();
  });

  it("releases the feedback of an abandoned block when practice opens", async () => {
    const { invoke } = open("/w/1/study/practice", { questions: [question(1)] });
    await screen.findByText("Enunciado 1?");
    expect(invoke).toHaveBeenCalledWith("practice:releaseAbandoned", { workspaceId: 1 });
  });
});

describe("the route of the pending feedback", () => {
  it("is a screen of Study", () => {
    expect(parseRoute("/w/1/study/feedback")).toEqual({
      name: "section",
      workspaceId: 1,
      section: "study",
      pendingFeedback: true,
    });
  });

  it("is not a detail of another section", () => {
    expect(parseRoute("/w/1/library/feedback")).toEqual({ name: "unknown" });
    expect(parseRoute("/w/1/study/feedback/extra")).toEqual({ name: "unknown" });
  });
});
