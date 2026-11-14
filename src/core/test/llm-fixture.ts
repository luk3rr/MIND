/*
 * Filename: llm-fixture.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { join } from "node:path";
import { z } from "zod";
import { fixedClock, tempDir } from "../test/helpers.js";
import { openAppDatabase } from "../db/databases.js";
import { SecretStore } from "../secrets.js";
import { SettingsService } from "../settings/service.js";
import { ConsentService } from "../llm/consent.js";
import { CostLedger, PriceCatalog } from "../llm/costs.js";
import { FakeProvider } from "../llm/fake.js";
import { GuardedProvider } from "../llm/guarded.js";

export const Card = z.object({ front: z.string(), back: z.string() });

/** The provider layer on an in-memory-like temp database with a controllable clock. */
export function llmFixture() {
  const dir = tempDir();
  const clock = fixedClock("2026-03-15T12:00:00.000Z");
  const connection = openAppDatabase(join(dir, "app.db"));
  const secrets = new SecretStore(join(dir, "ai"), {});
  const settings = new SettingsService(connection, secrets);
  const consent = new ConsentService(connection, clock);
  const catalog = new PriceCatalog(connection, clock);
  const ledger = new CostLedger(connection, catalog, clock);
  const inner = new FakeProvider();
  inner.script("Card", { front: "Q", back: "A" });
  const guarded = new GuardedProvider(
    { ...inner, name: "openrouter", requiresConsent: true, complete: inner.complete.bind(inner) },
    consent,
    ledger,
    settings,
    clock,
  );
  return { connection, clock, secrets, settings, consent, catalog, ledger, inner, guarded };
}
