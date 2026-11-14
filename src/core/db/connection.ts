/*
 * Filename: connection.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { basename } from "node:path";
import { logger } from "../logging.js";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Connection<Schema extends Record<string, unknown>> {
  sqlite: Database.Database;
  db: BetterSQLite3Database<Schema>;
  close(): void;
}

/** Opens a SQLite file (creating its folder) with foreign keys on and WAL journaling. */
const log = logger("db");

export function openDatabase<Schema extends Record<string, unknown>>(
  path: string,
  schema: Schema,
): Connection<Schema> {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  log.info("database opened", { file: path === ":memory:" ? path : basename(path) });
  const queryLog = { logQuery: (query: string): void => log.debug("sql", { query }) };
  return {
    sqlite,
    db: drizzle(sqlite, { schema, logger: queryLog }),
    close: () => sqlite.close(),
  };
}
