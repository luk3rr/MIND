/*
 * Filename: ui.spec.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
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

async function createWorkspace(launched: Launched, name: string): Promise<void> {
  const { page } = launched;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill(name);
  await page.getByRole("button", { name: "Criar" }).click();
  await expect(page.getByRole("heading", { name: "Hoje" })).toBeVisible();
}

test("creates the first workspace, shows the shell and walks through the sections (FR-28)", async () => {
  const messages: string[] = [];
  current = await launch(profile());
  current.page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") messages.push(message.text());
  });
  current.page.on("pageerror", (error) => messages.push(error.message));
  await createWorkspace(current, "Biologia");
  const { page } = current;

  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav.getByRole("button")).toHaveText([
    "Hoje",
    "Biblioteca",
    "Gerar",
    "Estudar",
    "Estatísticas",
    "Erros",
    "Chat",
  ]);
  for (const section of ["Biblioteca", "Gerar", "Estudar", "Estatísticas", "Erros", "Chat"]) {
    await nav.getByRole("button", { name: section }).click();
    // The page title is the level 1 heading; other headings may contain the same word.
    await expect(page.getByRole("heading", { level: 1, name: section })).toBeVisible();
    await expect(nav.getByRole("button", { name: section })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  await page.getByRole("button", { name: "Configurações" }).click();
  await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
  expect(messages).toEqual([]);
});

test("starts dark and remembers the light theme across restarts (FR-29)", async () => {
  const userData = profile();
  current = await launch(userData);
  await createWorkspace(current, "Tema");
  const theme = () => current?.page.evaluate(() => document.documentElement.dataset["theme"]);
  expect(await theme()).toBe("dark");
  const background = await current.page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(background).toBe("rgb(30, 31, 41)");
  await current.page.getByRole("button", { name: "Alternar tema claro/escuro" }).click();
  expect(await theme()).toBe("light");
  await current.app.close();

  current = await launch(userData);
  expect(await theme()).toBe("light");
});

test("restores the last section after a restart and opens the quick switcher (FR-27, FR-32)", async () => {
  const userData = profile();
  current = await launch(userData);
  await createWorkspace(current, "Atalhos");
  const dialog = current.page.getByRole("dialog", { name: "Ir para" });
  // A shortcut pressed before the window has keyboard focus is lost, so focus first and retry.
  await current.page.bringToFront();
  await current.page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(async () => {
    await current?.page.keyboard.press("Control+s");
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await dialog.getByRole("textbox").fill("estat");
  await current.page.keyboard.press("Enter");
  await expect(current.page.getByRole("heading", { name: "Estatísticas" })).toBeVisible();
  await current.page.keyboard.press("Control+,");
  await expect(current.page.getByRole("heading", { name: "Configurações" })).toBeVisible();
  await current.app.close();

  current = await launch(userData);
  await expect(current.page.getByRole("heading", { name: "Configurações" })).toBeVisible();
});

test("loads the bundled fonts without the network (FR-23)", async () => {
  current = await launch(profile());
  await createWorkspace(current, "Fontes");
  const fonts = await current.page.evaluate(async () => {
    // Fonts load on demand, so ask for both families explicitly.
    await Promise.all([
      document.fonts.load("16px Inter"),
      document.fonts.load("16px 'JetBrains Mono'"),
    ]);
    return {
      inter: document.fonts.check("16px Inter"),
      mono: document.fonts.check("16px 'JetBrains Mono'"),
    };
  });
  expect(fonts).toEqual({ inter: true, mono: true });
});
