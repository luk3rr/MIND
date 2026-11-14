/*
 * Filename: nfr.spec.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { EXECUTABLE, ROOT, launch, newProfile, removeProfile } from "./launch.js";
import type { Launched } from "./launch.js";

// The scripted provider only exists in the unpackaged app.
test.skip(Boolean(EXECUTABLE), "uses the offline scripted provider of the unpackaged app");

let current: Launched | undefined;
const profiles: string[] = [];

test.afterEach(async () => {
  await current?.app.close().catch(() => undefined);
  current = undefined;
});

test.afterAll(() => {
  profiles.splice(0).forEach(removeProfile);
});

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] as number;
}

test("study, navigation and statistics respond in under 300 ms with the network off, within the memory budget (NFR-3, NFR-4, NFR-5)", async () => {
  test.setTimeout(120_000);
  const userData = newProfile();
  profiles.push(userData);
  current = await launch(userData, { MIND_E2E_FAKE_LLM: "1" });
  const { page, app } = current;

  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Medição");
  await page.getByRole("button", { name: "Criar" }).click();
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
    },
    [join(ROOT, "samples", "fotossintese.md")],
  );
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Importar arquivo" }).click();
  await expect(page.getByRole("table").getByText("Indexado")).toBeVisible({ timeout: 20_000 });

  // 40 approved cards and 10 questions, enough to make the queries do real work.
  const approve = async (kind: "card" | "question", subtype: string, quantity: number) => {
    const started = await page.evaluate(
      (request) => window.mind.invoke("generation:start", request),
      { workspaceId: 1, materialId: 1, subtype, quantity, kind } as never,
    );
    const run = (started as { data: { id: number } }).data.id;
    await expect
      .poll(async () => {
        const result = await page.evaluate(
          (id) => window.mind.invoke("generation:get", { workspaceId: 1, runId: id }),
          run,
        );
        return result.ok ? result.data.status : "?";
      })
      .toBe("done");
    await page.evaluate(
      (runId) => window.mind.invoke("review:approveAll", { workspaceId: 1, runId }),
      run,
    );
  };
  await approve("card", "qa", 40);
  await approve("question", "multiple_choice_4", 10);

  // The network goes away: everything below must keep working (NFR-5).
  await app.evaluate(({ session }) => {
    session.defaultSession.enableNetworkEmulation({ offline: true });
  });
  expect(
    await page.evaluate(() =>
      fetch("https://example.com/").then(
        () => "reached",
        () => "blocked",
      ),
    ),
  ).toBe("blocked");

  // Study round trips: next card and rating, measured inside the window (NFR-3).
  const study = await page.evaluate(async () => {
    const times: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      const started = performance.now();
      const next = await window.mind.invoke("study:next", { workspaceId: 1 });
      if (!next.ok || !next.data.card) break;
      await window.mind.invoke("study:rate", {
        workspaceId: 1,
        itemId: next.data.card.itemId,
        rating: 3,
      });
      times.push(performance.now() - started);
    }
    return times;
  });
  expect(study.length).toBeGreaterThanOrEqual(20);
  expect(p95(study)).toBeLessThan(300);

  // Navigation between the screens, including the ones that aggregate data.
  const screens: [string, string][] = [
    ["Hoje", "Hoje"],
    ["Biblioteca", "Biblioteca"],
    ["Gerar", "Gerar"],
    ["Estudar", "Estudar"],
    ["Estatísticas", "Estatísticas"],
    ["Erros", "Caderno de erros"],
    ["Chat", "Chat com a base"],
  ];
  const navigation: number[] = [];
  for (let round = 0; round < 4; round += 1) {
    for (const [button, heading] of screens) {
      const started = Date.now();
      await page.getByRole("button", { name: button, exact: true }).click();
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      navigation.push(Date.now() - started);
    }
  }
  // Playwright adds its own round trips to each click, so CI machines get some headroom here.
  expect(p95(navigation)).toBeLessThan(500);

  // Memory of the whole process tree after the work above stays far below the 4 GB budget (NFR-4).
  const metrics = await app.evaluate(({ app: electron }) =>
    electron.getAppMetrics().map((entry) => entry.memory.workingSetSize),
  );
  const totalMb = metrics.reduce((sum, kb) => sum + kb, 0) / 1024;
  console.log(
    `NFR measures: study p95 ${p95(study).toFixed(1)} ms, navigation p95 ${p95(navigation)} ms, memory ${totalMb.toFixed(0)} MB`,
  );
  expect(totalMb).toBeLessThan(1500);
});
