/*
 * Filename: db.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { AppError } from "../contracts/errors.js";
import { openDatabase } from "./connection.js";
import { openAppDatabase, openWorkspaceDatabase } from "./databases.js";
import { applyMigrations, toMigrations } from "./migrate.js";
import { appMigrations, workspaceMigrations } from "./migrations.js";
import { tempDir } from "../test/helpers.js";
import { join } from "node:path";

function tables(sqlite: { prepare(sql: string): { all(): unknown[] } }): string[] {
  return sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => (row as { name: string }).name)
    .filter((name) => !name.startsWith("chunk_fts_"))
    .sort();
}

describe("migrations", () => {
  it("builds the app schema in a new database", () => {
    const connection = openAppDatabase(join(tempDir(), "app.db"));
    expect(tables(connection.sqlite)).toEqual(
      ["_migrations", "consent", "cost_ledger", "model_price", "setting", "workspace"].sort(),
    );
    connection.close();
  });

  it("builds the workspace schema in a new database", () => {
    const connection = openWorkspaceDatabase(join(tempDir(), "workspace.db"));
    expect(tables(connection.sqlite)).toEqual(
      [
        "_migrations",
        "attempt",
        "card_state",
        "chat_message",
        "chunk",
        "chunk_embedding",
        "chunk_fts",
        "generation_run",
        "item",
        "job",
        "material",
        "meta",
        "review_log",
        "topic",
      ].sort(),
    );
    connection.close();
  });

  it("is idempotent: reopening applies nothing twice", () => {
    const path = join(tempDir(), "app.db");
    openAppDatabase(path).close();
    const again = openAppDatabase(path);
    const rows = again.sqlite.prepare("SELECT id FROM _migrations").all();
    expect(rows).toHaveLength(appMigrations.length);
    again.close();
  });

  it("applies every migration file in name order", () => {
    expect(appMigrations.map((m) => m.id)).toEqual(["0000_init.sql"]);
    expect(workspaceMigrations.map((m) => m.id)).toEqual([
      "0000_init.sql",
      "0001_chunk_index.sql",
      "0002_chunk_fts.sql",
    ]);
  });

  it("refuses a database written by a newer version", () => {
    const path = join(tempDir(), "app.db");
    const connection = openAppDatabase(path);
    connection.sqlite
      .prepare("INSERT INTO _migrations (id, applied_at) VALUES ('9999_future.sql', 'x')")
      .run();
    connection.close();
    expect(() => openAppDatabase(path)).toThrowError(AppError);
  });

  it("rolls a failing migration back and keeps the earlier ones", () => {
    const connection = openDatabase(join(tempDir(), "x.db"), {});
    const migrations = toMigrations({
      "./0000_a.sql": "CREATE TABLE a (id INTEGER);",
      "./0001_b.sql": "CREATE TABLE b (id INTEGER);--> statement-breakpoint\nBROKEN SQL;",
    });
    expect(() => applyMigrations(connection.sqlite, migrations)).toThrow();
    expect(tables(connection.sqlite)).toEqual(["_migrations", "a"]);
    connection.close();
  });

  it("turns on foreign keys and WAL", () => {
    const connection = openWorkspaceDatabase(join(tempDir(), "workspace.db"));
    expect(connection.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(connection.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    connection.close();
  });

  it("enforces foreign keys with cascade on delete", () => {
    const connection = openWorkspaceDatabase(join(tempDir(), "workspace.db"));
    const { sqlite } = connection;
    sqlite
      .prepare(
        "INSERT INTO material (title, kind, filename, stored_path, created_at) VALUES ('t','md','f','p','x')",
      )
      .run();
    sqlite.prepare("INSERT INTO chunk (material_id, ordinal, text) VALUES (1, 0, 'hello')").run();
    expect(() =>
      sqlite.prepare("INSERT INTO chunk (material_id, ordinal, text) VALUES (99, 0, 'x')").run(),
    ).toThrow();
    sqlite.prepare("DELETE FROM material WHERE id = 1").run();
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM chunk").get()).toEqual({ n: 0 });
    connection.close();
  });
});
