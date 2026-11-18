/*
 * Filename: library.spec.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, launch, newProfile, removeProfile } from "./launch.js";
import type { Launched } from "./launch.js";

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

const PDF = (name: string): string => join(ROOT, "fixtures", "pdfs", name);

/** Replaces the native file dialog of the main process with a fixed answer. */
async function chooseFiles(launched: Launched, paths: string[]): Promise<void> {
  await launched.app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
  }, paths);
}

async function openLibrary(launched: Launched): Promise<void> {
  const { page } = launched;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Estudos");
  await page.getByRole("button", { name: "Criar" }).click();
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Biblioteca" })).toBeVisible();
}

test("imports a PDF and a Markdown file, searches and previews them (FR-2, FR-5)", async () => {
  current = await launch(profile());
  const notes = join(profile(), "notas.md");
  writeFileSync(notes, "# Biologia\n\nA fotossíntese ocorre nos cloroplastos.\n");
  await openLibrary(current);
  const { page } = current;
  await chooseFiles(current, [PDF("long.pdf"), notes]);
  await page.getByRole("button", { name: "Importar arquivo" }).click();

  const table = page.getByRole("table");
  await expect(table.getByText("Indexado")).toHaveCount(2, { timeout: 20_000 });
  await expect(table.getByRole("row", { name: /long/ })).toContainText("2");
  await expect(page.getByRole("alert")).toHaveCount(0);

  await page.getByRole("textbox", { name: "Buscar nos materiais" }).fill("cloroplastos");
  await page.getByRole("button", { name: "Buscar" }).click();
  const results = page.getByRole("region", { name: "Resultados da busca" });
  await expect(results).toContainText("notas");
  await results.getByRole("button", { name: /notas/ }).click();
  await expect(page.getByRole("heading", { name: "notas" })).toBeVisible();
  await expect(page.getByText("A fotossíntese ocorre nos cloroplastos.")).toBeVisible();

  await page.getByRole("button", { name: "Voltar à Biblioteca" }).click();
  await page.getByRole("textbox", { name: "Buscar nos materiais" }).fill("independentes");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByRole("region", { name: "Resultados da busca" })).toContainText("pág. 1");
});

test("reports unsupported and unreadable files without breaking the library", async () => {
  current = await launch(profile());
  const bad = join(profile(), "x.exe");
  writeFileSync(bad, "MZ");
  const broken = join(profile(), "quebrado.pdf");
  writeFileSync(broken, "%PDF-1.4 not a pdf");
  await openLibrary(current);
  const { page } = current;
  await chooseFiles(current, [bad, broken, PDF("locked.pdf")]);
  await page.getByRole("button", { name: "Importar arquivo" }).click();
  await expect(page.getByRole("alert")).toContainText("x.exe");
  await expect(page.getByRole("table").getByText("Falhou")).toHaveCount(2, { timeout: 20_000 });
  await expect(page.getByText("O PDF está corrompido ou não pôde ser aberto.")).toBeVisible();
  await expect(page.getByText("O PDF está protegido por senha.")).toBeVisible();
});

test("indexes a 100-page PDF in under 60 seconds without freezing the window (NFR-1, NFR-18)", async () => {
  current = await launch(profile());
  await openLibrary(current);
  const { page } = current;
  await chooseFiles(current, [PDF("big-100.pdf")]);
  const started = Date.now();
  await page.getByRole("button", { name: "Importar arquivo" }).click();

  // While the worker reads the pages the window keeps answering IPC calls.
  const latencies: number[] = [];
  while (!(await page.getByText("Indexado").isVisible())) {
    const before = Date.now();
    await page.evaluate(() => window.mind.invoke("window:getState", {}));
    latencies.push(Date.now() - before);
    if (Date.now() - started > 60_000) break;
    await page.waitForTimeout(50);
  }
  const elapsed = Date.now() - started;
  await expect(page.getByRole("table").getByText("Indexado")).toBeVisible();
  expect(elapsed).toBeLessThan(60_000);
  expect(Math.max(...latencies, 0)).toBeLessThan(500);
  await expect(page.getByRole("row", { name: /big-100/ })).toContainText("100");
});

test("deletes a material after confirmation", async () => {
  current = await launch(profile());
  await openLibrary(current);
  const { page } = current;
  await chooseFiles(current, [PDF("long.pdf")]);
  await page.getByRole("button", { name: "Importar arquivo" }).click();
  await expect(page.getByRole("table").getByText("Indexado")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /^Mais ações/ }).click();
  await page.getByRole("menuitem", { name: "Excluir" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("Nenhum material ainda")).toBeVisible();
});

test("reads a Word document and a scanned PDF with the bundled OCR (FR-3, FR-4)", async () => {
  current = await launch(profile());
  await openLibrary(current);
  const { page } = current;
  await chooseFiles(current, [join(ROOT, "fixtures", "docx", "sample.docx"), PDF("scanned.pdf")]);
  await page.getByRole("button", { name: "Importar arquivo" }).click();
  const table = page.getByRole("table");
  await expect(table.getByText("Indexado")).toHaveCount(2, { timeout: 90_000 });
  await expect(table.getByRole("row", { name: /scanned/ })).toContainText("OCR");
  await page.getByRole("textbox", { name: "Buscar nos materiais" }).fill("cloroplastos");
  await page.getByRole("button", { name: "Buscar" }).click();
  const hits = page.getByRole("region", { name: "Resultados da busca" });
  await expect(hits).toContainText("sample");
  await expect(hits).toContainText("scanned");
});

test("imports a web page by address and indexes its main text (FR-4)", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<html><head><title>Aula de Química</title></head><body><article><h1>Átomo</h1>
      <p>O átomo é a menor unidade de um elemento químico e contém prótons, nêutrons e elétrons em sua estrutura.</p>
      <p>Os elétrons ocupam níveis de energia ao redor do núcleo, que concentra quase toda a massa do átomo.</p>
      </article></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    current = await launch(profile());
    await openLibrary(current);
    const { page } = current;
    await page.getByRole("button", { name: "Importar URL" }).click();
    const dialog = page.getByRole("dialog", { name: "Importar URL" });
    await dialog.getByLabel("Endereço da página").fill("ftp://x.com");
    await dialog.getByRole("button", { name: "Importar URL" }).click();
    await expect(dialog.getByRole("alert")).toContainText("http:// ou https://");
    await dialog.getByLabel("Endereço da página").fill(`http://127.0.0.1:${port}/aula`);
    await dialog.getByRole("button", { name: "Importar URL" }).click();
    await expect(page.getByRole("table").getByText("Indexado")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("table")).toContainText("Aula de Química");
  } finally {
    server.close();
  }
});
