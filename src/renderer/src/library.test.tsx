/*
 * Filename: library.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeMaterial, FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";
import { materialPath, parseRoute } from "./router.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

function material(overrides: Partial<FakeMaterial> = {}): FakeMaterial {
  return {
    id: 1,
    title: "apostila",
    kind: "pdf",
    filename: "apostila.pdf",
    status: "indexed",
    pageCount: 120,
    charCount: 1000,
    ocrConfidence: null,
    jobId: 1,
    errorCode: null,
    errorDetail: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    sourceUrl: null,
    progress: null,
    chunkCount: 34,
    ...overrides,
  };
}

function openLibrary(initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route: "/w/1/library", ...initial });
  render(<App />);
  return fake;
}

describe("library with many materials", () => {
  it("pages the table and filters it by title", async () => {
    const materials = Array.from({ length: 13 }, (_, index) =>
      material({
        id: index + 1,
        title: index % 3 === 0 ? `Resumo ${index + 1}` : `Apostila ${index + 1}`,
        filename: `arquivo-${index + 1}.pdf`,
      }),
    );
    openLibrary({ materials });
    const user = userEvent.setup();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(11);
    expect(screen.getByRole("status")).toHaveTextContent("1–10 de 13");
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4);
    await user.type(screen.getByRole("searchbox", { name: "Filtrar materiais" }), "resumo");
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(6);
  });
});

describe("library routes", () => {
  it("parses a material preview with an optional chunk", () => {
    expect(parseRoute("/w/1/library/5")).toEqual({
      name: "section",
      workspaceId: 1,
      section: "library",
      detailId: 5,
    });
    expect(parseRoute(materialPath(1, 5, 12))).toEqual({
      name: "section",
      workspaceId: 1,
      section: "library",
      detailId: 5,
      chunkId: 12,
    });
    expect(parseRoute("/w/1/library/x")).toEqual({ name: "unknown" });
  });
});

describe("Library page", () => {
  it("invites to import when empty", async () => {
    openLibrary();
    expect(await screen.findByText("Nenhum material ainda")).toBeVisible();
    expect(screen.getByRole("button", { name: "Importar arquivo" })).toBeVisible();
  });

  it("lists the materials with status, pages and chunks", async () => {
    openLibrary({
      materials: [
        material(),
        material({ id: 2, title: "notas", kind: "text", pageCount: null, chunkCount: 3 }),
      ],
    });
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1] as HTMLElement).getByText("apostila")).toBeVisible();
    expect(within(rows[1] as HTMLElement).getByText("120")).toBeVisible();
    expect(within(rows[1] as HTMLElement).getByText("Indexado")).toBeVisible();
    expect(within(rows[2] as HTMLElement).getByText("—")).toBeVisible();
  });

  it("imports through the native dialog, shows errors and refreshes the list", async () => {
    const fake = openLibrary();
    const user = userEvent.setup();
    await screen.findByText("Nenhum material ainda");
    fake.state.importResult = {
      materials: [
        material({ id: 7, title: "novo", status: "queued", progress: 0.4, chunkCount: 0 }),
      ],
      errors: [{ file: "x.exe", message: "Formato '.exe' não suportado." }],
    };
    await user.click(screen.getByRole("button", { name: "Importar arquivo" }));
    expect(await screen.findByText("novo")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("x.exe: Formato '.exe' não suportado.");
    expect(screen.getByRole("progressbar", { name: /40%/ })).toBeVisible();
    expect(screen.getByText("Na fila")).toBeVisible();
  });

  it("shows OCR confidence and the failure detail", async () => {
    openLibrary({
      materials: [
        material({ id: 1, ocrConfidence: 87.4 }),
        material({
          id: 2,
          title: "ruim",
          status: "failed",
          errorCode: "EXTRACTION_FAILED",
          errorDetail: "O PDF está protegido por senha.",
        }),
      ],
    });
    expect(await screen.findByText(/OCR 87%/)).toBeVisible();
    expect(screen.getByText("Falhou")).toBeVisible();
    expect(screen.getByText("O PDF está protegido por senha.")).toBeVisible();
  });

  it("polls while a material is importing and stops when it is done", async () => {
    const fake = openLibrary({ materials: [material({ status: "importing", progress: 0.2 })] });
    expect(await screen.findByText("Importando")).toBeVisible();
    fake.state.materials = [material({ status: "indexed", progress: null })];
    expect(await screen.findByText("Indexado", {}, { timeout: 3000 })).toBeVisible();
    const calls = fake.invoke.mock.calls.filter((c) => c[0] === "material:list").length;
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(fake.invoke.mock.calls.filter((c) => c[0] === "material:list").length).toBe(calls);
  });

  it("shows the day and time each material was imported", async () => {
    openLibrary({
      materials: [
        material({ id: 2, title: "novo", createdAt: "2026-03-05T14:30:00.000Z" }),
        material({ id: 1, title: "velho", createdAt: "not a date" }),
      ],
    });
    await screen.findByRole("table");
    expect(screen.getByRole("columnheader", { name: "Importado em" })).toBeVisible();
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    const cells = (row: HTMLElement) =>
      within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent);
    // The time follows the local time zone, so the test builds the text the same way.
    const expected = new Date("2026-03-05T14:30:00.000Z").toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
    expect(expected).toMatch(/^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/);
    expect(cells(rows[1] as HTMLElement)).toContain(expected);
    expect(cells(rows[2] as HTMLElement)).toContain("—");
  });

  it("sorts the materials by name when the name column is clicked, and back to the newest", async () => {
    openLibrary({
      materials: [
        material({ id: 4, title: "Zeta" }),
        material({ id: 3, title: "alfa" }),
        material({ id: 2, title: "Beta 10" }),
        material({ id: 1, title: "Beta 2" }),
      ],
    });
    const user = userEvent.setup();
    await screen.findByRole("table");
    const names = () =>
      within(screen.getByRole("table"))
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[0]?.textContent);
    const header = () => screen.getByRole("columnheader", { name: /Material/ });
    // As loaded: newest first.
    expect(names()).toEqual(["Zeta", "alfa", "Beta 10", "Beta 2"]);
    expect(header()).toHaveAttribute("aria-sort", "none");
    const sort = screen.getByRole("button", { name: /Ordenar por nome/ });
    await user.click(sort);
    // A to Z, ignoring capitals and with numbers in order (Beta 2 before Beta 10).
    expect(names()).toEqual(["alfa", "Beta 2", "Beta 10", "Zeta"]);
    expect(header()).toHaveAttribute("aria-sort", "ascending");
    expect(header()).toHaveTextContent("▲");
    await user.click(sort);
    expect(names()).toEqual(["Zeta", "Beta 10", "Beta 2", "alfa"]);
    expect(header()).toHaveAttribute("aria-sort", "descending");
    await user.click(sort);
    expect(names()).toEqual(["Zeta", "alfa", "Beta 10", "Beta 2"]);
    expect(header()).toHaveAttribute("aria-sort", "none");
  });

  it("goes back to the first page when the order changes, and keeps the search", async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      material({ id: 12 - index, title: `Material ${String(12 - index).padStart(2, "0")}` }),
    );
    openLibrary({ materials: many });
    const user = userEvent.setup();
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(screen.getByText("Material 02")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Ordenar por nome/ }));
    expect(screen.getByText("Material 01")).toBeVisible();
    expect(screen.getByText("Material 10")).toBeVisible();
    expect(screen.queryByText("Material 11")).toBeNull();
  });

  it("asks for confirmation before deleting a material", async () => {
    const fake = openLibrary({ materials: [material()] });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Excluir" }));
    const dialog = screen.getByRole("dialog", { name: "Excluir material" });
    expect(dialog).toHaveTextContent("apostila");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(fake.state.materials).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(fake.state.materials).toHaveLength(0));
    expect(await screen.findByText("Nenhum material ainda")).toBeVisible();
  });

  it("searches the text and opens the preview at the chunk", async () => {
    const chunks = Array.from({ length: 3 }, (_, i) => ({
      id: 10 + i,
      materialId: 1,
      ordinal: i,
      page: i + 1,
      section: i === 1 ? "Capítulo" : null,
      text: `Texto do trecho ${i}`,
    }));
    openLibrary({
      materials: [material()],
      chunks,
      searchHits: [
        {
          chunkId: 11,
          materialId: 1,
          materialTitle: "apostila",
          page: 2,
          section: "Capítulo",
          text: "Texto do trecho 1",
          score: 3,
        },
      ],
    });
    const user = userEvent.setup();
    await screen.findByRole("table");
    await user.type(screen.getByRole("textbox", { name: "Buscar nos materiais" }), "trecho");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    const results = await screen.findByRole("region", { name: "Resultados da busca" });
    await user.click(within(results).getByRole("button", { name: /apostila, pág\. 2, Capítulo/ }));
    expect(await screen.findByRole("heading", { name: "apostila" })).toBeVisible();
    expect(screen.getByText("Trechos 1 a 3 de 3")).toBeVisible();
    expect(screen.getByText("Texto do trecho 1").closest("article")).toHaveAttribute(
      "aria-current",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Voltar à Biblioteca" }));
    expect(await screen.findByRole("heading", { name: "Biblioteca" })).toBeVisible();
  });

  it("shows the no-results message and clears the search", async () => {
    openLibrary({ materials: [material()] });
    const user = userEvent.setup();
    await screen.findByRole("table");
    await user.type(screen.getByRole("textbox", { name: "Buscar nos materiais" }), "nada");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByText("Nenhum trecho encontrado.")).toBeVisible();
    await user.clear(screen.getByRole("textbox", { name: "Buscar nos materiais" }));
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(screen.queryByText("Nenhum trecho encontrado.")).toBeNull());
  });

  it("paginates the preview", async () => {
    const chunks = Array.from({ length: 45 }, (_, i) => ({
      id: i + 1,
      materialId: 1,
      ordinal: i,
      page: null,
      section: null,
      text: `Trecho ${i}`,
    }));
    openLibrary({ materials: [material()], chunks, route: "/w/1/library/1" });
    const user = userEvent.setup();
    expect(await screen.findByText("Trechos 1 a 20 de 45")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Próximos" }));
    expect(await screen.findByText("Trechos 21 a 40 de 45")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Anteriores" }));
    expect(await screen.findByText("Trechos 1 a 20 de 45")).toBeVisible();
  });

  it("shows an error for an unknown material", async () => {
    openLibrary({ materials: [], route: "/w/1/library/99" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Material não encontrado.");
  });

  it("imports a web page by address and shows the validation error inline", async () => {
    const fake = openLibrary();
    const user = userEvent.setup();
    await screen.findByText("Nenhum material ainda");
    fake.state.importResult = {
      materials: [
        material({
          id: 9,
          title: "exemplo.com",
          kind: "url",
          pageCount: null,
          status: "queued",
          progress: 0.1,
        }),
      ],
      errors: [],
    };
    await user.click(screen.getByRole("button", { name: "Importar URL" }));
    const dialog = screen.getByRole("dialog", { name: "Importar URL" });
    await user.type(within(dialog).getByLabelText("Endereço da página"), "ftp://x.com");
    await user.click(within(dialog).getByRole("button", { name: "Importar URL" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("http:// ou https://");
    const input = within(dialog).getByLabelText("Endereço da página");
    await user.clear(input);
    await user.type(input, "https://exemplo.com/aula");
    await user.click(within(dialog).getByRole("button", { name: "Importar URL" }));
    expect(await screen.findByText("exemplo.com")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Renaming a material", () => {
  it("renames from the library, cleans the spaces and refuses an empty name", async () => {
    const material: FakeMaterial = {
      id: 3,
      title: "Aula_01_Moeda",
      kind: "pdf",
      filename: "Aula_01_Moeda.pdf",
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
    const { state } = installFakeMind({
      workspaces: [{ id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" }],
      route: "/w/1/library",
      materials: [material],
    });
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Renomear Aula_01_Moeda" }));
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("Nome do material");
    expect(input).toHaveValue("Aula_01_Moeda");
    await user.clear(input);
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("não pode ser vazio");
    await user.type(input, "  Aula 01 —   Moeda ");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(state.materials[0]?.title).toBe("Aula 01 — Moeda"));
    expect(await screen.findByRole("button", { name: "Aula 01 — Moeda" })).toBeInTheDocument();
  });
});
