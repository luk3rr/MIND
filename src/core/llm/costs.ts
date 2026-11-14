/*
 * Filename: costs.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { desc, gte, lt, and, eq, sum, max, asc } from "drizzle-orm";
import { isoNow, systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { costLedger, modelPrice } from "../db/app-schema.js";
import type { AppConnection } from "../db/databases.js";
import type { FetchLike } from "./openrouter.js";
import type { Usage } from "./types.js";

export const MODELS_URL = "https://openrouter.ai/api/v1/models";
export const PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const CHARS_PER_TOKEN = 4;

export interface Price {
  promptUsdPerToken: number;
  completionUsdPerToken: number;
}

export interface CostLine {
  at: string;
  provider: string;
  model: string;
  purpose: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

/** Half-open UTC bounds of a calendar month, as ISO strings. */
export function monthBounds(year: number, month: number): { start: string; end: string } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    end: new Date(Date.UTC(year, month, 1)).toISOString(),
  };
}

interface CatalogEntry {
  id?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
}

/** Model prices cached in the database and refreshed from the public catalog. */
export class PriceCatalog {
  constructor(
    private readonly connection: AppConnection,
    private readonly clock: Clock = systemClock,
  ) {}

  get(model: string): Price | null {
    const row = this.connection.db
      .select()
      .from(modelPrice)
      .where(eq(modelPrice.model, model))
      .get();
    return row
      ? {
          promptUsdPerToken: row.promptUsdPerToken,
          completionUsdPerToken: row.completionUsdPerToken,
        }
      : null;
  }

  knownModels(): string[] {
    return this.connection.db
      .select({ model: modelPrice.model })
      .from(modelPrice)
      .orderBy(asc(modelPrice.model))
      .all()
      .map((row) => row.model);
  }

  isFresh(): boolean {
    const newest = this.connection.db
      .select({ at: max(modelPrice.fetchedAt) })
      .from(modelPrice)
      .get()?.at;
    return (
      newest !== null &&
      newest !== undefined &&
      this.clock.now().getTime() - Date.parse(newest) < PRICE_MAX_AGE_MS
    );
  }

  /** Fetches prices when the cache is stale. Returns false if the fetch failed. */
  async refresh(fetchImpl: FetchLike, force = false): Promise<boolean> {
    if (!force && this.isFresh()) return true;
    let entries: CatalogEntry[];
    try {
      const response = await fetchImpl(MODELS_URL, {
        method: "GET",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return false;
      entries = ((await response.json()) as { data: CatalogEntry[] }).data;
      if (!Array.isArray(entries)) return false;
    } catch {
      return false;
    }
    const fetchedAt = isoNow(this.clock);
    const rows = entries.flatMap((entry) => {
      const prompt = entry.pricing?.prompt;
      const completion = entry.pricing?.completion;
      if (
        prompt === undefined ||
        prompt === null ||
        completion === undefined ||
        completion === null
      )
        return [];
      return [
        {
          model: String(entry.id),
          promptUsdPerToken: Number(prompt),
          completionUsdPerToken: Number(completion),
          fetchedAt,
        },
      ];
    });
    this.connection.sqlite.transaction(() => {
      for (const row of rows) {
        this.connection.db
          .insert(modelPrice)
          .values(row)
          .onConflictDoUpdate({ target: modelPrice.model, set: row })
          .run();
      }
    })();
    return true;
  }

  /** Estimates the cost of a call, or null when the model price is unknown. */
  estimate(model: string, promptChars: number, maxCompletionTokens: number): number | null {
    const price = this.get(model);
    if (!price) return null;
    const promptTokens = Math.ceil(promptChars / CHARS_PER_TOKEN);
    return (
      promptTokens * price.promptUsdPerToken + maxCompletionTokens * price.completionUsdPerToken
    );
  }
}

export class CostLedger {
  constructor(
    private readonly connection: AppConnection,
    private readonly catalog: PriceCatalog,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Stores one call. The provider-reported cost wins; otherwise tokens times price. */
  record(provider: string, model: string, purpose: string, usage: Usage): number {
    let cost = usage.costUsd;
    if (cost === null) {
      const price = this.catalog.get(model);
      cost = price
        ? usage.promptTokens * price.promptUsdPerToken +
          usage.completionTokens * price.completionUsdPerToken
        : 0;
    }
    this.connection.db
      .insert(costLedger)
      .values({
        at: isoNow(this.clock),
        provider,
        model,
        purpose,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        costUsd: cost,
      })
      .run();
    return cost;
  }

  monthTotal(year: number, month: number): number {
    const { start, end } = monthBounds(year, month);
    const row = this.connection.db
      .select({ total: sum(costLedger.costUsd) })
      .from(costLedger)
      .where(and(gte(costLedger.at, start), lt(costLedger.at, end)))
      .get();
    return Number(row?.total ?? 0);
  }

  spentThisMonth(): number {
    const now = this.clock.now();
    return this.monthTotal(now.getUTCFullYear(), now.getUTCMonth() + 1);
  }

  monthLines(year: number, month: number): CostLine[] {
    const { start, end } = monthBounds(year, month);
    return this.connection.db
      .select()
      .from(costLedger)
      .where(and(gte(costLedger.at, start), lt(costLedger.at, end)))
      .orderBy(desc(costLedger.at), desc(costLedger.id))
      .all()
      .map((row) => ({
        at: row.at,
        provider: row.provider,
        model: row.model,
        purpose: row.purpose,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        costUsd: row.costUsd,
      }));
  }
}
