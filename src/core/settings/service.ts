/*
 * Filename: service.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { AppError } from "../contracts/errors.js";
import type { FieldError } from "../contracts/errors.js";
import { setting } from "../db/app-schema.js";
import type { AppConnection } from "../db/databases.js";
import type { SecretStore } from "../secrets.js";

export const SUPPORTED_PROVIDERS = ["openrouter"] as const;
const MODEL_PATTERN = /^[\w.\-:/]{1,128}$/;
export const MAX_MONTHLY_LIMIT = 10_000;

export const DEFAULTS = {
  provider: "openrouter",
  generation_model: "anthropic/claude-haiku-5.5",
  judge_model: "anthropic/claude-sonnet-5.5",
  monthly_limit_usd: "5",
} as const;

/** What the user can configure about the provider. It never contains the API key. */
export interface ProviderSettings {
  provider: string;
  generationModel: string;
  judgeModel: string;
  monthlyLimitUsd: number;
}

export interface SettingsUpdate {
  provider?: string;
  generationModel?: string;
  judgeModel?: string;
  monthlyLimitUsd?: number;
}

export class SettingsService {
  constructor(
    private readonly connection: AppConnection,
    private readonly secrets: SecretStore,
  ) {}

  get(): ProviderSettings {
    const stored = Object.fromEntries(
      this.connection.db
        .select()
        .from(setting)
        .all()
        .map((row) => [row.key, row.value]),
    );
    const merged = { ...DEFAULTS, ...stored };
    return {
      provider: merged.provider,
      generationModel: merged.generation_model,
      judgeModel: merged.judge_model,
      monthlyLimitUsd: Number(merged.monthly_limit_usd),
    };
  }

  keyConfigured(): boolean {
    return this.secrets.isConfigured();
  }

  update(update: SettingsUpdate): ProviderSettings {
    const changes: Record<string, string> = {};
    const errors: FieldError[] = [];
    if (update.provider !== undefined) {
      if ((SUPPORTED_PROVIDERS as readonly string[]).includes(update.provider)) {
        changes["provider"] = update.provider;
      } else {
        errors.push({ field: "provider", message: "Provedor não suportado." });
      }
    }
    for (const [field, key, value] of [
      ["generationModel", "generation_model", update.generationModel],
      ["judgeModel", "judge_model", update.judgeModel],
    ] as const) {
      if (value === undefined) continue;
      if (MODEL_PATTERN.test(value.trim())) changes[key] = value.trim();
      else errors.push({ field, message: "Informe o identificador do modelo." });
    }
    if (update.monthlyLimitUsd !== undefined) {
      const limit = update.monthlyLimitUsd;
      if (Number.isFinite(limit) && limit > 0 && limit <= MAX_MONTHLY_LIMIT) {
        changes["monthly_limit_usd"] = String(limit);
      } else {
        errors.push({ field: "monthlyLimitUsd", message: "Informe um valor maior que zero." });
      }
    }
    if (errors.length > 0)
      throw new AppError("VALIDATION_ERROR", "Configurações inválidas.", errors);
    this.connection.sqlite.transaction(() => {
      for (const [key, value] of Object.entries(changes)) {
        this.connection.db
          .insert(setting)
          .values({ key, value })
          .onConflictDoUpdate({ target: setting.key, set: { value } })
          .run();
      }
    })();
    return this.get();
  }
}
