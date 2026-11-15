/*
 * Filename: sample-flow.spec.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { EXECUTABLE, ROOT, launch, newProfile, removeProfile } from "./launch.js";
import type { Launched } from "./launch.js";

// The whole journey runs offline with the scripted provider, which only the unpackaged app has.
test.skip(Boolean(EXECUTABLE), "uses the offline scripted provider of the unpackaged app");

let current: Launched | undefined;
const profiles: string[] = [];

test.afterEach(async () => {
  await current?.app.close().catch(() => undefined);
  current = undefined;
});

test.afterAll(() => {
  profiles.splice(0).forEach(removeProfile);
});

test("the sample material takes a first-time user from import to chat (SC-4)", async () => {
  const userData = newProfile();
  profiles.push(userData);
  current = await launch(userData, { MIND_E2E_FAKE_LLM: "1" });
  const { page, app } = current;

  // Welcome → first workspace.
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Amostra");
  await page.getByRole("button", { name: "Criar" }).click();
  await expect(page.getByRole("heading", { name: "Hoje" })).toBeVisible();

  // Library: import the sample and search it.
  const sample = join(ROOT, "samples", "fotossintese.md");
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
    },
    [sample],
  );
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Importar arquivo" }).click();
  await expect(page.getByRole("table").getByText("Indexado")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Buscar nos materiais").fill("cloroplastos");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText(/cloroplastos/).first()).toBeVisible();

  // Generate cards, review them and approve.
  await page.getByRole("button", { name: "Gerar", exact: true }).click();
  await page.getByLabel("Quantidade").fill("4");
  await page.getByRole("button", { name: "Gerar cards" }).click();
  await expect(page.getByRole("row", { name: /Concluída/ })).toContainText("4/4", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Revisar" }).click();
  await expect(page.getByText(/Fonte: fotossintese/).first()).toBeVisible();
  await page.getByRole("button", { name: "Aprovar todos" }).click();
  await expect(page.getByRole("tab", { name: "Aprovados (4)" })).toBeVisible();

  // Generate questions with the second check, review and approve.
  await page.getByRole("button", { name: "Gerar", exact: true }).click();
  await page.getByLabel("O que gerar").selectOption("question");
  await page.getByLabel("Perfil da questão").selectOption("multiple_choice_4");
  await page.getByLabel("Quantidade").fill("3");
  await page.getByRole("button", { name: "Gerar questões" }).click();
  await expect(page.getByRole("row", { name: /Concluída.*3\/3|3\/3.*Concluída/ })).toBeVisible({
    timeout: 20_000,
  });
  await page
    .getByRole("row", { name: /multiple_choice|Múltipla/ })
    .getByRole("button", { name: "Revisar" })
    .click();
  await page.getByRole("button", { name: "Aprovar todos" }).click();
  await expect(page.getByRole("tab", { name: "Aprovados (3)" })).toBeVisible();

  // Today shows the queue; study the cards with the keyboard.
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(page.getByRole("button", { name: "Estudar agora (4)" })).toBeVisible();
  await page.getByRole("button", { name: "Estudar agora (4)" }).click();
  for (let i = 0; i < 3; i += 1) {
    await expect(page.getByLabel("Frente")).toBeVisible();
    await page.keyboard.press("Space");
    await expect(page.getByLabel("Verso")).toBeVisible();
    await page.keyboard.press("3");
    await expect(page.getByLabel("Verso")).toHaveCount(0);
  }

  // Practice: miss a question and turn it into a card.
  await page.getByRole("tab", { name: /Questões/ }).click();
  await page.getByRole("radio", { name: /^B/ }).click();
  await page.getByRole("button", { name: "Responder" }).click();
  await expect(page.getByText(/Resposta errada/)).toBeVisible();
  await page.getByRole("button", { name: "Virar card" }).click();
  await expect(page.getByText("Card criado no caderno de erros.")).toBeVisible();

  // Errors, Statistics and the chat.
  await page.getByRole("button", { name: "Erros", exact: true }).click();
  await expect(page.getByText(/1 no caderno/)).toBeVisible();
  await page.getByRole("button", { name: "Estatísticas", exact: true }).click();
  await expect(page.getByRole("img", { name: /Atividade/ })).toBeVisible();
  await expect(page.getByText("3 / 40")).toBeVisible();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page.getByLabel("Sua pergunta").fill("Onde ocorre a fotossíntese?");
  await page.getByRole("button", { name: "Perguntar" }).click();
  await expect(page.getByText(/Segundo o material/)).toBeVisible();
  await expect(page.locator("blockquote.source").first()).toBeVisible();
});
