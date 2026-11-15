/*
 * Filename: topics.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { Message } from "../llm/types.js";
import { item, topic } from "../db/workspace-schema.js";
import type { WorkspaceDb } from "../jobs/store.js";

export type KnownTopics = Map<string, typeof topic.$inferSelect>;

/** How many existing topic labels the model is shown. */
export const KNOWN_TOPICS_IN_PROMPT = 40;

const STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "e",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "no",
  "na",
  "para",
  "por",
  "com",
  "um",
  "uma",
]);

/**
 * The words of a topic label that carry its meaning: lower case, no accents or punctuation, no
 * small connecting words and with a plural "s" removed ("Elasticidade-renda real" gives
 * elasticidade, renda, real).
 */
export function topicWords(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !STOPWORDS.has(word))
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

/**
 * An existing topic that `name` is a variant of: the same words in any order or punctuation, or a
 * label that differs by one extra word ("Elasticidade-renda real" for "Elasticidade-renda").
 * Single-word topics only match an identical one, so "Oferta" never swallows "Oferta e demanda".
 */
export function similarTopic(
  known: KnownTopics,
  name: string,
): typeof topic.$inferSelect | undefined {
  const wanted = new Set(topicWords(name));
  if (wanted.size === 0) return undefined;
  let best: typeof topic.$inferSelect | undefined;
  for (const candidate of known.values()) {
    const words = new Set(topicWords(candidate.name));
    if (words.size === 0) continue;
    const [small, large] = words.size <= wanted.size ? [words, wanted] : [wanted, words];
    if ([...small].some((word) => !large.has(word))) continue;
    const extra = large.size - small.size;
    if (extra > 1 || (extra === 1 && small.size < 2)) continue;
    if (!best || candidate.id < best.id) best = candidate;
  }
  return best;
}

/** Returns the topic named `name` (or a close variant of it), creating it when needed. */
export function upsertTopic(
  db: WorkspaceDb,
  known: KnownTopics,
  name: string | null,
): typeof topic.$inferSelect | null {
  if (name === null) return null;
  const key = name.toLowerCase();
  let found = known.get(key) ?? similarTopic(known, name);
  if (!found) {
    found = db.insert(topic).values({ name }).returning().get();
    known.set(key, found);
  }
  return found;
}

/** The most used topic labels, so the model can reuse them instead of inventing new ones. */
export function topTopics(db: WorkspaceDb, limit = KNOWN_TOPICS_IN_PROMPT): string[] {
  return db
    .select({ name: topic.name, total: sql<number>`count(${item.id})` })
    .from(topic)
    .leftJoin(item, and(eq(item.topicId, topic.id), ne(item.status, "discarded")))
    .groupBy(topic.id)
    .orderBy(desc(sql`count(${item.id})`), topic.name)
    .limit(limit)
    .all()
    .map((row) => row.name);
}

/** Tells the model which topic labels already exist, so it reuses one whenever the item fits. */
export function withKnownTopics(messages: readonly Message[], names: readonly string[]): Message[] {
  if (names.length === 0) return [...messages];
  const note =
    "\n\nTopic labels that already exist. Set `topic` to one of them, written exactly as shown, " +
    "whenever the item fits it; create a new label only when none fits:\n" +
    names.map((name) => `- ${name}`).join("\n");
  const last = messages.length - 1;
  return messages.map((message, index) =>
    index === last && message.role === "user"
      ? { ...message, content: `${message.content}${note}` }
      : message,
  );
}
