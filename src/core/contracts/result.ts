/*
 * Filename: result.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { ErrorCode, FieldError } from "./errors.js";

export interface ErrorInfo {
  code: ErrorCode;
  message: string;
  fields?: FieldError[];
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorInfo };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(code: ErrorCode, message: string, fields?: FieldError[]): Result<never> {
  const error: ErrorInfo = fields ? { code, message, fields } : { code, message };
  return { ok: false, error };
}
