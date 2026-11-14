/*
 * Filename: router.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { AppError, channels, fail, ok } from "../../core/contracts/index.js";
import type { ChannelName, InputOf, OutputOf, Result } from "../../core/contracts/index.js";

export type Handlers = {
  [C in ChannelName]: (input: InputOf<C>) => OutputOf<C> | Promise<OutputOf<C>>;
};

export interface Logger {
  error(message: string, detail?: unknown): void;
}

/**
 * Builds the dispatcher used by the main process: it validates the payload against the channel
 * schema, runs the handler, validates its answer and turns every failure into a stable `Result`.
 * It never imports Electron, so it is testable with plain Vitest.
 */
export function createRouter(handlers: Handlers, logger: Logger = console) {
  return async function dispatch(channel: unknown, payload: unknown): Promise<Result<unknown>> {
    if (typeof channel !== "string" || !Object.hasOwn(channels, channel)) {
      return fail("VALIDATION_ERROR", "Canal desconhecido.");
    }
    const name = channel as ChannelName;
    const schema = channels[name];
    const parsed = schema.input.safeParse(payload);
    if (!parsed.success) {
      return fail(
        "VALIDATION_ERROR",
        "Dados inválidos.",
        parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      );
    }
    try {
      const handler = handlers[name] as (input: unknown) => unknown;
      const output = schema.output.safeParse(await handler(parsed.data));
      if (!output.success) {
        logger.error(`Invalid output from ${name}`, output.error.issues);
        return fail("INTERNAL_ERROR", "Erro interno.");
      }
      return ok(output.data);
    } catch (error) {
      if (error instanceof AppError) {
        return fail(error.code, error.message, error.fields);
      }
      logger.error(`Unhandled error in ${name}`, error);
      return fail("INTERNAL_ERROR", "Erro interno.");
    }
  };
}
