/*
 * Filename: service.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import {
  attempt,
  cardState,
  generationRun,
  item,
  material,
  reviewLog,
  topic,
} from "../db/workspace-schema.js";
import { REVIEW_STATE, studyDay, systemOffset } from "../study/scheduler.js";
import type { TzOffset } from "../study/scheduler.js";
import { StudyService } from "../study/service.js";
import type { OpenWorkspace } from "../workspaces/registry.js";

/** Below this many events a topic's accuracy is flagged as a small sample. */
export const MIN_EVENTS = 5;

export interface TopicStat {
  topicId: number | null;
  name: string | null;
  /** Approved cards and questions the topic holds. */
  cards: number;
  questions: number;
  cardReviews: number;
  cardPasses: number;
  questionAttempts: number;
  questionCorrect: number;
  events: number;
  accuracy: number | null;
  cardAccuracy: number | null;
  questionAccuracy: number | null;
  smallSample: boolean;
}

/** Why a material is worth studying next. */
export type MaterialFocus = "due" | "weak" | "unseen" | "review";

export interface MaterialStat {
  materialId: number;
  title: string;
  /** Items generated from the material that were not discarded. */
  created: number;
  cards: number;
  questions: number;
  /** Drafts still waiting for the review. */
  toReview: number;
  approved: number;
  discarded: number;
  /** Approved items answered or rated at least once. */
  studied: number;
  /** Approved items never studied. */
  unseen: number;
  /** Approved cards already in the schedule whose time has come. */
  due: number;
  events: number;
  accuracy: number | null;
  smallSample: boolean;
  focus: MaterialFocus | null;
  /** Higher means more worth studying now. */
  priority: number;
  /** True for the one material the app suggests studying now. */
  suggested: boolean;
}

/** Accuracy below this makes a material count as weak. */
export const WEAK_ACCURACY = 0.7;
const WEAK_BONUS = 20;
const UNSEEN_WEIGHT = 0.5;
const REVIEW_WEIGHT = 0.25;

export interface RetentionDay {
  day: string;
  reviews: number;
  passes: number;
  rate: number | null;
}

export interface Retention {
  days: RetentionDay[];
  reviews: number;
  rate: number | null;
}

export interface ActivityDay {
  day: string;
  reviews: number;
  attempts: number;
  total: number;
}

export interface StatsSummary {
  reviewedToday: number;
  answeredToday: number;
  activityToday: number;
  goal: number;
  goalMet: boolean;
  currentStreak: number;
  longestStreak: number;
  totalReviews: number;
  totalAttempts: number;
}

const DAY_MS = 86_400_000;

function addDays(isoDay: string, days: number): string {
  return new Date(Date.parse(`${isoDay}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The current and the longest streak of consecutive study days with activity. */
export function streaks(
  days: ReadonlySet<string>,
  today: string,
): [current: number, longest: number] {
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of [...days].sort()) {
    run = previous !== null && addDays(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  // Today is not over yet, so it does not break the streak.
  let cursor = days.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (days.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return [current, longest];
}

function ratio(part: number, whole: number): number | null {
  return whole ? part / whole : null;
}

/** Statistics: accuracy by topic, retention, activity, daily goal and streak. */
/** How sure the student said they were: 1 a guess, 2 think so, 3 certain. */
export type ConfidenceLevel = 1 | 2 | 3;

/** Below this accuracy a level of confidence is flagged as overconfident (level 1 has no flag). */
export const OVERCONFIDENCE_BELOW: Record<ConfidenceLevel, number | null> = {
  1: null,
  2: 0.6,
  3: 0.8,
};

/** The fewest answers a level needs before it can be flagged. */
export const MIN_CALIBRATION_ANSWERS = 5;

export interface CalibrationLevel {
  level: ConfidenceLevel;
  answers: number;
  correct: number;
  /** Null while there are no answers at this level. */
  rate: number | null;
  /** Set when the accuracy is below what the confidence suggests. */
  flag: "overconfident" | null;
}

export interface Calibration {
  /** False until some answer in the window has a confidence. */
  hasData: boolean;
  levels: CalibrationLevel[];
  /** Topics with the most wrong answers given with the highest confidence. */
  topics: { topicId: number; name: string; confidentWrong: number }[];
}

export class StatsService {
  private readonly clock: Clock;
  private readonly offset: TzOffset;
  private readonly study: StudyService;

  constructor(
    private readonly workspace: OpenWorkspace,
    options: { clock?: Clock; offset?: TzOffset } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.offset = options.offset ?? systemOffset;
    this.study = new StudyService(workspace, { clock: this.clock, offset: this.offset });
  }

  private get db() {
    return this.workspace.connection.db;
  }

  private today(now?: Date): string {
    return studyDay(now ?? this.clock.now(), this.offset);
  }

  /** Accuracy per topic from card ratings and question attempts (approved items only). */
  topicStats(): TopicStat[] {
    const cards = new Map(
      this.db
        .select({
          topicId: item.topicId,
          total: count(),
          passed: sql<number>`coalesce(sum(${reviewLog.rating} >= 2), 0)`,
        })
        .from(reviewLog)
        .innerJoin(item, eq(item.id, reviewLog.itemId))
        .where(sql`${item.status} = 'approved' and ${item.kind} = 'card'`)
        .groupBy(item.topicId)
        .all()
        .map((r) => [r.topicId, [r.total, r.passed]] as const),
    );
    const questions = new Map(
      this.db
        .select({
          topicId: item.topicId,
          total: count(),
          right: sql<number>`coalesce(sum(${attempt.correct}), 0)`,
        })
        .from(attempt)
        .innerJoin(item, eq(item.id, attempt.itemId))
        .where(sql`${item.status} = 'approved' and ${item.kind} = 'question'`)
        .groupBy(item.topicId)
        .all()
        .map((r) => [r.topicId, [r.total, r.right]] as const),
    );
    const names = new Map(
      this.db
        .select()
        .from(topic)
        .all()
        .map((t) => [t.id, t.name] as const),
    );
    const withItems = new Set(
      this.db
        .selectDistinct({ topicId: item.topicId })
        .from(item)
        .where(sql`${item.status} = 'approved'`)
        .all()
        .map((r) => r.topicId),
    );
    const sizes = new Map<number | null, [number, number]>();
    for (const row of this.db
      .select({ topicId: item.topicId, kind: item.kind, total: count() })
      .from(item)
      .where(sql`${item.status} = 'approved'`)
      .groupBy(item.topicId, item.kind)
      .all()) {
      const entry = sizes.get(row.topicId) ?? [0, 0];
      entry[row.kind === "card" ? 0 : 1] += row.total;
      sizes.set(row.topicId, entry);
    }
    // Every topic of the workspace is listed, even one with nothing approved yet.
    const keys = new Set<number | null>([
      ...cards.keys(),
      ...questions.keys(),
      ...withItems,
      ...names.keys(),
    ]);
    const stats = [...keys].map((key): TopicStat => {
      const [reviews, passes] = cards.get(key) ?? [0, 0];
      const [attempts, right] = questions.get(key) ?? [0, 0];
      const events = (reviews as number) + (attempts as number);
      return {
        topicId: key,
        name: key === null ? null : (names.get(key) ?? null),
        cards: sizes.get(key)?.[0] ?? 0,
        questions: sizes.get(key)?.[1] ?? 0,
        cardReviews: reviews as number,
        cardPasses: passes as number,
        questionAttempts: attempts as number,
        questionCorrect: right as number,
        events,
        accuracy: ratio((passes as number) + (right as number), events),
        cardAccuracy: ratio(passes as number, reviews as number),
        questionAccuracy: ratio(right as number, attempts as number),
        smallSample: events < MIN_EVENTS,
      };
    });
    return stats.sort((a, b) => {
      if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
      return (a.name ?? "").toLowerCase() < (b.name ?? "").toLowerCase() ? -1 : 1;
    });
  }

  /**
   * Per material: how many items it produced, where they stand (to review, approved, studied,
   * unseen, due) and the accuracy so far, plus a suggestion of which one to study now.
   */
  materialStats(now?: Date): MaterialStat[] {
    const at = (now ?? this.clock.now()).toISOString();
    const materials = this.db
      .select({ id: material.id, title: material.title })
      .from(material)
      .all();
    const items = this.db
      .select({
        id: item.id,
        kind: item.kind,
        status: item.status,
        materialId: generationRun.materialId,
      })
      .from(item)
      .innerJoin(generationRun, eq(generationRun.id, item.runId))
      .where(sql`${generationRun.materialId} is not null`)
      .all();
    const cardEvents = new Map(
      this.db
        .select({
          itemId: reviewLog.itemId,
          total: count(),
          passed: sql<number>`coalesce(sum(${reviewLog.rating} >= 2), 0)`,
        })
        .from(reviewLog)
        .groupBy(reviewLog.itemId)
        .all()
        .map((r) => [r.itemId, [r.total, Number(r.passed)] as const] as const),
    );
    const questionEvents = new Map(
      this.db
        .select({
          itemId: attempt.itemId,
          total: count(),
          right: sql<number>`coalesce(sum(${attempt.correct}), 0)`,
        })
        .from(attempt)
        .groupBy(attempt.itemId)
        .all()
        .map((r) => [r.itemId, [r.total, Number(r.right)] as const] as const),
    );
    const dueCards = new Set(
      this.db
        .select({ itemId: cardState.itemId })
        .from(cardState)
        .where(sql`${cardState.state} != 0 and ${cardState.due} <= ${at}`)
        .all()
        .map((r) => r.itemId),
    );
    const stats = materials.map((entry): MaterialStat => {
      const all = items.filter((row) => row.materialId === entry.id);
      const mine = all.filter((row) => row.status !== "discarded");
      const approved = mine.filter((row) => row.status === "approved");
      let events = 0;
      let good = 0;
      let studied = 0;
      let due = 0;
      for (const row of approved) {
        const [total, passed] = (row.kind === "card" ? cardEvents : questionEvents).get(row.id) ?? [
          0, 0,
        ];
        events += total;
        good += passed;
        if (total > 0) studied += 1;
        if (row.kind === "card" && dueCards.has(row.id)) due += 1;
      }
      const accuracy = ratio(good, events);
      const unseen = approved.length - studied;
      const toReview = mine.filter((row) => row.status === "draft").length;
      const weak = accuracy !== null && events >= MIN_EVENTS && accuracy < WEAK_ACCURACY;
      const parts: [MaterialFocus, number][] = [
        ["due", due],
        ["weak", weak ? WEAK_BONUS + events * (WEAK_ACCURACY - (accuracy ?? 0)) : 0],
        ["unseen", unseen * UNSEEN_WEIGHT],
        ["review", approved.length === 0 ? toReview * REVIEW_WEIGHT : 0],
      ];
      const priority = parts.reduce((sum, [, value]) => sum + value, 0);
      const top = parts.reduce((best, part) => (part[1] > best[1] ? part : best));
      return {
        materialId: entry.id,
        title: entry.title,
        created: mine.length,
        cards: mine.filter((row) => row.kind === "card").length,
        questions: mine.filter((row) => row.kind === "question").length,
        toReview,
        approved: approved.length,
        discarded: all.length - mine.length,
        studied,
        unseen,
        due,
        events,
        accuracy,
        smallSample: events < MIN_EVENTS,
        focus: priority > 0 ? top[0] : null,
        priority,
        suggested: false,
      };
    });
    stats.sort(
      (a, b) => b.priority - a.priority || (a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1),
    );
    const first = stats[0];
    if (first && first.priority > 0) first.suggested = true;
    return stats;
  }

  /** Topics below the weak-accuracy line among those with enough events, lowest first. */
  weakestTopics(limit = 5, minEvents = MIN_EVENTS): TopicStat[] {
    return this.topicStats()
      .filter((s) => s.name !== null && s.events >= minEvents && (s.accuracy ?? 1) < WEAK_ACCURACY)
      .sort(
        (a, b) =>
          (a.accuracy ?? 0) - (b.accuracy ?? 0) || ((a.name ?? "") < (b.name ?? "") ? -1 : 1),
      )
      .slice(0, limit);
  }

  /** Share of reviews of mature cards (already in review) rated "Hard" or better. */
  retention(days = 30, now?: Date): Retention {
    const today = this.today(now);
    const first = addDays(today, -(days - 1));
    const logs = this.db
      .select({
        day: reviewLog.day,
        rating: reviewLog.rating,
        previous: reviewLog.previousStateJson,
      })
      .from(reviewLog)
      .where(sql`${reviewLog.day} >= ${first} and ${reviewLog.previousStateJson} is not null`)
      .all();
    const totals = new Map<string, [number, number]>();
    for (const log of logs) {
      if ((JSON.parse(log.previous as string) as { state?: number }).state !== REVIEW_STATE)
        continue;
      const entry = totals.get(log.day) ?? [0, 0];
      entry[0] += 1;
      entry[1] += log.rating >= 2 ? 1 : 0;
      totals.set(log.day, entry);
    }
    const series = Array.from({ length: days }, (_, index): RetentionDay => {
      const day = addDays(first, index);
      const [reviews, passes] = totals.get(day) ?? [0, 0];
      return { day, reviews, passes, rate: ratio(passes, reviews) };
    });
    const reviews = series.reduce((sum, d) => sum + d.reviews, 0);
    const passes = series.reduce((sum, d) => sum + d.passes, 0);
    return { days: series, reviews, rate: ratio(passes, reviews) };
  }

  /**
   * Confidence against accuracy over the practice answers of the last `days` study days. Answers
   * of a pre-test live in their own table and never count here.
   */
  calibration(days = 30, now?: Date): Calibration {
    const first = addDays(this.today(now), -(days - 1));
    const inWindow = and(gte(attempt.day, first), isNotNull(attempt.confidence));
    const rows = this.db
      .select({
        level: attempt.confidence,
        answers: count(),
        correct: sql<number>`coalesce(sum(${attempt.correct}), 0)`,
      })
      .from(attempt)
      .where(inWindow)
      .groupBy(attempt.confidence)
      .all();
    const levels = ([1, 2, 3] as const).map((level): CalibrationLevel => {
      const row = rows.find((candidate) => candidate.level === level);
      const answers = row?.answers ?? 0;
      const correct = Number(row?.correct ?? 0);
      const rate = ratio(correct, answers);
      const below = OVERCONFIDENCE_BELOW[level];
      const flag =
        below !== null && rate !== null && answers >= MIN_CALIBRATION_ANSWERS && rate < below
          ? "overconfident"
          : null;
      return { level, answers, correct, rate, flag };
    });
    const topics = this.db
      .select({ topicId: item.topicId, name: topic.name, confidentWrong: count() })
      .from(attempt)
      .innerJoin(item, eq(item.id, attempt.itemId))
      .innerJoin(topic, eq(topic.id, item.topicId))
      .where(and(gte(attempt.day, first), eq(attempt.confidence, 3), eq(attempt.correct, false)))
      .groupBy(item.topicId, topic.name)
      .orderBy(desc(count()), topic.name)
      .limit(5)
      .all()
      .map((row) => ({
        topicId: row.topicId as number,
        name: row.name,
        confidentWrong: row.confidentWrong,
      }));
    return { hasData: levels.some((level) => level.answers > 0), levels, topics };
  }

  activity(days = 30, now?: Date): ActivityDay[] {
    const first = addDays(this.today(now), -(days - 1));
    const reviews = new Map(
      this.db
        .select({ day: reviewLog.day, total: count() })
        .from(reviewLog)
        .where(gte(reviewLog.day, first))
        .groupBy(reviewLog.day)
        .all()
        .map((r) => [r.day, r.total] as const),
    );
    const attempts = new Map(
      this.db
        .select({ day: attempt.day, total: count() })
        .from(attempt)
        .where(gte(attempt.day, first))
        .groupBy(attempt.day)
        .all()
        .map((r) => [r.day, r.total] as const),
    );
    return Array.from({ length: days }, (_, index): ActivityDay => {
      const day = addDays(first, index);
      const r = reviews.get(day) ?? 0;
      const a = attempts.get(day) ?? 0;
      return { day, reviews: r, attempts: a, total: r + a };
    });
  }

  summary(now?: Date): StatsSummary {
    const today = this.today(now);
    const one = (query: { total: number } | undefined): number => query?.total ?? 0;
    const reviewed = one(
      this.db.select({ total: count() }).from(reviewLog).where(eq(reviewLog.day, today)).get(),
    );
    const answered = one(
      this.db.select({ total: count() }).from(attempt).where(eq(attempt.day, today)).get(),
    );
    const totalReviews = one(this.db.select({ total: count() }).from(reviewLog).get());
    const totalAttempts = one(this.db.select({ total: count() }).from(attempt).get());
    const days = new Set<string>([
      ...this.db
        .selectDistinct({ day: reviewLog.day })
        .from(reviewLog)
        .all()
        .map((r) => r.day),
      ...this.db
        .selectDistinct({ day: attempt.day })
        .from(attempt)
        .all()
        .map((r) => r.day),
    ]);
    const [currentStreak, longestStreak] = streaks(days, today);
    const goal = this.study.settings().dailyGoal;
    return {
      reviewedToday: reviewed,
      answeredToday: answered,
      activityToday: reviewed + answered,
      goal,
      goalMet: reviewed >= goal,
      currentStreak,
      longestStreak,
      totalReviews,
      totalAttempts,
    };
  }
}
