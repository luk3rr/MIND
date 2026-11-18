/*
 * Filename: pretest.test.tsx
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeItem, FakeMaterial, FakeQuestion, FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";
import { forgetPretests } from "./pages/PretestPage.js";
import { parseRoute } from "./router.js";

afterEach(forgetPretests);

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };
const material = (eligible: number): FakeMaterial => ({
  id: 1,
  title: "apostila",
  kind: "md",
  filename: "a.md",
  status: "indexed",
  pageCount: null,
  charCount: 10,
  ocrConfidence: null,
  jobId: 1,
  errorCode: null,
  errorDetail: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  sourceUrl: null,
  progress: null,
  chunkCount: 3,
  pretestEligible: eligible,
});

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

describe("the pre-test button of the Library (FR-1)", () => {
  it("explains that questions must be generated, and offers to go to Generate", async () => {
    open("/w/1/library", { materials: [material(0)] });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Pré-teste/ }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/ainda não tem questões para um pré-teste/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Gere questões dele em Gerar/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Ir para Gerar" }));
    expect(await screen.findByRole("heading", { name: "Gerar" })).toBeInTheDocument();
  });

  it("opens a dialog with the number of questions, and refuses 0 and 21", async () => {
    open("/w/1/library", { materials: [material(12)], questions: [question(1)] });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Pré-teste/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Quantas questões? (1 a 20)")).toHaveValue("10");
    expect(within(dialog).getByText(/12 questões elegíveis/)).toBeInTheDocument();
    for (const value of ["0", "21", "abc"]) {
      const field = within(dialog).getByLabelText("Quantas questões? (1 a 20)");
      await user.clear(field);
      await user.type(field, value);
      await user.click(within(dialog).getByRole("button", { name: "Começar" }));
      expect(within(dialog).getByRole("alert")).toHaveTextContent("Use um número de 1 a 20.");
    }
  });
});

describe("a pre-test round (FR-3, FR-5, FR-6)", () => {
  const route = "/w/1/library/1/pretest?count=2";

  it("shows the notice, no key after an answer, and a summary at the end", async () => {
    const { state } = open(route, {
      materials: [material(2)],
      questions: [question(1), question(2)],
    });
    const user = userEvent.setup();
    expect(await screen.findByRole("note")).toHaveTextContent("errar aqui é esperado");
    await screen.findByText("Enunciado 1?");
    await user.click(screen.getByRole("radio", { name: /^B ·/ }));
    await user.click(screen.getByRole("button", { name: "Responder" }));
    await screen.findByText("Enunciado 2?");
    expect(screen.queryByText(/Gabarito/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /^A ·/ }));
    await user.click(screen.getByRole("button", { name: "Responder" }));
    const list = await screen.findByRole("region", { name: "Resumo do pré-teste" });
    expect(within(list).getByText("1 de 2 certas")).toBeInTheDocument();
    expect(within(list).getAllByText("Comentário da questão.")).toHaveLength(2);
    expect(state.pretestGiven).toHaveLength(2);
  });

  it("ends the round early with the answers so far", async () => {
    open(route, { materials: [material(2)], questions: [question(1), question(2)] });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await user.click(screen.getByRole("radio", { name: /^A ·/ }));
    await user.click(screen.getByRole("button", { name: "Responder" }));
    await screen.findByText("Enunciado 2?");
    await user.click(screen.getByRole("button", { name: "Encerrar" }));
    const list = await screen.findByRole("region", { name: "Resumo do pré-teste" });
    expect(within(list).getByText("1 de 1 certa")).toBeInTheDocument();
  });

  it("asks for the confidence when it is turned on", async () => {
    open(route, {
      materials: [material(1)],
      questions: [question(1)],
      practiceSettings: { feedback: "immediate", confidence: true, interleave: false },
    });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await user.click(screen.getByRole("radio", { name: /^A ·/ }));
    expect(screen.getByRole("button", { name: "Responder" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Chute" }));
    expect(screen.getByRole("button", { name: "Responder" })).toBeEnabled();
  });

  it("says when fewer questions than asked are available", async () => {
    open(route, { materials: [material(1)], questions: [question(1)] });
    expect(await screen.findByText(/Só há 1 questão elegível/)).toBeInTheDocument();
  });
});

describe("leaving a round in progress", () => {
  it("keeps the round and continues it from the Library", async () => {
    const { invoke } = open("/w/1/library/1/pretest?count=2", {
      materials: [material(2)],
      questions: [question(1), question(2)],
    });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await user.click(screen.getByRole("radio", { name: /^A ·/ }));
    await user.click(screen.getByRole("button", { name: "Responder" }));
    await screen.findByText("Enunciado 2?");
    await user.click(screen.getByRole("button", { name: "Biblioteca" }));
    await user.click(await screen.findByRole("button", { name: /Continuar pré-teste/ }));
    expect(await screen.findByText("Enunciado 2?")).toBeInTheDocument();
    expect(screen.queryByText("Enunciado 1?")).not.toBeInTheDocument();
    expect(invoke.mock.calls.filter(([name]) => name === "pretest:start")).toHaveLength(1);
    await user.click(screen.getByRole("radio", { name: /^A ·/ }));
    await user.click(screen.getByRole("button", { name: "Responder" }));
    const list = await screen.findByRole("region", { name: "Resumo do pré-teste" });
    expect(within(list).getByText("2 de 2 certas")).toBeInTheDocument();
  });

  it("offers a new round again once the summary was seen", async () => {
    open("/w/1/library/1/pretest?count=1", {
      materials: [material(1)],
      questions: [question(1)],
    });
    const user = userEvent.setup();
    await screen.findByText("Enunciado 1?");
    await user.click(screen.getByRole("radio", { name: /^A ·/ }));
    await user.click(screen.getByRole("button", { name: "Responder" }));
    await screen.findByRole("region", { name: "Resumo do pré-teste" });
    await user.click(screen.getByRole("button", { name: "Voltar à Biblioteca" }));
    expect(await screen.findByRole("button", { name: /^Pré-teste/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continuar pré-teste/ })).not.toBeInTheDocument();
  });
});

describe("the pre-test route", () => {
  it("belongs to a material of the Library and carries the count", () => {
    expect(parseRoute("/w/1/library/3/pretest?count=10")).toEqual({
      name: "section",
      workspaceId: 1,
      section: "library",
      detailId: 3,
      pretest: true,
      count: 10,
    });
  });

  it("refuses a missing, zero or large count and other sections", () => {
    for (const path of [
      "/w/1/library/3/pretest",
      "/w/1/library/3/pretest?count=0",
      "/w/1/library/3/pretest?count=21",
      "/w/1/items/3/pretest?count=5",
      "/w/1/library/pretest?count=5",
    ]) {
      expect(parseRoute(path)).toEqual({ name: "unknown" });
    }
  });
});
