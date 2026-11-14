/*
 * Filename: provider.spec.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
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

function* files(directory: string): Generator<string> {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const KEY = "sk-or-v1-e2e-secret-key-1234567890";

test("configures the provider through the setup without leaking the key (FR-19, FR-20, NFR-7)", async () => {
  const userData = profile();
  current = await launch(userData);
  const { page } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Provedor");
  await page.getByRole("button", { name: "Criar" }).click();
  await expect(page.getByText(/Configure o provedor de IA/)).toBeVisible();

  await page.getByRole("button", { name: "Configurar" }).click();
  await expect(page.getByText("Passo 1 de 2: chave e modelos")).toBeVisible();
  await page.getByLabel("Chave de API do OpenRouter").fill(KEY);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Passo 2 de 2: privacidade")).toBeVisible();
  await page.getByRole("button", { name: "Aceito" }).click();
  await expect(page.getByRole("heading", { name: "Hoje" })).toBeVisible();
  await expect(page.getByText(/Configure o provedor de IA/)).toHaveCount(0);

  const view = await page.evaluate(() => window.mind.invoke("settings:get", {}));
  expect(view).toMatchObject({
    ok: true,
    data: { keyConfigured: true, keySource: "stored", consentGiven: true },
  });
  expect(JSON.stringify(view)).not.toContain(KEY);
  expect(await page.content()).not.toContain(KEY);
  await current.app.close();
  current = undefined;

  // The key is in no file of the profile in clear text, and the key files are private.
  const all = [...files(userData)];
  for (const path of all) {
    expect(readFileSync(path).includes(KEY), path).toBe(false);
  }
  for (const name of ["keystore.key", "credentials.enc"]) {
    const path = all.find((file) => file.endsWith(join("ai", name)));
    expect(path, name).toBeDefined();
    expect(statSync(path as string).mode & 0o777).toBe(0o600);
  }

  // After a restart the configuration is still there and the banner stays hidden.
  current = await launch(userData);
  await expect(current.page.getByRole("heading", { name: "Hoje" })).toBeVisible();
  await expect(current.page.getByText(/Configure o provedor de IA/)).toHaveCount(0);
});

test("lets the environment variable win and reports it as the key source", async () => {
  current = await launch(profile(), { OPENROUTER_API_KEY: KEY });
  const view = await current.page.evaluate(() => window.mind.invoke("settings:get", {}));
  expect(view).toMatchObject({ ok: true, data: { keyConfigured: true, keySource: "environment" } });
  expect(JSON.stringify(view)).not.toContain(KEY);
});
