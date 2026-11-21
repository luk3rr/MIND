/*
 * Filename: import-zip.test.tsx
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

beforeEach(() => window.localStorage.clear());

type Rows = NonNullable<NonNullable<FakeState["importFile"]>["rows"]>;
const line = (n: number, extra: Partial<Rows[number]> = {}): Rows[number] => ({
  line: n,
  status: "valid",
  text: `Pergunta ${n}?`,
  topic: null,
  topicIsNew: false,
  problem: null,
  ...extra,
});

async function openDialog() {
  const fake = installFakeMind({ workspaces: [ws], route: "/w/1/items", catalog: [] });
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Importar…" }));
  const dialog = await screen.findByRole("dialog", { name: "Importar itens" });
  return { fake, user, dialog };
}

describe("Importing a .zip with pictures (FR-15, US-6)", () => {
  it("tells how to name the pictures and that a .zip is accepted", async () => {
    const { dialog } = await openDialog();
    expect(within(dialog).getByText(/ou um \.zip com a planilha e as imagens/)).toBeVisible();
    expect(within(dialog).getByText(/colunas imagem_frente e imagem_verso/)).toBeVisible();
  });

  it("shows how many pictures were linked and warns on the row that lost one", async () => {
    const { fake, user, dialog } = await openDialog();
    fake.state.importFile = {
      fileName: "pacote.zip",
      rows: [
        line(2),
        line(3, {
          warning: "A imagem “fig-03.png” não está no .zip. A linha entra sem elas.",
        }),
      ],
      zip: { images: 18, missingImages: 1 },
    };
    await user.click(within(dialog).getByRole("button", { name: "Escolher arquivo…" }));
    await screen.findByText("2 Prévia");
    const preview = screen.getByRole("dialog", { name: "Importar itens" });
    expect(within(preview).getByText("18 imagem(ns) ligada(s) · 1 faltando")).toBeVisible();
    const warned = within(preview).getByRole("note");
    expect(warned).toHaveTextContent("“fig-03.png” não está no .zip");
    await user.click(within(preview).getByRole("button", { name: /Importar 2/ }));
    expect(await screen.findByText(/18 imagem\(ns\) guardada\(s\) com os itens\./)).toBeVisible();
  });

  it("shows nothing about pictures for a plain spreadsheet", async () => {
    const { fake, user, dialog } = await openDialog();
    fake.state.importFile = { rows: [line(2)] };
    await user.click(within(dialog).getByRole("button", { name: "Escolher arquivo…" }));
    await screen.findByText("2 Prévia");
    const preview = screen.getByRole("dialog", { name: "Importar itens" });
    expect(within(preview).queryByText(/imagem\(ns\) ligada/)).toBeNull();
    expect(within(preview).queryByRole("note")).toBeNull();
  });
});
