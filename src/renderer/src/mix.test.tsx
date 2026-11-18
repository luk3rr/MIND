/*
 * Filename: mix.test.tsx
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fakeMixKey, installFakeMind } from "../test/fake-mind.js";
import type { FakeItem, FakeQuestion, FakeState, FakeStudyCard } from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

function card(id: number, topic: string): FakeStudyCard {
  return {
    itemId: id,
    subtype: "qa",
    topic,
    sourceTitle: "apostila",
    sourcePage: 4,
    isNew: true,
    front: [{ text: `Pergunta ${id} de ${topic}?`, hit: false }],
    back: [{ text: `Resposta ${id}`, hit: false }],
    previews: { "1": "1 min", "2": "6 min", "3": "10 min", "4": "3 d" },
  };
}

function question(id: number, topic: string): FakeQuestion {
  const item: FakeItem = {
    id,
    runId: 1,
    kind: "question",
    subtype: "multiple_choice",
    front: `Enunciado ${id} de ${topic}?`,
    back: "Comentário",
    status: "approved",
    topic,
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

const nextCalls = (invoke: { mock: { calls: unknown[][] } }, channel: string) =>
  invoke.mock.calls.filter(([name]) => name === channel).map(([, payload]) => payload);

describe("mixing the cards (FR-13, FR-14, FR-15)", () => {
  const cards = [card(1, "A"), card(2, "A"), card(3, "A"), card(4, "B")];

  it("starts off, and studies in blocks until the option is turned on", async () => {
    const { invoke } = open("/w/1/study", { studyQueue: cards });
    expect(await screen.findByText("Pergunta 1 de A?")).toBeInTheDocument();
    const box = screen.getByRole("checkbox", { name: /Misturar tópicos/ });
    expect(box).not.toBeChecked();
    expect(
      nextCalls(invoke, "study:next").every((payload) => !("mix" in (payload as object))),
    ).toBe(true);
  });

  it("alternates the topics and sends the key of the last card back", async () => {
    const { invoke } = open("/w/1/study", { studyQueue: cards });
    const user = userEvent.setup();
    await screen.findByText("Pergunta 1 de A?");
    await user.click(screen.getByRole("checkbox", { name: /Misturar tópicos/ }));
    await screen.findByText("Pergunta 1 de A?");
    await user.click(screen.getByRole("button", { name: /Mostrar resposta/ }));
    await user.click(screen.getByRole("button", { name: /3 · Bom/ }));
    expect(await screen.findByText("Pergunta 4 de B?")).toBeInTheDocument();
    const calls = nextCalls(invoke, "study:next") as {
      mix?: { by: string; afterKey: string | null };
    }[];
    expect(calls.at(-1)?.mix).toEqual({ by: "topic", afterKey: fakeMixKey("A") });
    expect(calls.some((payload) => payload.mix?.afterKey === null)).toBe(true);
  });

  it("offers to alternate by material", async () => {
    const { invoke } = open("/w/1/study", { studyQueue: cards });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: /Misturar tópicos/ }));
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Alternar por" }),
      "material",
    );
    await waitFor(() =>
      expect((nextCalls(invoke, "study:next") as { mix?: { by: string } }[]).at(-1)?.mix?.by).toBe(
        "material",
      ),
    );
  });

  it("starts from the default of the workspace", async () => {
    open("/w/1/study", {
      studyQueue: cards,
      practiceSettings: { feedback: "immediate", confidence: false, interleave: true },
    });
    const box = await screen.findByRole("checkbox", { name: /Misturar tópicos/ });
    await waitFor(() => expect(box).toBeChecked());
  });

  it("is disabled, and not sent, while a topic filter is active", async () => {
    const { invoke } = open("/w/1/study", {
      studyQueue: cards,
      practiceSettings: { feedback: "immediate", confidence: false, interleave: true },
      rememberedFilters: { "mind.filter.1.study-cards": "topic:1" },
    });
    const box = await screen.findByRole("checkbox", { name: /Misturar tópicos/ });
    expect(box).toBeDisabled();
    expect(screen.getByText(/Desabilitada com um filtro/)).toBeInTheDocument();
    expect(
      nextCalls(invoke, "study:next").every((payload) => !("mix" in (payload as object))),
    ).toBe(true);
  });
});

describe("mixing the questions (FR-13, FR-14, FR-15)", () => {
  const questions = [question(1, "A"), question(2, "A"), question(3, "B")];

  it("alternates the topics and asks for the next one after the key of the last", async () => {
    const { invoke } = open("/w/1/study/practice", { questions });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1 de A?");
    await user.click(screen.getByRole("checkbox", { name: /Misturar tópicos/ }));
    await screen.findByText("Enunciado 1 de A?");
    await user.click(screen.getByRole("button", { name: "Pular" }));
    expect(await screen.findByText("Enunciado 3 de B?")).toBeInTheDocument();
    const calls = nextCalls(invoke, "practice:next") as {
      mix?: { by: string; afterKey: string | null };
    }[];
    expect(calls.at(-1)?.mix).toEqual({ by: "topic", afterKey: fakeMixKey("A") });
  });

  it("leaves the order alone when the option is off", async () => {
    open("/w/1/study/practice", { questions });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1 de A?");
    await user.click(screen.getByRole("button", { name: "Pular" }));
    expect(await screen.findByText("Enunciado 2 de A?")).toBeInTheDocument();
  });
});
