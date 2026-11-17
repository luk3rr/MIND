/*
 * Filename: reader-selection.test.tsx
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { openReader, READER_LINE as LINE, select } from "../test/reader-fixture.js";

beforeEach(() => window.localStorage.clear());

describe("Selecting a passage in the reader (FR-5, FR-6)", () => {
  it("shows the actions next to a selection and hides them when it is cleared", async () => {
    await openReader();
    expect(screen.queryByRole("toolbar", { name: "Ações da seleção" })).toBeNull();
    select(await screen.findByText(LINE));
    const bar = await screen.findByRole("toolbar", { name: "Ações da seleção" });
    expect(within(bar).getByRole("button", { name: "✦ Gerar itens" })).toBeVisible();
    expect(within(bar).getByRole("button", { name: "+ Criar item" })).toBeVisible();
    expect(screen.getByText(/Trecho selecionado, 65 caracteres/)).toBeInTheDocument();
    act(() => {
      window.getSelection()?.removeAllRanges();
      document.dispatchEvent(new Event("selectionchange"));
    });
    await waitFor(() =>
      expect(screen.queryByRole("toolbar", { name: "Ações da seleção" })).toBeNull(),
    );
  });

  it("ignores text selected outside the pages", async () => {
    await openReader();
    await screen.findByText(LINE);
    select(screen.getByRole("heading", { name: "apostila" }));
    expect(screen.queryByRole("toolbar", { name: "Ações da seleção" })).toBeNull();
  });

  it("opens the editor with the material, page and passage filled in, and saves an item of the reader", async () => {
    const fake = await openReader();
    const user = userEvent.setup();
    select(await screen.findByText(LINE));
    await user.click(await screen.findByRole("button", { name: "+ Criar item" }));
    const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
    // The selection is not needed any more, so the actions go away.
    expect(screen.queryByRole("toolbar", { name: "Ações da seleção" })).toBeNull();
    expect(within(panel).getByLabelText("Material da fonte")).toHaveValue("4");
    expect(within(panel).getByLabelText("Página (opcional)")).toHaveValue("1");
    expect(within(panel).getByLabelText("Trecho da fonte")).toHaveValue(LINE);
    await user.type(
      within(panel).getByLabelText("Frente"),
      "Sobre o que incidem os juros compostos?",
    );
    await user.type(within(panel).getByLabelText("Verso"), "Capital e juros acumulados.");
    await user.click(within(panel).getByRole("button", { name: "Salvar" }));
    expect(fake.invoke).toHaveBeenCalledWith(
      "items:create",
      expect.objectContaining({
        origin: "reader",
        source: { materialId: 4, page: 1, quote: LINE },
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo cartão" })).toBeNull());
    // The pages are still there, ready for the next selection.
    expect(screen.getByRole("img", { name: "Página 1" })).toBeInTheDocument();
  });

  it("lets the person edit the passage and leaves room for the PDF beside the panel", async () => {
    await openReader();
    const user = userEvent.setup();
    select(await screen.findByText(LINE));
    await user.click(await screen.findByRole("button", { name: "+ Criar item" }));
    const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
    const quote = within(panel).getByLabelText("Trecho da fonte");
    await user.clear(quote);
    await user.type(quote, "juros compostos");
    expect(quote).toHaveValue("juros compostos");
    expect(document.querySelector(".reader.with-panel")).not.toBeNull();
    await user.click(within(panel).getByRole("button", { name: "Fechar" }));
    expect(document.querySelector(".reader.with-panel")).toBeNull();
  });

  it("is reachable with the keyboard: Tab leads to the action and Esc dismisses the bar", async () => {
    await openReader();
    select(await screen.findByText(LINE));
    const bar = await screen.findByRole("toolbar", { name: "Ações da seleção" });
    fireEvent.keyDown(document, { key: "Tab" });
    // The first action takes the focus; the next Tab reaches the other one.
    expect(within(bar).getByRole("button", { name: "✦ Gerar itens" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("toolbar", { name: "Ações da seleção" })).toBeNull(),
    );
  });

  it("does not offer actions for a selection that crosses pages", async () => {
    await openReader();
    const user = userEvent.setup();
    const first = await screen.findByText(LINE);
    await user.click(screen.getByRole("button", { name: "Rolagem contínua" }));
    const second = await screen.findByText("Página dois.");
    select(first.firstChild as Node, second.firstChild as Node);
    expect(screen.queryByRole("toolbar", { name: "Ações da seleção" })).toBeNull();
  });
  it("offers the actions when a triple click selects the whole text layer of a page", async () => {
    await openReader();
    const layer = await screen.findByLabelText("Texto da página");
    // A triple click selects the block, and its end point lands outside the text layer.
    const range = document.createRange();
    range.setStart(layer, 0);
    range.setEnd(layer.parentElement as Node, layer.parentElement?.childNodes.length ?? 0);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    act(() => void document.dispatchEvent(new Event("selectionchange")));
    expect(await screen.findByRole("toolbar", { name: "Ações da seleção" })).toBeVisible();
  });
  it("offers the actions when a triple click ends the selection in the next block, outside the reader", async () => {
    await openReader();
    const line = await screen.findByText(LINE);
    const next = document.querySelector("section.reader > p.muted") as Node;
    // This is what Chromium selects for a triple click on a line of the page.
    const range = document.createRange();
    range.setStart(line.firstChild as Node, 0);
    range.setEnd(next, 0);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    act(() => void document.dispatchEvent(new Event("selectionchange")));
    expect(await screen.findByRole("toolbar", { name: "Ações da seleção" })).toBeVisible();
  });
});
