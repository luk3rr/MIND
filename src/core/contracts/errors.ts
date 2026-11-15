/*
 * Filename: errors.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { z } from "zod";

/** Stable error codes shared by the main process and the window (no HTTP status). */
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "WORKSPACE_NOT_FOUND",
  "JOB_NOT_FOUND",
  "JOB_NOT_ACTIVE",
  "PROVIDER_KEY_MISSING",
  "CONSENT_REQUIRED",
  "MONTHLY_LIMIT_REACHED",
  "PROVIDER_ERROR",
  "UNSUPPORTED_FILE",
  "EXTRACTION_FAILED",
  "OCR_UNAVAILABLE",
  "MATERIAL_NOT_FOUND",
  "ITEM_NOT_FOUND",
  "TOPIC_NOT_FOUND",
  "RUN_NOT_FOUND",
  "SESSION_NOT_FOUND",
  "FILE_MISSING",
  "PDF_PROTECTED",
  "EMBEDDINGS_UNAVAILABLE",
  "ARCHIVE_INCOMPATIBLE",
  "ARCHIVE_INVALID",
  "INTERRUPTED",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const fieldErrorSchema = z.object({ field: z.string(), message: z.string() });
export type FieldError = z.infer<typeof fieldErrorSchema>;

/** Domain error with a stable code and a pt-BR message that is safe to show to the user. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fields: FieldError[] | undefined;

  constructor(code: ErrorCode, message: string, fields?: FieldError[]) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fields = fields;
  }
}
