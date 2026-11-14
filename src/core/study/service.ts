/*
 * Filename: service.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, asc, count, desc, eq, inArray, isNull, lte, notInArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import type { FieldError } from "../contracts/errors.js";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import {
  cardState,
  generationRun,
  item,
  material,
  meta,
  reviewLog,
  topic,
} from "../db/workspace-schema.js";
import { ReviewService } from "../review/service.js";
import type { ItemInfo } from "../review/service.js";
import type { OpenWorkspace } from "../workspaces/registry.js";
import {
  LEARN_AHEAD_MS,
  REVIEW_STATE,
  Rating,
  Scheduler,
  dayEnd,
  formatInterval,
  studyDay,
  systemOffset,
} from "./scheduler.js";
import type { CardSchedule, TzOffset } from "./scheduler.js";

export const LEARNING_STATES = [1, 3];
export const DEFAULTS = { new_per_day: "20", daily_goal: "40", desired_retention: "0.9" };
export const MAX_NEW_PER_DAY = 500;
export const MAX_DAILY_GOAL = 2000;

export interface StudySettings {
  newPerDay: number;
  dailyGoal: number;
  desiredRetention: number;
}

/** What to study in a session; an absent field means "no restriction". */
export interface StudyFilter {
  kind?: "card" | "question";
  topicId?: number;
  materialId?: number;
  subtype?: string;
}

export interface Facet {
  key: number | string;
  label: string;
  count: number;
}

export interface StudyFacets {
  topics: Facet[];
  materials: Facet[];
  subtypes: Facet[];
  cards: number;
  questions: number;
}

export interface StudyCard {
  item: ItemInfo;
  schedule: CardSchedule | null;
}

export interface TodayCounts {
  learning: number;
  review: number;
  newAvailable: number;
  reviewedToday: number;
  newStudiedToday: number;
  toStudy: number;
}

export interface StudyServiceOptions {
  clock?: Clock;
  offset?: TzOffset;
  scheduler?: Scheduler;
}

/** The conditions that select the approved items of a study session. */
export function filterConditions(
  filter: StudyFilter | undefined,
  db: OpenWorkspace["connection"]["db"],
): SQL[] {
  const found: SQL[] = [eq(item.status, "approved"), eq(item.kind, filter?.kind ?? "card")];
  if (filter?.topicId !== undefined) found.push(eq(item.topicId, filter.topicId));
  if (filter?.subtype !== undefined) found.push(eq(item.subtype, filter.subtype));
  if (filter?.materialId !== undefined) {
    found.push(
      inArray(
        item.runId,
        db
          .select({ id: generationRun.id })
          .from(generationRun)
          .where(eq(generationRun.materialId, filter.materialId)),
      ),
    );
  }
  return found;
}

/** Spaced repetition over the approved cards of one workspace. */
export class StudyService {
  private readonly clock: Clock;
  private readonly offset: TzOffset;
  private readonly review: ReviewService;

  constructor(
    private readonly workspace: OpenWorkspace,
    private readonly options: StudyServiceOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.offset = options.offset ?? systemOffset;
    this.review = new ReviewService(workspace, this.clock);
  }

  private get db() {
    return this.workspace.connection.db;
  }

  // settings ---------------------------------------------------------------------------------

  settings(): StudySettings {
    const stored = Object.fromEntries(
      this.db
        .select()
        .from(meta)
        .all()
        .map((row) => [row.key, row.value]),
    );
    const merged = { ...DEFAULTS, ...stored };
    return {
      newPerDay: Number(merged.new_per_day),
      dailyGoal: Number(merged.daily_goal),
      desiredRetention: Number(merged.desired_retention),
    };
  }

  updateSettings(update: Partial<StudySettings>): StudySettings {
    const changes: Record<string, string> = {};
    const errors: FieldError[] = [];
    if (update.newPerDay !== undefined) {
      if (
        Number.isInteger(update.newPerDay) &&
        update.newPerDay >= 0 &&
        update.newPerDay <= MAX_NEW_PER_DAY
      ) {
        changes["new_per_day"] = String(update.newPerDay);
      } else errors.push({ field: "newPerDay", message: `Use de 0 a ${MAX_NEW_PER_DAY}.` });
    }
    if (update.dailyGoal !== undefined) {
      if (
        Number.isInteger(update.dailyGoal) &&
        update.dailyGoal >= 1 &&
        update.dailyGoal <= MAX_DAILY_GOAL
      ) {
        changes["daily_goal"] = String(update.dailyGoal);
      } else errors.push({ field: "dailyGoal", message: `Use de 1 a ${MAX_DAILY_GOAL}.` });
    }
    if (update.desiredRetention !== undefined) {
      if (update.desiredRetention >= 0.7 && update.desiredRetention <= 0.99) {
        changes["desired_retention"] = String(update.desiredRetention);
      } else errors.push({ field: "desiredRetention", message: "Use de 0,70 a 0,99." });
    }
    if (errors.length > 0)
      throw new AppError("VALIDATION_ERROR", "Configurações de estudo inválidas.", errors);
    this.workspace.connection.sqlite.transaction(() => {
      for (const [key, value] of Object.entries(changes)) {
        this.db
          .insert(meta)
          .values({ key, value })
          .onConflictDoUpdate({ target: meta.key, set: { value } })
          .run();
      }
    })();
    return this.settings();
  }

  private scheduler(): Scheduler {
    return this.options.scheduler ?? new Scheduler(this.settings().desiredRetention);
  }

  // reading state ----------------------------------------------------------------------------

  private today(now: Date): string {
    return studyDay(now, this.offset);
  }

  private newStudiedToday(day: string): number {
    return (
      this.db
        .select({ total: count() })
        .from(reviewLog)
        .where(and(eq(reviewLog.day, day), isNull(reviewLog.previousStateJson)))
        .get()?.total ?? 0
    );
  }

  private unseen(filter?: StudyFilter): SQL[] {
    return [
      ...filterConditions(filter, this.db),
      notInArray(item.id, this.db.select({ id: cardState.itemId }).from(cardState)),
    ];
  }

  counts(now: Date = this.clock.now(), filter?: StudyFilter): TodayCounts {
    const end = dayEnd(now, this.offset).toISOString();
    const ahead = new Date(now.getTime() + LEARN_AHEAD_MS).toISOString();
    const day = this.today(now);
    const wanted = filterConditions(filter, this.db);
    const learning =
      this.db
        .select({ total: count() })
        .from(cardState)
        .innerJoin(item, eq(item.id, cardState.itemId))
        .where(and(...wanted, inArray(cardState.state, LEARNING_STATES), lte(cardState.due, ahead)))
        .get()?.total ?? 0;
    const review =
      this.db
        .select({ total: count() })
        .from(cardState)
        .innerJoin(item, eq(item.id, cardState.itemId))
        .where(and(...wanted, eq(cardState.state, REVIEW_STATE), lte(cardState.due, end)))
        .get()?.total ?? 0;
    const unseen =
      this.db
        .select({ total: count() })
        .from(item)
        .where(and(...this.unseen(filter)))
        .get()?.total ?? 0;
    const newToday = this.newStudiedToday(day);
    const reviewed =
      this.db.select({ total: count() }).from(reviewLog).where(eq(reviewLog.day, day)).get()
        ?.total ?? 0;
    const allowance = Math.max(this.settings().newPerDay - newToday, 0);
    const newAvailable = Math.min(unseen, allowance);
    return {
      learning,
      review,
      newAvailable,
      reviewedToday: reviewed,
      newStudiedToday: newToday,
      toStudy: learning + review + newAvailable,
    };
  }

  private scheduleOf(row: typeof cardState.$inferSelect): CardSchedule {
    return {
      fsrsJson: row.fsrsJson,
      due: row.due,
      state: row.state,
      reps: row.reps,
      lapses: row.lapses,
    };
  }

  /** Upcoming cards: due learning cards, reviews due today, then new cards in the quota. */
  queue(limit = 20, now: Date = this.clock.now(), filter?: StudyFilter): StudyCard[] {
    const end = dayEnd(now, this.offset).toISOString();
    const ahead = new Date(now.getTime() + LEARN_AHEAD_MS).toISOString();
    const wanted = filterConditions(filter, this.db);
    const cards: StudyCard[] = [];
    for (const [states, cutoff] of [
      [LEARNING_STATES, ahead],
      [[REVIEW_STATE], end],
    ] as const) {
      const remaining = limit - cards.length;
      if (remaining <= 0) break;
      const rows = this.db
        .select({ state: cardState })
        .from(cardState)
        .innerJoin(item, eq(item.id, cardState.itemId))
        .where(and(...wanted, inArray(cardState.state, [...states]), lte(cardState.due, cutoff)))
        .orderBy(asc(cardState.due))
        .limit(remaining)
        .all();
      for (const { state } of rows) {
        cards.push({ item: this.review.get(state.itemId), schedule: this.scheduleOf(state) });
      }
    }
    const allowance = this.settings().newPerDay - this.newStudiedToday(this.today(now));
    const room = Math.min(limit - cards.length, allowance);
    if (room > 0) {
      const fresh = this.db
        .select()
        .from(item)
        .where(and(...this.unseen(filter)))
        .orderBy(asc(item.approvedAt), asc(item.id))
        .limit(room)
        .all();
      for (const row of fresh) cards.push({ item: this.review.get(row.id), schedule: null });
    }
    return cards;
  }

  nextCard(now: Date = this.clock.now(), filter?: StudyFilter): StudyCard | null {
    return this.queue(1, now, filter)[0] ?? null;
  }

  /** Selector options with how many approved items each holds. */
  facets(kind: "card" | "question" = "card"): StudyFacets {
    const approved = and(eq(item.status, "approved"), eq(item.kind, kind));
    const topics = this.db
      .select({ id: topic.id, name: topic.name, total: count(item.id) })
      .from(topic)
      .innerJoin(item, eq(item.topicId, topic.id))
      .where(approved)
      .groupBy(topic.id)
      .orderBy(asc(topic.name))
      .all();
    const materials = this.db
      .select({ id: material.id, title: material.title, total: count(item.id) })
      .from(material)
      .innerJoin(generationRun, eq(generationRun.materialId, material.id))
      .innerJoin(item, eq(item.runId, generationRun.id))
      .where(approved)
      .groupBy(material.id)
      .orderBy(asc(material.title))
      .all();
    const subtypes = this.db
      .select({ subtype: item.subtype, total: count(item.id) })
      .from(item)
      .where(approved)
      .groupBy(item.subtype)
      .orderBy(asc(item.subtype))
      .all();
    const cards =
      this.db
        .select({ total: count() })
        .from(item)
        .where(and(eq(item.status, "approved"), eq(item.kind, "card")))
        .get()?.total ?? 0;
    const questions =
      this.db
        .select({ total: count() })
        .from(item)
        .where(and(eq(item.status, "approved"), eq(item.kind, "question")))
        .get()?.total ?? 0;
    return {
      topics: topics.map((row) => ({ key: row.id, label: row.name, count: row.total })),
      materials: materials.map((row) => ({ key: row.id, label: row.title, count: row.total })),
      subtypes: subtypes.map((row) => ({ key: row.subtype, label: row.subtype, count: row.total })),
      cards,
      questions,
    };
  }

  /** A specific card with its current state (used after an undo). */
  card(itemId: number): StudyCard {
    const row = this.db.select().from(cardState).where(eq(cardState.itemId, itemId)).get();
    return { item: this.review.get(itemId), schedule: row ? this.scheduleOf(row) : null };
  }

  previews(card: StudyCard, now: Date = this.clock.now()): Record<Rating, string> {
    const spans = this.scheduler().preview(card.schedule, now);
    return {
      [Rating.AGAIN]: formatInterval(spans[Rating.AGAIN]),
      [Rating.HARD]: formatInterval(spans[Rating.HARD]),
      [Rating.GOOD]: formatInterval(spans[Rating.GOOD]),
      [Rating.EASY]: formatInterval(spans[Rating.EASY]),
    };
  }

  // changing state ---------------------------------------------------------------------------

  rate(
    itemId: number,
    rating: Rating,
    options: { now?: Date; durationMs?: number } = {},
  ): CardSchedule {
    const now = options.now ?? this.clock.now();
    const scheduler = this.scheduler();
    const row = this.db.select().from(item).where(eq(item.id, itemId)).get();
    if (!row) throw new AppError("ITEM_NOT_FOUND", `Não existe item com id ${itemId}.`);
    if (row.status !== "approved" || row.kind !== "card") {
      throw new AppError("VALIDATION_ERROR", "Só cards aprovados podem ser estudados.");
    }
    const existing = this.db.select().from(cardState).where(eq(cardState.itemId, itemId)).get();
    const previous = existing ? this.scheduleOf(existing) : null;
    const updated = scheduler.review(previous, rating, now);
    const moment = now.toISOString();
    this.workspace.connection.sqlite.transaction(() => {
      const values = {
        fsrsJson: updated.fsrsJson,
        due: updated.due,
        state: updated.state,
        reps: updated.reps,
        lapses: updated.lapses,
        updatedAt: moment,
      };
      if (existing) this.db.update(cardState).set(values).where(eq(cardState.itemId, itemId)).run();
      else
        this.db
          .insert(cardState)
          .values({ itemId, ...values })
          .run();
      this.db
        .insert(reviewLog)
        .values({
          itemId,
          rating,
          reviewedAt: moment,
          previousStateJson: previous ? JSON.stringify(previous) : null,
          durationMs: options.durationMs ?? null,
          day: this.today(now),
        })
        .run();
    })();
    return updated;
  }

  /** Reverts the most recent rating; returns the item id, or null if there is nothing to undo. */
  undo(): number | null {
    const log = this.db.select().from(reviewLog).orderBy(desc(reviewLog.id)).limit(1).get();
    if (!log) return null;
    this.workspace.connection.sqlite.transaction(() => {
      if (log.previousStateJson === null) {
        this.db.delete(cardState).where(eq(cardState.itemId, log.itemId)).run();
      } else {
        const previous = JSON.parse(log.previousStateJson) as CardSchedule;
        this.db
          .update(cardState)
          .set({
            fsrsJson: previous.fsrsJson,
            due: previous.due,
            state: previous.state,
            reps: previous.reps,
            lapses: previous.lapses,
          })
          .where(eq(cardState.itemId, log.itemId))
          .run();
      }
      this.db.delete(reviewLog).where(eq(reviewLog.id, log.id)).run();
    })();
    return log.itemId;
  }

  ratingDistribution(day?: string): Record<number, number> {
    const target = day ?? this.today(this.clock.now());
    const rows = this.db
      .select({ rating: reviewLog.rating, total: count() })
      .from(reviewLog)
      .where(eq(reviewLog.day, target))
      .groupBy(reviewLog.rating)
      .all();
    return Object.fromEntries(rows.map((row) => [row.rating, row.total]));
  }
}
