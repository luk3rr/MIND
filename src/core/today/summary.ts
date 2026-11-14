/*
 * Filename: summary.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, count, eq } from "drizzle-orm";
import { item, material } from "../db/workspace-schema.js";
import type { OpenWorkspace } from "../workspaces/registry.js";

export interface TodaySummary {
  materials: number;
  cards: number;
  questions: number;
}

/** Library counts shown on the Today screen; study indicators arrive with the FSRS unit. */
export function todaySummary(workspace: OpenWorkspace): TodaySummary {
  const { db } = workspace.connection;
  const approved = (kind: string): number =>
    db
      .select({ total: count() })
      .from(item)
      .where(and(eq(item.kind, kind), eq(item.status, "approved")))
      .get()?.total ?? 0;
  return {
    materials: db.select({ total: count() }).from(material).get()?.total ?? 0,
    cards: approved("card"),
    questions: approved("question"),
  };
}
