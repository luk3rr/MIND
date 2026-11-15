/*
 * Filename: errors-actions.test.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeErrorEntry, FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

const entry: FakeErrorEntry = {
  itemId: 3,
  front: "Qual é o PNB?",
  topic: "Macroeconomia",
  sourceTitle: "apostila",
  sourcePage: 71,
  fromQuestion: true,
  failures: 0,
  lastErrorAt: "2026-01-02T00:00:00.000Z",
};

function open(initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route: "/w/1/errors", ...initial });
  render(<App />);
  return fake;
}

describe("Errors notebook actions", () => {
  it("offers to redo the wrong questions and to study the notebook cards", async () => {
    open({ errorEntries: [entry], practiceRetry: 2 });
    const user = userEvent.setup();
    expect(
      await screen.findByText(/As questões que você errou voltam na aba Questões/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Refazer questões que errei (2)" }));
    expect(await screen.findByRole("heading", { name: "Praticar questões" })).toBeVisible();
    expect(screen.getByRole("tab", { name: /Questões/ })).toHaveAttribute("aria-selected", "true");
  });

  it("goes to the card review from the notebook", async () => {
    open({ errorEntries: [entry], practiceRetry: 0 });
    const user = userEvent.setup();
    const redo = await screen.findByRole("button", { name: "Refazer questões que errei (0)" });
    expect(redo).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Estudar os cards do caderno" }));
    expect(await screen.findByRole("heading", { name: "Revisão de cards" })).toBeVisible();
  });

  it("has nothing to study when the notebook is empty", async () => {
    open({ errorEntries: [] });
    expect(
      await screen.findByRole("button", { name: "Estudar os cards do caderno" }),
    ).toBeDisabled();
  });

  it("shows no retry button when the notebook loads fine", async () => {
    const { invoke } = open({ errorEntries: [entry] });
    await screen.findByText("Qual é o PNB?");
    expect(invoke).toHaveBeenCalledWith("errors:list", { workspaceId: 1 });
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).not.toBeInTheDocument();
  });
});
