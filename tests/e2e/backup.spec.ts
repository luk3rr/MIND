/*
 * Filename: backup.spec.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, newProfile, removeProfile } from "./launch.js";
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

test("exports a workspace and imports it back as a copy (FR-22, NFR-17)", async () => {
  current = await launch(profile());
  const { page, app } = current;
  const notes = join(profile(), "bio.md");
  writeFileSync(notes, "# Biologia\n\nA mitocôndria produz energia para a célula.");
  const backup = join(profile(), "backup.zip");
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Biologia");
  await page.getByRole("button", { name: "Criar" }).click();
  await app.evaluate(
    ({ dialog }, paths) => {
      dialog.showOpenDialog = (...args: unknown[]) => {
        const options = (args.length > 1 ? args[1] : args[0]) as { filters?: { name: string }[] };
        const isBackup = options.filters?.[0]?.name === "Backup do MIND";
        return Promise.resolve({
          canceled: false,
          filePaths: [isBackup ? paths.backup : paths.notes],
        });
      };
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: paths.backup });
    },
    { notes, backup },
  );
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Importar arquivo" }).click();
  await expect(page.getByRole("table").getByText("Indexado")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /Workspace: Biologia/ }).click();
  await page.getByRole("menuitem", { name: "Exportar…" }).click();
  await expect(page.getByRole("dialog")).toContainText("Backup salvo em");
  expect(existsSync(backup)).toBe(true);
  await page.getByRole("button", { name: "Ok" }).click();

  await page.getByRole("button", { name: /Workspace: Biologia/ }).click();
  await page.getByRole("menuitem", { name: "Importar backup…" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    'Workspace "Biologia (importado)" importado.',
  );
  await page.getByRole("button", { name: "Abrir workspace" }).click();
  await expect(
    page.getByRole("button", { name: /Workspace: Biologia \(importado\)/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await expect(page.getByRole("table").getByText("Indexado")).toBeVisible();
  await page.getByLabel("Buscar nos materiais").fill("mitocôndria");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText(/mitocôndria produz energia/)).toBeVisible();
});
