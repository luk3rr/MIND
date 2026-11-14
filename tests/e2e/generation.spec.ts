/*
 * Filename: generation.spec.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXECUTABLE, launch, newProfile, removeProfile } from "./launch.js";
import type { Launched } from "./launch.js";

// The scripted provider only exists in the unpackaged app, so these tests skip against a package.
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
  "",
  "O ciclo de Calvin fixa o dióxido de carbono em açúcares usando ATP e NADPH produzidos antes.",
].join("\n");

test("generates cards with their source, reviews them and approves (FR-6, FR-7, FR-8)", async () => {
  current = await launch(profile(), { MIND_E2E_FAKE_LLM: "1" });
  const { page, app } = current;
  const notes = join(profile(), "bio.md");
  writeFileSync(notes, TEXT);
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Geração");
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

  await page.getByRole("button", { name: "Gerar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Gerar" })).toBeVisible();
  await expect(page.getByText(/Custo estimado/)).toBeVisible();
  await page.getByLabel("Quantidade").fill("6");
  await page.getByRole("button", { name: "Gerar cards" }).click();
  await expect(page.getByText("Concluída")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("row", { name: /Concluída/ })).toContainText("6/6");

  await page.getByRole("button", { name: "Revisar" }).click();
  await expect(page.getByRole("heading", { name: "Revisar itens gerados" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Rascunhos (6)" })).toBeVisible();
  await expect(page.getByText(/Fonte: bio/).first()).toBeVisible();
  await expect(page.locator("blockquote").first()).toContainText("“");

  const first = page.locator("article").first();
  await first.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Verso").fill("Resposta revisada");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Resposta revisada")).toBeVisible();
  await page.locator("article").first().getByRole("button", { name: "Aprovar" }).click();
  await expect(page.getByRole("tab", { name: "Rascunhos (5)" })).toBeVisible();
  await page.getByRole("button", { name: "Aprovar todos" }).click();
  await expect(page.getByRole("tab", { name: "Aprovados (6)" })).toBeVisible();

  const counters = await page.evaluate(() =>
    window.mind.invoke("generation:list", { workspaceId: 1 }),
  );
  expect(counters).toMatchObject({
    ok: true,
    data: { runs: [{ generated: 6, approved: 6, approvedUnedited: 5 }] },
  });
  const summary = await page.evaluate(() =>
    window.mind.invoke("today:summary", { workspaceId: 1 }),
  );
  expect(summary).toMatchObject({ ok: true, data: { materials: 1, cards: 6 } });
});

test("shows the readiness error when the provider is not configured", async () => {
  current = await launch(profile());
  const { page, app } = current;
  const notes = join(profile(), "bio.md");
  writeFileSync(notes, TEXT);
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Sem chave");
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
  await page.getByRole("button", { name: "Gerar", exact: true }).click();
  await page.getByRole("button", { name: "Gerar cards" }).click();
  await expect(page.getByRole("alert")).toContainText("Configure a chave do OpenRouter");
});
