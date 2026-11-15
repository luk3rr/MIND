/*
 * Filename: study.spec.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXECUTABLE, launch, newProfile, removeProfile } from "./launch.js";
import type { Launched } from "./launch.js";

// The scripted provider only exists in the unpackaged app, so these tests skip against a package.
test.skip(Boolean(EXECUTABLE), "uses the offline scripted provider of the unpackaged app");

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

const TEXT = [
  "# Biologia",
  "",
  "A fotossíntese converte a energia da luz em energia química nos cloroplastos das plantas verdes.",
  "",
  "A respiração celular libera energia armazenada nas moléculas de glicose dentro das mitocôndrias.",
  "",
  "O ciclo de Calvin fixa o dióxido de carbono em açúcares usando ATP e NADPH produzidos antes.",
].join("\n");

/** Creates a workspace, imports a text and approves generated cards and questions. */
async function prepare(launched: Launched): Promise<void> {
  const { page, app } = launched;
  const notes = join(profile(), "bio.md");
  writeFileSync(notes, TEXT);
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Estudo");
  await page.getByRole("button", { name: "Criar" }).click();
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
    },
    [notes],
  );
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Importar arquivo" }).click();
  await expect(page.getByRole("table").getByText("Indexado")).toBeVisible({ timeout: 20_000 });
  await generate(page, "card", "qa", 6);
  await generate(page, "question", "multiple_choice_4", 3);
}

async function generate(
  page: Page,
  kind: "card" | "question",
  subtype: string,
  quantity: number,
): Promise<void> {
  const before = await page.evaluate(() =>
    window.mind.invoke("generation:list", { workspaceId: 1 }),
  );
  const known = before.ok ? before.data.runs.length : 0;
  const started = await page.evaluate(
    (request) => window.mind.invoke("generation:start", request),
    { workspaceId: 1, materialId: 1, subtype, quantity, kind } as never,
  );
  expect(started.ok).toBe(true);
  await expect
    .poll(async () => {
      const result = await page.evaluate(() =>
        window.mind.invoke("generation:list", { workspaceId: 1 }),
      );
      return result.ok ? result.data.runs.filter((run) => run.status === "done").length : -1;
    })
    .toBe(known + 1);
  const run = (started as { data: { id: number } }).data.id;
  const approved = await page.evaluate(
    (runId) => window.mind.invoke("review:approveAll", { workspaceId: 1, runId }),
    run,
  );
  expect(approved).toMatchObject({ ok: true, data: { approved: quantity } });
}

test("studies the day's queue with the keyboard and updates Today (FR-12, FR-13, FR-32, NFR-3)", async () => {
  current = await launch(profile(), { MIND_E2E_FAKE_LLM: "1" });
  await prepare(current);
  const { page } = current;

  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(page.getByRole("button", { name: "Estudar agora (6)" })).toBeVisible();
  await page.getByRole("button", { name: "Estudar agora (6)" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Estudar" })).toBeVisible();
  await expect(page.getByLabel("Frente")).toContainText("O que o trecho");

  const latencies: number[] = [];
  for (let done = 0; done < 6; done += 1) {
    await page.keyboard.press("Space");
    await expect(page.getByLabel("Verso")).toBeVisible();
    await expect(page.getByRole("button", { name: /^3 · Bom/ })).toContainText(/min|h|d/);
    const before = Date.now();
    await page.keyboard.press("3");
    if (done < 5) {
      await expect(page.getByLabel("Verso")).toHaveCount(0);
      latencies.push(Date.now() - before);
    }
  }
  // The six new cards are now in learning; the quota of new cards for today is used up only at 20.
  expect(Math.max(...latencies)).toBeLessThan(1000);

  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(page.getByText("Feitos hoje")).toBeVisible();
  const today = await page.evaluate(() => window.mind.invoke("study:today", { workspaceId: 1 }));
  expect(today).toMatchObject({
    ok: true,
    data: { counts: { reviewedToday: 6 } },
  });
});

test("undoes the last rating with Ctrl+Z", async () => {
  current = await launch(profile(), { MIND_E2E_FAKE_LLM: "1" });
  await prepare(current);
  const { page } = current;
  await page.getByRole("button", { name: "Estudar", exact: true }).click();
  await page.keyboard.press("Space");
  await page.keyboard.press("4");
  await expect(page.getByLabel("Verso")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  const state = await page.evaluate(() => window.mind.invoke("study:today", { workspaceId: 1 }));
  expect(state).toMatchObject({ ok: true, data: { counts: { reviewedToday: 0 } } });
});

test("practices generated questions and records the attempts (FR-9, FR-14)", async () => {
  current = await launch(profile(), { MIND_E2E_FAKE_LLM: "1" });
  await prepare(current);
  const { page } = current;
  await page.getByRole("button", { name: "Estudar", exact: true }).click();
  await page.getByRole("tab", { name: /Questões/ }).click();
  await expect(page.getByRole("heading", { name: "Praticar questões" })).toBeVisible();
  await expect(page.getByText(/3 novas/)).toBeVisible();

  await page.getByRole("radio", { name: /^B/ }).click();
  await page.getByRole("button", { name: "Responder" }).click();
  await expect(page.getByText(/Resposta errada\. Gabarito: A/)).toBeVisible();
  await expect(page.locator("blockquote")).toContainText("Fonte: bio");
  await page.getByRole("button", { name: "Próxima" }).click();
  // Wait for the next question to be on screen before using the keyboard.
  await expect(page.getByRole("button", { name: "Responder" })).toBeVisible();
  await page.keyboard.press("1");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Resposta correta! Gabarito: A/)).toBeVisible();

  const counts = await page.evaluate(() =>
    window.mind.invoke("practice:counts", { workspaceId: 1 }),
  );
  expect(counts).toMatchObject({
    ok: true,
    data: { unseen: 1, retry: 1, answeredToday: 2, correctToday: 1 },
  });
});

test("generates calculation questions whose arithmetic the app confirmed (offline)", async () => {
  current = await launch(profile(), { MIND_E2E_FAKE_LLM: "1" });
  await prepare(current);
  const { page } = current;
  await generate(page, "question", "calculation_5", 2);
  const runs = await page.evaluate(() => window.mind.invoke("generation:list", { workspaceId: 1 }));
  const runId = Math.max(...(runs.ok ? runs.data.runs.map((run) => run.id) : [0]));
  const listed = await page.evaluate(
    (id) => window.mind.invoke("review:list", { workspaceId: 1, runId: id, status: "approved" }),
    runId,
  );
  expect(listed.ok).toBe(true);
  const calculations = (listed.ok ? listed.data.items : []).filter((entry) =>
    entry.back.includes("Conta conferida pelo app"),
  );
  expect(calculations).toHaveLength(2);
  expect(calculations.every((entry) => entry.options.length === 5)).toBe(true);
  expect(calculations[0]?.back).toContain(" R$");
  expect(calculations[0]?.back).toContain(",");
});

test("skips a question, goes back to it and filters the questions by type (practice session)", async () => {
  current = await launch(profile(), { MIND_E2E_FAKE_LLM: "1" });
  await prepare(current);
  const { page } = current;
  await page.getByRole("button", { name: "Estudar", exact: true }).click();
  await page.getByRole("tab", { name: /Questões/ }).click();
  await expect(page.getByRole("combobox", { name: "Estudar" })).toBeVisible();
  await expect(page.getByText(/Questão 1 de 1/)).toBeVisible();
  await page.getByRole("button", { name: "Pular" }).click();
  await expect(page.getByText(/Questão 2 de 2/)).toBeVisible();
  await page.getByRole("button", { name: "Anterior" }).click();
  await expect(page.getByText(/Questão 1 de 2/)).toBeVisible();
  const counts = await page.evaluate(() =>
    window.mind.invoke("practice:counts", { workspaceId: 1 }),
  );
  expect(counts).toMatchObject({ ok: true, data: { answeredToday: 0 } });
  await page
    .getByRole("combobox", { name: "Estudar" })
    .selectOption({ label: "Múltipla escolha (3)" });
  await expect(page.getByText(/Questão 1 de 1/)).toBeVisible();
});
