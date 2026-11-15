/*
 * Filename: navigation.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeMaterial, FakeState, FakeStudyCard } from "../test/fake-mind.js";
import { App } from "./App.js";
import { backLabel } from "./components/BackLink.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };
const other = { id: 2, name: "Outro", createdAt: "2026-01-01T00:00:00.000Z" };
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

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws, other], route, materials: [pdf], ...initial });
  render(<App />);
  return fake;
}

const card: FakeStudyCard = {
  itemId: 9,
  subtype: "qa",
  topic: "Biologia",
  sourceTitle: "apostila",
  sourcePage: 2,
  pdfSource: { materialId: 4, page: 2, quote: "A fotossíntese converte luz" },
  isNew: true,
  front: [{ text: "Pergunta?", hit: false }],
  back: [{ text: "Resposta", hit: false }],
  previews: { "1": "1 min", "2": "6 min", "3": "10 min", "4": "3 d" },
};

describe("backLabel", () => {
  it("names the screen the link goes back to", () => {
    expect(backLabel("/w/1/library")).toBe("Voltar à Biblioteca");
    expect(backLabel("/w/1/library/4/read?page=2")).toBe("Voltar ao leitor");
    expect(backLabel("/w/1/library/4")).toBe("Voltar à prévia do material");
    expect(backLabel("/w/1/study")).toBe("Voltar a Estudar");
    expect(backLabel("/w/1/study/practice")).toBe("Voltar à Prática");
    expect(backLabel("/w/1/chat")).toBe("Voltar ao Chat");
    expect(backLabel("/w/1/today")).toBe("Voltar a Hoje");
    expect(backLabel("/w/1/stats")).toBe("Voltar às Estatísticas");
    expect(backLabel("/w/1/errors")).toBe("Voltar aos Erros");
    expect(backLabel("/w/1/settings")).toBe("Voltar às Configurações");
    expect(backLabel("/w/1/generate")).toBe("Voltar a Gerar");
    expect(backLabel("/welcome")).toBeNull();
  });
});

describe("going back to where the person came from", () => {
  it("returns to the card that opened the PDF, not to the library", async () => {
    open("/w/1/study", { studyQueue: [card], summary: { materials: 1, cards: 1, questions: 0 } });
    const user = userEvent.setup();
    await screen.findByText("Pergunta?");
    await user.click(screen.getByRole("button", { name: /Mostrar resposta|Revelar|Mostrar/ }));
    await user.click(await screen.findByRole("button", { name: "Ver no PDF, pág. 2" }));
    await screen.findByRole("img", { name: "Página 2" });
    await user.click(screen.getByRole("button", { name: "Voltar a Estudar" }));
    expect(await screen.findByText("Pergunta?")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Biblioteca" })).not.toBeInTheDocument();
  });

  it("returns to the library when the PDF was opened from it, and to the chat from a citation", async () => {
    open("/w/1/library");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Ler apostila" }));
    await screen.findByRole("img", { name: "Página 1" });
    await user.click(screen.getByRole("button", { name: "Voltar à Biblioteca" }));
    expect(await screen.findByRole("heading", { name: "Biblioteca" })).toBeInTheDocument();
  });

  it("walks back through several screens and with Alt + Left", async () => {
    open("/w/1/today");
    const user = userEvent.setup();
    const nav = await screen.findByRole("navigation", { name: "Principal" });
    await user.click(within(nav).getByRole("button", { name: "Biblioteca" }));
    await user.click(await screen.findByRole("button", { name: "Ler apostila" }));
    await screen.findByRole("img", { name: "Página 1" });
    fireEvent.keyDown(document, { key: "ArrowLeft", altKey: true });
    expect(await screen.findByRole("heading", { name: "Biblioteca" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowLeft", altKey: true });
    expect(await screen.findByRole("heading", { name: "Hoje" })).toBeInTheDocument();
    // Nothing is left to go back to: the shortcut does nothing.
    fireEvent.keyDown(document, { key: "ArrowLeft", altKey: true });
    expect(screen.getByRole("heading", { name: "Hoje" })).toBeInTheDocument();
  });

  it("falls back to the library when the reader was restored with no history", async () => {
    open("/w/1/library/4/read");
    const user = userEvent.setup();
    await screen.findByRole("img", { name: "Página 1" });
    await user.click(screen.getByRole("button", { name: "Voltar à Biblioteca" }));
    expect(await screen.findByRole("heading", { name: "Biblioteca" })).toBeInTheDocument();
  });

  it("starts a new history when the workspace changes", async () => {
    open("/w/1/library");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Ler apostila" }));
    await screen.findByRole("img", { name: "Página 1" });
    await user.click(screen.getByRole("button", { name: /Estudos/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Outro" }));
    await screen.findByRole("heading", { name: "Hoje" });
    fireEvent.keyDown(document, { key: "ArrowLeft", altKey: true });
    expect(screen.getByRole("heading", { name: "Hoje" })).toBeInTheDocument();
  });
});

describe("leaving a workspace (start screen)", () => {
  it("goes to the start screen to pick another workspace, and pauses the study timer", async () => {
    const { invoke } = open("/w/1/today");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Workspace: Estudos/ }));
    await user.click(screen.getByRole("menuitem", { name: "Sair do workspace" }));
    expect(await screen.findByRole("heading", { name: "Escolha um workspace" })).toBeVisible();
    expect(invoke).toHaveBeenCalledWith("time:pause", { workspaceId: 1 });
    const list = screen.getByRole("list", { name: "Workspace" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Estudos", "Outro"]);
    await user.click(within(list).getByRole("button", { name: "Abrir Outro" }));
    expect(await screen.findByRole("heading", { name: "Hoje" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Workspace: Outro/ })).toBeVisible();
  });

  it("offers to create a workspace from the start screen", async () => {
    open("/w/1/today", { nextId: 3 });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Workspace: Estudos/ }));
    await user.click(screen.getByRole("menuitem", { name: "Sair do workspace" }));
    await user.click(await screen.findByRole("button", { name: "Novo workspace" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nome do workspace"), "Terceiro");
    await user.click(within(dialog).getByRole("button", { name: "Criar" }));
    expect(await screen.findByRole("heading", { name: "Hoje" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Workspace: Terceiro/ })).toBeVisible();
  });
});
