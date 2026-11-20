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
        "pretest_attempt",
        "review_log",
        "study_session",
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
      "0003_study_session.sql",
      "0004_study_practices.sql",
      "0005_item_runs_by_material.sql",
      "0006_run_out_of_scope.sql",
      "0007_material_analysis.sql",
    ]);
  });

  it("migrates a database from before the study practices without losing answers (NFR-1)", () => {
    const connection = openDatabase(join(tempDir(), "workspace.db"), {});
    const { sqlite } = connection;
    applyMigrations(sqlite, workspaceMigrations.slice(0, 4));
    sqlite
      .prepare(
        "INSERT INTO generation_run (kind, subtype, model, requested, created_at) VALUES ('question','multiple_choice','m',1,'x')",
      )
      .run();
    sqlite
      .prepare(
        "INSERT INTO item (run_id, kind, subtype, payload_json, created_at) VALUES (1,'question','multiple_choice','{}','x')",
      )
      .run();
    sqlite
      .prepare(
        "INSERT INTO attempt (item_id, answer, correct, seconds, answered_at, day) VALUES (1,'A',1,3.5,'2026-03-10T15:00:00.000Z','2026-03-10')",
      )
      .run();

    applyMigrations(sqlite, workspaceMigrations);

    expect(sqlite.prepare("SELECT * FROM attempt").all()).toEqual([
      {
        id: 1,
        item_id: 1,
        answer: "A",
        correct: 1,
        seconds: 3.5,
        answered_at: "2026-03-10T15:00:00.000Z",
        day: "2026-03-10",
        confidence: null,
        release_at: "2026-03-10T15:00:00.000Z",
        seen_at: "2026-03-10T15:00:00.000Z",
      },
    ]);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM pretest_attempt").get()).toEqual({ n: 0 });
    connection.close();
  });

  it("adds the out-of-scope counter, rounds and analysis flag to existing runs (NFR-4)", () => {
    const connection = openDatabase(join(tempDir(), "workspace.db"), {});
    const { sqlite } = connection;
    applyMigrations(sqlite, workspaceMigrations.slice(0, 6));
    sqlite
      .prepare(
        "INSERT INTO generation_run (kind, subtype, model, requested, generated, discarded_unsupported, created_at) VALUES ('card','qa','m',5,4,1,'x')",
      )
      .run();

    applyMigrations(sqlite, workspaceMigrations);

    expect(
      sqlite
        .prepare(
          "SELECT requested, generated, discarded_unsupported, discarded_out_of_scope, rounds, with_analysis FROM generation_run",
        )
        .all(),
    ).toEqual([
      {
        requested: 5,
        generated: 4,
        discarded_unsupported: 1,
        discarded_out_of_scope: 0,
        rounds: 1,
        with_analysis: 0,
      },
    ]);
    connection.close();
  });

  it("adds the analysis columns to existing materials and chunks without touching them (NFR-4)", () => {
    const connection = openDatabase(join(tempDir(), "workspace.db"), {});
    const { sqlite } = connection;
    applyMigrations(sqlite, workspaceMigrations.slice(0, 7));
    sqlite
      .prepare(
        "INSERT INTO material (title, kind, filename, stored_path, status, created_at) VALUES ('Apostila','pdf','a.pdf','files/a','indexed','x')",
      )
      .run();
    sqlite
      .prepare(
        "INSERT INTO chunk (material_id, ordinal, page, text) VALUES (1, 0, 1, 'A paroxítona leva acento.')",
      )
      .run();

    applyMigrations(sqlite, workspaceMigrations);

    expect(
      sqlite
        .prepare(
          "SELECT title, status, subject_user, subject_inferred, analysis_job_id, analyzed_at FROM material",
        )
        .all(),
    ).toEqual([
      {
        title: "Apostila",
        status: "indexed",
        subject_user: null,
        subject_inferred: null,
        analysis_job_id: null,
        analyzed_at: null,
      },
    ]);
    expect(sqlite.prepare("SELECT text, role, starts_unit, unit FROM chunk").all()).toEqual([
      { text: "A paroxítona leva acento.", role: null, starts_unit: null, unit: null },
    ]);
    // The search index still finds the chunk.
    expect(
      sqlite.prepare("SELECT rowid FROM chunk_fts WHERE chunk_fts MATCH 'paroxítona'").all(),
    ).toHaveLength(1);
    connection.close();
  });

  it("moves authored items onto a run of their material without losing anything", () => {
    const connection = openDatabase(join(tempDir(), "workspace.db"), {});
    const { sqlite } = connection;
    applyMigrations(sqlite, workspaceMigrations.slice(0, 5));
    const run = (kind: string, subtype: string, material: number | null): number =>
      Number(
        sqlite
          .prepare(
            "INSERT INTO generation_run (kind, subtype, material_id, model, requested, created_at) VALUES (?, ?, ?, '-', 0, 'x')",
          )
          .run(kind, subtype, material).lastInsertRowid,
      );
    sqlite
      .prepare(
        "INSERT INTO material (title, kind, filename, stored_path, status, created_at) VALUES ('Apostila', 'pdf', 'a.pdf', 'p', 'indexed', 'x')",
      )
      .run();
    sqlite
      .prepare("INSERT INTO chunk (material_id, ordinal, page, text) VALUES (1, 0, 1, 'texto')")
      .run();
    const generated = run("question", "multiple_choice", 1);
    const reader = run("reader", "reader", null);
    const manual = run("manual", "manual", null);
    const notebook = run("notebook", "error_note", null);
    const add = (runId: number, origin: string, chunk: number | null, from: number | null) =>
      Number(
        sqlite
          .prepare(
            "INSERT INTO item (run_id, kind, subtype, payload_json, chunk_id, origin, origin_item_id, created_at) VALUES (?, 'card', 'qa', '{}', ?, ?, ?, 'x')",
          )
          .run(runId, chunk, origin, from).lastInsertRowid,
      );
    const question = add(generated, "generated", 1, null);
    const fromReader = add(reader, "reader", 1, null);
    const unlinked = add(manual, "manual", null, null);
    const error = add(notebook, "error_note", 1, question);

    applyMigrations(sqlite, workspaceMigrations);

    const placed = (id: number) =>
      sqlite
        .prepare(
          "SELECT r.kind AS kind, r.material_id AS material FROM item i JOIN generation_run r ON r.id = i.run_id WHERE i.id = ?",
        )
        .get(id);
    expect(placed(fromReader)).toEqual({ kind: "reader", material: 1 });
    expect(placed(error)).toEqual({ kind: "notebook", material: 1 });
    // No source, no material: it stays on the shared run.
    expect(placed(unlinked)).toEqual({ kind: "manual", material: null });
    expect(placed(question)).toEqual({ kind: "question", material: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM item").get()).toEqual({ n: 4 });
    expect(
      sqlite.prepare("SELECT name FROM sqlite_temp_master WHERE name = '_item_material'").all(),
    ).toEqual([]);
    connection.close();
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
