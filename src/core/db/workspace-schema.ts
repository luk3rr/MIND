/*
 * Filename: workspace-schema.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { blob, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = (): string => new Date().toISOString();

/** Tables of each workspace database (`workspace.db`). */
export const job = sqliteTable("job", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  state: text("state").notNull().default("queued"),
  progress: real("progress").notNull().default(0),
  message: text("message").notNull().default(""),
  errorCode: text("error_code"),
  errorDetail: text("error_detail"),
  createdAt: text("created_at").notNull().$defaultFn(now),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
});

export const material = sqliteTable("material", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  kind: text("kind").notNull(),
  filename: text("filename").notNull(),
  storedPath: text("stored_path").notNull(),
  status: text("status").notNull().default("queued"),
  pageCount: integer("page_count"),
  charCount: integer("char_count"),
  ocrConfidence: real("ocr_confidence"),
  jobId: integer("job_id"),
  errorCode: text("error_code"),
  errorDetail: text("error_detail"),
  sourceUrl: text("source_url"),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

export const chunk = sqliteTable("chunk", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  materialId: integer("material_id")
    .notNull()
    .references(() => material.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(),
  page: integer("page"),
  section: text("section"),
  text: text("text").notNull(),
});

export const topic = sqliteTable("topic", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const generationRun = sqliteTable("generation_run", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  subtype: text("subtype").notNull(),
  materialId: integer("material_id").references(() => material.id, { onDelete: "set null" }),
  pageFrom: integer("page_from"),
  pageTo: integer("page_to"),
  topicId: integer("topic_id").references(() => topic.id, { onDelete: "set null" }),
  model: text("model").notNull(),
  requested: integer("requested").notNull(),
  generated: integer("generated").notNull().default(0),
  discardedNoSource: integer("discarded_no_source").notNull().default(0),
  discardedInvalid: integer("discarded_invalid").notNull().default(0),
  discardedDuplicate: integer("discarded_duplicate").notNull().default(0),
  discardedUnsupported: integer("discarded_unsupported").notNull().default(0),
  approved: integer("approved").notNull().default(0),
  approvedUnedited: integer("approved_unedited").notNull().default(0),
  discardedReview: integer("discarded_review").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  status: text("status").notNull().default("queued"),
  discardLog: text("discard_log").notNull().default("[]"),
  errorCode: text("error_code"),
  errorDetail: text("error_detail"),
  jobId: integer("job_id"),
  createdAt: text("created_at").notNull().$defaultFn(now),
  finishedAt: text("finished_at"),
});

export const item = sqliteTable(
  "item",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id")
      .notNull()
      .references(() => generationRun.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    subtype: text("subtype").notNull(),
    payloadJson: text("payload_json").notNull(),
    payloadVersion: integer("payload_version").notNull().default(1),
    status: text("status").notNull().default("draft"),
    topicId: integer("topic_id").references(() => topic.id, { onDelete: "set null" }),
    chunkId: integer("chunk_id").references(() => chunk.id, { onDelete: "set null" }),
    sourceTitle: text("source_title").notNull().default(""),
    sourcePage: integer("source_page"),
    quote: text("quote").notNull().default(""),
    edited: integer("edited", { mode: "boolean" }).notNull().default(false),
    origin: text("origin").notNull().default("generated"),
    originItemId: integer("origin_item_id"),
    createdAt: text("created_at").notNull().$defaultFn(now),
    approvedAt: text("approved_at"),
  },
  (table) => [index("ix_item_origin_item_id").on(table.originItemId)],
);

export const cardState = sqliteTable(
  "card_state",
  {
    itemId: integer("item_id")
      .primaryKey()
      .references(() => item.id, { onDelete: "cascade" }),
    fsrsJson: text("fsrs_json").notNull(),
    due: text("due").notNull(),
    state: integer("state").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    updatedAt: text("updated_at").notNull().$defaultFn(now),
  },
  (table) => [index("ix_card_state_due").on(table.due)],
);

export const reviewLog = sqliteTable(
  "review_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    reviewedAt: text("reviewed_at").notNull().$defaultFn(now),
    previousStateJson: text("previous_state_json"),
    durationMs: integer("duration_ms"),
    day: text("day").notNull(),
  },
  (table) => [index("ix_review_log_day").on(table.day)],
);

/** Per-workspace key/value settings (study limits, retention...). */
export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** One answer to a question during practice. */
export const attempt = sqliteTable(
  "attempt",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    answer: text("answer").notNull(),
    correct: integer("correct", { mode: "boolean" }).notNull(),
    seconds: real("seconds"),
    answeredAt: text("answered_at").notNull().$defaultFn(now),
    day: text("day").notNull(),
  },
  (table) => [
    index("ix_attempt_item_answered").on(table.itemId, table.answeredAt),
    index("ix_attempt_day").on(table.day),
  ],
);

/** One question to the chat and its answer (each question is independent). */
export const chatMessage = sqliteTable("chat_message", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  supported: integer("supported", { mode: "boolean" }).notNull(),
  citationsJson: text("citations_json").notNull(),
  model: text("model"),
  costUsd: real("cost_usd").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

/** The optional vector of a chunk (float32, L2-normalized). */
export const chunkEmbedding = sqliteTable("chunk_embedding", {
  chunkId: integer("chunk_id")
    .primaryKey()
    .references(() => chunk.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  dim: integer("dim").notNull(),
  vector: blob("vector", { mode: "buffer" }).notNull(),
});
