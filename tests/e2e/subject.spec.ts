/*
 * Filename: subject.spec.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXECUTABLE, launch, newProfile, removeProfile } from "./launch.js";
import type { Launched } from "./launch.js";

// The scripted provider only exists in the unpackaged app, so this test skips against a package.
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
  "# Aula 3",
  "",
  "As palavras paroxítonas têm a penúltima sílaba tônica e recebem acento quando terminam em -l, -n, -r ou -x.",
  "",
  "As oxítonas são acentuadas quando terminam em a(s), e(s) ou o(s), como em sofá, você e cipó.",
  "",
  "Todas as proparoxítonas são acentuadas, como em máximo, lâmpada e árvore.",
].join("\n");

test("names the subject of a material in the library and sees it where items are generated (FR-14, FR-1)", async () => {
  current = await launch(profile(), { MIND_E2E_FAKE_LLM: "1" });
  const { page, app } = current;
  const notes = join(profile(), "aula3.md");
  writeFileSync(notes, TEXT);
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Disciplina");
  await page.getByRole("button", { name: "Criar" }).click();
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
    },
    [notes],
  );
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Importar arquivo" }).click();
  const table = page.getByRole("table");
  await expect(table.getByText("Indexado")).toBeVisible({ timeout: 20_000 });
  // The analysis starts by itself after the import and ends with the material analyzed.
  await expect(table.getByText("Analisado")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Mais ações aula3" }).click();
  await page.getByRole("menuitem", { name: "Definir disciplina…" }).click();
  const dialog = page.getByRole("dialog", { name: /Disciplina de/ });
  await expect(dialog.getByText("Não identificada")).toBeVisible();
  await dialog.getByLabel("Disciplina ou assunto (opcional)").fill("Língua Portuguesa: acentuação");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog).toBeHidden();
  await expect(table.getByText("Língua Portuguesa: acentuação")).toBeVisible();

  await page.getByRole("button", { name: "Gerar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Gerar" })).toBeVisible();
  await expect(page.getByText("Disciplina:")).toBeVisible();
  await expect(page.getByText("Informada")).toBeVisible();
  await expect(page.getByText("Língua Portuguesa: acentuação")).toBeVisible();
  // The material is analyzed, so there is no notice about generating without the analysis.
  await expect(page.getByText(/Gerando sem a análise do material/)).toHaveCount(0);

  await page.getByLabel("Quantidade").fill("5");
  await page.getByRole("button", { name: "Gerar cards" }).click();
  await expect(page.getByRole("row", { name: /Concluída/ })).toContainText("5/5", {
    timeout: 20_000,
  });
  const runs = await page.evaluate(() => window.mind.invoke("generation:list", { workspaceId: 1 }));
  expect(runs).toMatchObject({
    ok: true,
    data: { runs: [{ generated: 5, discardedOutOfScope: 0, rounds: 1, withAnalysis: true }] },
  });
});
