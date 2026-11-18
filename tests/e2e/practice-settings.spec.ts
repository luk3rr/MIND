/*
 * Filename: practice-settings.spec.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
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

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  return page.getByRole("region", { name: "Práticas de estudo" });
}

test("saves the study practices and finds them again after the app is reopened (FR-21, US-7)", async () => {
  const dir = newProfile();
  profiles.push(dir);
  current = await launch(dir);
  const first = current.page;
  await first.getByRole("button", { name: "Novo workspace" }).click();
  await first.getByLabel("Nome do workspace").fill("Práticas");
  await first.getByRole("button", { name: "Criar" }).click();

  // The defaults keep the behaviour of earlier versions.
  const form = await openSettings(first);
  await expect(form.getByRole("radio", { name: /Imediato/ })).toBeChecked();
  await expect(form.getByRole("checkbox", { name: /Perguntar a confiança/ })).not.toBeChecked();
  await expect(
    form.getByRole("checkbox", { name: /Misturar tópicos por padrão/ }),
  ).not.toBeChecked();

  await form.getByRole("radio", { name: /No dia seguinte/ }).check();
  await form.getByRole("checkbox", { name: /Perguntar a confiança/ }).check();
  await form.getByRole("checkbox", { name: /Misturar tópicos por padrão/ }).check();
  await form.getByRole("button", { name: "Salvar práticas" }).click();
  await expect(first.getByText("Configurações das práticas salvas.")).toBeVisible();

  // A new run of the app on the same data folder still has the choices.
  await current.app.close();
  current = await launch(dir);
  const second = current.page;
  // The app resumes the last screen it showed, with the workspace open.
  await expect(second.getByRole("button", { name: "Configurações", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  const reopened = await openSettings(second);
  await expect(reopened.getByRole("radio", { name: /No dia seguinte/ })).toBeChecked();
  await expect(reopened.getByRole("checkbox", { name: /Perguntar a confiança/ })).toBeChecked();
  await expect(
    reopened.getByRole("checkbox", { name: /Misturar tópicos por padrão/ }),
  ).toBeChecked();

  // Restoring the defaults only fills the form; saving makes it final.
  await reopened.getByRole("button", { name: "Restaurar padrões das práticas" }).click();
  await expect(reopened.getByRole("radio", { name: /Imediato/ })).toBeChecked();
  await reopened.getByRole("button", { name: "Salvar práticas" }).click();
  await expect(second.getByText("Configurações das práticas salvas.")).toBeVisible();
});
