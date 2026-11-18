/*
 * Filename: calibration.spec.ts
 * Created on: November 19, 2026
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
  await page.getByLabel("Nome do workspace").fill("Calibração");
  await page.getByRole("button", { name: "Criar" }).click();
  await page.getByRole("button", { name: "Itens", exact: true }).click();
  await createQuestion(page, "Primeira questão?");
  return page;
}

test("asks for the confidence, points out a sure mistake and shows it in Statistics (FR-16..FR-19)", async () => {
  const page = await openPractice();
  await page.getByRole("button", { name: "Estatísticas", exact: true }).click();
  const card = page.getByRole("region", { name: "Calibração" });
  await expect(card.getByText(/Ligue “Perguntar a confiança/)).toBeVisible();

  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  const form = page.getByRole("region", { name: "Práticas de estudo" });
  await form.getByRole("checkbox", { name: /Perguntar a confiança/ }).check();
  await form.getByRole("button", { name: "Salvar práticas" }).click();
  await expect(page.getByText("Configurações das práticas salvas.")).toBeVisible();

  await page.getByRole("button", { name: "Estudar", exact: true }).click();
  await page.getByRole("tab", { name: /Questões/ }).click();
  await page.getByRole("radio", { name: /^B ·/ }).click();
  await expect(page.getByRole("button", { name: "Responder" })).toBeDisabled();
  await page.getByRole("radio", { name: "Tenho certeza" }).click();
  await page.getByRole("button", { name: "Responder" }).click();
  await expect(page.getByText("Você tinha marcado “Tenho certeza”")).toBeVisible();

  await page.getByRole("button", { name: "Estatísticas", exact: true }).click();
  const table = page.getByRole("table", { name: "Calibração" });
  await expect(table.getByRole("row", { name: /Tenho certeza.*1.*0%/ })).toBeVisible();
});
