/*
 * Filename: study-tabs.test.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeItem, FakeQuestion, FakeState, FakeStudyCard } from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route, ...initial });
  render(<App />);
  return fake;
}

const card = (id: number): FakeStudyCard => ({
  itemId: id,
  subtype: "qa",
  topic: "Biologia",
  sourceTitle: "apostila",
  sourcePage: 4,
  isNew: true,
  front: [{ text: `Pergunta ${id}?`, hit: false }],
  back: [{ text: `Resposta ${id}`, hit: false }],
  previews: { "1": "1 min", "2": "6 min", "3": "10 min", "4": "3 d" },
});

const question = (id: number): FakeQuestion => {
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
    quote: "citação",
    chunkId: id,
    edited: false,
    origin: "generated",
    createdAt: "x",
    approvedAt: "x",
    options: [{ key: "A", text: "Alternativa A", why: "Porque A" }],
    answer: "A",
  };
  return { item, attempts: 0, lastCorrect: null };
};

describe("Study tabs: cards or questions", () => {
  it("says on both screens what is being done, with the count of each", async () => {
    open("/w/1/study", {
      studyQueue: [card(1), card(2)],
      questions: [question(7), question(8), question(9)],
    });
    const tablist = await screen.findByRole("tablist", { name: "Modo de estudo" });
    const cards = within(tablist).getByRole("tab", { name: /Cards/ });
    const questions = within(tablist).getByRole("tab", { name: /Questões/ });
    expect(cards).toHaveAttribute("aria-selected", "true");
    expect(questions).toHaveAttribute("aria-selected", "false");
    await waitFor(() => expect(cards).toHaveTextContent("Cards2"));
    expect(questions).toHaveTextContent("Questões3");
    expect(screen.getByText(/Revisão espaçada/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Revisão de cards" })).toBeVisible();

    await userEvent.setup().click(questions);
    expect(await screen.findByRole("heading", { name: "Praticar questões" })).toBeVisible();
    const tabs = await screen.findByRole("tablist", { name: "Modo de estudo" });
    expect(within(tabs).getByRole("tab", { name: /Questões/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(tabs).getByRole("tab", { name: /Cards/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByText(/Resolva questões/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Estudar" })).toBeVisible();
  });

  it("switches back and forth without piling up the history, and the arrows move between tabs", async () => {
    open("/w/1/today", { studyQueue: [card(1)], questions: [question(7)] });
    const user = userEvent.setup();
    const nav = await screen.findByRole("navigation", { name: "Principal" });
    await user.click(within(nav).getByRole("button", { name: "Estudar" }));
    const cards = await screen.findByRole("tab", { name: /Cards/ });
    await user.click(screen.getByRole("tab", { name: /Questões/ }));
    await screen.findByRole("heading", { name: "Praticar questões" });
    fireEvent.keyDown(screen.getByRole("tab", { name: /Questões/ }), { key: "ArrowLeft" });
    await screen.findByRole("heading", { name: "Revisão de cards" });
    expect(cards).toBeDefined();
    // One step back from the study screens leads to Today, not to the other tab.
    fireEvent.keyDown(document, { key: "ArrowLeft", altKey: true });
    expect(await screen.findByRole("heading", { name: "Hoje" })).toBeVisible();
  });
});
