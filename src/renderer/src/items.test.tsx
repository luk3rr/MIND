/*
 * Filename: items.test.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeMaterial, FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

const entry = (id: number, extra: Partial<NonNullable<FakeState["catalog"]>[number]> = {}) => ({
  id,
  kind: "card",
  subtype: "qa",
  front: `Pergunta ${id}`,
  back: "Resposta",
  status: "approved",
  topicId: null,
  topic: null,
  materialId: 1,
  material: "Micro",
  edited: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  origin: "generated",
  sourceTitle: "Micro",
  sourcePage: 4,
  hasPdf: true,
  ...extra,
});

function open(
  catalog: NonNullable<FakeState["catalog"]>,
  topicList = [] as FakeState["topicList"],
) {
  const fake = installFakeMind({ workspaces: [ws], route: "/w/1/items", catalog, topicList });
  render(<App />);
  return fake;
}

beforeEach(() => window.localStorage.clear());

describe("Items screen", () => {
  it("lists every item, filters the ones without a topic and gives them a topic in bulk", async () => {
    const fake = open(
      [
        entry(1),
        entry(2),
        entry(3, { topicId: 5, topic: "Demanda" }),
        entry(4, { status: "discarded" }),
      ],
      [{ id: 5, name: "Demanda", cards: 1, questions: 0 }],
    );
    const user = userEvent.setup();
    const table = await screen.findByRole("table", { name: "Itens" });
    // Discarded items stay out of the default view.
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(screen.getByText("3 de 4 item(ns) · 2 sem tópico")).toBeVisible();

    await user.click(screen.getByRole("combobox", { name: "Filtrar por tópico" }));
    await user.click(await screen.findByRole("option", { name: /Sem tópico/ }));
    expect(within(table).getAllByRole("row")).toHaveLength(3);

    await user.click(screen.getByRole("checkbox", { name: "Selecionar a página" }));
    expect(screen.getByText("2 selecionado(s)")).toBeVisible();
    await user.type(
      screen.getByRole("combobox", { name: "Tópico para os selecionados" }),
      "Oferta",
    );
    await user.click(screen.getByRole("button", { name: "Atribuir tópico" }));
    expect(await screen.findByText("2 item(ns) alterado(s).")).toBeVisible();
    expect(fake.invoke).toHaveBeenCalledWith("items:bulk", {
      workspaceId: 1,
      ids: [1, 2],
      action: "topic",
      topic: "Oferta",
    });
    // Both now have a topic, so the "without topic" filter is empty.
    expect(await screen.findByText("Nenhum item com esses filtros.")).toBeVisible();
  });

  it("filters by status and discards the selected items after confirming", async () => {
    open([entry(1), entry(2, { status: "draft" }), entry(3, { status: "discarded" })]);
    const user = userEvent.setup();
    await screen.findByRole("table", { name: "Itens" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Situação" }), "discarded");
    expect(screen.getByText("Pergunta 3")).toBeVisible();
    expect(screen.queryByText("Pergunta 1")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await user.click(screen.getByRole("checkbox", { name: "Selecionar Pergunta 1" }));
    await user.click(screen.getByRole("button", { name: "Descartar" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Descartar" }));
    expect(await screen.findByText("1 item(ns) alterado(s).")).toBeVisible();
    await waitFor(() => expect(screen.queryByText("Pergunta 1")).toBeNull());
  });

  it("edits one item from the list", async () => {
    const fake = open([entry(1)]);
    fake.state.items = [
      {
        id: 1,
        runId: 1,
        kind: "card",
        subtype: "qa",
        front: "Pergunta 1",
        back: "Resposta",
        status: "approved",
        topic: null,
        sourceTitle: "apostila",
        sourcePage: 4,
        quote: "citação",
        chunkId: 1,
        pdfSource: null,
        edited: false,
        origin: "generated",
        createdAt: "2026-01-01T00:00:00.000Z",
        approvedAt: "2026-01-01T00:00:00.000Z",
        options: [],
        answer: null,
      },
    ];
    const user = userEvent.setup();
    await screen.findByRole("table", { name: "Itens" });
    await user.click(screen.getByRole("button", { name: /^Editar Pergunta 1/ }));
    expect(await screen.findByRole("dialog")).toBeVisible();
  });
  it("creates a card by hand and keeps type and topic to create another (FR-1, FR-21)", async () => {
    const fake = open([entry(1)]);
    const user = userEvent.setup();
    await screen.findByRole("table", { name: "Itens" });
    await user.click(screen.getByRole("button", { name: "Novo item" }));
    const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
    await user.selectOptions(within(panel).getByLabelText("Tipo de cartão"), "compare");
    await user.type(within(panel).getByLabelText("Frente"), "A vs B");
    await user.type(within(panel).getByLabelText("Verso"), "Diferem em C");
    await user.type(within(panel).getByRole("combobox", { name: "Tópico" }), "Química");
    await user.click(within(panel).getByRole("button", { name: "Salvar e criar outro" }));
    expect(fake.invoke).toHaveBeenCalledWith("items:create", {
      workspaceId: 1,
      draft: { kind: "card", subtype: "compare", front: "A vs B", back: "Diferem em C" },
      topic: "Química",
      origin: "manual",
    });
    expect(await within(panel).findByText("Cartão criado.")).toBeVisible();
    expect(within(panel).getByLabelText("Frente")).toHaveValue("");
    expect(within(panel).getByLabelText("Tipo de cartão")).toHaveValue("compare");
    expect(within(panel).getByRole("combobox", { name: "Tópico" })).toHaveValue("Química");
    // The new card shows up in the list behind the panel.
    expect(await screen.findByText("A vs B")).toBeVisible();
  });

  it("shows a message on the empty field and saves nothing (FR-1)", async () => {
    const fake = open([entry(1)]);
    const user = userEvent.setup();
    await screen.findByRole("table", { name: "Itens" });
    await user.click(screen.getByRole("button", { name: "Novo item" }));
    const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
    await user.type(within(panel).getByLabelText("Verso"), "Resposta");
    await user.click(within(panel).getByRole("button", { name: "Salvar" }));
    expect(await within(panel).findByText("A frente do card não pode ficar vazia.")).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Novo cartão" })).toBeVisible();
    expect(fake.state.catalog).toHaveLength(1);
  });

  it("closes the panel after saving a single card and with Esc", async () => {
    open([entry(1)]);
    const user = userEvent.setup();
    await screen.findByRole("table", { name: "Itens" });
    await user.click(screen.getByRole("button", { name: "Novo item" }));
    const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
    await user.type(within(panel).getByLabelText("Frente"), "P");
    await user.type(within(panel).getByLabelText("Verso"), "R");
    await user.click(within(panel).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo cartão" })).toBeNull());
    await user.click(screen.getByRole("button", { name: "Novo item" }));
    await screen.findByRole("dialog", { name: "Novo cartão" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Novo cartão" })).toBeNull();
  });
  it("creates a multiple choice question, adding and removing alternatives (FR-2)", async () => {
    const fake = open([entry(1)]);
    const user = userEvent.setup();
    await screen.findByRole("table", { name: "Itens" });
    await user.click(screen.getByRole("button", { name: "Novo item" }));
    const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
    await user.click(within(panel).getByRole("radio", { name: "Questão" }));
    expect(screen.getByRole("dialog", { name: "Nova questão" })).toBeVisible();
    // Starts with A to D; remove D, then C, and the remove buttons go away at two.
    await user.click(within(panel).getByRole("button", { name: "Remover alternativa D" }));
    await user.click(within(panel).getByRole("button", { name: "Remover alternativa C" }));
    expect(within(panel).queryByRole("button", { name: /^Remover alternativa/ })).toBeNull();
    await user.click(within(panel).getByRole("button", { name: "Adicionar alternativa" }));
    await user.type(within(panel).getByLabelText("Enunciado"), "Qual a capital?");
    await user.type(within(panel).getByLabelText("Texto da alternativa A"), "Lyon");
    await user.type(within(panel).getByLabelText("Justificativa da alternativa A"), "Não é");
    await user.type(within(panel).getByLabelText("Texto da alternativa B"), "Paris");
    await user.type(within(panel).getByLabelText("Justificativa da alternativa B"), "É a capital");
    await user.type(within(panel).getByLabelText("Texto da alternativa C"), "Nice");
    await user.type(within(panel).getByLabelText("Justificativa da alternativa C"), "Não é");
    await user.click(within(panel).getByRole("radio", { name: "Alternativa B é a correta" }));
    await user.type(within(panel).getByLabelText("Explicação"), "Paris é a capital.");
    await user.click(within(panel).getByRole("button", { name: "Salvar" }));
    expect(fake.invoke).toHaveBeenCalledWith("items:create", {
      workspaceId: 1,
      draft: {
        kind: "question",
        subtype: "multiple_choice",
        statement: "Qual a capital?",
        options: [
          { key: "A", text: "Lyon", why: "Não é" },
          { key: "B", text: "Paris", why: "É a capital" },
          { key: "C", text: "Nice", why: "Não é" },
        ],
        answer: "B",
        explanation: "Paris é a capital.",
      },
      topic: null,
      origin: "manual",
    });
    expect(await screen.findByText("Qual a capital?")).toBeVisible();
  });

  it("creates a true or false question with a verdict and no alternatives (FR-2)", async () => {
    const fake = open([entry(1)]);
    const user = userEvent.setup();
    await screen.findByRole("table", { name: "Itens" });
    await user.click(screen.getByRole("button", { name: "Novo item" }));
    const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
    await user.click(within(panel).getByRole("radio", { name: "Questão" }));
    await user.selectOptions(within(panel).getByLabelText("Tipo de questão"), "certo_errado");
    expect(within(panel).queryByLabelText("Texto da alternativa A")).toBeNull();
    await user.type(within(panel).getByLabelText("Enunciado"), "O Sol é uma estrela.");
    await user.click(within(panel).getByRole("radio", { name: "Certo" }));
    await user.type(within(panel).getByLabelText("Explicação"), "É uma estrela anã amarela.");
    await user.click(within(panel).getByRole("button", { name: "Salvar" }));
    expect(fake.invoke).toHaveBeenCalledWith(
      "items:create",
      expect.objectContaining({
        draft: {
          kind: "question",
          subtype: "certo_errado",
          statement: "O Sol é uma estrela.",
          options: [],
          answer: "C",
          explanation: "É uma estrela anã amarela.",
        },
      }),
    );
  });

  it("shows the message next to the alternative that is missing its reason (FR-2)", async () => {
    open([entry(1)]);
    const user = userEvent.setup();
    await screen.findByRole("table", { name: "Itens" });
    await user.click(screen.getByRole("button", { name: "Novo item" }));
    const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
    await user.click(within(panel).getByRole("radio", { name: "Questão" }));
    await user.type(within(panel).getByLabelText("Enunciado"), "Pergunta?");
    await user.type(within(panel).getByLabelText("Explicação"), "Porque sim.");
    await user.click(within(panel).getByRole("button", { name: "Salvar" }));
    expect(await within(panel).findByText("Informe o motivo desta alternativa.")).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Nova questão" })).toBeVisible();
  });

  it("keeps the kind and the number of alternatives to create another question", async () => {
    open([entry(1)]);
    const user = userEvent.setup();
    await screen.findByRole("table", { name: "Itens" });
    await user.click(screen.getByRole("button", { name: "Novo item" }));
    const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
    await user.click(within(panel).getByRole("radio", { name: "Questão" }));
    await user.click(within(panel).getByRole("button", { name: "Remover alternativa D" }));
    await user.type(within(panel).getByLabelText("Enunciado"), "Pergunta?");
    for (const key of ["A", "B", "C"]) {
      await user.type(within(panel).getByLabelText(`Texto da alternativa ${key}`), `T${key}`);
      await user.type(within(panel).getByLabelText(`Justificativa da alternativa ${key}`), "m");
    }
    await user.type(within(panel).getByLabelText("Explicação"), "Porque.");
    await user.click(within(panel).getByRole("button", { name: "Salvar e criar outro" }));
    expect(await within(panel).findByText("Cartão criado.")).toBeVisible();
    expect(within(panel).getByLabelText("Enunciado")).toHaveValue("");
    expect(within(panel).getByLabelText("Texto da alternativa C")).toHaveValue("");
    expect(within(panel).queryByLabelText("Texto da alternativa D")).toBeNull();
  });
  it("shows where each item came from and filters by origin (FR-19)", async () => {
    open([
      entry(1),
      entry(2, { origin: "manual", sourceTitle: "", sourcePage: null, hasPdf: false }),
      entry(3, { origin: "reader", sourceTitle: "Apostila", sourcePage: 48 }),
      entry(4, { origin: "import", sourceTitle: "", sourcePage: null, hasPdf: false }),
      entry(5, { origin: "error_note" }),
    ]);
    const user = userEvent.setup();
    const table = await screen.findByRole("table", { name: "Itens" });
    const row = (text: string) => within(table).getByText(text).closest("tr") as HTMLElement;
    expect(within(row("Pergunta 1")).getByText("Gerado")).toBeVisible();
    expect(within(row("Pergunta 1")).getByText("Micro, p. 4")).toBeVisible();
    expect(within(row("Pergunta 2")).getByText("Manual")).toBeVisible();
    expect(within(row("Pergunta 2")).getByText("sem fonte")).toBeVisible();
    expect(within(row("Pergunta 3")).getByText("Do leitor")).toBeVisible();
    expect(within(row("Pergunta 3")).getByText("Apostila, p. 48")).toBeVisible();
    expect(within(row("Pergunta 4")).getByText("Importado")).toBeVisible();
    expect(within(row("Pergunta 5")).getByText("Caderno de erros")).toBeVisible();

    await user.selectOptions(screen.getByRole("combobox", { name: "Origem" }), "manual");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("Pergunta 2")).toBeVisible();
    expect(screen.queryByText("Pergunta 1")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(within(table).getAllByRole("row")).toHaveLength(6);
    expect(screen.getByRole("combobox", { name: "Origem" })).toHaveValue("");
  });
  describe("source of a new item (FR-4)", () => {
    const material: FakeMaterial = {
      id: 1,
      title: "Micro",
      kind: "pdf",
      filename: "micro.pdf",
      status: "indexed",
      pageCount: 10,
      charCount: 100,
      ocrConfidence: null,
      jobId: 1,
      errorCode: null,
      errorDetail: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      sourceUrl: null,
      progress: null,
      chunkCount: 1,
    };
    const chunk = {
      id: 7,
      materialId: 1,
      ordinal: 0,
      page: 4,
      section: null,
      text: "A demanda cai quando o preço sobe.",
    };

    async function openPanel() {
      const fake = installFakeMind({
        workspaces: [ws],
        route: "/w/1/items",
        catalog: [entry(1)],
        materials: [material],
        chunks: [chunk],
      });
      render(<App />);
      const user = userEvent.setup();
      await screen.findByRole("table", { name: "Itens" });
      await user.click(screen.getByRole("button", { name: "Novo item" }));
      const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
      await user.type(within(panel).getByLabelText("Frente"), "O que acontece com a demanda?");
      await user.type(within(panel).getByLabelText("Verso"), "Ela cai.");
      return { fake, user, panel };
    }

    it("starts with no source and lets the item be saved without one", async () => {
      const { fake, user, panel } = await openPanel();
      expect(within(panel).getByText("sem fonte")).toBeVisible();
      await user.click(within(panel).getByRole("button", { name: "Salvar" }));
      await waitFor(() =>
        expect(fake.invoke).toHaveBeenCalledWith(
          "items:create",
          expect.not.objectContaining({ source: expect.anything() }),
        ),
      );
    });

    it("saves the item with the material, page and quote, and checks the quote first", async () => {
      const { fake, user, panel } = await openPanel();
      await user.click(within(panel).getByRole("button", { name: "Adicionar fonte" }));
      await user.selectOptions(within(panel).getByLabelText("Material da fonte"), "1");
      await user.type(within(panel).getByLabelText("Página (opcional)"), "4x");
      expect(within(panel).getByLabelText("Página (opcional)")).toHaveValue("4");
      await user.type(
        within(panel).getByLabelText("Trecho da fonte"),
        "A demanda cai quando o preço sobe.",
      );
      await user.click(within(panel).getByRole("button", { name: "Verificar trecho" }));
      expect(await within(panel).findByText("Trecho encontrado no material.")).toBeVisible();
      await user.click(within(panel).getByRole("button", { name: "Salvar" }));
      expect(fake.invoke).toHaveBeenCalledWith(
        "items:create",
        expect.objectContaining({
          source: { materialId: 1, page: 4, quote: "A demanda cai quando o preço sobe." },
        }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo cartão" })).toBeNull());
    });

    it("asks for the material and the quote before saving, and can drop the source", async () => {
      const { fake, user, panel } = await openPanel();
      await user.click(within(panel).getByRole("button", { name: "Adicionar fonte" }));
      await user.click(within(panel).getByRole("button", { name: "Salvar" }));
      expect(await within(panel).findByText("Escolha o material da fonte.")).toBeVisible();
      expect(within(panel).getByText("Informe o trecho da fonte.")).toBeVisible();
      expect(fake.invoke).not.toHaveBeenCalledWith("items:create", expect.anything());
      await user.click(within(panel).getByRole("button", { name: "Remover fonte" }));
      expect(within(panel).getByText("sem fonte")).toBeVisible();
    });

    it("warns, and stays open, when the quote is not in the material (the item is still saved)", async () => {
      const { fake, user, panel } = await openPanel();
      await user.click(within(panel).getByRole("button", { name: "Adicionar fonte" }));
      await user.selectOptions(within(panel).getByLabelText("Material da fonte"), "1");
      await user.type(within(panel).getByLabelText("Trecho da fonte"), "Texto que não está lá");
      await user.click(within(panel).getByRole("button", { name: "Verificar trecho" }));
      expect(await within(panel).findByText(/Trecho não encontrado no material/)).toBeVisible();
      await user.click(within(panel).getByRole("button", { name: "Salvar" }));
      expect(
        await within(panel).findByText(
          "Item criado, mas o trecho não está no material: sem o atalho Ver no PDF.",
        ),
      ).toBeVisible();
      expect(within(panel).getByText("sem fonte")).toBeVisible();
      expect(fake.state.catalog?.at(-1)).toMatchObject({ sourceTitle: "Micro", hasPdf: false });
    });
  });
  it("creates a card in at most five interactions, from the first click to the saved item (NFR-1)", async () => {
    const fake = open([entry(1)]);
    const user = userEvent.setup();
    await screen.findByRole("table", { name: "Itens" });
    // Every call below is one interaction of the person: a click, or a run of typing.
    let interactions = 0;
    const act = async <T,>(step: () => Promise<T>): Promise<T> => {
      interactions += 1;
      return step();
    };
    await act(() => user.click(screen.getByRole("button", { name: "Novo item" })));
    const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
    // The panel opens with the cursor in the first field, so the typing starts at once.
    expect(within(panel).getByLabelText("Frente")).toHaveFocus();
    // Each text field is followed by its "＋ Imagem" button, so the second field is two Tabs away.
    await act(() => user.keyboard("Pergunta rápida?{Tab}{Tab}Resposta rápida."));
    await act(() => user.click(within(panel).getByRole("button", { name: "Salvar" })));
    expect(interactions).toBeLessThanOrEqual(5);
    expect(interactions).toBe(3);
    expect(fake.invoke).toHaveBeenCalledWith(
      "items:create",
      expect.objectContaining({
        draft: expect.objectContaining({ front: "Pergunta rápida?", back: "Resposta rápida." }),
      }),
    );
    expect(await screen.findByText("Pergunta rápida?")).toBeVisible();
  });

  it("saves with Ctrl+Enter from any field, and puts the cursor in the statement of a question", async () => {
    const fake = open([entry(1)]);
    const user = userEvent.setup();
    await screen.findByRole("table", { name: "Itens" });
    await user.click(screen.getByRole("button", { name: "Novo item" }));
    const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
    await user.keyboard("Frente{Tab}{Tab}Verso{Control>}{Enter}{/Control}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo cartão" })).toBeNull());
    expect(fake.invoke).toHaveBeenCalledWith(
      "items:create",
      expect.objectContaining({
        draft: expect.objectContaining({ front: "Frente", back: "Verso" }),
      }),
    );
    expect(panel).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "Novo item" }));
    const again = await screen.findByRole("dialog", { name: "Novo cartão" });
    await user.click(within(again).getByRole("radio", { name: "Questão" }));
    // Choosing a question puts the cursor in its statement, ready for typing.
    expect(within(again).getByLabelText("Enunciado")).toHaveFocus();
  });
});
