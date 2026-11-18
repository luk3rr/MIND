/*
 * Filename: feedback-block.spec.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { launch, newProfile, removeProfile } from "./launch.js";
import type { Launched } from "./launch.js";

let current: Launched | undefined;
const profiles: string[] = [];

test.afterEach(async () => {
  await current?.app.close().catch(() => undefined);
  current = undefined;
});

test.afterAll(() => {
  profiles.splice(0).forEach(removeProfile);
});

async function createQuestion(page: Page, statement: string): Promise<void> {
  await page.getByRole("button", { name: "Novo item" }).click();
  await page
    .getByRole("dialog", { name: "Novo cartão" })
    .getByRole("radio", { name: "Questão" })
    .check();
  const question = page.getByRole("dialog", { name: "Nova questão" });
  await question.getByLabel("Enunciado").fill(statement);
  await question.getByLabel("Texto da alternativa A").fill("Certa");
  await question.getByLabel("Justificativa da alternativa A").fill("Porque sim.");
  await question.getByLabel("Texto da alternativa B").fill("Errada");
  await question.getByLabel("Justificativa da alternativa B").fill("Porque não.");
  await question.getByRole("button", { name: "Remover alternativa D" }).click();
  await question.getByRole("button", { name: "Remover alternativa C" }).click();
  await question.getByLabel("Explicação").fill(`Explicação de ${statement}`);
  await question.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(question).toHaveCount(0);
}

async function openPractice(): Promise<Page> {
  const dir = newProfile();
  profiles.push(dir);
  current = await launch(dir);
  const { page } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Feedback");
  await page.getByRole("button", { name: "Criar" }).click();
  await page.getByRole("button", { name: "Itens", exact: true }).click();
  await createQuestion(page, "Primeira questão?");
  await createQuestion(page, "Segunda questão?");
  return page;
}

async function answer(page: Page, option: "A" | "B"): Promise<void> {
  await page.getByRole("radio", { name: option === "A" ? /^A ·/ : /^B ·/ }).click();
  await page.getByRole("button", { name: "Responder" }).click();
}

test("shows the key only at the end of the block, and keeps the immediate mode as it was (FR-7, FR-8)", async () => {
  const page = await openPractice();

  // The default is the feedback at once, as before.
  await page.getByRole("button", { name: "Estudar", exact: true }).click();
  await page.getByRole("tab", { name: /Questões/ }).click();
  await expect(page.getByText("Primeira questão?")).toBeVisible();
  await answer(page, "A");
  await expect(page.getByText("Resposta correta!")).toBeVisible();
  await expect(page.getByText("Explicação de Primeira questão?")).toBeVisible();

  // Switch to the end of the block in Settings.
  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  const form = page.getByRole("region", { name: "Práticas de estudo" });
  await form.getByRole("radio", { name: /Ao fim do bloco/ }).check();
  await form.getByRole("button", { name: "Salvar práticas" }).click();
  await expect(page.getByText("Configurações das práticas salvas.")).toBeVisible();

  // The second question is registered, with no key and no comment on the screen.
  await page.getByRole("button", { name: "Estudar", exact: true }).click();
  await page.getByRole("tab", { name: /Questões/ }).click();
  await expect(page.getByText("Segunda questão?")).toBeVisible();
  await answer(page, "A");
  await expect(page.getByText(/Resposta registrada/)).toBeVisible();
  await expect(page.getByText("Explicação de Segunda questão?")).toHaveCount(0);
  await expect(page.getByText(/Gabarito/)).toHaveCount(0);

  // At the end of the queue the feedback of the block opens by itself.
  await page.getByRole("button", { name: "Próxima" }).click();
  const block = page.getByRole("region", { name: "Feedback do bloco" });
  await expect(block).toBeVisible();
  await expect(block.getByText("Explicação de Segunda questão?")).toBeVisible();
  await expect(block.getByText("1 de 1 certa")).toBeVisible();
});

test("asks for the feedback before the block ends (FR-8)", async () => {
  const page = await openPractice();
  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  const form = page.getByRole("region", { name: "Práticas de estudo" });
  await form.getByRole("radio", { name: /Ao fim do bloco/ }).check();
  await form.getByRole("button", { name: "Salvar práticas" }).click();
  await expect(page.getByText("Configurações das práticas salvas.")).toBeVisible();

  await page.getByRole("button", { name: "Estudar", exact: true }).click();
  await page.getByRole("tab", { name: /Questões/ }).click();
  await expect(page.getByText("Primeira questão?")).toBeVisible();
  await answer(page, "B");
  await expect(page.getByText(/Resposta registrada/)).toBeVisible();
  await page.getByRole("button", { name: "Ver o feedback agora" }).click();
  const block = page.getByRole("region", { name: "Feedback do bloco" });
  await expect(block.getByText("0 de 1 certa")).toBeVisible();
  await expect(block.getByText("Explicação de Primeira questão?")).toBeVisible();
  await block.getByRole("button", { name: "Começar novo bloco" }).click();
  await expect(page.getByText("Segunda questão?")).toBeVisible();
});
