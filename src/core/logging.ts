/*
 * Filename: logging.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

let threshold: LogLevel = "warn";

export function parseLogLevel(value: string | undefined, fallback: LogLevel): LogLevel {
  const level = value?.toLowerCase();
  return level !== undefined && level in ORDER ? (level as LogLevel) : fallback;
}

/** Sets the lowest level that is written. The app uses `info`; tests stay quiet at `warn`. */
export function setLogLevel(level: LogLevel): void {
  threshold = level;
}

export function logLevel(): LogLevel {
  return threshold;
}

/** Only plain, short values: callers must never pass content typed or read by the user. */
export type LogFields = Record<string, string | number | boolean | null | undefined>;

const MAX_VALUE = 80;

function render(value: string | number | boolean | null): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(4);
  const text = String(value).replace(/\s+/g, " ").trim();
  const short = text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text;
  return /[\s=]/.test(short) ? JSON.stringify(short) : short;
}

export function formatFields(fields: LogFields | undefined): string {
  if (!fields) return "";
  return Object.entries(fields)
    .filter((entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined)
    .map(([key, value]) => ` ${key}=${render(value)}`)
    .join("");
}

export interface Log {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

/**
 * A logger for one part of the app. It writes through `console`, so the lines reach the log file
 * and go through the secret redaction. Messages and fields describe what happened (ids, counts,
 * durations, hosts, error codes); they never carry the user's text, prompts, answers or keys.
 */
export function logger(scope: string): Log {
  const write =
    (level: Exclude<LogLevel, "silent">) =>
    (message: string, fields?: LogFields): void => {
      if (ORDER[level] < ORDER[threshold]) return;
      console[level](`[${scope}] ${message}${formatFields(fields)}`);
    };
  return { debug: write("debug"), info: write("info"), warn: write("warn"), error: write("error") };
}

/** Milliseconds since `start`, rounded. */
export function since(start: number): number {
  return Math.round(performance.now() - start);
}

/** The host of an address, or "invalid"; paths and queries can hold what the user typed. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}
