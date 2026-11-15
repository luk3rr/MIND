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
import type { FakeState } from "../test/fake-mind.js";
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
});
