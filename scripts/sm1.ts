/*
 * Filename: sm1.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { computeReport, formatReport } from "../src/core/sm1.js";
import { WorkspaceRegistry } from "../src/core/workspaces/registry.js";

/** Reports the share of generated items approved without edits (SM-1), per workspace. */
const { values } = parseArgs({
  options: {
    "data-dir": { type: "string" },
    workspace: { type: "string" },
    kind: { type: "string", default: "card" },
  },
});

const dataDir = values["data-dir"] ?? join(homedir(), ".config", "mind");
const kind = values.kind === "question" ? "question" : "card";
const registry = new WorkspaceRegistry(dataDir);
try {
  const wanted = values.workspace === undefined ? undefined : Number(values.workspace);
  const workspaces = registry.list().filter((w) => wanted === undefined || w.id === wanted);
  if (workspaces.length === 0) console.log("Nenhum workspace encontrado.");
  for (const workspace of workspaces) {
    const opened = registry.open(workspace.id);
    console.log(formatReport(workspace.name, computeReport(opened.connection.db, kind), kind));
  }
} finally {
  registry.close();
}
