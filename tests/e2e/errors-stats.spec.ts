/*
 * Filename: errors-stats.spec.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
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
].join("\n");

async function prepare(launched: Launched): Promise<void> {
  const { page, app } = launched;
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
  await generateAndApprove(page, "card", "qa", 4);
  await generateAndApprove(page, "question", "multiple_choice_4", 3);
}

async function generateAndApprove(
  page: Page,
  kind: "card" | "question",
  subtype: string,
  quantity: number,
): Promise<void> {
  const started = await page.evaluate(
    (request) => window.mind.invoke("generation:start", request),
    { workspaceId: 1, materialId: 1, subtype, quantity, kind } as never,
  );
  expect(started.ok).toBe(true);
  const run = (started as { data: { id: number } }).data.id;
  await expect
    .poll(async () => {
      const result = await page.evaluate(
        (id) => window.mind.invoke("generation:get", { workspaceId: 1, runId: id }),
        run,
      );
      return result.ok ? result.data.status : "?";
    })
    .toBe("done");
  const approved = await page.evaluate(
    (runId) => window.mind.invoke("review:approveAll", { workspaceId: 1, runId }),
    run,
  );
  expect(approved).toMatchObject({ ok: true, data: { approved: quantity } });
}

test("turns a wrong answer into a card and shows it in the notebook (FR-15)", async () => {
  current = await launch(profile(), { MIND_E2E_FAKE_LLM: "1" });
  await prepare(current);
  const { page } = current;
  await page.getByRole("button", { name: "Estudar", exact: true }).click();
  await page.getByRole("tab", { name: /Questões/ }).click();
  await page.getByRole("radio", { name: /^B/ }).click();
  await page.getByRole("button", { name: "Responder" }).click();
  await page.getByRole("button", { name: "Virar card" }).click();
  await expect(page.getByText("Card criado no caderno de erros.")).toBeVisible();
  await page.getByRole("button", { name: "Erros", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Caderno de erros" })).toBeVisible();
  await expect(page.getByText(/1 no caderno · 1 de questões/)).toBeVisible();
  await expect(page.getByText(/De questão/)).toBeVisible();
});

test("shows real charts, the goal and topic management on the statistics screen (FR-16)", async () => {
  current = await launch(profile(), { MIND_E2E_FAKE_LLM: "1" });
  await prepare(current);
  const { page } = current;
  await page.getByRole("button", { name: "Estudar", exact: true }).click();
  for (let i = 0; i < 2; i += 1) {
    await expect(page.getByLabel("Frente")).toBeVisible();
    await page.keyboard.press("Space");
    await expect(page.getByLabel("Verso")).toBeVisible();
    await page.keyboard.press("3");
    await expect(page.getByLabel("Verso")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Estatísticas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Estatísticas" })).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Atividade/ }).locator("svg.recharts-surface"),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Retenção/ }).locator("svg.recharts-surface"),
  ).toBeVisible();
  await expect(page.getByText("2 / 40")).toBeVisible();
  await page.getByRole("button", { name: "Editar meta" }).click();
  await page.getByLabel("Cards por dia").fill("25");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("2 / 25")).toBeVisible();
  const topics = page.getByRole("table", { name: "Acerto por tópico" });
  await expect(topics.getByRole("row")).not.toHaveCount(1);
});

test("trains on a weak topic without choosing a material (FR-17)", async () => {
  current = await launch(profile(), { MIND_E2E_FAKE_LLM: "1" });
  await prepare(current);
  const { page } = current;
  const next = await page.evaluate(() => window.mind.invoke("practice:next", { workspaceId: 1 }));
  const questionId = (next as { data: { question: { item: { id: number } } } }).data.question.item
    .id;
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(
      (itemId) => window.mind.invoke("practice:answer", { workspaceId: 1, itemId, answer: "B" }),
      questionId,
    );
  }
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pontos fracos" })).toBeVisible();
  await page.getByRole("button", { name: /^Treinar / }).click();
  await expect(page.getByRole("note")).toContainText("Treino do tópico");
  await expect(page.getByLabel("Material")).toHaveCount(0);
  await page.getByRole("button", { name: "Gerar cards" }).click();
  await expect(page.getByText(/Treino: /)).toBeVisible();
  await expect
    .poll(async () => {
      const result = await page.evaluate(() =>
        window.mind.invoke("generation:list", { workspaceId: 1 }),
      );
      return result.ok
        ? result.data.runs.filter((r) => r.materialId === null && r.status === "done").length
        : 0;
    })
    .toBe(1);
});
