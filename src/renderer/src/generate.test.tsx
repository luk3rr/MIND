/*
 * Filename: generate.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeItem, FakeMaterial, FakeRun, FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

const material: FakeMaterial = {
  id: 1,
  title: "apostila",
  kind: "pdf",
  filename: "apostila.pdf",
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
  chunkCount: 3,
};

function run(overrides: Partial<FakeRun> = {}): FakeRun {
  return {
    id: 1,
    kind: "card",
    subtype: "qa",
    materialId: 1,
    pageFrom: null,
    pageTo: null,
    topicId: null,
    model: "a/gen",
    requested: 10,
    generated: 10,
    discardedNoSource: 2,
    discardedInvalid: 0,
    discardedDuplicate: 0,
    discardedUnsupported: 0,
    approved: 0,
    approvedUnedited: 0,
    discardedReview: 0,
    costUsd: 0.0123,
    status: "done",
    discardLog: [],
    errorCode: null,
    errorDetail: null,
    jobId: 1,
    createdAt: "2026-03-01T10:00:00.000Z",
    finishedAt: "2026-03-01T10:01:00.000Z",
    progress: null,
    ...overrides,
  };
}

function item(id: number, overrides: Partial<FakeItem> = {}): FakeItem {
  return {
    id,
    runId: 1,
    kind: "card",
    subtype: "qa",
    front: `Pergunta ${id}?`,
    back: `Resposta ${id}`,
    status: "draft",
    topic: "Biologia",
    sourceTitle: "apostila",
    sourcePage: 4,
    quote: `citação exata ${id}`,
    chunkId: id,
    edited: false,
    origin: "generated",
    createdAt: "2026-03-01T10:00:00.000Z",
    approvedAt: null,
    options: [],
    answer: null,
    ...overrides,
  };
}

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route, materials: [material], ...initial });
  render(<App />);
  return fake;
}

describe("Generate page", () => {
  it("asks to import a material when none is indexed", async () => {
    open("/w/1/generate", { materials: [{ ...material, status: "importing" }] });
    expect(await screen.findByText(/Importe e aguarde a indexação/)).toBeVisible();
  });

  it("shows the estimated cost, validates and starts a run (FR-6)", async () => {
    const fake = open("/w/1/generate");
    const user = userEvent.setup();
    expect(await screen.findByText("Custo estimado: ~US$ 0.0123")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Tipo de card"), "cloze");
    const quantity = screen.getByLabelText("Quantidade");
    await user.clear(quantity);
    await user.type(quantity, "99");
    await user.click(screen.getByRole("button", { name: "Gerar cards" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Peça de 1 a 60 cards.");
    await user.clear(quantity);
    await user.type(quantity, "12");
    await user.click(screen.getByRole("button", { name: "Gerar cards" }));
    expect(await screen.findByText("Na fila")).toBeVisible();
    expect(fake.state.runs[0]).toMatchObject({ subtype: "cloze", requested: 12, materialId: 1 });
  });

  it("sends the person's instructions and the variations option with the request", async () => {
    const { invoke } = open("/w/1/generate", { items: [item(1, { status: "approved" })] });
    const user = userEvent.setup();
    const box = await screen.findByLabelText("Instruções para o modelo (opcional)");
    expect(screen.getByText(/0\/500/)).toBeVisible();
    await user.click(box);
    await user.paste("  Foque em questões de aplicação.  ");
    expect(screen.getByText(/35\/500/)).toBeVisible();
    await user.click(
      screen.getByRole("checkbox", { name: /Criar variações dos itens já aprovados/ }),
    );
    await user.click(screen.getByRole("button", { name: "Gerar cards" }));
    await screen.findByText("Na fila");
    expect(invoke).toHaveBeenCalledWith(
      "generation:start",
      expect.objectContaining({
        instructions: "Foque em questões de aplicação.",
        variations: true,
      }),
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "generation:estimate",
        expect.objectContaining({
          instructions: "Foque em questões de aplicação.",
          variations: true,
        }),
      ),
    );
  });

  it("sends neither field when they are empty", async () => {
    const { invoke } = open("/w/1/generate");
    const user = userEvent.setup();
    await screen.findByLabelText("Instruções para o modelo (opcional)");
    await user.click(screen.getByRole("button", { name: "Gerar cards" }));
    await screen.findByText("Na fila");
    const call = invoke.mock.calls.find(([channel]) => channel === "generation:start");
    expect(call?.[1]).not.toHaveProperty("instructions");
    expect(call?.[1]).not.toHaveProperty("variations");
  });

  it("shows the message when there are no approved items to vary", async () => {
    open("/w/1/generate");
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("checkbox", { name: /Criar variações dos itens já aprovados/ }),
    );
    await user.click(screen.getByRole("button", { name: "Gerar cards" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Pedido de geração inválido|variações/,
    );
  });

  it("says when the cost cannot be estimated", async () => {
    open("/w/1/generate", { estimateUsd: null });
    expect(await screen.findByText(/Custo estimado indisponível/)).toBeVisible();
  });

  it("lists runs with status, items, discards and cost, and cancels an active one", async () => {
    const fake = open("/w/1/generate", {
      runs: [run({ id: 2, status: "running", progress: 0.4, generated: 3, requested: 10 }), run()],
    });
    const user = userEvent.setup();
    expect(await screen.findByText("Gerando")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: /40%/ })).toBeVisible();
    expect(screen.getByText("Concluída")).toBeVisible();
    expect(screen.getAllByText(/2 sem fonte verificável/)).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(fake.state.runs[0]?.status).toBe("cancelled"));
  });

  it("explains why a finished run has fewer items than asked", async () => {
    open("/w/1/generate", {
      runs: [
        run({
          id: 3,
          kind: "question",
          subtype: "calculation_4",
          requested: 10,
          generated: 3,
          discardedNoSource: 1,
          discardedInvalid: 2,
          discardedDuplicate: 1,
          discardedUnsupported: 1,
          discardLog: [
            { reason: "calc_mismatch", front: "Um capital de R$ 1.000,00 rende 10%…" },
            { reason: "unsupported: gabarito errado", front: "Qual o montante?" },
            { reason: "duplicate", front: "Outra pergunta" },
            { reason: "quote_not_in_chunk", front: "Sem fonte" },
            { reason: "algum_codigo_novo", front: "Desconhecido" },
          ],
        }),
      ],
    });
    const cell = (await screen.findByText(/3\/10/)).closest("td") as HTMLElement;
    expect(cell).toHaveTextContent(
      "3/10 · 1 sem fonte verificável · 2 inválidos (formato ou conta) · 1 repetido · 1 reprovado pela revisão · o modelo devolveu 2 itens a menos",
    );
    const user = userEvent.setup();
    await user.click(within(cell).getByText("Por que não completou?"));
    const list = within(cell).getByRole("list", { name: "Itens descartados" });
    expect(
      within(list).getByText(/o gabarito não confere com a conta — “Um capital/),
    ).toBeVisible();
    expect(
      within(list).getByText(/reprovado pela revisão: gabarito errado — “Qual o montante\?”/),
    ).toBeVisible();
    expect(within(list).getByText(/já existe um item igual/)).toBeVisible();
    expect(within(list).getByText(/citação não encontrada no trecho/)).toBeVisible();
    expect(within(list).getByText(/algum_codigo_novo/)).toBeVisible();
  });

  it("shows nothing extra for a complete run and no shortfall while it still runs", async () => {
    open("/w/1/generate", {
      runs: [
        run({ id: 4, requested: 20, generated: 20, discardedNoSource: 0, discardLog: [] }),
        run({
          id: 5,
          status: "running",
          progress: 0.2,
          requested: 10,
          generated: 2,
          discardedNoSource: 0,
        }),
      ],
    });
    await screen.findByText("20/20");
    expect(screen.queryByText(/o modelo devolveu/)).not.toBeInTheDocument();
    expect(screen.queryByText("Por que não completou?")).not.toBeInTheDocument();
  });

  it("opens the review of a finished run", async () => {
    open("/w/1/generate", { runs: [run()], items: [item(1)] });
    await userEvent.setup().click(await screen.findByRole("button", { name: "Revisar" }));
    expect(await screen.findByRole("heading", { name: "Revisar itens gerados" })).toBeVisible();
    expect(screen.getByText("Pergunta 1?")).toBeVisible();
  });
});

describe("Review page", () => {
  it("shows each draft with its supporting quote (FR-8)", async () => {
    open("/w/1/generate/1", { runs: [run()], items: [item(1), item(2)] });
    expect(await screen.findByText("Pergunta 1?")).toBeVisible();
    expect(screen.getByText(/citação exata 1/)).toBeVisible();
    expect(screen.getAllByText(/Fonte: apostila, pág\. 4/)).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "Rascunhos (2)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("approves, discards and moves items between the tabs", async () => {
    const fake = open("/w/1/generate/1", { runs: [run()], items: [item(1), item(2), item(3)] });
    const user = userEvent.setup();
    await screen.findByText("Pergunta 1?");
    const first = screen.getByText("Pergunta 1?").closest("article") as HTMLElement;
    await user.click(within(first).getByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(screen.queryByText("Pergunta 1?")).toBeNull());
    const second = screen.getByText("Pergunta 2?").closest("article") as HTMLElement;
    await user.click(within(second).getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(screen.queryByText("Pergunta 2?")).toBeNull());
    expect(fake.state.items.map((i) => i.status)).toEqual(["approved", "discarded", "draft"]);
    await user.click(screen.getByRole("tab", { name: "Aprovados (1)" }));
    expect(await screen.findByText("Pergunta 1?")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Descartados (1)" }));
    expect(await screen.findByText("Pergunta 2?")).toBeVisible();
  });

  it("approves every draft at once", async () => {
    const fake = open("/w/1/generate/1", { runs: [run()], items: [item(1), item(2)] });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Aprovar todos" }));
    await waitFor(() => expect(fake.state.items.every((i) => i.status === "approved")).toBe(true));
    expect(await screen.findByText("Nada aqui.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Aprovar todos" })).toBeNull();
  });

  it("edits an item and shows validation errors", async () => {
    const fake = open("/w/1/generate/1", { runs: [run()], items: [item(1)] });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Editar" }));
    const dialog = screen.getByRole("dialog", { name: "Editar" });
    const front = within(dialog).getByLabelText("Frente");
    await user.clear(front);
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("frente do card");
    await user.type(front, "Pergunta nova?");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Pergunta nova?")).toBeVisible();
    expect(screen.getByText(/editado/)).toBeVisible();
    expect(fake.state.items[0]).toMatchObject({ front: "Pergunta nova?", edited: true });
  });

  it("renders formulas and shows cloze gaps as [term]", async () => {
    open("/w/1/generate/1", {
      runs: [run({ subtype: "cloze" })],
      items: [
        item(1, { subtype: "cloze", front: "A {{c1::mitocôndria}} produz $E=mc^2$.", back: "" }),
      ],
    });
    const card = (await screen.findByText(/A \[mitocôndria\] produz/)).closest(
      "article",
    ) as HTMLElement;
    expect(card.querySelector(".katex")).not.toBeNull();
  });

  it("reports an unknown run", async () => {
    open("/w/1/generate/9", { runs: [] });
    expect(await screen.findByRole("alert")).toHaveTextContent("Geração não encontrada.");
  });
});
