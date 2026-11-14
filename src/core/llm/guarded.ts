/*
 * Filename: guarded.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { z } from "zod";
import { AppError } from "../contracts/errors.js";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import type { SettingsService } from "../settings/service.js";
import type { ConsentService } from "./consent.js";
import type { CostLedger } from "./costs.js";
import type { Completion, CompleteOptions, Provider } from "./provider.js";
import type { Message } from "./types.js";

/** Wraps a provider: blocks without consent or over the monthly limit, and records the cost. */
export class GuardedProvider implements Provider {
  constructor(
    private readonly inner: Provider,
    private readonly consent: ConsentService,
    private readonly ledger: CostLedger,
    private readonly settings: SettingsService,
    private readonly clock: Clock = systemClock,
  ) {}

  get name(): string {
    return this.inner.name;
  }

  get requiresConsent(): boolean {
    return this.inner.requiresConsent;
  }

  async complete<T>(
    messages: readonly Message[],
    schema: z.ZodType<T>,
    options: CompleteOptions,
  ): Promise<Completion<T>> {
    if (this.inner.requiresConsent && !this.consent.isGiven(this.inner.name)) {
      throw new AppError(
        "CONSENT_REQUIRED",
        "Aceite o envio de trechos do material ao provedor antes de gerar conteúdo.",
      );
    }
    const limit = this.settings.get().monthlyLimitUsd;
    const spent = this.ledger.spentThisMonth();
    if (spent >= limit) {
      const now = this.clock.now();
      const month = String(now.getUTCMonth() + 1).padStart(2, "0");
      throw new AppError(
        "MONTHLY_LIMIT_REACHED",
        `Gasto de US$ ${spent.toFixed(2)} de US$ ${limit.toFixed(2)} em ${now.getUTCFullYear()}-${month}.`,
      );
    }
    const completion = await this.inner.complete(messages, schema, options);
    const cost = this.ledger.record(
      this.inner.name,
      options.model,
      options.purpose ?? "generation",
      completion.usage,
    );
    return { value: completion.value, usage: { ...completion.usage, costUsd: cost } };
  }
}
