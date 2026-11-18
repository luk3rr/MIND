/*
 * Filename: pretest.spec.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXECUTABLE, launch, newProfile, removeProfile } from "./launch.js";
import type { Launched } from "./launch.js";

// The scripted model only exists in the unpackaged app.
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

test("takes a pre-test: the key only in the summary, and practice and statistics untouched (FR-1..FR-5)", async () => {
  current = await launch(profile(), { MIND_E2E_FAKE_LLM: "1" });
  await prepare(current);
  const { page } = current;
  // Leave and come back, so the list counts the questions approved a moment ago.
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: /Pré-teste/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/3 questões elegíveis/)).toBeVisible();
  await dialog.getByLabel("Quantas questões? (1 a 20)").fill("2");
  await dialog.getByRole("button", { name: "Começar" }).click();

  await expect(page.getByRole("note")).toContainText("errar aqui é esperado");
  for (let step = 0; step < 2; step += 1) {
    await page.getByRole("radio").nth(1).click();
    await page.getByRole("button", { name: "Responder" }).click();
    await expect(page.getByText(/Gabarito/)).toHaveCount(0);
  }
  const summary = page.getByRole("region", { name: "Resumo do pré-teste" });
  await expect(summary).toBeVisible();
  await expect(summary.getByText(/de 2 certas/)).toBeVisible();

  // Practice still has the three questions as new, and the notebook has no mistake.
  await page.getByRole("button", { name: "Estudar", exact: true }).click();
  await page.getByRole("tab", { name: /Questões/ }).click();
  await expect(page.getByText(/3 novas · 0 para refazer/)).toBeVisible();
  await page.getByRole("button", { name: "Erros", exact: true }).click();
  await expect(page.getByText(/Nenhum erro por enquanto/)).toBeVisible();
});
