/*
 * Filename: reader-crop.test.tsx
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeItem, FakeState } from "../test/fake-mind.js";
import { openReader, READER_LINE } from "../test/reader-fixture.js";
import { rectBetween } from "./components/CropOverlay.js";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("rectBetween", () => {
  it("orders the corners, clamps to the page and ignores a click", () => {
    expect(rectBetween({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 })).toEqual({
      x: 0.2,
      y: 0.1,
      width: expect.closeTo(0.4),
      height: expect.closeTo(0.4),
    });
    expect(rectBetween({ x: -1, y: -1 }, { x: 2, y: 2 })).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    expect(rectBetween({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 })).toBeNull();
    expect(rectBetween({ x: 0.1, y: 0.1 }, { x: 0.105, y: 0.9 })).toBeNull();
  });
});

const item = (overrides: Partial<FakeItem> = {}): FakeItem => ({
  id: 7,
  runId: 1,
  kind: "card",
  subtype: "qa",
  front: "Pergunta existente",
  back: "Resposta",
  status: "approved",
  topic: "Física",
  sourceTitle: "apostila",
  sourcePage: 1,
  quote: "q",
  chunkId: 1,
  edited: false,
  origin: "manual",
  createdAt: "x",
  approvedAt: "x",
  options: [],
  answer: null,
  images: { front: [{ hash: "d".repeat(64) }] },
  ...overrides,
});

const catalogOf = (entry: FakeItem): NonNullable<FakeState["catalog"]>[number] => ({
  id: entry.id,
  kind: entry.kind,
  subtype: entry.subtype,
  front: entry.front,
  back: entry.back,
  status: entry.status,
  topicId: null,
  topic: entry.topic,
  materialId: 4,
  material: "apostila",
  edited: false,
  createdAt: "x",
  origin: entry.origin,
  sourceTitle: entry.sourceTitle,
  sourcePage: entry.sourcePage,
  hasPdf: true,
});

/** Drags a rectangle over the page: from (20%, 10%) to (70%, 40%) of a 200 x 400 area. */
async function drag(): Promise<void> {
  const layer = await screen.findByRole("application", {
    name: "Arraste sobre a página para recortar uma figura",
  });
  vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 400,
    right: 200,
    bottom: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  fireEvent.pointerDown(layer, { clientX: 40, clientY: 40, button: 0, pointerId: 1 });
  fireEvent.pointerMove(layer, { clientX: 100, clientY: 100, pointerId: 1 });
  expect(layer.querySelector(".reader-crop-box")).not.toBeNull();
  fireEvent.pointerUp(layer, { clientX: 140, clientY: 160, pointerId: 1 });
}

describe("Cutting a figure from the page (FR-12)", () => {
  it("has no cutting layer until the mode is turned on, and the text can be selected until then", async () => {
    await openReader();
    await screen.findByText(READER_LINE);
    expect(screen.queryByRole("application")).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Recortar figura" }));
    expect(screen.getByRole("button", { name: "Recortar figura" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await screen.findByRole("application")).toBeVisible();
    expect(
      screen.getByText("Arraste sobre a página para escolher a região da figura."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Recortar figura" }));
    expect(screen.queryByRole("application")).toBeNull();
  });

  it("asks the core for the rectangle in fractions of the page and shows the picture", async () => {
    const fake = await openReader();
    const user = userEvent.setup();
    await screen.findByText(READER_LINE);
    await user.click(screen.getByRole("button", { name: "Recortar figura" }));
    await drag();
    const panel = await screen.findByRole("dialog", { name: "Recorte da página 1" });
    await within(panel).findByRole("img", { name: "Imagem do item" });
    expect(fake.state.images.crops).toEqual([
      {
        workspaceId: 1,
        materialId: 4,
        page: 1,
        rect: {
          x: expect.closeTo(0.2),
          y: expect.closeTo(0.1),
          width: expect.closeTo(0.5),
          height: expect.closeTo(0.3),
        },
      },
    ]);
  });

  it("opens a new card with the figure on its front, with the caption given", async () => {
    const fake = await openReader();
    const user = userEvent.setup();
    await screen.findByText(READER_LINE);
    await user.click(screen.getByRole("button", { name: "Recortar figura" }));
    await drag();
    const panel = await screen.findByRole("dialog", { name: "Recorte da página 1" });
    await user.type(
      await within(panel).findByLabelText("Texto alternativo ou legenda (opcional)"),
      "Circuito",
    );
    await user.click(within(panel).getByRole("button", { name: "Novo card…" }));
    const editor = await screen.findByRole("dialog", { name: "Novo cartão" });
    expect(within(editor).getByLabelText("Texto alternativo da imagem 1")).toHaveValue("Circuito");
    await user.type(within(editor).getByLabelText("Frente"), "Qual o circuito?");
    await user.type(within(editor).getByLabelText("Verso"), "Em série.");
    await user.click(within(editor).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith(
        "items:create",
        expect.objectContaining({
          origin: "reader",
          draft: expect.objectContaining({
            kind: "card",
            images: { front: [{ hash: "501".padStart(64, "0"), alt: "Circuito" }] },
          }),
        }),
      ),
    );
  });

  it("opens a new question with the figure on its statement", async () => {
    await openReader();
    const user = userEvent.setup();
    await screen.findByText(READER_LINE);
    await user.click(screen.getByRole("button", { name: "Recortar figura" }));
    await drag();
    const panel = await screen.findByRole("dialog", { name: "Recorte da página 1" });
    await within(panel).findByRole("img", { name: "Imagem do item" });
    await user.click(within(panel).getByRole("button", { name: "Nova questão…" }));
    const editor = await screen.findByRole("dialog", { name: "Nova questão" });
    expect(within(editor).getByLabelText("Texto alternativo da imagem 1")).toBeVisible();
  });

  it("attaches the figure to a field of an item that already exists, keeping its other pictures", async () => {
    const existing = item();
    const fake = await openReader([READER_LINE], {
      items: [existing],
      catalog: [catalogOf(existing)],
    });
    const user = userEvent.setup();
    await screen.findByText(READER_LINE);
    await user.click(screen.getByRole("button", { name: "Recortar figura" }));
    await drag();
    const panel = await screen.findByRole("dialog", { name: "Recorte da página 1" });
    await within(panel).findByRole("img", { name: "Imagem do item" });
    await user.click(within(panel).getByRole("button", { name: "Anexar a um item…" }));
    const dialog = await screen.findByRole("dialog", { name: "Anexar a um item" });
    await user.selectOptions(await within(dialog).findByLabelText("Item"), "7");
    await user.selectOptions(await within(dialog).findByLabelText("Campo"), "back");
    await user.click(within(dialog).getByRole("button", { name: "Anexar" }));
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith(
        "review:edit",
        expect.objectContaining({
          itemId: 7,
          images: {
            front: [{ hash: "d".repeat(64) }],
            back: [{ hash: "501".padStart(64, "0") }],
          },
        }),
      ),
    );
    expect(await screen.findByText("Imagem anexada ao item.")).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Anexar a um item" })).toBeNull();
  });

  it("offers the alternatives of a question as fields and shows when there are no items", async () => {
    const question = item({
      id: 8,
      kind: "question",
      subtype: "multiple_choice",
      options: [
        { key: "A", text: "um", why: "x" },
        { key: "B", text: "dois", why: "y" },
      ],
      answer: "A",
      images: {},
    });
    await openReader([READER_LINE], { items: [question], catalog: [catalogOf(question)] });
    const user = userEvent.setup();
    await screen.findByText(READER_LINE);
    await user.click(screen.getByRole("button", { name: "Recortar figura" }));
    await drag();
    const panel = await screen.findByRole("dialog", { name: "Recorte da página 1" });
    await within(panel).findByRole("img", { name: "Imagem do item" });
    await user.click(within(panel).getByRole("button", { name: "Anexar a um item…" }));
    const dialog = await screen.findByRole("dialog", { name: "Anexar a um item" });
    await user.selectOptions(await within(dialog).findByLabelText("Item"), "8");
    const field = await within(dialog).findByLabelText("Campo");
    expect(
      within(field)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Enunciado", "Alternativa A", "Alternativa B", "Comentário"]);
  });

  it("shows why the figure could not be cut and can be closed", async () => {
    const fake = await openReader();
    fake.state.reader.failure = {
      code: "FILE_MISSING",
      message: "O arquivo original não está mais no disco.",
    };
    const user = userEvent.setup();
    await screen.findByText(READER_LINE).catch(() => undefined);
    await user.click(screen.getByRole("button", { name: "Recortar figura" }));
    await drag();
    expect(await screen.findByText("O arquivo original não está mais no disco.")).toBeVisible();
  });
});
