/*
 * Filename: time.spec.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
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

test("runs the study timer, shows it in the status bar, statistics and settings (US-1..US-7)", async () => {
  const dir = newProfile();
  profiles.push(dir);
  current = await launch(dir);
  const { page } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Tempo");
  await page.getByRole("button", { name: "Criar" }).click();

  // The card on Today starts the manual timer and the status bar follows it.
  const card = page.getByRole("region", { name: "Tempo de estudo" });
  await expect(card.getByText("Nenhum tempo registrado hoje")).toBeVisible();
  await card.getByRole("button", { name: "Iniciar cronômetro" }).click();
  const bar = page.getByRole("group", { name: "Cronômetro de estudo" });
  await expect(bar).toBeVisible();
  await expect(bar.getByText(/^0:00:0[2-9]$/)).toBeVisible({ timeout: 8000 });
  await bar.getByRole("button", { name: "Pausar" }).click();
  await expect(bar.getByText("pausado")).toBeVisible();
  await bar.getByRole("button", { name: "Retomar" }).click();
  await bar.getByRole("button", { name: "Encerrar" }).click();
  await expect(bar).toBeHidden();
  await expect(card.getByText("Nenhum tempo registrado hoje")).toBeHidden();

  // The interval is in the history of the statistics.
  await page.getByRole("button", { name: "Estatísticas", exact: true }).click();
  const history = page.getByRole("table", { name: "Sessões recentes" });
  await expect(history).toBeVisible();
  await expect(history.getByRole("cell", { name: "manual" }).first()).toBeVisible();

  // The goal saved in Settings is the one Today shows.
  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  const goal = page.getByLabel(/Meta diária \(minutos/);
  await goal.fill("90");
  await page.getByRole("button", { name: "Salvar tempo" }).click();
  await expect(page.getByText("Configurações de tempo salvas.")).toBeVisible();
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(page.getByText(/Meta: 90 min/)).toBeVisible();
});
