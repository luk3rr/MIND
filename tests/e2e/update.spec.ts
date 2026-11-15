/*
 * Filename: update.spec.ts
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { EXECUTABLE, launch, newProfile, removeProfile } from "./launch.js";
import type { Launched } from "./launch.js";

// The release address can only be redirected in the unpackaged app.
test.skip(Boolean(EXECUTABLE), "the packaged app only asks GitHub");

let current: Launched | undefined;
let server: Server | undefined;
const profiles: string[] = [];

test.afterEach(async () => {
  await current?.app.close().catch(() => undefined);
  current = undefined;
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

test.afterAll(() => {
  profiles.splice(0).forEach(removeProfile);
});

/** A stand-in for the GitHub API that answers with the given latest release. */
async function releaseServer(tag: string): Promise<string> {
  server = createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        tag_name: tag,
        html_url: `https://github.com/luk3rr/MIND/releases/tag/${tag}`,
      }),
    );
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/latest`;
}

test("tells about a new version, lets it be dismissed and checks by hand (update notice)", async () => {
  const url = await releaseServer("v99.0.0");
  const dir = newProfile();
  profiles.push(dir);
  current = await launch(dir, { MIND_UPDATE_URL: url });
  const { page } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Versões");
  await page.getByRole("button", { name: "Criar" }).click();
  await expect(page.getByText(/Nova versão/)).toHaveCount(0);

  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  const section = page.getByRole("region", { name: "Atualizações" });
  await expect(section.getByText(/Versão instalada: \d+\.\d+\.\d+/)).toBeVisible();
  await section.getByRole("button", { name: "Verificar agora" }).click();
  await expect(section.getByText("Há uma nova versão: 99.0.0.")).toBeVisible();

  // The banner shows on every screen of the workspace until it is dismissed.
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  const banner = page.getByText(/Nova versão 99\.0\.0 disponível/);
  await expect(banner).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver a nova versão" })).toBeVisible();
  await page.getByRole("button", { name: "Agora não" }).click();
  await expect(banner).toHaveCount(0);
  await page.getByRole("button", { name: "Estudar", exact: true }).click();
  await expect(page.getByText(/Nova versão 99/)).toHaveCount(0);

  // A dismissed version stays hidden after a restart, even when it is found again.
  await current.app.close();
  current = await launch(dir, { MIND_UPDATE_URL: url });
  const again = current.page;
  await again.getByRole("button", { name: "Configurações", exact: true }).click();
  const settings = again.getByRole("region", { name: "Atualizações" });
  await settings.getByRole("button", { name: "Verificar agora" }).click();
  await expect(settings.getByText("Há uma nova versão: 99.0.0.")).toBeVisible();
  await again.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(again.getByRole("heading", { name: "Hoje" })).toBeVisible();
  await expect(again.getByText(/Nova versão 99/)).toHaveCount(0);
});

test("reports a failed check without breaking the settings", async () => {
  const dir = newProfile();
  profiles.push(dir);
  current = await launch(dir, { MIND_UPDATE_URL: "http://127.0.0.1:9/never" });
  const { page } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Offline");
  await page.getByRole("button", { name: "Criar" }).click();
  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  const section = page.getByRole("region", { name: "Atualizações" });
  await section.getByRole("button", { name: "Verificar agora" }).click();
  await expect(section.getByText(/Não foi possível verificar agora/)).toBeVisible();
  await expect(section.getByRole("button", { name: "Verificar agora" })).toBeEnabled();
});
