/*
 * Filename: authoring.spec.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
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

test("creates a card by hand in the side panel and studies it (FR-1, FR-3, NFR-1)", async () => {
  const userData = newProfile();
  profiles.push(userData);
  current = await launch(userData);
  const { page } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Estudo");
  await page.getByRole("button", { name: "Criar" }).click();

  await page.getByRole("button", { name: "Itens", exact: true }).click();
  await page.getByRole("button", { name: "Novo item" }).click();
  const panel = page.getByRole("dialog", { name: "Novo cartão" });
  await expect(panel).toBeVisible();
  await panel.getByLabel("Frente").fill("Qual a capital da França?");
  await panel.getByLabel("Verso").fill("Paris.");
  await panel.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("table", { name: "Itens" }).getByText("Qual a capital da França?"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await page.getByRole("button", { name: "Estudar agora (1)" }).click();
  await expect(page.getByLabel("Frente")).toContainText("Qual a capital da França?");
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Verso")).toContainText("Paris.");
});

/** Opens a fresh workspace on the Items screen, with the offline scripted model. */
async function openItems(): Promise<Launched["page"]> {
  const userData = newProfile();
  profiles.push(userData);
  current = await launch(userData, { MIND_E2E_FAKE_LLM: "1" });
  const { page } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Estudo");
  await page.getByRole("button", { name: "Criar" }).click();
  await page.getByRole("button", { name: "Itens", exact: true }).click();
  return page;
}

test("asks the model to fix the text, compares, accepts and saves with Ctrl+Enter (FR-10, FR-11)", async () => {
  const page = await openItems();
  await page.getByRole("button", { name: "Novo item" }).click();
  const panel = page.getByRole("dialog", { name: "Novo cartão" });
  await expect(panel.getByLabel("Frente")).toBeFocused();
  await page.keyboard.type("Qual a funcao da mitocondria?");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Produz energia.");
  await panel.getByRole("button", { name: /Melhorar com IA/ }).click();
  await panel.getByRole("button", { name: "Corrigir" }).click();
  const proposal = page.getByRole("dialog", { name: "Proposta: Corrigir" });
  await expect(proposal).toBeVisible();
  // Nothing is stored while the proposal is open.
  const before = await page.evaluate(() => window.mind.invoke("items:list", { workspaceId: 1 }));
  expect(before).toMatchObject({ ok: true, data: { items: [] } });
  await expect(proposal.getByText("(revisado)")).toBeVisible();
  await proposal.getByRole("button", { name: "Aceitar tudo" }).click();
  const form = page.getByRole("dialog", { name: "Novo cartão" });
  await expect(form.getByLabel("Frente")).toHaveValue("Qual a funcao da mitocondria? (revisado)");
  await page.keyboard.press("Control+Enter");
  await expect(form).toHaveCount(0);
  await expect(
    page
      .getByRole("table", { name: "Itens" })
      .getByText("Qual a funcao da mitocondria? (revisado)"),
  ).toBeVisible();
});

test("creates a multiple choice question and practises it (FR-2, FR-3)", async () => {
  const page = await openItems();
  await page.getByRole("button", { name: "Novo item" }).click();
  const panel = page.getByRole("dialog", { name: "Novo cartão" });
  await panel.getByRole("radio", { name: "Questão" }).check();
  // The panel is now called after the question, and the cursor is in its statement.
  const question = page.getByRole("dialog", { name: "Nova questão" });
  await expect(question.getByLabel("Enunciado")).toBeFocused();
  await question.getByLabel("Enunciado").fill("Qual organela produz ATP?");
  await question.getByLabel("Texto da alternativa A").fill("Mitocôndria");
  await question.getByLabel("Justificativa da alternativa A").fill("Respira.");
  await question.getByLabel("Texto da alternativa B").fill("Ribossomo");
  await question.getByLabel("Justificativa da alternativa B").fill("Faz proteínas.");
  await question.getByRole("button", { name: "Remover alternativa D" }).click();
  await question.getByRole("button", { name: "Remover alternativa C" }).click();
  await question.getByLabel("Explicação").fill("A mitocôndria respira.");
  await question.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Nova questão" })).toHaveCount(0);
  const row = page
    .getByRole("table", { name: "Itens" })
    .getByRole("row")
    .filter({ hasText: "Qual organela produz ATP?" });
  await expect(row.getByText("Manual")).toBeVisible();
  const next = await page.evaluate(() => window.mind.invoke("practice:next", { workspaceId: 1 }));
  expect(next).toMatchObject({
    ok: true,
    data: { question: { item: { origin: "manual", answer: "A" } } },
  });
});
