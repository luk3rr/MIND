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
const BIG = join(ROOT, "fixtures", "pdfs", "big-100.pdf");

/** Creates a workspace and imports the PDFs, waiting until every one is indexed. */
async function prepare(launched: Launched, files: string[]): Promise<void> {
  const { page, app } = launched;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Leitura");
  await page.getByRole("button", { name: "Criar" }).click();
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: paths });
  }, files);
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Importar arquivo" }).click();
  await expect(page.getByRole("table").getByText("Indexado")).toHaveCount(files.length, {
    timeout: 30_000,
  });
}

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

  // A separate window shows only the reader, and opening it again reuses the same window (FR-19).
  const opened = app.waitForEvent("window");
  await page.getByRole("button", { name: "Nova janela" }).click();
  const second = await opened;
  await second.waitForLoadState("domcontentloaded");
  await expect(second.getByRole("img", { name: "Página 3" })).toBeVisible({ timeout: 10_000 });
  await expect(second.getByRole("navigation", { name: "Principal" })).toHaveCount(0);
  await expect(second.getByRole("button", { name: "Nova janela" })).toHaveCount(0);
  await page.getByRole("button", { name: "Nova janela" }).click();
  await page.waitForTimeout(500);
  expect(app.windows()).toHaveLength(2);
  await second.close();
  await expect(page.getByRole("img", { name: "Página 3" })).toBeVisible();
});

test("goes from a search hit to the cited page and highlights the passage (US-12)", async () => {
  const dir = newProfile();
  profiles.push(dir);
  current = await launch(dir);
  const { page } = current;
  await prepare(current, [PDF]);
  await page.getByRole("textbox", { name: "Buscar nos materiais" }).fill("Terceira");
  await page.getByRole("textbox", { name: "Buscar nos materiais" }).press("Enter");
  await page.getByRole("button", { name: /^Ver no PDF, pág\. 3$/ }).click();
  await expect(page.getByRole("img", { name: "Página 3" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("img", { name: "Trecho citado" }).first()).toBeVisible();
});

test("remembers the last page read and resumes it (US-13)", async () => {
  const dir = newProfile();
  profiles.push(dir);
  current = await launch(dir);
  await prepare(current, [PDF]);
  await current.page.getByRole("button", { name: /^Ler / }).click();
  await expect(current.page.getByRole("img", { name: "Página 1" })).toBeVisible();
  await current.page.getByRole("button", { name: "Próxima página" }).first().click();
  await current.page.getByRole("button", { name: "Próxima página" }).first().click();
  await expect(current.page.getByRole("img", { name: "Página 3" })).toBeVisible();
  await current.page.waitForTimeout(1200);
  await current.page.getByRole("button", { name: "Voltar à Biblioteca" }).click();
  await current.page.getByRole("button", { name: /^Ler / }).click();
  await expect(current.page.getByRole("img", { name: "Página 3" })).toBeVisible({
    timeout: 10_000,
  });
});

test("shows the first page of a 100-page PDF within 2 s and turns pages quickly (NFR-2)", async () => {
  const dir = newProfile();
  profiles.push(dir);
  current = await launch(dir);
  const { page } = current;
  await prepare(current, [BIG]);
  const started = Date.now();
  await page.getByRole("button", { name: /^Ler / }).click();
  await expect(page.getByRole("img", { name: "Página 1" })).toBeVisible({ timeout: 10_000 });
  const first = Date.now() - started;
  const turns: number[] = [];
  for (let number = 2; number <= 6; number += 1) {
    const before = Date.now();
    await page.getByRole("button", { name: "Próxima página" }).first().click();
    await expect(page.getByRole("img", { name: `Página ${number}` })).toBeVisible();
    turns.push(Date.now() - before);
  }
  console.log(`NFR-2 first page: ${first} ms; page turns: ${turns.join(", ")} ms`);
  expect(first).toBeLessThan(2000);
  expect(Math.max(...turns)).toBeLessThan(500);
});

test("reads a 100-page PDF in continuous scroll mode and draws only the nearby pages", async () => {
  const dir = newProfile();
  profiles.push(dir);
  current = await launch(dir);
  const { page } = current;
  await prepare(current, [BIG]);
  await page.getByRole("button", { name: /^Ler / }).click();
  await expect(page.getByRole("img", { name: "Página 1" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Rolagem contínua" }).click();
  await expect(page.locator(".reader-scroll")).toBeVisible();
  await expect(page.getByRole("img", { name: "Página 1" })).toBeVisible();

  // The mouse wheel moves through the pages and the counter follows.
  const viewport = page.locator(".reader-viewport");
  await viewport.hover();
  await page.mouse.wheel(0, 4000);
  await expect(page.getByLabel("Ir para a página")).not.toHaveValue("1", { timeout: 5000 });
  const drawn = await page.locator(".reader-page img").count();
  expect(drawn).toBeGreaterThan(0);
  expect(drawn).toBeLessThan(10);

  // Choosing a far page scrolls straight to it.
  const box = page.getByLabel("Ir para a página");
  await box.fill("60");
  await box.press("Enter");
  await expect(page.getByRole("img", { name: "Página 60" })).toBeVisible({ timeout: 5000 });
  expect(await page.locator(".reader-page img").count()).toBeLessThan(10);
  await page.screenshot({ path: process.env["MIND_E2E_SHOT"] ?? "test-results/scroll.png" });

  // The mode is remembered: the reader opens scrolling next time.
  await page.getByRole("button", { name: "Voltar à Biblioteca" }).click();
  await page.getByRole("button", { name: /^Ler / }).click();
  await expect(page.getByRole("button", { name: "Rolagem contínua" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("See in PDF lands on the cited page when the reader is in scroll mode", async () => {
  const dir = newProfile();
  profiles.push(dir);
  current = await launch(dir);
  const { page } = current;
  await prepare(current, [PDF]);
  // Choose the continuous scroll once; it is remembered for the next openings.
  await page.getByRole("button", { name: /^Ler / }).click();
  await expect(page.getByRole("img", { name: "Página 1" })).toBeVisible();
  await page.getByRole("button", { name: "Rolagem contínua" }).click();
  await page.getByRole("button", { name: "Voltar à Biblioteca" }).click();

  await page.getByRole("textbox", { name: "Buscar nos materiais" }).fill("Terceira");
  await page.getByRole("textbox", { name: "Buscar nos materiais" }).press("Enter");
  await page.getByRole("button", { name: /^Ver no PDF, pág\. 3$/ }).click();

  await expect(page.getByRole("button", { name: "Rolagem contínua" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Ir para a página")).toHaveValue("3");
  // The cited page is the one on screen, not just the number in the box.
  const inView = async () =>
    page.evaluate(() => {
      const viewport = document.querySelector(".reader-viewport") as HTMLElement;
      const target = document.querySelector('.reader-page[data-page="3"]') as HTMLElement | null;
      if (!target) return false;
      const outer = viewport.getBoundingClientRect();
      const box = target.getBoundingClientRect();
      return box.bottom > outer.top && box.top < outer.bottom;
    });
  await expect.poll(inView).toBe(true);
  await expect(page.getByRole("img", { name: "Página 3" })).toBeVisible();
  // Interacting afterwards keeps the person there.
  await page.locator(".reader-viewport").hover();
  await page.mouse.wheel(0, 40);
  await page.waitForTimeout(700);
  await expect(page.getByLabel("Ir para a página")).toHaveValue("3");
});
