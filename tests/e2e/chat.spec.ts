/*
 * Filename: chat.spec.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXECUTABLE, launch, newProfile, removeProfile } from "./launch.js";
import type { Launched } from "./launch.js";

// The scripted provider and the model-free embedder only exist in the unpackaged app.
test.skip(Boolean(EXECUTABLE), "uses the offline scripted provider of the unpackaged app");

let current: Launched | undefined;
const profiles: string[] = [];

function profile(): string {
  const path = newProfile();
  profiles.push(path);
  return path;
}

test.afterEach(async () => {
  await current?.app.close().catch(() => undefined);
  current = undefined;
});

test.afterAll(() => {
  profiles.splice(0).forEach(removeProfile);
});

const TEXT = [
  "# Biologia",
  "",
  "A fotossíntese converte a energia da luz em energia química nos cloroplastos das plantas verdes.",
  "",
  "A respiração celular libera energia armazenada nas moléculas de glicose dentro das mitocôndrias.",
].join("\n");

test("answers from the material with a citation and opens the source (FR-18)", async () => {
  current = await launch(profile(), { MIND_E2E_FAKE_LLM: "1" });
  const { page, app } = current;
  const notes = join(profile(), "bio.md");
  writeFileSync(notes, TEXT);
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Estudo");
  await page.getByRole("button", { name: "Criar" }).click();
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
    },
    [notes],
  );
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Importar arquivo" }).click();
  await expect(page.getByRole("table").getByText("Indexado")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Chat com a base" })).toBeVisible();
  await page.getByLabel("Sua pergunta").fill("Onde ocorre a fotossíntese nas plantas?");
  await page.getByRole("button", { name: "Perguntar" }).click();
  await expect(page.getByText(/Segundo o material/)).toBeVisible();
  await expect(page.locator("blockquote.source").first()).toContainText("fotossíntese");
  await page.getByRole("button", { name: /Abrir trecho: bio/ }).click();
  await expect(page.getByRole("heading", { name: /bio/ })).toBeVisible();

  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page.getByLabel("Sua pergunta").fill("Xilofone zeppelin?");
  await page.getByRole("button", { name: "Perguntar" }).click();
  await expect(page.getByRole("note")).toContainText("Sem suporte no material");
  expect(
    await page.evaluate(() => window.mind.invoke("chat:history", { workspaceId: 1 })),
  ).toMatchObject({ ok: true, data: { messages: [{ supported: true }, { supported: false }] } });
});

test("enables the semantic search, downloads the model and keeps answering (FR-18)", async () => {
  current = await launch(profile(), { MIND_E2E_FAKE_LLM: "1" });
  const { page, app } = current;
  const notes = join(profile(), "bio.md");
  writeFileSync(notes, TEXT);
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Estudo");
  await page.getByRole("button", { name: "Criar" }).click();
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
    },
    [notes],
  );
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Importar arquivo" }).click();
  await expect(page.getByRole("table").getByText("Indexado")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByText("Desativada")).toBeVisible();
  await page.getByRole("button", { name: "Ativar" }).click();
  await expect(page.getByRole("dialog")).toContainText("130 MB");
  await page.getByRole("dialog").getByRole("button", { name: "Ativar" }).click();
  await expect(page.getByText("Ativada")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/\d+ de \d+ trechos vetorizados/)).toBeVisible();
  await page.getByLabel("Sua pergunta").fill("Como as mitocôndrias liberam energia?");
  await page.getByRole("button", { name: "Perguntar" }).click();
  await expect(page.getByText(/Segundo o material/)).toBeVisible();
});

// Needs the network (downloads about 130 MB) and a few minutes: run it on purpose with
// `MIND_E2E_REAL_EMBEDDINGS=1 pnpm exec playwright test tests/e2e/chat.spec.ts -g "real model"`.
test("real model: downloads, vectorizes and finds a chunk by meaning (FR-18)", async () => {
  test.skip(process.env["MIND_E2E_REAL_EMBEDDINGS"] !== "1", "downloads the real model");
  test.setTimeout(600_000);
  current = await launch(profile(), { MIND_E2E_FAKE_LLM: "1", MIND_E2E_REAL_EMBEDDINGS: "1" });
  const { page, app } = current;
  const notes = join(profile(), "bio.md");
  writeFileSync(notes, TEXT);
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Estudo");
  await page.getByRole("button", { name: "Criar" }).click();
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
    },
    [notes],
  );
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Importar arquivo" }).click();
  await expect(page.getByRole("table").getByText("Indexado")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page.getByRole("button", { name: "Ativar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ativar" }).click();
  await expect(page.getByText("1 de 1 trechos vetorizados")).toBeVisible({ timeout: 540_000 });
  // No word in common with the text: only the meaning connects them.
  await page.getByLabel("Sua pergunta").fill("Como as plantas transformam luz solar em alimento?");
  await page.getByRole("button", { name: "Perguntar" }).click();
  await expect(page.getByText(/Segundo o material: A fotossíntese/)).toBeVisible({
    timeout: 60_000,
  });
});
