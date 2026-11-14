/*
 * Filename: app-schema.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = (): string => new Date().toISOString();

/** Tables of the global `app.db` database. */
export const workspace = sqliteTable("workspace", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
  folder: text("folder").notNull().unique(),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

export const setting = sqliteTable("setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const consent = sqliteTable("consent", {
  provider: text("provider").primaryKey(),
  acceptedAt: text("accepted_at").notNull().$defaultFn(now),
});

export const costLedger = sqliteTable(
  "cost_ledger",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    at: text("at").notNull().$defaultFn(now),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    purpose: text("purpose").notNull(),
    promptTokens: integer("prompt_tokens").notNull(),
    completionTokens: integer("completion_tokens").notNull(),
    costUsd: real("cost_usd").notNull(),
  },
  (table) => [index("ix_cost_ledger_at").on(table.at)],
);

export const modelPrice = sqliteTable("model_price", {
  model: text("model").primaryKey(),
  promptUsdPerToken: real("prompt_usd_per_token").notNull(),
  completionUsdPerToken: real("completion_usd_per_token").notNull(),
  fetchedAt: text("fetched_at").notNull().$defaultFn(now),
});
