/*
 * Filename: databases.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import * as appSchema from "./app-schema.js";
import { openDatabase } from "./connection.js";
import type { Connection } from "./connection.js";
import { applyMigrations } from "./migrate.js";
import { appMigrations, workspaceMigrations } from "./migrations.js";
import * as workspaceSchema from "./workspace-schema.js";

export type AppConnection = Connection<typeof appSchema>;
export type WorkspaceConnection = Connection<typeof workspaceSchema>;

/** Opens the global database and migrates it to the current schema. */
export function openAppDatabase(path: string): AppConnection {
  const connection = openDatabase(path, appSchema);
  try {
    applyMigrations(connection.sqlite, appMigrations);
  } catch (error) {
    connection.close();
    throw error;
  }
  return connection;
}

/** Opens a workspace database and migrates it to the current schema. */
export function openWorkspaceDatabase(path: string): WorkspaceConnection {
  const connection = openDatabase(path, workspaceSchema);
  try {
    applyMigrations(connection.sqlite, workspaceMigrations);
  } catch (error) {
    connection.close();
    throw error;
  }
  return connection;
}

export { appSchema, workspaceSchema };
