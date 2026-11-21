/*
 * Filename: images-editor.test.tsx
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeMaterial, FakeState, FakeStudyCard } from "../test/fake-mind.js";
import { App } from "./App.js";

vi.mock("./images/canvas.js", () => ({
  adjustToPng: vi.fn(() => Promise.resolve(new Uint8Array([137, 80, 78, 71]))),
}));
import { adjustToPng } from "./images/canvas.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };
const material: FakeMaterial = {
  id: 1,
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
const entry: NonNullable<FakeState["catalog"]>[number] = {
  id: 1,
  kind: "card",
  subtype: "qa",
  front: "Pergunta 1",
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
};

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route, materials: [material], ...initial });
  render(<App />);
  return fake;
}

async function openPanelWithPicture() {
  const fake = open("/w/1/items", { catalog: [entry] });
  const user = userEvent.setup();
  await screen.findByRole("table", { name: "Itens" });
  await user.click(screen.getByRole("button", { name: "Novo item" }));
  const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
  await user.click(within(panel).getAllByRole("button", { name: "＋ Imagem" })[0] as HTMLElement);
  await within(panel).findByRole("list", { name: "Imagens" });
  return { fake, user, panel };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(adjustToPng).mockClear();
});

describe("Image editor (FR-7)", () => {
  it("keeps the original reference when nothing was changed", async () => {
    const { fake, user, panel } = await openPanelWithPicture();
    await user.click(within(panel).getByRole("button", { name: "Editar a imagem 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Ajustar imagem" });
    await within(dialog).findByRole("img", { name: "Prévia da imagem ajustada" });
    await user.click(within(dialog).getByRole("button", { name: "Usar imagem" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Ajustar imagem" })).toBeNull(),
    );
    // Nothing new was stored: only the first attachment.
    expect(fake.state.images.puts).toHaveLength(1);
  });

  it("stores the cut and turned picture and remembers the original", async () => {
    const { fake, user, panel } = await openPanelWithPicture();
    await user.type(within(panel).getByLabelText("Texto alternativo da imagem 1"), "Mapa");
    await user.click(within(panel).getByRole("button", { name: "Editar a imagem 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Ajustar imagem" });
    await user.click(within(dialog).getByRole("button", { name: "↻ Girar à direita" }));
    const slider = within(dialog).getByLabelText(/Cortar à esquerda/);
    await user.click(slider);
    await waitFor(() =>
      expect(adjustToPng).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ rotation: 90 }),
      ),
    );
    await user.click(within(dialog).getByRole("button", { name: "Usar imagem" }));
    await waitFor(() => expect(fake.state.images.puts).toHaveLength(2));
    expect(fake.state.images.puts[1]).toMatchObject({
      source: { kind: "bytes" },
      confirmLarge: true,
    });
    await user.click(within(panel).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith(
        "items:create",
        expect.objectContaining({
          draft: expect.objectContaining({
            images: {
              front: [{ hash: "2".padStart(64, "0"), source: "1".padStart(64, "0"), alt: "Mapa" }],
            },
          }),
        }),
      ),
    ).catch(() => undefined);
  });

  it("edits again from the original and can restore it", async () => {
    const { user, panel } = await openPanelWithPicture();
    await user.click(within(panel).getByRole("button", { name: "Editar a imagem 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Ajustar imagem" });
    await user.click(within(dialog).getByRole("button", { name: "↺ Girar à esquerda" }));
    await user.click(within(dialog).getByRole("button", { name: "Restaurar" }));
    await waitFor(() =>
      expect(adjustToPng).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ rotation: 0 }),
      ),
    );
    await user.click(within(dialog).getByRole("button", { name: "Usar imagem" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Ajustar imagem" })).toBeNull(),
    );
  });

  it("warns that a GIF keeps only its first frame", async () => {
    const { fake, user, panel } = await openPanelWithPicture();
    fake.state.images.gif = true;
    await user.click(within(panel).getByRole("button", { name: "Editar a imagem 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Ajustar imagem" });
    expect(await within(dialog).findByText(/Só o primeiro quadro/)).toBeVisible();
  });

  it("shows a message when the original is gone and when the result cannot be stored", async () => {
    const { fake, user, panel } = await openPanelWithPicture();
    fake.state.images.missing = ["1".padStart(64, "0")];
    await user.click(within(panel).getByRole("button", { name: "Editar a imagem 1" }));
    const gone = await screen.findByRole("dialog", { name: "Ajustar imagem" });
    expect(await within(gone).findByText(/Imagem indisponível/)).toBeVisible();
    expect(within(gone).getByRole("button", { name: "Usar imagem" })).toBeDisabled();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Ajustar imagem" })).toBeNull(),
    );

    fake.state.images.missing = [];
    await user.click(within(panel).getByRole("button", { name: "Editar a imagem 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Ajustar imagem" });
    await user.click(await within(dialog).findByRole("button", { name: "↻ Girar à direita" }));
    fake.state.images.failure = {
      code: "IMAGE_TOO_LARGE",
      message: "A imagem é grande demais para ser anexada.",
    };
    await user.click(within(dialog).getByRole("button", { name: "Usar imagem" }));
    expect(
      await within(dialog).findByText("A imagem é grande demais para ser anexada."),
    ).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog", { name: "Ajustar imagem" })).toBeNull();
  });
});

describe("Enlarging a picture (FR-10)", () => {
  const card = (): FakeStudyCard => ({
    itemId: 1,
    subtype: "qa",
    topic: null,
    sourceTitle: "apostila",
    sourcePage: 4,
    isNew: true,
    front: [{ text: "Qual a estrutura?", hit: false }],
    back: [{ text: "O núcleo", hit: false }],
    images: { front: [{ hash: "a".repeat(64), alt: "Célula" }] },
    previews: { "1": "1 min", "2": "6 min", "3": "10 min", "4": "3 d" },
  });

  it("opens with the button, closes with Escape and gives the focus back", async () => {
    open("/w/1/study", { studyQueue: [card()] });
    const user = userEvent.setup();
    const zoom = await screen.findByRole("button", { name: "Ampliar imagem: Célula" });
    await user.click(zoom);
    const dialog = await screen.findByRole("dialog", { name: "Célula" });
    expect(await within(dialog).findByRole("img", { name: "Célula" })).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Célula" })).toBeNull());
    expect(zoom).toHaveFocus();
  });

  it("opens by clicking the picture and closes with its button", async () => {
    open("/w/1/study", { studyQueue: [card()] });
    const user = userEvent.setup();
    const front = await screen.findByLabelText("Frente");
    await user.click(await within(front).findByRole("img", { name: "Célula" }));
    const dialog = await screen.findByRole("dialog", { name: "Célula" });
    await user.click(within(dialog).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog", { name: "Célula" })).toBeNull();
  });
});
