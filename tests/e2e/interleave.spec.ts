/*
 * Filename: interleave.spec.ts
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

async function openItems(): Promise<Page> {
  const dir = newProfile();
  profiles.push(dir);
  current = await launch(dir);
  const { page } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Mistura");
  await page.getByRole("button", { name: "Criar" }).click();
  await page.getByRole("button", { name: "Itens", exact: true }).click();
  return page;
}

/** Shows the answer and rates the card "Bom" with the buttons, so the focus can stay anywhere. */
async function rate(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Mostrar resposta/ }).click();
  await page.getByRole("button", { name: /3 · Bom/ }).click();
}

async function createCard(page: Page, front: string, topic: string): Promise<void> {
  await page.getByRole("button", { name: "Novo item" }).click();
  const panel = page.getByRole("dialog", { name: "Novo cartão" });
  await panel.getByLabel("Frente").fill(front);
  await panel.getByLabel("Verso").fill("Resposta.");
  await panel.getByLabel("Tópico", { exact: true }).fill(topic);
  await panel.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(panel).toHaveCount(0);
}

async function createQuestion(page: Page, statement: string, topic: string): Promise<void> {
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
  await question.getByLabel("Explicação").fill("Explicação.");
  await question.getByLabel("Tópico", { exact: true }).fill(topic);
  await question.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(question).toHaveCount(0);
}

test("mixes the topics of the cards and of the questions (FR-13, FR-14, FR-15)", async () => {
  const page = await openItems();
  await createCard(page, "Alfa um?", "Alfa");
  await createCard(page, "Alfa dois?", "Alfa");
  await createCard(page, "Alfa três?", "Alfa");
  await createCard(page, "Beta um?", "Beta");
  await createQuestion(page, "Questão alfa um?", "Alfa");
  await createQuestion(page, "Questão alfa dois?", "Alfa");
  await createQuestion(page, "Questão beta um?", "Beta");

  // Cards: in blocks by default, alternating once the option is on.
  await page.getByRole("button", { name: "Estudar", exact: true }).click();
  const mix = page.getByRole("checkbox", { name: /Misturar tópicos/ });
  await expect(mix).not.toBeChecked();
  await expect(page.getByLabel("Frente")).toContainText("Alfa um?");
  await mix.check();
  await expect(page.getByLabel("Frente")).toContainText("Alfa um?");
  await rate(page);
  await expect(page.getByLabel("Frente")).toContainText("Beta um?");
  await rate(page);
  await expect(page.getByLabel("Frente")).toContainText("Alfa dois?");

  // Questions: the same rotation, and skipping goes to the other topic.
  await page.getByRole("tab", { name: /Questões/ }).click();
  const practiceMix = page.getByRole("checkbox", { name: /Misturar tópicos/ });
  await expect(practiceMix).not.toBeChecked();
  await expect(page.getByText("Questão alfa um?")).toBeVisible();
  await page.getByRole("button", { name: "Pular" }).click();
  await expect(page.getByText("Questão alfa dois?")).toBeVisible();
  await practiceMix.check();
  await expect(page.getByText("Questão alfa um?")).toBeVisible();
  await page.getByRole("button", { name: "Pular" }).click();
  await expect(page.getByText("Questão beta um?")).toBeVisible();
});
