/*
 * Filename: import.spec.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

const BOM = String.fromCharCode(0xfeff);

/** A new workspace on the Items screen with the Import dialog open. */
async function openImport(): Promise<{
  dir: string;
  page: Launched["page"];
  app: Launched["app"];
}> {
  const dir = newProfile();
  profiles.push(dir);
  current = await launch(dir);
  const { page, app } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Importação");
  await page.getByRole("button", { name: "Criar" }).click();
  await page.getByRole("button", { name: "Itens", exact: true }).click();
  await page.getByRole("button", { name: "Importar…" }).click();
  return { dir, page, app };
}

test("downloads a template, fills it, checks the preview and imports (FR-13 to FR-17, US-6 to US-8)", async () => {
  const { dir, page, app } = await openImport();
  const dialog = page.getByRole("dialog", { name: "Importar itens" });

  // The template goes where the save dialog says, with the BOM and ; that Excel in Portuguese expects.
  const template = join(dir, "modelo.csv");
  await app.evaluate(({ dialog: native }, path) => {
    native.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path });
  }, template);
  await dialog.getByRole("button", { name: "Cartões · CSV" }).click();
  await expect(dialog.getByText("Template salvo.")).toBeVisible();
  expect(readFileSync(template, "utf8").startsWith(`${BOM}subtipo;frente;verso;topico`)).toBe(true);

  // A filled-in file: three good rows, one without a back, one that repeats an earlier row.
  const filled = join(dir, "cartoes.csv");
  writeFileSync(
    filled,
    [
      "subtipo;frente;verso;topico",
      ";Qual a capital da França?;Paris.;Geografia",
      ";Qual a capital da Itália?;Roma.;Geografia",
      "lacuna;A capital da Alemanha é {{c1::Berlim}}.;;Geografia",
      ";Pergunta sem resposta?;;Geografia",
      ";qual a capital da frança?;Paris de novo.;Geografia",
    ].join("\r\n"),
  );
  await app.evaluate(({ dialog: native }, path) => {
    native.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
  }, filled);
  await dialog.getByRole("button", { name: "Escolher arquivo…" }).click();
  const preview = page.getByRole("dialog", { name: "Importar itens" });
  await expect(preview.getByText("cartoes.csv · 5 linha(s)")).toBeVisible();
  await expect(preview.getByText("3 válida(s)", { exact: true })).toBeVisible();
  await expect(preview.getByText("1 com erro", { exact: true })).toBeVisible();
  await expect(preview.getByText("1 duplicada(s)", { exact: true })).toBeVisible();
  await expect(preview.getByText("O verso do card não pode ficar vazio.")).toBeVisible();
  await expect(preview.getByText("Repetida: igual à linha 2 do arquivo.")).toBeVisible();
  await expect(preview.getByText("Tópicos que serão criados: Geografia.")).toBeVisible();
  // Nothing is stored until the confirmation.
  const before = await page.evaluate(() => window.mind.invoke("items:list", { workspaceId: 1 }));
  expect(before).toMatchObject({ ok: true, data: { items: [] } });

  await preview.getByRole("button", { name: "Importar 3 válida(s)" }).click();
  const done = page.getByRole("dialog", { name: "Importação concluída" });
  await expect(
    done.getByText(
      /3 item\(ns\) adicionado\(s\) e aprovado\(s\), 1 duplicada\(s\) pulada\(s\), 1 linha\(s\) com erro ignorada\(s\)\. 1 tópico\(s\) criado\(s\)\./,
    ),
  ).toBeVisible();
  await done.getByRole("button", { name: "Ver itens importados" }).click();
  const table = page.getByRole("table", { name: "Itens" });
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(table.getByText("Importado")).toHaveCount(3);
  await expect(table.getByText("Qual a capital da Itália?")).toBeVisible();

  // The imported cards are approved, so they are due in the study queue.
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(page.getByRole("button", { name: "Estudar agora (3)" })).toBeVisible();
});

test("imports the spreadsheet template as it was downloaded, and refuses a file with a wrong header (FR-14, FR-18)", async () => {
  const { dir, page, app } = await openImport();
  const dialog = page.getByRole("dialog", { name: "Importar itens" });
  const xlsx = join(dir, "modelo-questoes.xlsx");
  await app.evaluate(({ dialog: native }, path) => {
    native.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path });
  }, xlsx);
  await dialog.getByRole("button", { name: "Questões · XLSX" }).click();
  await expect(dialog.getByText("Template salvo.")).toBeVisible();
  expect(existsSync(xlsx)).toBe(true);

  // The workbook the app wrote is read back by the app, on the real Electron runtime.
  await app.evaluate(({ dialog: native }, path) => {
    native.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
  }, xlsx);
  await dialog.getByRole("radio", { name: "Questões" }).check();
  await dialog.getByRole("button", { name: "Escolher arquivo…" }).click();
  const preview = page.getByRole("dialog", { name: "Importar itens" });
  await expect(preview.getByText("2 válida(s)", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(preview.getByText("0 com erro", { exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Voltar" }).click();

  const wrong = join(dir, "errado.csv");
  writeFileSync(wrong, "pergunta;resposta\r\nA?;B\r\n");
  await app.evaluate(({ dialog: native }, path) => {
    native.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
  }, wrong);
  await page
    .getByRole("dialog", { name: "Importar itens" })
    .getByRole("radio", { name: "Cards" })
    .check();
  await page
    .getByRole("dialog", { name: "Importar itens" })
    .getByRole("button", { name: "Escolher arquivo…" })
    .click();
  await expect(
    page.getByText("Colunas obrigatórias ausentes: frente, verso. Baixe o template de cartões."),
  ).toBeVisible();
});
