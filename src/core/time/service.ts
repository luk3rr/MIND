/*
 * Filename: service.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, eq, ne, sql } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { meta, studySession, topic } from "../db/workspace-schema.js";
import { studyDay, systemOffset } from "../study/scheduler.js";
import type { TzOffset } from "../study/scheduler.js";
import type { OpenWorkspace } from "../workspaces/registry.js";

export const TIME_SOURCES = ["cards", "practice", "reading", "manual"] as const;
export type TimeSource = (typeof TIME_SOURCES)[number];

/** How often the open interval is written to the database (a crash loses at most this much). */
export const FLUSH_MS = 30_000;
export const DEFAULT_GOAL_MIN = 60;
export const DEFAULT_IDLE_SECONDS = 120;

export interface TimeState {
  status: "idle" | "running" | "paused";
  mode: "auto" | "manual" | null;
  source: TimeSource | null;
  pausedReason: "manual" | "idle" | "blur" | null;
  startedAt: string | null;
  activeSeconds: number;
  topicId: number | null;
  materialId: number | null;
  todaySeconds: number;
  goalMinutes: number;
  bySource: Record<TimeSource, number>;
}

export interface TimeServiceOptions {
  clock?: Clock;
  offset?: TzOffset;
  /** Called after the state changed (start, pause, resume, stop). */
  onChange?: () => void;
  flushMs?: number;
}

interface OpenInterval {
  id: number;
  startedAt: Date;
  day: string;
  source: TimeSource;
}

const META_GOAL = "time.dailyGoalMin";

/** Counts study time of one workspace as intervals stored in `study_session`. */
export class TimeService {
  private readonly clock: Clock;
  private readonly offset: TzOffset;
  private readonly flushMs: number;
  private open: OpenInterval | null = null;
  private status: TimeState["status"] = "idle";
  private mode: TimeState["mode"] = null;
  private pausedReason: TimeState["pausedReason"] = null;
  /** Seconds of the intervals of the current session that are already closed. */
  private closedSeconds = 0;
  private sessionStart: Date | null = null;
  private topicId: number | null = null;
  private materialId: number | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly workspace: OpenWorkspace,
    private readonly options: TimeServiceOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.offset = options.offset ?? systemOffset;
    this.flushMs = options.flushMs ?? FLUSH_MS;
  }

  private get db() {
    return this.workspace.connection.db;
  }

  private today(): string {
    return studyDay(this.clock.now(), this.offset);
  }

  private readMeta(key: string): string | undefined {
    return this.db.select({ value: meta.value }).from(meta).where(eq(meta.key, key)).get()?.value;
  }

  /** Daily goal in minutes; zero means no goal. */
  goalMinutes(): number {
    const raw = Number(this.readMeta(META_GOAL));
    return Number.isInteger(raw) && raw >= 0 ? raw : DEFAULT_GOAL_MIN;
  }

  /** The state shown to the window: the stored time of the day plus the live open interval. */
  state(): TimeState {
    const now = this.clock.now();
    const today = this.today();
    const live = this.open
      ? Math.max(0, (now.getTime() - this.open.startedAt.getTime()) / 1000)
      : 0;
    const closed = this.open ? ne(studySession.id, this.open.id) : undefined;
    const rows = this.db
      .select({
        source: studySession.source,
        total: sql<number>`coalesce(sum(${studySession.seconds}), 0)`,
      })
      .from(studySession)
      .where(and(eq(studySession.day, today), closed))
      .groupBy(studySession.source)
      .all();
    const bySource: Record<TimeSource, number> = { cards: 0, practice: 0, reading: 0, manual: 0 };
    for (const row of rows) {
      if ((TIME_SOURCES as readonly string[]).includes(row.source)) {
        bySource[row.source as TimeSource] = row.total;
      }
    }
    if (this.open && this.open.day === today) {
      bySource[this.open.source] += Math.round(live);
    }
    return {
      status: this.status,
      mode: this.mode,
      source: this.open?.source ?? (this.status === "paused" ? "manual" : null),
      pausedReason: this.pausedReason,
      startedAt: this.open?.startedAt.toISOString() ?? null,
      activeSeconds: Math.floor(this.closedSeconds + live),
      topicId: this.topicId,
      materialId: this.materialId,
      todaySeconds: Object.values(bySource).reduce((sum, value) => sum + value, 0),
      goalMinutes: this.goalMinutes(),
      bySource,
    };
  }

  /** Starts the manual timer, optionally on a topic; with a session already active it only reports. */
  start(topicId?: number): TimeState {
    if (this.status !== "idle") return this.state();
    if (topicId !== undefined) {
      const found = this.db.select({ id: topic.id }).from(topic).where(eq(topic.id, topicId)).get();
      if (!found) throw new AppError("TOPIC_NOT_FOUND", "Tópico não encontrado.");
    }
    this.topicId = topicId ?? null;
    this.materialId = null;
    this.closedSeconds = 0;
    this.sessionStart = this.clock.now();
    this.mode = "manual";
    this.status = "running";
    this.pausedReason = null;
    this.openInterval("manual");
    return this.changed();
  }

  pause(): TimeState {
    if (this.status !== "running") return this.state();
    this.closeInterval();
    this.status = "paused";
    this.pausedReason = "manual";
    return this.changed();
  }

  resume(): TimeState {
    if (this.status !== "paused") return this.state();
    this.status = "running";
    this.pausedReason = null;
    this.openInterval("manual");
    return this.changed();
  }

  /** Ends the session: the open interval is closed and the timer goes back to idle. */
  stop(): TimeState {
    if (this.status === "idle") return this.state();
    this.closeInterval();
    this.reset();
    return this.changed();
  }

  /** Closes everything before the workspace or the app goes away. */
  shutdown(): void {
    if (this.status === "idle") return;
    this.closeInterval();
    this.reset();
  }

  /** Writes the open interval, splitting it when the study day turned over. */
  flush(): void {
    if (!this.open) return;
    const now = this.clock.now();
    const day = studyDay(now, this.offset);
    if (day !== this.open.day) {
      const source = this.open.source;
      this.closeInterval();
      this.openInterval(source);
      return;
    }
    this.writeOpen(now);
  }

  private reset(): void {
    this.status = "idle";
    this.mode = null;
    this.pausedReason = null;
    this.closedSeconds = 0;
    this.sessionStart = null;
    this.topicId = null;
    this.materialId = null;
  }

  private openInterval(source: TimeSource): void {
    const now = this.clock.now();
    const day = studyDay(now, this.offset);
    const row = this.db
      .insert(studySession)
      .values({
        startedAt: now.toISOString(),
        endedAt: now.toISOString(),
        seconds: 0,
        source,
        day,
        materialId: this.materialId,
        topicId: this.topicId,
      })
      .returning({ id: studySession.id })
      .get();
    this.open = { id: row.id, startedAt: now, day, source };
    this.timer ??= setInterval(() => this.flush(), this.flushMs);
    this.timer.unref();
  }

  private writeOpen(now: Date): number {
    const open = this.open;
    if (!open) return 0;
    const seconds = Math.max(0, Math.round((now.getTime() - open.startedAt.getTime()) / 1000));
    this.db
      .update(studySession)
      .set({ endedAt: now.toISOString(), seconds })
      .where(eq(studySession.id, open.id))
      .run();
    return seconds;
  }

  private closeInterval(): void {
    if (!this.open) return;
    const seconds = this.writeOpen(this.clock.now());
    this.closedSeconds += seconds;
    this.open = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private changed(): TimeState {
    this.options.onChange?.();
    return this.state();
  }
}
