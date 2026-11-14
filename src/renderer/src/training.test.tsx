/*
 * Filename: training.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyOverview, installFakeMind } from "../test/fake-mind.js";
import type { FakeMaterial, FakeOverview, FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";
import { parseRoute, trainPath } from "./router.js";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

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

const weak = {
  topicId: 2,
  name: "Genética",
  cardReviews: 5,
  cardPasses: 1,
  questionAttempts: 0,
  questionCorrect: 0,
  events: 5,
  accuracy: 0.2,
  cardAccuracy: 0.2,
  questionAccuracy: null,
  smallSample: false,
};

function withWeak(): FakeOverview {
  return { ...emptyOverview(), topics: [weak], weakest: [weak] };
}

const topics = [{ id: 2, name: "Genética", cards: 3, questions: 1 }];

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route, materials: [material], ...initial });
  render(<App />);
  return fake;
}

describe("training routes", () => {
  it("parses and builds the pre-filled generate path", () => {
    expect(trainPath(1, 2)).toBe("/w/1/generate?topic=2");
    expect(trainPath(1, 2, "cloze")).toBe("/w/1/generate?topic=2&subtype=cloze");
    expect(parseRoute("/w/1/generate?topic=2&subtype=cloze")).toEqual({
      name: "section",
      workspaceId: 1,
      section: "generate",
      topicId: 2,
      subtype: "cloze",
    });
    expect(parseRoute("/w/1/generate?topic=2")).toMatchObject({ topicId: 2 });
  });

  it("rejects malformed or misplaced queries", () => {
    for (const path of [
      "/w/1/generate?topic=x",
      "/w/1/generate?topic=2&topic=3",
      "/w/1/generate?subtype=qa",
      "/w/1/library?topic=2",
      "/w/1/generate?topic=2&other=1",
      "/w/1/generate?topic=2&subtype=../x",
      "/w/1/generate?",
    ]) {
      expect(parseRoute(path)).toEqual({ name: "unknown" });
    }
    expect(parseRoute("/w/1/library/3?chunk=4")).toMatchObject({ detailId: 3, chunkId: 4 });
  });
});

describe("Weak points (FR-17)", () => {
  it("lists the weakest topics on Today and opens Generate pre-filled", async () => {
    open("/w/1/today", {
      overview: withWeak(),
      topicList: topics,
      summary: { materials: 1, cards: 3, questions: 0 },
    });
    const user = userEvent.setup();
    expect(await screen.findByRole("heading", { name: "Pontos fracos" })).toBeVisible();
    expect(screen.getByText(/20% de acerto em 5 eventos/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Treinar Genética" }));
    expect(await screen.findByText("Treino do tópico")).toBeVisible();
  });

  it("shows the same list on Statistics", async () => {
    open("/w/1/stats", { overview: withWeak(), topicList: topics });
    expect(await screen.findByRole("heading", { name: "Pontos fracos" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Treinar Genética" })).toBeVisible();
  });

  it("hides the section when no topic is eligible", async () => {
    open("/w/1/today", { summary: { materials: 1, cards: 3, questions: 0 } });
    await screen.findByText(/Estudar agora/);
    expect(screen.queryByRole("heading", { name: "Pontos fracos" })).toBeNull();
  });
});

describe("Generate page in training mode", () => {
  it("shows the topic banner without a material and starts a training run only on click", async () => {
    const fake = open("/w/1/generate?topic=2", { topicList: topics });
    const user = userEvent.setup();
    const banner = await screen.findByRole("note");
    expect(within(banner).getByText("Genética")).toBeVisible();
    expect(screen.queryByLabelText("Material")).toBeNull();
    expect(screen.queryByLabelText("Página inicial")).toBeNull();
    expect(fake.state.runs).toHaveLength(0);
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith(
        "generation:estimate",
        expect.objectContaining({ topicId: 2 }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Gerar cards" }));
    expect(await screen.findByText(/Treino: Genética/)).toBeVisible();
    expect(fake.invoke).toHaveBeenCalledWith(
      "generation:start",
      expect.not.objectContaining({ materialId: expect.anything() }),
    );
    expect(fake.state.runs[0]).toMatchObject({ topicId: 2, materialId: null });
  });

  it("uses the subtype of the link and goes back to the material form", async () => {
    open("/w/1/generate?topic=2&subtype=cloze", { topicList: topics });
    const user = userEvent.setup();
    await screen.findByRole("note");
    expect(screen.getByLabelText("Tipo de card")).toHaveValue("cloze");
    await user.click(screen.getByRole("button", { name: "Gerar a partir de um material" }));
    expect(await screen.findByLabelText("Material")).toBeVisible();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("falls back to the material form for an unknown topic", async () => {
    open("/w/1/generate?topic=99", { topicList: topics });
    expect(await screen.findByLabelText("Material")).toBeVisible();
    expect(screen.queryByRole("note")).toBeNull();
  });
});
