/*
 * Filename: calibration.test.tsx
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
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

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route, ...initial });
  render(<App />);
  return fake;
}

const on = { feedback: "immediate" as const, confidence: true, interleave: false };

describe("confidence before answering (FR-16, FR-17, FR-18)", () => {
  it("does not ask when the option is off", async () => {
    open("/w/1/study/practice", { questions: [question(1)] });
    await screen.findByText("Enunciado 1?");
    expect(screen.queryByText("Quão seguro você está?")).not.toBeInTheDocument();
  });

  it("keeps Responder disabled until a level is chosen, then sends it", async () => {
    const { invoke } = open("/w/1/study/practice", {
      questions: [question(1)],
      practiceSettings: on,
    });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await user.click(screen.getByRole("radio", { name: /^A ·/ }));
    const answer = screen.getByRole("button", { name: "Responder" });
    expect(answer).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Acho que sei" }));
    expect(answer).toBeEnabled();
    await user.click(answer);
    expect(invoke).toHaveBeenCalledWith(
      "practice:answer",
      expect.objectContaining({ itemId: 1, answer: "A", confidence: 2 }),
    );
    expect(await screen.findByText("Confiança: Acho que sei")).toBeInTheDocument();
  });

  it("chooses the level with Alt+1 to Alt+3", async () => {
    open("/w/1/study/practice", { questions: [question(1)], practiceSettings: on });
    await screen.findByText("Enunciado 1?");
    fireEvent.keyDown(document, { code: "Digit3", altKey: true });
    expect(screen.getByRole("radio", { name: "Tenho certeza" })).toBeChecked();
  });

  it("points out a wrong answer given with certainty", async () => {
    open("/w/1/study/practice", { questions: [question(1)], practiceSettings: on });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await user.click(screen.getByRole("radio", { name: /^B ·/ }));
    await user.click(screen.getByRole("radio", { name: "Tenho certeza" }));
    await user.click(screen.getByRole("button", { name: "Responder" }));
    expect(await screen.findByText("Você tinha marcado “Tenho certeza”")).toBeInTheDocument();
  });
});

describe("calibration in Statistics (FR-19, FR-20)", () => {
  it("explains how to turn the question on when there is no data", async () => {
    open("/w/1/stats");
    const card = await screen.findByRole("region", { name: "Calibração" });
    expect(within(card).getByText(/Ligue “Perguntar a confiança/)).toBeInTheDocument();
  });

  it("shows confidence against accuracy, the overconfidence notice and the topics", async () => {
    open("/w/1/stats", {
      calibration: {
        hasData: true,
        levels: [
          { level: 1, answers: 4, correct: 1, rate: 0.25, flag: null },
          { level: 2, answers: 6, correct: 4, rate: 4 / 6, flag: null },
          { level: 3, answers: 5, correct: 3, rate: 0.6, flag: "overconfident" },
        ],
        topics: [{ topicId: 1, name: "Fotossíntese", confidentWrong: 2 }],
      },
    });
    const card = await screen.findByRole("region", { name: "Calibração" });
    const table = within(card).getByRole("table", { name: "Calibração" });
    expect(
      within(table).getByRole("row", { name: /Tenho certeza.*5.*60%.*excesso de confiança/ }),
    ).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Chute.*4.*25%/ })).toBeInTheDocument();
    expect(within(card).getByText("Fotossíntese: 2")).toBeInTheDocument();
  });
});
