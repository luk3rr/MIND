/*
 * Filename: generate-selection.test.tsx
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { openReader, READER_LINE as LINE, select } from "../test/reader-fixture.js";

beforeEach(() => window.localStorage.clear());

async function openPanel(lines?: string[], extra?: Parameters<typeof openReader>[1]) {
  const fake = await openReader(lines, extra);
  const user = userEvent.setup();
  select(await screen.findByText(lines?.[0] ?? LINE));
  await user.click(await screen.findByRole("button", { name: "✦ Gerar itens" }));
  const panel = await screen.findByRole("dialog", { name: "Gerar itens do trecho" });
  return { fake, user, panel };
}

const requests = (fake: Awaited<ReturnType<typeof openReader>>) =>
  fake.invoke.mock.calls.filter(([channel]) => channel === "selection:generate");

describe("Generating items from the selected passage (FR-5, FR-7, FR-8, FR-9)", () => {
  it("shows the passage and the estimated cost before anything is asked", async () => {
    const { fake, panel } = await openPanel();
    expect(within(panel).getByText(/Trecho · p\. 1 · 65 de 8\.000 caracteres/)).toBeVisible();
    expect(within(panel).getByText(LINE, { exact: false })).toBeVisible();
    expect(await within(panel).findByText("Custo estimado: ~US$ 0.0123")).toBeVisible();
    expect(requests(fake)).toHaveLength(0);
    // The bar went away and the pages are still readable beside the panel.
    expect(screen.queryByRole("toolbar", { name: "Ações da seleção" })).toBeNull();
    expect(document.querySelector(".reader.with-panel")).not.toBeNull();
  });

  it("asks for no quantity and no subject when they are left empty, and lists the drafts (FR-7)", async () => {
    const { fake, user, panel } = await openPanel();
    await user.click(within(panel).getByRole("button", { name: "Gerar" }));
    expect(await within(panel).findByText("2 rascunho(s) do trecho")).toBeVisible();
    expect(requests(fake)[0]?.[1]).toEqual({
      workspaceId: 1,
      materialId: 4,
      page: 1,
      text: LINE,
      kind: "card",
    });
    expect(within(panel).getByText("Pergunta 1 sobre o trecho?")).toBeVisible();
    expect(fake.invoke).not.toHaveBeenCalledWith("items:create", expect.anything());
    expect(within(panel).getByRole("button", { name: "Pedir mais" })).toBeVisible();
  });

  it("sends the type, the quantity and the subject that were chosen", async () => {
    const { fake, user, panel } = await openPanel();
    await user.click(within(panel).getByRole("radio", { name: "Questões" }));
    await user.type(within(panel).getByLabelText("Quantidade (opcional)"), "3a");
    expect(within(panel).getByLabelText("Quantidade (opcional)")).toHaveValue("3");
    await user.type(within(panel).getByLabelText("Assunto (opcional)"), "juros");
    await user.click(within(panel).getByRole("button", { name: "Gerar" }));
    expect(await within(panel).findByText("3 rascunho(s) do trecho")).toBeVisible();
    expect(requests(fake)[0]?.[1]).toEqual({
      workspaceId: 1,
      materialId: 4,
      page: 1,
      text: LINE,
      kind: "question",
      quantity: 3,
      subject: "juros",
    });
    expect(within(panel).getByText("Afirmação 1 sobre juros.")).toBeVisible();
  });

  it("refuses a quantity above 20 and a passage above 8.000 characters (FR-7)", async () => {
    const { user, panel } = await openPanel();
    await user.type(within(panel).getByLabelText("Quantidade (opcional)"), "25");
    expect(within(panel).getByText("Peça de 1 a 20 itens.")).toBeVisible();
    expect(within(panel).getByRole("button", { name: "Gerar" })).toBeDisabled();
  });

  it("explains a passage that is too long and does not offer to generate", async () => {
    const long = `${"palavra ".repeat(1200)}fim.`;
    const { fake, panel } = await openPanel([long]);
    expect(within(panel).getByText(/Trecho com mais de 8\.000 caracteres/)).toBeVisible();
    expect(within(panel).getByRole("button", { name: "Gerar" })).toBeDisabled();
    expect(fake.invoke).not.toHaveBeenCalledWith("selection:estimate", expect.anything());
  });

  it("saves a draft as an approved item of the reader with the passage as its source (FR-8)", async () => {
    const { fake, user, panel } = await openPanel();
    await user.click(within(panel).getByRole("button", { name: "Gerar" }));
    const draft = await within(panel).findByRole("article", { name: /Rascunho: Pergunta 1/ });
    await user.click(within(draft).getByRole("button", { name: "Salvar" }));
    expect(await within(draft).findByText("Salvo e aprovado")).toBeVisible();
    expect(fake.invoke).toHaveBeenCalledWith("items:create", {
      workspaceId: 1,
      draft: {
        kind: "card",
        subtype: "qa",
        front: "Pergunta 1 sobre o trecho?",
        back: "Resposta 1.",
      },
      topic: "Tópico",
      origin: "reader",
      source: { materialId: 4, page: 1, quote: LINE.slice(0, 30) },
    });
    // The other draft is still waiting; saving one did not save it.
    const other = within(panel).getByRole("article", { name: /Rascunho: Pergunta 2/ });
    expect(within(other).getByRole("button", { name: "Salvar" })).toBeVisible();
  });

  it("tells when a saved draft cannot open the PDF because its quote is not in the material", async () => {
    const { fake, user, panel } = await openPanel();
    fake.state.selection = {
      drafts: [
        {
          draft: { kind: "card", subtype: "qa", front: "Sem atalho?", back: "Sim." },
          topic: null,
          quote: "uma citação que o material não tem",
        },
      ],
    };
    await user.click(within(panel).getByRole("button", { name: "Gerar" }));
    const draft = await within(panel).findByRole("article", { name: /Rascunho: Sem atalho/ });
    await user.click(within(draft).getByRole("button", { name: "Salvar" }));
    expect(
      await within(draft).findByText("Salvo e aprovado (sem o atalho Ver no PDF)"),
    ).toBeVisible();
  });

  it("shows the message of a draft that could not be saved", async () => {
    const { fake, user, panel } = await openPanel();
    fake.state.selection = {
      drafts: [
        {
          draft: { kind: "card", subtype: "qa", front: " ", back: "Sim." },
          topic: null,
          quote: LINE.slice(0, 30),
        },
      ],
    };
    await user.click(within(panel).getByRole("button", { name: "Gerar" }));
    const draft = await within(panel).findByRole("article");
    await user.click(within(draft).getByRole("button", { name: "Salvar" }));
    expect(await within(draft).findByText("A frente do card não pode ficar vazia.")).toBeVisible();
    expect(within(draft).getByRole("button", { name: "Salvar" })).toBeVisible();
  });

  it("discards a draft without storing anything", async () => {
    const { fake, user, panel } = await openPanel();
    await user.click(within(panel).getByRole("button", { name: "Gerar" }));
    const draft = await within(panel).findByRole("article", { name: /Rascunho: Pergunta 1/ });
    await user.click(within(draft).getByRole("button", { name: "Descartar" }));
    expect(within(panel).queryByText("Pergunta 1 sobre o trecho?")).toBeNull();
    expect(within(panel).getByText("1 rascunho(s) do trecho")).toBeVisible();
    expect(fake.invoke).not.toHaveBeenCalledWith("items:create", expect.anything());
  });

  it("edits a draft in the editor with its text and source already filled in", async () => {
    const { fake, user, panel } = await openPanel();
    await user.click(within(panel).getByRole("button", { name: "Gerar" }));
    const draft = await within(panel).findByRole("article", { name: /Rascunho: Pergunta 1/ });
    await user.click(within(draft).getByRole("button", { name: "Editar" }));
    const editor = await screen.findByRole("dialog", { name: "Novo cartão" });
    expect(within(editor).getByLabelText("Frente")).toHaveValue("Pergunta 1 sobre o trecho?");
    expect(within(editor).getByLabelText("Verso")).toHaveValue("Resposta 1.");
    expect(within(editor).getByLabelText("Material da fonte")).toHaveValue("4");
    expect(within(editor).getByRole("combobox", { name: "Tópico" })).toHaveValue("Tópico");
    await user.clear(within(editor).getByLabelText("Frente"));
    await user.type(within(editor).getByLabelText("Frente"), "Minha versão?");
    await user.click(within(editor).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo cartão" })).toBeNull());
    expect(fake.invoke).toHaveBeenCalledWith(
      "items:create",
      expect.objectContaining({
        origin: "reader",
        draft: expect.objectContaining({ front: "Minha versão?" }),
      }),
    );
    const back = await screen.findByRole("dialog", { name: "Gerar itens do trecho" });
    expect(within(back).getAllByText(/^Salvo e aprovado/)).toHaveLength(1);
    expect(within(back).getByText("Pergunta 2 sobre o trecho?")).toBeVisible();
  });

  it("goes back to the list when the editor is closed without saving", async () => {
    const { fake, user, panel } = await openPanel();
    await user.click(within(panel).getByRole("button", { name: "Gerar" }));
    const draft = await within(panel).findByRole("article", { name: /Rascunho: Pergunta 1/ });
    await user.click(within(draft).getByRole("button", { name: "Editar" }));
    const editor = await screen.findByRole("dialog", { name: "Novo cartão" });
    await user.click(within(editor).getByRole("button", { name: "Fechar" }));
    const back = await screen.findByRole("dialog", { name: "Gerar itens do trecho" });
    expect(within(back).getByText("Pergunta 1 sobre o trecho?")).toBeVisible();
    expect(fake.invoke).not.toHaveBeenCalledWith("items:create", expect.anything());
  });

  it("asks for more without repeating what is already listed and tells what was left out", async () => {
    const { fake, user, panel } = await openPanel();
    fake.state.selection = { discarded: { noSource: 1, invalid: 1, duplicate: 1 } };
    await user.click(within(panel).getByRole("button", { name: "Gerar" }));
    await within(panel).findByText("2 rascunho(s) do trecho");
    await user.click(within(panel).getByRole("button", { name: "Pedir mais" }));
    // The same two drafts came back: none is added, but the discards add up.
    await waitFor(() => expect(requests(fake)).toHaveLength(2));
    expect(
      await within(panel).findByText(
        "6 item(ns) descartado(s): citação fora do trecho, texto inválido ou repetido.",
      ),
    ).toBeVisible();
    expect(within(panel).getByText("2 rascunho(s) do trecho")).toBeVisible();
  });

  it("says when nothing came out of the request", async () => {
    const { fake, user, panel } = await openPanel();
    fake.state.selection = { drafts: [] };
    await user.click(within(panel).getByRole("button", { name: "Gerar" }));
    expect(await within(panel).findByText("Nenhum item gerado para este pedido.")).toBeVisible();
  });

  it("leads to the settings when the key or the consent is missing (FR-9)", async () => {
    const { fake, user, panel } = await openPanel();
    fake.state.selection = {
      error: { code: "PROVIDER_KEY_MISSING", message: "Configure a chave do provedor." },
    };
    await user.click(within(panel).getByRole("button", { name: "Gerar" }));
    expect(await within(panel).findByText("Configure a chave do provedor.")).toBeVisible();
    await user.click(within(panel).getByRole("button", { name: "Ir às Configurações" }));
    expect(await screen.findByRole("heading", { name: "Configurações" })).toBeVisible();
  });

  it("offers to try again after a failure of the model", async () => {
    const { fake, user, panel } = await openPanel();
    fake.state.selection = { error: { code: "PROVIDER_ERROR", message: "O modelo falhou." } };
    await user.click(within(panel).getByRole("button", { name: "Gerar" }));
    expect(await within(panel).findByText("O modelo falhou.")).toBeVisible();
    fake.state.selection = {};
    await user.click(within(panel).getByRole("button", { name: "Tentar de novo" }));
    expect(await within(panel).findByText("2 rascunho(s) do trecho")).toBeVisible();
  });

  it("throws the unsaved drafts away when the panel is closed (ADR-6)", async () => {
    const { fake, user, panel } = await openPanel();
    await user.click(within(panel).getByRole("button", { name: "Gerar" }));
    await within(panel).findByText("2 rascunho(s) do trecho");
    expect(
      within(panel).getByText("Fechar descarta os rascunhos que você não salvou."),
    ).toBeVisible();
    await user.click(within(panel).getAllByRole("button", { name: "Fechar" })[0] as HTMLElement);
    expect(screen.queryByRole("dialog", { name: "Gerar itens do trecho" })).toBeNull();
    expect(fake.invoke).not.toHaveBeenCalledWith("items:create", expect.anything());
    expect(document.querySelector(".reader.with-panel")).toBeNull();
  });
});
