/*
 * Filename: import.test.tsx
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

beforeEach(() => window.localStorage.clear());

async function openImport() {
  const fake = installFakeMind({ workspaces: [ws], route: "/w/1/items", catalog: [] });
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Importar…" }));
  const dialog = await screen.findByRole("dialog", { name: "Importar itens" });
  return { fake, user, dialog };
}

describe("Import dialog: templates (FR-13, US-6)", () => {
  it("explains the import and offers the four templates", async () => {
    const { dialog } = await openImport();
    expect(within(dialog).getByText(/Nada é gravado antes da sua confirmação/)).toBeVisible();
    const group = within(dialog).getByRole("group", { name: "Templates" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Cartões · CSV", "Cartões · XLSX", "Questões · CSV", "Questões · XLSX"]);
  });

  it.each([
    ["Cartões · CSV", "card", "csv"],
    ["Cartões · XLSX", "card", "xlsx"],
    ["Questões · CSV", "question", "csv"],
    ["Questões · XLSX", "question", "xlsx"],
  ] as const)("downloads %s", async (label, kind, format) => {
    const { fake, user, dialog } = await openImport();
    await user.click(within(dialog).getByRole("button", { name: label }));
    expect(fake.invoke).toHaveBeenCalledWith("import:template", { workspaceId: 1, kind, format });
    expect(await within(dialog).findByText("Template salvo.")).toBeVisible();
    expect(fake.state.templates).toEqual([{ kind, format }]);
  });

  it("says nothing when the save dialog is cancelled", async () => {
    const { fake, user, dialog } = await openImport();
    fake.state.cancelTemplate = true;
    await user.click(within(dialog).getByRole("button", { name: "Cartões · CSV" }));
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith("import:template", expect.anything()),
    );
    expect(within(dialog).queryByText("Template salvo.")).toBeNull();
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("closes with the button and with Esc, and shows an error that came back", async () => {
    const { fake, user, dialog } = await openImport();
    fake.invoke.mockImplementationOnce(async () => ({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Não foi possível salvar o arquivo." },
    }));
    await user.click(within(dialog).getByRole("button", { name: "Cartões · XLSX" }));
    expect(await within(dialog).findByText("Não foi possível salvar o arquivo.")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog", { name: "Importar itens" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Importar…" }));
    await screen.findByRole("dialog", { name: "Importar itens" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Importar itens" })).toBeNull();
  });
});

type PreviewRows = NonNullable<NonNullable<FakeState["importFile"]>["rows"]>;
const row = (
  line: number,
  status: PreviewRows[number]["status"],
  extra: Partial<PreviewRows[number]> = {},
): PreviewRows[number] => ({
  line,
  status,
  text: `Pergunta ${line}?`,
  topic: null,
  topicIsNew: false,
  problem: null,
  ...extra,
});

const SAMPLE: PreviewRows = [
  row(2, "valid", { topic: "Geografia", topicIsNew: true }),
  row(3, "valid", { topic: "Geografia" }),
  row(4, "error", { text: "", problem: "A frente do card não pode ficar vazia." }),
  row(5, "duplicate", { problem: "Já existe um item igual neste workspace." }),
  row(6, "duplicate", { problem: "Repetida: igual à linha 2 do arquivo." }),
];

async function openPreview(
  importFile: FakeState["importFile"] = { rows: SAMPLE, newTopics: ["Geografia"] },
) {
  const { fake, user, dialog } = await openImport();
  fake.state.importFile = importFile;
  await user.click(within(dialog).getByRole("button", { name: "Escolher arquivo…" }));
  return { fake, user, dialog };
}

/** Chooses a file that gives a preview; the dialog is a new one, with the focus inside. */
async function openRows(
  importFile: FakeState["importFile"] = { rows: SAMPLE, newTopics: ["Geografia"] },
) {
  const { fake, user } = await openPreview(importFile);
  await screen.findByText("2 Prévia");
  return { fake, user, dialog: screen.getByRole("dialog", { name: "Importar itens" }) };
}

describe("Import dialog: file and preview (FR-14, FR-15, FR-18, US-7)", () => {
  it("starts on the file step with the kind to import, and passes the kind chosen", async () => {
    const { fake, user, dialog } = await openImport();
    expect(within(dialog).getByText("1 Arquivo")).toBeVisible();
    expect(within(dialog).getByRole("radio", { name: "Cards" })).toBeChecked();
    await user.click(within(dialog).getByRole("radio", { name: "Questões" }));
    fake.state.importFile = { rows: [], cancel: true };
    await user.click(within(dialog).getByRole("button", { name: "Escolher arquivo…" }));
    expect(fake.invoke).toHaveBeenCalledWith("import:preview", {
      workspaceId: 1,
      kind: "question",
    });
  });

  it("shows the totals, every row with its status and reason, and the topics that will be created", async () => {
    const { dialog } = await openRows();
    expect(await within(dialog).findByText("cartoes.csv · 5 linha(s)")).toBeVisible();
    expect(within(dialog).getByText("2 válida(s)")).toBeVisible();
    expect(within(dialog).getByText("1 com erro")).toBeVisible();
    expect(within(dialog).getByText("2 duplicada(s)")).toBeVisible();
    expect(within(dialog).getByText("2 Prévia")).toBeVisible();
    const table = within(dialog).getByRole("table", { name: "Prévia da importação" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(6);
    expect(
      within(rows[3] as HTMLElement).getByText("A frente do card não pode ficar vazia."),
    ).toBeVisible();
    expect(within(rows[1] as HTMLElement).getByText("novo")).toBeVisible();
    expect(within(rows[2] as HTMLElement).queryByText("novo")).toBeNull();
    expect(
      within(rows[4] as HTMLElement).getByText("Já existe um item igual neste workspace."),
    ).toBeVisible();
    expect(within(dialog).getByText("Tópicos que serão criados: Geografia.")).toBeVisible();
  });

  it("filters the rows by status and says when a filter is empty", async () => {
    const { user, dialog } = await openRows();
    await within(dialog).findByText("cartoes.csv · 5 linha(s)");
    await user.click(within(dialog).getByRole("button", { name: "Erros (1)" }));
    const table = within(dialog).getByRole("table", { name: "Prévia da importação" });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(dialog).getByRole("button", { name: "Erros (1)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(within(dialog).getByRole("button", { name: "Duplicadas (2)" }));
    expect(within(within(dialog).getByRole("table")).getAllByRole("row")).toHaveLength(3);
    await user.click(within(dialog).getByRole("button", { name: "Todas (5)" }));
    expect(within(within(dialog).getByRole("table")).getAllByRole("row")).toHaveLength(6);
  });

  it("lets a duplicate be imported anyway and updates the summary", async () => {
    const { user, dialog } = await openRows();
    await within(dialog).findByText("cartoes.csv · 5 linha(s)");
    expect(
      within(dialog).getByText(
        "Resumo: 2 entram · 1 erro(s) ignorado(s) · 2 duplicada(s) pulada(s)",
      ),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Importar a linha 5 mesmo assim" }),
    );
    expect(
      within(dialog).getByText(
        "Resumo: 3 entram · 1 erro(s) ignorado(s) · 1 duplicada(s) pulada(s)",
      ),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Importar a linha 5 mesmo assim" }),
    );
    expect(
      within(dialog).getByText(
        "Resumo: 2 entram · 1 erro(s) ignorado(s) · 2 duplicada(s) pulada(s)",
      ),
    ).toBeVisible();
  });

  it("asks for the rows past the first 500 when more are wanted", async () => {
    const many = Array.from({ length: 620 }, (_, index) => row(index + 2, "valid"));
    const { fake, user, dialog } = await openRows({ rows: many });
    await within(dialog).findByText("cartoes.csv · 620 linha(s)");
    expect(within(within(dialog).getByRole("table")).getAllByRole("row")).toHaveLength(501);
    await user.click(within(dialog).getByRole("button", { name: "Mostrar mais linhas" }));
    await waitFor(() =>
      expect(within(within(dialog).getByRole("table")).getAllByRole("row")).toHaveLength(621),
    );
    expect(fake.invoke).toHaveBeenCalledWith("import:previewRows", {
      workspaceId: 1,
      token: "tok-1",
      status: "all",
      offset: 500,
      limit: 500,
    });
    expect(within(dialog).queryByRole("button", { name: "Mostrar mais linhas" })).toBeNull();
  });

  it("shows the reason when the file is refused, and stays on the file step", async () => {
    const { dialog } = await openPreview({
      error: {
        code: "IMPORT_LIMIT_EXCEEDED",
        message: "A planilha tem mais de 5.000 linhas. Divida o arquivo em partes menores.",
      },
    });
    expect(await within(dialog).findByText(/A planilha tem mais de 5\.000 linhas/)).toBeVisible();
    expect(within(dialog).getByText("1 Arquivo")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Escolher arquivo…" })).toBeEnabled();
  });

  it("stays on the file step, quietly, when the dialog is cancelled", async () => {
    const { dialog } = await openPreview({ cancel: true });
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Escolher arquivo…" })).toBeEnabled(),
    );
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(within(dialog).queryByRole("table")).toBeNull();
  });

  it("shows that the file is being read and does not let it be chosen twice", async () => {
    let release: () => void = () => undefined;
    const { user, dialog } = await openPreview({
      rows: SAMPLE,
      gate: new Promise<void>((resolve) => (release = resolve)),
    });
    expect(await within(dialog).findByText("Lendo o arquivo…")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Escolher arquivo…" })).toBeDisabled();
    release();
    // The preview is a new dialog, so it is looked up again.
    expect(await screen.findByText("cartoes.csv · 5 linha(s)")).toBeVisible();
    expect(user).toBeDefined();
  });

  it("moves the focus into the preview, so the keyboard keeps working there", async () => {
    const { dialog } = await openRows();
    await within(dialog).findByText("cartoes.csv · 5 linha(s)");
    const current = screen.getByRole("dialog", { name: "Importar itens" });
    expect(current.contains(document.activeElement)).toBe(true);
  });

  it("goes back to the file step and throws the preview away", async () => {
    const { fake, user, dialog } = await openRows();
    await within(dialog).findByText("cartoes.csv · 5 linha(s)");
    await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(await screen.findByText("1 Arquivo")).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
    expect(fake.state.discarded).toEqual(["tok-1"]);
  });

  it("throws the preview away when the dialog is closed", async () => {
    const { fake, user, dialog } = await openRows();
    await within(dialog).findByText("cartoes.csv · 5 linha(s)");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(fake.state.discarded).toEqual(["tok-1"]));
    expect(screen.queryByRole("dialog", { name: "Importar itens" })).toBeNull();
  });
});

describe("Import dialog: confirming (FR-16, FR-17, US-8)", () => {
  it("imports the valid rows, shows what was done and refreshes the list", async () => {
    const { fake, user, dialog } = await openRows();
    const listed = () =>
      fake.invoke.mock.calls.filter(([channel]) => channel === "items:list").length;
    const before = listed();
    await user.click(within(dialog).getByRole("button", { name: "Importar 2 válida(s)" }));
    expect(await screen.findByRole("heading", { name: "Importação concluída" })).toBeVisible();
    expect(fake.state.commits).toEqual([{ token: "tok-1", includeDuplicates: [] }]);
    const done = screen.getByRole("dialog", { name: "Importação concluída" });
    expect(
      within(done).getByText(
        "2 item(ns) adicionado(s) e aprovado(s), 2 duplicada(s) pulada(s), 1 linha(s) com erro ignorada(s). 1 tópico(s) criado(s).",
      ),
    ).toBeVisible();
    expect(within(done).getByText("3 Resultado")).toBeVisible();
    const row = within(done).getAllByRole("row")[1] as HTMLElement;
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["Cards", "2", "3"]);
    await waitFor(() => expect(listed()).toBeGreaterThan(before));
    // The preview was used up by the import: closing does not try to throw it away.
    await user.click(within(done).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fake.state.discarded).toBeUndefined();
  });

  it("sends the duplicates that were marked and counts them in the button", async () => {
    const { fake, user, dialog } = await openRows();
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Importar a linha 5 mesmo assim" }),
    );
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Importar a linha 6 mesmo assim" }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Importar 4 válida(s)" }));
    await screen.findByRole("heading", { name: "Importação concluída" });
    expect(fake.state.commits).toEqual([{ token: "tok-1", includeDuplicates: [5, 6] }]);
    expect(
      screen.getByText(
        /4 item\(ns\) adicionado\(s\) e aprovado\(s\), 0 duplicada\(s\) pulada\(s\)/,
      ),
    ).toBeVisible();
  });

  it("does not offer to import when nothing would enter", async () => {
    const { dialog } = await openRows({
      rows: [row(2, "error", { problem: "Erro." }), row(3, "duplicate")],
    });
    expect(within(dialog).getByRole("button", { name: "Importar 0 válida(s)" })).toBeDisabled();
  });

  it("shows that it is working and cannot be pressed twice", async () => {
    const { fake, user, dialog } = await openRows();
    let release: () => void = () => undefined;
    fake.state.commitGate = new Promise<void>((resolve) => (release = resolve));
    await user.click(within(dialog).getByRole("button", { name: "Importar 2 válida(s)" }));
    expect(await within(dialog).findByRole("button", { name: "Importando…" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Voltar" })).toBeDisabled();
    release();
    expect(await screen.findByRole("heading", { name: "Importação concluída" })).toBeVisible();
    expect(fake.state.commits).toHaveLength(1);
  });

  it("keeps the preview and the button when the import fails, so it can be tried again", async () => {
    const { fake, user, dialog } = await openRows();
    fake.state.commitError = {
      code: "INTERNAL_ERROR",
      message: "Não foi possível salvar os itens.",
    };
    await user.click(within(dialog).getByRole("button", { name: "Importar 2 válida(s)" }));
    expect(await within(dialog).findByText("Não foi possível salvar os itens.")).toBeVisible();
    expect(within(dialog).getByRole("table")).toBeVisible();
    fake.state.commitError = undefined;
    await user.click(within(dialog).getByRole("button", { name: "Importar 2 válida(s)" }));
    expect(await screen.findByRole("heading", { name: "Importação concluída" })).toBeVisible();
  });

  it("asks to choose the file again when the preview expired", async () => {
    const { fake, user, dialog } = await openRows();
    fake.state.commitError = {
      code: "IMPORT_EXPIRED",
      message: "A prévia expirou. Escolha o arquivo de novo.",
    };
    await user.click(within(dialog).getByRole("button", { name: "Importar 2 válida(s)" }));
    expect(
      await within(dialog).findByText("A prévia expirou. Escolha o arquivo de novo."),
    ).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: /^Importar \d/ })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(await screen.findByText("1 Arquivo")).toBeVisible();
    expect(screen.queryByText("A prévia expirou. Escolha o arquivo de novo.")).toBeNull();
  });

  it("shows only what was imported when asked to see it", async () => {
    const { user, dialog } = await openRows();
    await user.click(within(dialog).getByRole("button", { name: "Importar 2 válida(s)" }));
    await user.click(await screen.findByRole("button", { name: "Ver itens importados" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Origem" })).toHaveValue("import");
  });
});
