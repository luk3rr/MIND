/*
 * Filename: reader-items.spec.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { EXECUTABLE, launch, newProfile, removeProfile, ROOT } from "./launch.js";
import type { Launched } from "./launch.js";

// The scripted model only exists in the unpackaged app, so these tests skip against a package.
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

const PDF = join(ROOT, "fixtures", "pdfs", "three-pages.pdf");

test("creates items from a passage selected in the PDF and goes back to it (FR-5 to FR-8, FR-20)", async () => {
  const dir = newProfile();
  profiles.push(dir);
  current = await launch(dir, { MIND_E2E_FAKE_LLM: "1" });
  const { page, app } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Leitura");
  await page.getByRole("button", { name: "Criar" }).click();
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
    },
    [PDF],
  );
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Importar arquivo" }).click();
  await expect(page.getByRole("table").getByText("Indexado")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /^Ler (?!em nova janela)/ }).click();
  await expect(page.getByRole("img", { name: "Página 1" })).toBeVisible({ timeout: 10_000 });

  // Selecting a line of the page with the mouse (triple click) shows nothing by itself; the
  // actions open with a right click on the selection.
  const line = page.getByLabel("Texto da página").getByText("Primeira página com função.");
  await line.click({ clickCount: 3 });
  await expect(page.getByRole("toolbar", { name: "Ações da seleção" })).toHaveCount(0);
  await line.click({ button: "right" });
  const bar = page.getByRole("toolbar", { name: "Ações da seleção" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "✦ Gerar itens" }).click();

  // Ask for two cards about a subject: the drafts exist only on screen until they are saved.
  const panel = page.getByRole("dialog", { name: "Gerar itens do trecho" });
  await expect(panel.getByText(/Trecho · p\. 1/)).toBeVisible();
  await panel.getByLabel("Quantidade (opcional)").fill("2");
  await panel.getByLabel("Assunto (opcional)").fill("função");
  await panel.getByRole("button", { name: "Gerar", exact: true }).click();
  await expect(panel.getByText("2 rascunho(s) do trecho")).toBeVisible({ timeout: 15_000 });
  const none = await page.evaluate(() => window.mind.invoke("items:list", { workspaceId: 1 }));
  expect(none).toMatchObject({ ok: true, data: { items: [] } });
  const first = panel.getByRole("article").first();
  await first.getByRole("button", { name: "Salvar" }).click();
  await expect(first.getByText("Salvo e aprovado")).toBeVisible();
  await panel.getByRole("button", { name: "Fechar" }).first().click();
  await expect(panel).toHaveCount(0);

  // Another passage, this time written into one item by hand, with the source already filled in.
  await line.click({ clickCount: 3 });
  await line.click({ button: "right" });
  await page
    .getByRole("toolbar", { name: "Ações da seleção" })
    .getByRole("button", { name: "+ Criar item" })
    .click();
  const editor = page.getByRole("dialog", { name: "Novo cartão" });
  await expect(editor.getByLabel("Trecho da fonte")).toHaveValue("Primeira página com função.");
  await editor.getByLabel("Frente").fill("O que a primeira página tem?");
  await editor.getByLabel("Verso").fill("Uma função.");
  await page.keyboard.press("Control+Enter");
  await expect(editor).toHaveCount(0);

  // Both items are approved, come from the reader and point to the page of the PDF.
  const listed = await page.evaluate(() => window.mind.invoke("items:list", { workspaceId: 1 }));
  expect(listed).toMatchObject({
    ok: true,
    data: {
      items: [
        { origin: "reader", status: "approved", sourcePage: 1, hasPdf: true },
        { origin: "reader", status: "approved", sourcePage: 1, hasPdf: true },
      ],
    },
  });

  // From the study screen, "Ver no PDF" goes back to the page and marks the passage.
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await page.getByRole("button", { name: /^Estudar agora/ }).click();
  await expect(page.getByLabel("Frente")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Verso")).toBeVisible();
  await page
    .getByRole("button", { name: /^Ver no PDF, pág\. 1$/ })
    .first()
    .click();
  await expect(page.getByRole("img", { name: "Página 1" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("img", { name: "Trecho citado" }).first()).toBeVisible();
});
