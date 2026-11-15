/*
 * Filename: reader.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeMaterial, FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";

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

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route, materials: [pdf], ...initial });
  render(<App />);
  return fake;
}

const line = (text: string, y: number) => ({ text, x: 50, y, width: 200, height: 14 });

describe("Library action (FR-15)", () => {
  it("shows Ler only for indexed PDFs and opens the reader", async () => {
    const markdown: FakeMaterial = { ...pdf, id: 5, title: "notas", kind: "md", filename: "n.md" };
    const pending: FakeMaterial = {
      ...pdf,
      id: 6,
      title: "novo",
      status: "importing",
      progress: 0.5,
    };
    open("/w/1/library", { materials: [pdf, markdown, pending] });
    expect(await screen.findByRole("button", { name: "Ler apostila" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ler notas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ler novo" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Ler apostila" }));
    expect(await screen.findByRole("heading", { name: "apostila" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Página 1" })).toBeInTheDocument();
  });
});

describe("Reader page (FR-15, FR-16, FR-18, FR-24)", () => {
  it("opens on the requested page and shows the image and the page count", async () => {
    open("/w/1/library/4/read?page=2");
    expect(await screen.findByRole("img", { name: "Página 2" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ir para a página")).toHaveValue("2");
    expect(screen.getByText("de 3")).toBeInTheDocument();
  });

  it("turns pages with the buttons, the page box, the panel and the keyboard", async () => {
    open("/w/1/library/4/read");
    const user = userEvent.setup();
    await screen.findByRole("img", { name: "Página 1" });
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    await screen.findByRole("img", { name: "Página 2" });
    const box = screen.getByLabelText("Ir para a página");
    await user.clear(box);
    await user.type(box, "3{Enter}");
    await screen.findByRole("img", { name: "Página 3" });
    expect(screen.getByRole("button", { name: "Próxima página" })).toBeDisabled();
    await user.click(within(screen.getByRole("navigation", { name: "Páginas" })).getByText("1"));
    await screen.findByRole("img", { name: "Página 1" });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    await screen.findByRole("img", { name: "Página 2" });
    fireEvent.keyDown(document, { key: "PageUp" });
    await screen.findByRole("img", { name: "Página 1" });
    await user.clear(box);
    await user.type(box, "99{Enter}");
    await screen.findByRole("img", { name: "Página 3" });
  });

  it("zooms in, out and back to the width with the buttons and the keyboard", async () => {
    open("/w/1/library/4/read");
    const user = userEvent.setup();
    await screen.findByRole("img", { name: "Página 1" });
    await user.click(screen.getByRole("button", { name: "Aumentar zoom" }));
    expect(screen.getByText("150%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Diminuir zoom" }));
    await user.click(screen.getByRole("button", { name: "Diminuir zoom" }));
    expect(screen.getByText("100%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ajustar à largura" }));
    expect(screen.getByText("129%")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "-", ctrlKey: true });
    expect(await screen.findByText("100%")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "0", ctrlKey: true });
    expect(await screen.findByText("129%")).toBeInTheDocument();
  });

  it("puts the text of the page over the image so it can be selected and copied", async () => {
    open("/w/1/library/4/read", {
      reader: {
        info: {
          title: "apostila",
          pageCount: 3,
          pages: [
            { width: 595, height: 842 },
            { width: 595, height: 842 },
            { width: 595, height: 842 },
          ],
          lastPage: null,
        },
        lines: { 1: [line("Primeira linha do texto", 50), line("Segunda linha", 70)] },
        hits: [],
        cited: [],
        saved: [],
        failure: null,
      },
    });
    const layer = await screen.findByLabelText("Texto da página");
    await waitFor(() =>
      expect(within(layer).getByText("Primeira linha do texto")).toBeInTheDocument(),
    );
    expect(within(layer).getByText("Segunda linha")).toBeInTheDocument();
  });

  it("searches the PDF, jumps to the page of each occurrence and highlights it", async () => {
    const hit = (page: number, y: number) => ({
      page,
      rects: [{ x: 60, y, width: 40, height: 12 }],
    });
    const { invoke } = open("/w/1/library/4/read", {
      reader: {
        info: {
          title: "apostila",
          pageCount: 3,
          pages: [
            { width: 595, height: 842 },
            { width: 595, height: 842 },
            { width: 595, height: 842 },
          ],
          lastPage: null,
        },
        lines: {},
        hits: [hit(1, 50), hit(3, 90)],
        cited: [],
        saved: [],
        failure: null,
      },
    });
    const user = userEvent.setup();
    await screen.findByRole("img", { name: "Página 1" });
    await user.type(screen.getByRole("textbox", { name: "Buscar no PDF" }), "função{Enter}");
    expect(await screen.findByText(/1 de 2 ocorrências/)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("reader:search", {
      workspaceId: 1,
      materialId: 4,
      query: "função",
    });
    expect(document.querySelectorAll(".reader-hit.current")).toHaveLength(1);
    const status = screen.getByText(/1 de 2 ocorrências/).closest("span") as HTMLElement;
    await user.click(within(status).getByRole("button", { name: "Próxima página" }));
    await screen.findByRole("img", { name: "Página 3" });
    expect(screen.getByText(/2 de 2 ocorrências/)).toBeInTheDocument();
    await user.click(within(status).getByRole("button", { name: "Próxima página" }));
    await screen.findByRole("img", { name: "Página 1" });
    expect(screen.getByText(/1 de 2 ocorrências/)).toBeInTheDocument();
  });

  it("says when nothing was found", async () => {
    open("/w/1/library/4/read");
    const user = userEvent.setup();
    await screen.findByRole("img", { name: "Página 1" });
    await user.type(screen.getByRole("textbox", { name: "Buscar no PDF" }), "nada{Enter}");
    expect(await screen.findByText("Nenhuma ocorrência")).toBeInTheDocument();
  });

  it("shows a clear message and a way back when the file cannot be opened (FR-24)", async () => {
    open("/w/1/library/4/read", {
      reader: {
        info: { title: "", pageCount: 0, pages: [], lastPage: null },
        lines: {},
        hits: [],
        cited: [],
        saved: [],
        failure: { code: "FILE_MISSING", message: "O arquivo original não foi encontrado." },
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "O arquivo original não foi encontrado.",
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Voltar à Biblioteca" }));
    expect(await screen.findByRole("heading", { name: "Biblioteca" })).toBeInTheDocument();
  });

  it("counts the reading time of the material (FR-3)", async () => {
    const { invoke } = open("/w/1/library/4/read");
    await screen.findByRole("img", { name: "Página 1" });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("time:activity", {
        workspaceId: 1,
        source: "reading",
        materialId: 4,
      }),
    );
  });
});

describe("opening in a window and in the system (FR-19, FR-20, FR-21)", () => {
  it("offers the right actions per kind in the Library and reports failures", async () => {
    const docx: FakeMaterial = { ...pdf, id: 5, title: "resumo", kind: "docx", filename: "r.docx" };
    const { state } = open("/w/1/library", { materials: [pdf, docx] });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Nova janela apostila" }));
    await user.click(screen.getByRole("button", { name: "Abrir no sistema apostila" }));
    await user.click(screen.getByRole("button", { name: "Abrir original resumo" }));
    expect(state.opened).toEqual([
      { kind: "window", materialId: 4 },
      { kind: "system", materialId: 4 },
      { kind: "system", materialId: 5 },
    ]);
    expect(screen.queryByRole("button", { name: "Nova janela resumo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ler resumo" })).not.toBeInTheDocument();
    state.openFailure = "Não foi possível abrir o arquivo no aplicativo padrão do sistema.";
    await user.click(screen.getByRole("button", { name: "Abrir original resumo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("aplicativo padrão do sistema");
  });

  it("opens the current page in a new window or the file in the system from the reader", async () => {
    const { state } = open("/w/1/library/4/read?page=2");
    const user = userEvent.setup();
    await screen.findByRole("img", { name: "Página 2" });
    await user.click(screen.getByRole("button", { name: "Nova janela" }));
    await user.click(screen.getByRole("button", { name: "Abrir no sistema" }));
    expect(state.opened).toEqual([
      { kind: "window", materialId: 4, page: 2 },
      { kind: "system", materialId: 4 },
    ]);
    state.openFailure = "falhou";
    await user.click(screen.getByRole("button", { name: "Abrir no sistema" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("falhou");
  });

  it("offers the system viewer when the PDF cannot be opened", async () => {
    const { state } = open("/w/1/library/4/read", {
      reader: {
        info: { title: "", pageCount: 0, pages: [], lastPage: null },
        lines: {},
        hits: [],
        cited: [],
        saved: [],
        failure: { code: "PDF_PROTECTED", message: "O PDF está protegido por senha." },
      },
    });
    const user = userEvent.setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("protegido por senha");
    await user.click(screen.getByRole("button", { name: "Abrir no sistema" }));
    expect(state.opened).toEqual([{ kind: "system", materialId: 4 }]);
  });
});

describe("separate reader window (FR-19, FR-5)", () => {
  it("shows only the reader, keeps the saved route and does not pause the study session on close", async () => {
    const { invoke } = installFakeMind({ workspaces: [ws], route: "/w/1/study", materials: [pdf] });
    window.history.pushState({}, "", "/?route=%2Fw%2F1%2Flibrary%2F4%2Fread%3Fpage%3D3");
    const view = render(<App />);
    expect(await screen.findByRole("img", { name: "Página 3" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Principal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Voltar à Biblioteca" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nova janela" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir no sistema" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Página anterior" }));
    await screen.findByRole("img", { name: "Página 2" });
    expect(invoke).not.toHaveBeenCalledWith("window:setLastRoute", expect.anything());
    view.unmount();
    expect(invoke).not.toHaveBeenCalledWith("time:pause", expect.anything());
    window.history.pushState({}, "", "/");
  });
});
