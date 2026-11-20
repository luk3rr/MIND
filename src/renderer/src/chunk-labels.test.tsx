/*
 * Filename: chunk-labels.test.tsx
 * Created on: November 20, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeChunk, FakeMaterial, FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

const done: FakeMaterial["analysis"] = {
  state: "done",
  progress: null,
  errorCode: null,
  errorDetail: null,
  analyzedAt: "2026-11-20T10:00:00.000Z",
};

function material(overrides: Partial<FakeMaterial> = {}): FakeMaterial {
  return {
    id: 1,
    title: "Apostila",
    kind: "pdf",
    filename: "apostila.pdf",
    status: "indexed",
    pageCount: 10,
    charCount: 1000,
    ocrConfidence: null,
    jobId: 1,
    errorCode: null,
    errorDetail: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    sourceUrl: null,
    progress: null,
    chunkCount: 4,
    analysis: done,
    ...overrides,
  };
}

type Role = NonNullable<FakeChunk["role"]>;
/** Chunks of an analyzed material: [role, opens a unit]. */
function chunks(layout: [Role | null, boolean][]): FakeChunk[] {
  let unit = 0;
  return layout.map(([role, starts], i) => {
    if (i === 0 || starts || role === null) unit += 1;
    return {
      id: i + 1,
      materialId: 1,
      ordinal: i,
      page: i + 1,
      section: null,
      text: `Texto do trecho ${i + 1}`,
      role,
      startsUnit: i === 0 ? true : starts,
      unit,
    };
  });
}

const LAYOUT: [Role | null, boolean][] = [
  ["concept", true],
  ["example", false],
  ["motivating_text", true],
  ["exam_question", false],
];

function open(initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({
    workspaces: [ws],
    route: "/w/1/library/1",
    materials: [material()],
    chunks: chunks(LAYOUT),
    ...initial,
  });
  render(<App />);
  return fake;
}

const card = (n: number) =>
  screen.getByText(`Texto do trecho ${n}`).closest("article") as HTMLElement;

describe("the labels of the chunks in the preview (FR-8)", () => {
  it("shows the role and the unit of each chunk, with the start of each unit marked", async () => {
    open();
    await screen.findByText("Texto do trecho 1");
    expect(within(card(1)).getByLabelText("Papel do trecho 1")).toHaveValue("concept");
    expect(within(card(2)).getByLabelText("Papel do trecho 2")).toHaveValue("example");
    expect(within(card(3)).getByLabelText("Papel do trecho 3")).toHaveValue("motivating_text");
    expect(within(card(4)).getByLabelText("Papel do trecho 4")).toHaveValue("exam_question");
    expect(within(card(2)).getByText("Unidade 1")).toBeVisible();
    expect(within(card(4)).getByText("Unidade 2")).toBeVisible();
    // A heading opens each unit, before its first chunk.
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Unidade 1",
      "Unidade 2",
    ]);
    expect(within(card(1)).getByLabelText("Começa uma unidade 1")).toBeChecked();
    expect(within(card(2)).getByLabelText("Começa uma unidade 2")).not.toBeChecked();
    // The first chunk always opens a unit, so it cannot be changed.
    expect(within(card(1)).getByLabelText("Começa uma unidade 1")).toBeDisabled();
    expect(within(card(3)).getByLabelText("Começa uma unidade 3")).toBeEnabled();
    expect(screen.getByText(/guiam a geração/)).toBeVisible();
  });

  it("corrects the role of a chunk and sends only that", async () => {
    const fake = open();
    const user = userEvent.setup();
    await screen.findByText("Texto do trecho 3");
    await user.selectOptions(within(card(3)).getByLabelText("Papel do trecho 3"), "other");
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith("material:setChunkLabel", {
        workspaceId: 1,
        chunkId: 3,
        role: "other",
      }),
    );
    await waitFor(() =>
      expect(within(card(3)).getByLabelText("Papel do trecho 3")).toHaveValue("other"),
    );
  });

  it("numbers the units again when a chunk starts or stops one", async () => {
    const fake = open();
    const user = userEvent.setup();
    await screen.findByText("Texto do trecho 2");
    await user.click(within(card(2)).getByLabelText("Começa uma unidade 2"));
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith("material:setChunkLabel", {
        workspaceId: 1,
        chunkId: 2,
        startsUnit: true,
      }),
    );
    await waitFor(() => expect(within(card(2)).getByText("Unidade 2")).toBeVisible());
    expect(within(card(4)).getByText("Unidade 3")).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
    await user.click(within(card(3)).getByLabelText("Começa uma unidade 3"));
    await waitFor(() => expect(within(card(4)).getByText("Unidade 2")).toBeVisible());
    expect(within(card(3)).getByText("Unidade 2")).toBeVisible();
  });

  it("shows only the chunks with a role, without the unit headings, and says when there are none", async () => {
    open();
    const user = userEvent.setup();
    await screen.findByText("Texto do trecho 1");
    await user.selectOptions(screen.getByLabelText("Mostrar"), "exam_question");
    await waitFor(() => expect(screen.queryByText("Texto do trecho 1")).toBeNull());
    expect(screen.getByText("Texto do trecho 4")).toBeVisible();
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(screen.getByText("Trechos 1 a 1 de 1")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Mostrar"), "other");
    expect(await screen.findByText("Nenhum trecho com esse papel.")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Mostrar"), "");
    expect(await screen.findByText("Texto do trecho 1")).toBeVisible();
  });

  it("offers the chunks the analysis left without a role", async () => {
    open({
      chunks: chunks([
        ["concept", true],
        [null, true],
      ]),
    });
    const user = userEvent.setup();
    await screen.findByText("Texto do trecho 2");
    expect(within(card(2)).getByLabelText("Papel do trecho 2")).toHaveDisplayValue("Sem papel");
    await user.selectOptions(screen.getByLabelText("Mostrar"), "none");
    await waitFor(() => expect(screen.queryByText("Texto do trecho 1")).toBeNull());
    expect(screen.getByText("Texto do trecho 2")).toBeVisible();
  });

  it("says a material that was not analyzed has no roles, and offers no correction", async () => {
    open({
      materials: [material({ analysis: { ...done, state: "none", analyzedAt: null } })],
      chunks: chunks([["concept", true]]).map((c) => ({
        ...c,
        role: null,
        startsUnit: null,
        unit: null,
      })),
    });
    expect(await screen.findByText(/ainda não foi analisado/)).toBeVisible();
    expect(screen.queryByLabelText(/Papel do trecho/)).toBeNull();
    expect(screen.queryByLabelText("Mostrar")).toBeNull();
    expect(screen.getByText("Texto do trecho 1")).toBeVisible();
  });

  it("shows the reason when a correction cannot be saved", async () => {
    const fake = open();
    const user = userEvent.setup();
    await screen.findByText("Texto do trecho 3");
    // The chunk is gone behind the page's back, so the correction fails.
    fake.state.chunks = fake.state.chunks.filter((c) => c.id !== 3);
    await user.selectOptions(within(card(3)).getByLabelText("Papel do trecho 3"), "other");
    expect(await within(card(3)).findByRole("alert")).toHaveTextContent("Trecho não encontrado.");
  });
});
