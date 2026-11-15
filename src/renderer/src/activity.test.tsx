/*
 * Filename: activity.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeItem, FakeMaterial, FakeQuestion, FakeStudyCard } from "../test/fake-mind.js";
import { App } from "./App.js";
import { PING_INTERVAL_MS, TimeProvider, useActivity } from "./time.js";

function Probe({ itemId }: { itemId: number }) {
  useActivity("cards", { itemId });
  return null;
}

afterEach(() => vi.restoreAllMocks());

describe("useActivity (FR-3, FR-4)", () => {
  it("reports once on open, throttles interaction pings and reports a lost focus", () => {
    const { invoke } = installFakeMind({ workspaces: [] });
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const pings = (): unknown[][] =>
      invoke.mock.calls.filter(([channel]) => channel === "time:activity");
    render(
      <TimeProvider workspaceId={1}>
        <Probe itemId={3} />
      </TimeProvider>,
    );
    expect(pings()).toEqual([["time:activity", { workspaceId: 1, source: "cards", itemId: 3 }]]);
    fireEvent.keyDown(document, { key: "a" });
    fireEvent.pointerMove(document);
    expect(pings()).toHaveLength(1);
    now += PING_INTERVAL_MS + 1;
    fireEvent.keyDown(document, { key: "b" });
    expect(pings()).toHaveLength(2);
    fireEvent.blur(window);
    expect(invoke).toHaveBeenCalledWith("time:blur", { workspaceId: 1 });
  });

  it("reports again as soon as the context changes", () => {
    const { invoke } = installFakeMind({ workspaces: [] });
    const view = render(
      <TimeProvider workspaceId={1}>
        <Probe itemId={1} />
      </TimeProvider>,
    );
    view.rerender(
      <TimeProvider workspaceId={1}>
        <Probe itemId={2} />
      </TimeProvider>,
    );
    const items = invoke.mock.calls
      .filter(([channel]) => channel === "time:activity")
      .map(([, payload]) => (payload as { itemId: number }).itemId);
    expect(items).toEqual([1, 2]);
  });

  it("does nothing outside a workspace", () => {
    const { invoke } = installFakeMind({ workspaces: [] });
    render(<Probe itemId={1} />);
    expect(invoke).not.toHaveBeenCalled();
  });
});

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };
const pdf: FakeMaterial = {
  id: 4,
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

function activityCalls(invoke: { mock: { calls: unknown[][] } }): unknown[] {
  return invoke.mock.calls.filter(([channel]) => channel === "time:activity").map(([, p]) => p);
}

describe("study screens report activity (FR-3, US-2)", () => {
  it("reports cards activity with the shown card", async () => {
    const card: FakeStudyCard = {
      itemId: 9,
      subtype: "qa",
      topic: "Biologia",
      sourceTitle: "apostila",
      sourcePage: 4,
      isNew: true,
      front: [{ text: "Pergunta?", hit: false }],
      back: [{ text: "Resposta", hit: false }],
      previews: { "1": "1 min", "2": "6 min", "3": "10 min", "4": "3 d" },
    };
    const { invoke } = installFakeMind({
      workspaces: [ws],
      route: "/w/1/study",
      materials: [pdf],
      studyQueue: [card],
      summary: { materials: 1, cards: 1, questions: 0 },
    });
    render(<App />);
    await screen.findByText("Pergunta?");
    await waitFor(() =>
      expect(activityCalls(invoke)).toContainEqual({ workspaceId: 1, source: "cards", itemId: 9 }),
    );
  });

  it("reports practice activity with the shown question", async () => {
    const item: FakeItem = {
      id: 7,
      runId: 1,
      kind: "question",
      subtype: "multiple_choice",
      front: "Enunciado?",
      back: "Comentário",
      status: "approved",
      topic: "Biologia",
      sourceTitle: "apostila",
      sourcePage: 2,
      quote: "citação",
      chunkId: 1,
      edited: false,
      origin: "generated",
      createdAt: "x",
      approvedAt: "x",
      options: [{ key: "A", text: "Alternativa A", why: "Porque A" }],
      answer: "A",
    };
    const question: FakeQuestion = { item, attempts: 0, lastCorrect: null };
    const { invoke } = installFakeMind({
      workspaces: [ws],
      route: "/w/1/study/practice",
      materials: [pdf],
      questions: [question],
      summary: { materials: 1, cards: 0, questions: 1 },
    });
    render(<App />);
    await screen.findByText("Enunciado?");
    await waitFor(() =>
      expect(activityCalls(invoke)).toContainEqual({
        workspaceId: 1,
        source: "practice",
        itemId: 7,
      }),
    );
  });

  it("reports reading activity on the text preview of a material", async () => {
    const { invoke } = installFakeMind({
      workspaces: [ws],
      route: "/w/1/library/4",
      materials: [pdf],
      chunks: [{ id: 1, materialId: 4, ordinal: 0, page: 1, section: null, text: "Trecho um" }],
      summary: { materials: 1, cards: 0, questions: 0 },
    });
    render(<App />);
    await screen.findByText("Trecho um");
    await waitFor(() =>
      expect(activityCalls(invoke)).toContainEqual({
        workspaceId: 1,
        source: "reading",
        materialId: 4,
      }),
    );
  });
});
