/*
 * Filename: reader.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeMaterial, FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";

beforeEach(() => window.localStorage.clear());

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
    const menu = async (title: string, item: string): Promise<void> => {
      await user.click(await screen.findByRole("button", { name: `Mais ações ${title}` }));
      await user.click(screen.getByRole("menuitem", { name: item }));
    };
    await user.click(await screen.findByRole("button", { name: "Ler em nova janela apostila" }));
    await menu("apostila", "Abrir no sistema");
    await menu("resumo", "Abrir original");
    expect(state.opened).toEqual([
      { kind: "window", materialId: 4 },
      { kind: "system", materialId: 4 },
      { kind: "system", materialId: 5 },
    ]);
    expect(
      screen.queryByRole("button", { name: "Ler em nova janela resumo" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ler resumo" })).not.toBeInTheDocument();
    state.openFailure = "Não foi possível abrir o arquivo no aplicativo padrão do sistema.";
    await menu("resumo", "Abrir original");
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

describe("zoom with Ctrl + wheel", () => {
  it("zooms in and out only when Ctrl is held", async () => {
    open("/w/1/library/4/read");
    await screen.findByRole("img", { name: "Página 1" });
    const viewport = document.querySelector(".reader-viewport") as HTMLElement;
    expect(screen.getByText("129%")).toBeInTheDocument();
    fireEvent.wheel(viewport, { deltaY: -100 });
    expect(screen.getByText("129%")).toBeInTheDocument();
    fireEvent.wheel(viewport, { deltaY: -100, ctrlKey: true });
    await waitFor(() => expect(screen.getByText("160%")).toBeInTheDocument());
    fireEvent.wheel(viewport, { deltaY: 300, ctrlKey: true });
    await waitFor(() => expect(screen.getByText("90%")).toBeInTheDocument());
    fireEvent.wheel(viewport, { deltaY: 5000, ctrlKey: true });
    await waitFor(() => expect(screen.getByText("50%")).toBeInTheDocument());
  });
});

describe("continuous scroll mode", () => {
  const modeButton = () => screen.getByRole("button", { name: "Rolagem contínua" });

  it("starts page by page and switches to scrolling, remembering the choice", async () => {
    open("/w/1/library/4/read");
    await screen.findByRole("img", { name: "Página 1" });
    expect(modeButton()).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("img", { name: "Página 2" })).not.toBeInTheDocument();
    await userEvent.setup().click(modeButton());
    expect(modeButton()).toHaveAttribute("aria-pressed", "true");
    // The pages near the screen are drawn together; a far one is only a placeholder.
    expect(await screen.findByRole("img", { name: "Página 2" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Página 1" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Página 3" })).not.toBeInTheDocument();
    expect(document.querySelectorAll(".reader-page")).toHaveLength(3);
    expect(window.localStorage.getItem("mind.reader.mode")).toBe("scroll");
  });

  it("fits every page to the same width, so a wide page does not rescale the others", async () => {
    window.localStorage.setItem("mind.reader.mode", "scroll");
    open("/w/1/library/4/read", {
      reader: {
        info: {
          title: "apostila",
          pageCount: 3,
          // A portrait page, a landscape one twice as wide, and a portrait one again.
          pages: [
            { width: 595, height: 842 },
            { width: 1190, height: 842 },
            { width: 595, height: 842 },
          ],
          lastPage: null,
        },
        lines: {},
        hits: [],
        cited: [],
        saved: [],
        failure: null,
      },
    });
    await screen.findByRole("img", { name: "Página 1" });
    const widths = () =>
      [...document.querySelectorAll<HTMLElement>(".reader-page")].map((page) => page.style.width);
    // Each page is as wide as the area; the wide one is not drawn bigger, and the layout is the
    // same whichever page is the current one.
    expect(new Set(widths()).size).toBe(1);
    const heights = [...document.querySelectorAll<HTMLElement>(".reader-page")].map(
      (page) => page.style.height,
    );
    expect(Number.parseFloat(heights[1] ?? "0")).toBeCloseTo(
      Number.parseFloat(heights[0] ?? "0") / 2,
      0,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Próxima página" }));
    expect(new Set(widths()).size).toBe(1);
    expect(
      [...document.querySelectorAll<HTMLElement>(".reader-page")].map((page) => page.style.height),
    ).toEqual(heights);
  });

  it("opens in scrolling when that was the last choice and goes back to pages", async () => {
    window.localStorage.setItem("mind.reader.mode", "scroll");
    open("/w/1/library/4/read");
    expect(await screen.findByRole("img", { name: "Página 2" })).toBeInTheDocument();
    await userEvent.setup().click(modeButton());
    expect(modeButton()).toHaveAttribute("aria-pressed", "false");
    expect(document.querySelectorAll(".reader-page")).toHaveLength(1);
    expect(window.localStorage.getItem("mind.reader.mode")).toBe("page");
  });

  it("scrolls to a page when it is chosen and follows the scroll bar", async () => {
    window.localStorage.setItem("mind.reader.mode", "scroll");
    open("/w/1/library/4/read");
    await screen.findByRole("img", { name: "Página 2" });
    const viewport = document.querySelector(".reader-viewport") as HTMLElement;
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(viewport.scrollTop).toBeGreaterThan(2000);
    expect(await screen.findByRole("img", { name: "Página 3" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ir para a página")).toHaveValue("3");
    // The person drags the scroll bar back to the top of the second page.
    await new Promise((resolve) => setTimeout(resolve, 450));
    viewport.scrollTop = 1200;
    fireEvent.scroll(viewport);
    await waitFor(() => expect(screen.getByLabelText("Ir para a página")).toHaveValue("2"));
    viewport.scrollTop = 0;
    fireEvent.scroll(viewport);
    await waitFor(() => expect(screen.getByLabelText("Ir para a página")).toHaveValue("1"));
  });

  it("leaves Page Up and Page Down to the scrolling, and keeps the arrows for pages", async () => {
    window.localStorage.setItem("mind.reader.mode", "scroll");
    open("/w/1/library/4/read");
    await screen.findByRole("img", { name: "Página 2" });
    expect(fireEvent.keyDown(document, { key: "PageDown" })).toBe(true);
    expect(fireEvent.keyDown(document, { key: "ArrowRight" })).toBe(false);
    await waitFor(() => expect(screen.getByLabelText("Ir para a página")).toHaveValue("2"));
  });

  it("highlights the search hits on the pages and jumps to them", async () => {
    window.localStorage.setItem("mind.reader.mode", "scroll");
    open("/w/1/library/4/read", {
      reader: {
        info: {
          title: "apostila",
          pageCount: 3,
          pages: [595, 595, 595].map((width) => ({ width, height: 842 })),
          lastPage: null,
        },
        lines: {},
        hits: [
          { page: 1, rects: [{ x: 60, y: 50, width: 40, height: 12 }] },
          { page: 3, rects: [{ x: 60, y: 90, width: 40, height: 12 }] },
        ],
        cited: [],
        saved: [],
        failure: null,
      },
    });
    const user = userEvent.setup();
    await screen.findByRole("img", { name: "Página 2" });
    await user.type(screen.getByRole("textbox", { name: "Buscar no PDF" }), "função{Enter}");
    expect(await screen.findByText(/1 de 2 ocorrências/)).toBeInTheDocument();
    expect(document.querySelectorAll(".reader-hit.current")).toHaveLength(1);
    const status = screen.getByText(/1 de 2 ocorrências/).closest("span") as HTMLElement;
    await user.click(within(status).getByRole("button", { name: "Próxima página" }));
    await screen.findByRole("img", { name: "Página 3" });
    expect(screen.getByText(/2 de 2 ocorrências/)).toBeInTheDocument();
    expect(document.querySelectorAll(".reader-hit.current")).toHaveLength(1);
  });

  it("zooms with the buttons and keeps the pages sized for the new zoom", async () => {
    window.localStorage.setItem("mind.reader.mode", "scroll");
    open("/w/1/library/4/read");
    await screen.findByRole("img", { name: "Página 1" });
    const first = document.querySelector(".reader-page") as HTMLElement;
    const before = parseFloat(first.style.width);
    await userEvent.setup().click(screen.getByRole("button", { name: "Aumentar zoom" }));
    await waitFor(() =>
      expect(
        parseFloat((document.querySelector(".reader-page") as HTMLElement).style.width),
      ).toBeGreaterThan(before),
    );
  });

  it("opens on the requested page when it starts in scrolling (See in PDF) and keeps it", async () => {
    window.localStorage.setItem("mind.reader.mode", "scroll");
    open("/w/1/library/4/read?page=3");
    expect(await screen.findByRole("img", { name: "Página 3" })).toBeInTheDocument();
    const viewport = document.querySelector(".reader-viewport") as HTMLElement;
    expect(viewport.scrollTop).toBeGreaterThan(2000);
    expect(screen.getByLabelText("Ir para a página")).toHaveValue("3");
    // Any later action must not send the person back to the first page.
    await new Promise((resolve) => setTimeout(resolve, 450));
    fireEvent.scroll(viewport);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByLabelText("Ir para a página")).toHaveValue("3");
    expect(viewport.scrollTop).toBeGreaterThan(2000);
  });

  it("resumes on the last page read when it opens in scrolling", async () => {
    window.localStorage.setItem("mind.reader.mode", "scroll");
    open("/w/1/library/4/read", {
      reader: {
        info: {
          title: "apostila",
          pageCount: 3,
          pages: [595, 595, 595].map((width) => ({ width, height: 842 })),
          lastPage: 3,
        },
        lines: {},
        hits: [],
        cited: [],
        saved: [],
        failure: null,
      },
    });
    expect(await screen.findByRole("img", { name: "Página 3" })).toBeInTheDocument();
    const viewport = document.querySelector(".reader-viewport") as HTMLElement;
    await waitFor(() => expect(viewport.scrollTop).toBeGreaterThan(2000));
  });
});
