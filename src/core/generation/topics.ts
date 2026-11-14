/*
 * Filename: topics.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { topic } from "../db/workspace-schema.js";
import type { WorkspaceDb } from "../jobs/store.js";

export type KnownTopics = Map<string, typeof topic.$inferSelect>;

/** Returns the topic named `name` (case-insensitive), creating it when needed. */
export function upsertTopic(
  db: WorkspaceDb,
  known: KnownTopics,
  name: string | null,
): typeof topic.$inferSelect | null {
  if (name === null) return null;
  const key = name.toLowerCase();
  let found = known.get(key);
  if (!found) {
    found = db.insert(topic).values({ name }).returning().get();
    known.set(key, found);
  }
  return found;
}
