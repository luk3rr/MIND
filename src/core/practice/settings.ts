/*
 * Filename: settings.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { eq, inArray } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import type { FieldError } from "../contracts/errors.js";
import { meta } from "../db/workspace-schema.js";
import type { OpenWorkspace } from "../workspaces/registry.js";

export const FEEDBACK_MODES = ["immediate", "block", "next_day"] as const;
export type FeedbackMode = (typeof FEEDBACK_MODES)[number];

/** The study practices a workspace can turn on; the defaults keep the behaviour of earlier versions. */
export interface PracticeSettingsValues {
  /** When the answer to a question is shown: at once, at the end of the block or the next day. */
  feedback: FeedbackMode;
  /** Ask how sure the student is before every answer. */
  confidence: boolean;
  /** Mix topics in the study and practice queues by default. */
  interleave: boolean;
}

export const PRACTICE_DEFAULTS: PracticeSettingsValues = {
  feedback: "immediate",
  confidence: false,
  interleave: false,
};

const KEYS = {
  feedback: "practice.feedback",
  confidence: "practice.confidence",
  interleave: "study.interleave",
} as const;

const FEEDBACK_ERROR = "Escolha imediato, ao fim do bloco ou no dia seguinte.";
const BOOLEAN_ERROR = "Use ligado ou desligado.";

function isFeedbackMode(value: unknown): value is FeedbackMode {
  return typeof value === "string" && (FEEDBACK_MODES as readonly string[]).includes(value);
}

/** Per-workspace settings of the study practices, stored as plain keys in `meta`. */
export class PracticeSettings {
  constructor(private readonly workspace: OpenWorkspace) {}

  private get db() {
    return this.workspace.connection.db;
  }

  /** The values as stored; a missing or unknown value falls back to its default. */
  get(): PracticeSettingsValues {
    const stored = new Map(
      this.db
        .select()
        .from(meta)
        .where(inArray(meta.key, Object.values(KEYS)))
        .all()
        .map((row) => [row.key, row.value]),
    );
    const feedback = stored.get(KEYS.feedback);
    return {
      feedback: isFeedbackMode(feedback) ? feedback : PRACTICE_DEFAULTS.feedback,
      confidence: stored.has(KEYS.confidence)
        ? stored.get(KEYS.confidence) === "1"
        : PRACTICE_DEFAULTS.confidence,
      interleave: stored.has(KEYS.interleave)
        ? stored.get(KEYS.interleave) === "1"
        : PRACTICE_DEFAULTS.interleave,
    };
  }

  defaults(): PracticeSettingsValues {
    return { ...PRACTICE_DEFAULTS };
  }

  /** Saves the given fields; when any field is invalid nothing at all is saved. */
  set(update: Partial<PracticeSettingsValues>): PracticeSettingsValues {
    const changes: Record<string, string> = {};
    const errors: FieldError[] = [];
    if (update.feedback !== undefined) {
      if (isFeedbackMode(update.feedback)) changes[KEYS.feedback] = update.feedback;
      else errors.push({ field: "feedback", message: FEEDBACK_ERROR });
    }
    for (const field of ["confidence", "interleave"] as const) {
      const value = update[field];
      if (value === undefined) continue;
      if (typeof value === "boolean") changes[KEYS[field]] = value ? "1" : "0";
      else errors.push({ field, message: BOOLEAN_ERROR });
    }
    if (errors.length > 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Configurações das práticas de estudo inválidas.",
        errors,
      );
    }
    this.workspace.connection.sqlite.transaction(() => {
      for (const [key, value] of Object.entries(changes)) {
        this.db
          .insert(meta)
          .values({ key, value })
          .onConflictDoUpdate({ target: meta.key, set: { value } })
          .run();
      }
    })();
    return this.get();
  }

  /** Forgets the stored values, so every practice goes back to its default. */
  reset(): PracticeSettingsValues {
    this.workspace.connection.sqlite.transaction(() => {
      for (const key of Object.values(KEYS)) this.db.delete(meta).where(eq(meta.key, key)).run();
    })();
    return this.get();
  }
}
