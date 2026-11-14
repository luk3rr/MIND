/*
 * Filename: index.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

export { CHANNEL_NAMES, EVENT_NAMES } from "./channel-names.js";
export type { ChannelName, EventName } from "./channel-names.js";
export { channels, CONTRACT_VERSION } from "./channels.js";
export type { Channels, InputOf, OutputOf } from "./channels.js";
export { AppError, ERROR_CODES, fieldErrorSchema } from "./errors.js";
export type { ErrorCode, FieldError } from "./errors.js";
export { fail, ok } from "./result.js";
export type { ErrorInfo, Result } from "./result.js";
export type { MindApi } from "./api.js";
