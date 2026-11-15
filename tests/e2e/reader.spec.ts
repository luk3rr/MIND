/*
 * Filename: reader.spec.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { launch, newProfile, removeProfile, ROOT } from "./launch.js";
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

const PDF = join(ROOT, "fixtures", "pdfs", "three-pages.pdf");

test("reads the original PDF in the app: pages, text layer and search (US-8, US-9)", async () => {
  const dir = newProfile();
  profiles.push(dir);
  current = await launch(dir);
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

  await page.getByRole("button", { name: /^Ler / }).click();
  const image = page.getByRole("img", { name: "Página 1" });
  await expect(image).toBeVisible({ timeout: 10_000 });
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(
    300,
  );
  await expect(
    page.getByLabel("Texto da página").getByText("Primeira página com função."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Próxima página" }).first().click();
  await expect(page.getByRole("img", { name: "Página 2" })).toBeVisible();

  await page.getByRole("textbox", { name: "Buscar no PDF" }).fill("terceira");
  await page.getByRole("textbox", { name: "Buscar no PDF" }).press("Enter");
  await expect(page.getByText(/1 de 1 ocorrências/)).toBeVisible();
  await expect(page.getByRole("img", { name: "Página 3" })).toBeVisible();
  await expect(page.locator(".reader-hit.current")).toHaveCount(1);
});
