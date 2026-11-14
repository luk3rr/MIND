/*
 * Filename: service.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { count, eq, gte, sql } from "drizzle-orm";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { attempt, item, reviewLog, topic } from "../db/workspace-schema.js";
import { REVIEW_STATE, studyDay, systemOffset } from "../study/scheduler.js";
import type { TzOffset } from "../study/scheduler.js";
import { StudyService } from "../study/service.js";
import type { OpenWorkspace } from "../workspaces/registry.js";

/** Below this many events a topic's accuracy is flagged as a small sample. */
export const MIN_EVENTS = 5;

export interface TopicStat {
  topicId: number | null;
  name: string | null;
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
        .where(sql`${item.status} = 'approved' and ${item.topicId} is not null`)
        .all()
        .map((r) => r.topicId),
    );
    const keys = new Set<number | null>([...cards.keys(), ...questions.keys(), ...withItems]);
    const stats = [...keys].map((key): TopicStat => {
      const [reviews, passes] = cards.get(key) ?? [0, 0];
      const [attempts, right] = questions.get(key) ?? [0, 0];
      const events = (reviews as number) + (attempts as number);
      return {
        topicId: key,
        name: key === null ? null : (names.get(key) ?? null),
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

  /** Topics with the lowest accuracy among those with enough events. */
  weakestTopics(limit = 5, minEvents = MIN_EVENTS): TopicStat[] {
    return this.topicStats()
      .filter((s) => s.name !== null && s.events >= minEvents)
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
