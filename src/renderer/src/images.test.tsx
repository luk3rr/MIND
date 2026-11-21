/*
 * Filename: images.test.tsx
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeMaterial, FakeState, FakeStudyCard } from "../test/fake-mind.js";
import { App } from "./App.js";

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

const HASH = "a".repeat(64);

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

function card(overrides: Partial<FakeStudyCard> = {}): FakeStudyCard {
  return {
    itemId: 1,
    subtype: "qa",
    topic: "Biologia",
    sourceTitle: "apostila",
    sourcePage: 4,
    isNew: true,
    front: [{ text: "Qual a estrutura indicada?", hit: false }],
    back: [{ text: "O núcleo", hit: false }],
    previews: { "1": "1 min", "2": "6 min", "3": "10 min", "4": "3 d" },
    ...overrides,
  };
}

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route, materials: [material], ...initial });
  render(<App />);
  return fake;
}

const png = (name = "figura.png", type = "image/png") =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type });

async function openEditor() {
  const user = userEvent.setup();
  await screen.findByRole("table", { name: "Itens" });
  await user.click(screen.getByRole("button", { name: "Novo item" }));
  const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
  return { user, panel };
}

beforeEach(() => window.localStorage.clear());

describe("Attaching a picture to the front of a card (FR-1, FR-4, FR-5)", () => {
  it("attaches with the button through the native dialog and saves the reference", async () => {
    const fake = open("/w/1/items", { catalog: [entry] });
    const { user, panel } = await openEditor();
    await user.type(within(panel).getByLabelText("Frente"), "Qual estrutura?");
    await user.type(within(panel).getByLabelText("Verso"), "Núcleo");
    await user.click(within(panel).getAllByRole("button", { name: "＋ Imagem" })[0] as HTMLElement);
    expect(fake.invoke).toHaveBeenCalledWith("image:put", {
      workspaceId: 1,
      source: { kind: "dialog" },
    });
    expect(await within(panel).findByRole("list", { name: "Imagens" })).toBeVisible();
    await user.click(within(panel).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith("items:create", {
        workspaceId: 1,
        draft: {
          kind: "card",
          subtype: "qa",
          front: "Qual estrutura?",
          back: "Núcleo",
          images: { front: [{ hash: "1".padStart(64, "0") }] },
        },
        topic: null,
        origin: "manual",
      }),
    );
  });

  it("attaches a picture pasted into the field and does not paste its name as text", async () => {
    const fake = open("/w/1/items", { catalog: [entry] });
    const { panel } = await openEditor();
    const front = within(panel).getByLabelText("Frente");
    fireEvent.paste(front, { clipboardData: { files: [png()], types: ["Files"] } });
    await waitFor(() => expect(fake.state.images.puts).toHaveLength(1));
    expect(fake.state.images.puts[0]).toMatchObject({
      workspaceId: 1,
      source: { kind: "bytes", bytes: expect.any(Uint8Array) },
    });
    expect(front).toHaveValue("");
  });

  it("ignores a paste that has only text", async () => {
    const fake = open("/w/1/items", { catalog: [entry] });
    const { panel } = await openEditor();
    fireEvent.paste(within(panel).getByLabelText("Frente"), {
      clipboardData: { files: [], types: ["text/plain"], getData: () => "texto" },
    });
    expect(fake.state.images.puts).toHaveLength(0);
  });

  it("attaches a file dropped on the field", async () => {
    const fake = open("/w/1/items", { catalog: [entry] });
    const { panel } = await openEditor();
    const front = within(panel).getByLabelText("Frente");
    fireEvent.dragOver(front, { dataTransfer: { types: ["Files"], files: [png()] } });
    fireEvent.drop(front, { dataTransfer: { types: ["Files"], files: [png()] } });
    await waitFor(() => expect(fake.state.images.puts).toHaveLength(1));
    expect(await within(panel).findByRole("list", { name: "Imagens" })).toBeVisible();
  });

  it("refuses a dropped file that is not an image without asking the core", async () => {
    const fake = open("/w/1/items", { catalog: [entry] });
    const { panel } = await openEditor();
    const text = new File(["x"], "notas.txt", { type: "text/plain" });
    fireEvent.drop(within(panel).getByLabelText("Frente"), {
      dataTransfer: { types: ["Files"], files: [text] },
    });
    expect(await within(panel).findByText("Este arquivo não é uma imagem.")).toBeVisible();
    expect(fake.state.images.puts).toHaveLength(0);
  });

  it("shows the message of a refused file and keeps the field as it was (FR-4)", async () => {
    const fake = open("/w/1/items", { catalog: [entry] });
    fake.state.images.failure = {
      code: "IMAGE_UNSUPPORTED",
      message: "Este formato de imagem não é aceito. Use PNG, JPEG, WebP ou GIF.",
    };
    const { user, panel } = await openEditor();
    await user.click(within(panel).getAllByRole("button", { name: "＋ Imagem" })[0] as HTMLElement);
    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "Este formato de imagem não é aceito",
    );
    expect(within(panel).queryByRole("list", { name: "Imagens" })).toBeNull();
  });

  it("warns about a large pasted file and sends it again only when the person accepts (FR-5)", async () => {
    const fake = open("/w/1/items", { catalog: [entry] });
    fake.state.images.next = {
      cancelled: false,
      stored: false,
      ref: null,
      info: {
        mime: "image/png",
        bytes: 30 * 1024 * 1024,
        width: 4000,
        height: 3000,
        animated: false,
      },
      warning: "LARGE_FILE",
      token: null,
    };
    const { user, panel } = await openEditor();
    fireEvent.paste(within(panel).getByLabelText("Frente"), {
      clipboardData: { files: [png()], types: ["Files"] },
    });
    expect(await within(panel).findByText(/Arquivo de 30 MB/)).toBeVisible();
    fake.state.images.next = null;
    await user.click(within(panel).getByRole("button", { name: "Anexar mesmo assim" }));
    await waitFor(() => expect(fake.state.images.puts).toHaveLength(2));
    expect(fake.state.images.puts[1]).toMatchObject({ confirmLarge: true });
    expect(await within(panel).findByRole("list", { name: "Imagens" })).toBeVisible();
  });

  it("confirms a large file chosen in the dialog by its token", async () => {
    const fake = open("/w/1/items", { catalog: [entry] });
    fake.state.images.next = {
      cancelled: false,
      stored: false,
      ref: null,
      info: {
        mime: "image/png",
        bytes: 25 * 1024 * 1024,
        width: 4000,
        height: 3000,
        animated: false,
      },
      warning: "LARGE_FILE",
      token: "large-1",
    };
    const { user, panel } = await openEditor();
    await user.click(within(panel).getAllByRole("button", { name: "＋ Imagem" })[0] as HTMLElement);
    fake.state.images.next = null;
    await user.click(await within(panel).findByRole("button", { name: "Anexar mesmo assim" }));
    await waitFor(() => expect(fake.state.images.puts).toHaveLength(2));
    expect(fake.state.images.puts[1]).toMatchObject({
      source: { kind: "confirm", token: "large-1" },
    });
  });

  it("removes an attached picture", async () => {
    open("/w/1/items", { catalog: [entry] });
    const { user, panel } = await openEditor();
    await user.click(within(panel).getAllByRole("button", { name: "＋ Imagem" })[0] as HTMLElement);
    await within(panel).findByRole("list", { name: "Imagens" });
    await user.click(within(panel).getByRole("button", { name: "Remover a imagem 1" }));
    expect(within(panel).queryByRole("list", { name: "Imagens" })).toBeNull();
  });
});

describe("Study shows the pictures of a card (FR-9)", () => {
  it("shows the front picture with its description and the back one after revealing", async () => {
    open("/w/1/study", {
      studyQueue: [
        card({
          images: {
            front: [{ hash: HASH, alt: "Célula com seta" }],
            back: [{ hash: "b".repeat(64) }],
          },
        }),
      ],
    });
    const user = userEvent.setup();
    const front = await screen.findByLabelText("Frente");
    expect(await within(front).findByRole("img", { name: "Célula com seta" })).toBeVisible();
    expect(screen.queryByLabelText("Verso")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Mostrar resposta/ }));
    const back = await screen.findByLabelText("Verso");
    expect(await within(back).findByRole("img", { name: "Imagem do item" })).toBeVisible();
  });

  it("keeps the card usable when the file of a picture is gone", async () => {
    const fake = open("/w/1/study", {
      studyQueue: [card({ images: { front: [{ hash: HASH, alt: "Célula com seta" }] } })],
    });
    fake.state.images.missing = [HASH];
    const front = await screen.findByLabelText("Frente");
    expect(await within(front).findByText(/Imagem indisponível/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Mostrar resposta/ })).toBeEnabled();
  });

  it("shows a card without pictures as before", async () => {
    open("/w/1/study", { studyQueue: [card()] });
    const front = await screen.findByLabelText("Frente");
    expect(within(front).queryByRole("img")).toBeNull();
  });
});
