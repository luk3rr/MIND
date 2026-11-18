/*
 * Filename: feedback-pending.spec.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { EXECUTABLE, launch, newProfile, removeProfile } from "./launch.js";
import type { Launched } from "./launch.js";

// The clock can only be moved ahead in the unpackaged app.
test.skip(Boolean(EXECUTABLE), "moves the clock of the unpackaged app to cross the day change");

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

test("holds the key until the next day, then shows it from Today (FR-9, FR-10)", async () => {
  const dir = newProfile();
  profiles.push(dir);
  current = await launch(dir);
  const first = current.page;
  await first.getByRole("button", { name: "Novo workspace" }).click();
  await first.getByLabel("Nome do workspace").fill("Amanhã");
  await first.getByRole("button", { name: "Criar" }).click();
  await first.getByRole("button", { name: "Itens", exact: true }).click();
  await createQuestion(first, "Primeira questão?");
  await createQuestion(first, "Segunda questão?");

  await first.getByRole("button", { name: "Configurações", exact: true }).click();
  const form = first.getByRole("region", { name: "Práticas de estudo" });
  await form.getByRole("radio", { name: /No dia seguinte/ }).check();
  await form.getByRole("button", { name: "Salvar práticas" }).click();
  await expect(first.getByText("Configurações das práticas salvas.")).toBeVisible();

  // Both answers are registered, with the time of the key and nothing else.
  await first.getByRole("button", { name: "Estudar", exact: true }).click();
  await first.getByRole("tab", { name: /Questões/ }).click();
  await first.getByRole("radio", { name: /^B ·/ }).click();
  await first.getByRole("button", { name: "Responder" }).click();
  await expect(first.getByText(/O gabarito fica disponível amanhã, a partir das 4h/)).toBeVisible();
  await expect(first.getByText(/Gabarito/)).toHaveCount(0);
  await first.getByRole("button", { name: "Próxima" }).click();
  await first.getByRole("radio", { name: /^A ·/ }).click();
  await first.getByRole("button", { name: "Responder" }).click();
  await expect(first.getByText(/O gabarito fica disponível amanhã/)).toBeVisible();

  // Today has no notice yet: the day has not turned over.
  await first.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(first.getByRole("heading", { name: "Hoje" })).toBeVisible();
  await expect(first.getByText(/aguardam feedback/)).toHaveCount(0);

  // A day and a half later the feedback is ready.
  await current.app.close();
  current = await launch(dir, { MIND_E2E_CLOCK_SHIFT_HOURS: "36" });
  const second = current.page;
  await second.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(second.getByText("2 respostas aguardam feedback.")).toBeVisible();
  await second.getByRole("button", { name: "Ver feedback" }).click();
  const list = second.getByRole("region", { name: "Respostas liberadas" });
  await expect(list.getByText("1 de 2 certas")).toBeVisible();
  await expect(list.getByText("Explicação de Primeira questão?")).toBeVisible();
  await expect(list.getByText("Explicação de Segunda questão?")).toBeVisible();

  // Seeing it clears the notice.
  await list.getByRole("button", { name: "Voltar a Hoje" }).click();
  await expect(second.getByRole("heading", { name: "Hoje" })).toBeVisible();
  await expect(second.getByText(/aguardam feedback/)).toHaveCount(0);
});
