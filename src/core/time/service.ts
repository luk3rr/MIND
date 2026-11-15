/*
 * Filename: service.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { item, material, meta, studySession, topic } from "../db/workspace-schema.js";
import { studyDay, systemOffset } from "../study/scheduler.js";
import type { TzOffset } from "../study/scheduler.js";
import type { OpenWorkspace } from "../workspaces/registry.js";

export const TIME_SOURCES = ["cards", "practice", "reading", "manual"] as const;
export type TimeSource = (typeof TIME_SOURCES)[number];

/** How often the open interval is written to the database (a crash loses at most this much). */
export const FLUSH_MS = 30_000;
export const DEFAULT_GOAL_MIN = 60;
export const DEFAULT_IDLE_SECONDS = 120;
/** How often the timer looks for idleness and decides whether to flush. */
export const TICK_MS = 5_000;
/** An automatic session left paused this long is over; the next activity starts a new one. */
export const SESSION_GAP_MS = 10 * 60_000;
export const MIN_IDLE_SECONDS = 30;
export const MAX_IDLE_SECONDS = 600;

/** What the window was doing when it reported activity. */
export interface ActivityContext {
  itemId?: number;
  materialId?: number;
}

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

export interface TimeSettings {
  dailyGoalMin: number;
  idleSeconds: number;
  autoEnabled: boolean;
}

export interface TimeStats {
  totalSeconds: number;
  avgPerDaySeconds: number;
  bestDay: { day: string; seconds: number } | null;
  byDay: { day: string; cards: number; practice: number; reading: number; manual: number }[];
  byTopic: { topicId: number | null; name: string | null; seconds: number }[];
  byMaterial: { materialId: number; title: string; seconds: number }[];
}

export interface SessionInfo {
  id: number;
  startedAt: string;
  endedAt: string;
  seconds: number;
  source: TimeSource;
  day: string;
  topicName: string | null;
  materialTitle: string | null;
}

export const MAX_GOAL_MIN = 600;

export interface TimeServiceOptions {
  clock?: Clock;
  offset?: TzOffset;
  /** Called after the state changed (start, pause, resume, stop). */
  onChange?: () => void;
  flushMs?: number;
  tickMs?: number;
}

interface OpenInterval {
  id: number;
  startedAt: Date;
  day: string;
  source: TimeSource;
}

const META_GOAL = "time.dailyGoalMin";
const META_IDLE = "time.idleSeconds";
const META_AUTO = "time.autoEnabled";

/** Counts study time of one workspace as intervals stored in `study_session`. */
export class TimeService {
  private readonly clock: Clock;
  private readonly offset: TzOffset;
  private readonly flushMs: number;
  private readonly tickMs: number;
  private lastActivity: Date | null = null;
  private pausedAt: Date | null = null;
  private lastFlushAt: Date | null = null;
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
  private lastSource: TimeSource | null = null;

  constructor(
    private readonly workspace: OpenWorkspace,
    private readonly options: TimeServiceOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.offset = options.offset ?? systemOffset;
    this.flushMs = options.flushMs ?? FLUSH_MS;
    this.tickMs = options.tickMs ?? TICK_MS;
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

  /** Seconds without interaction after which the automatic counting pauses. */
  idleSeconds(): number {
    const raw = Number(this.readMeta(META_IDLE));
    return Number.isInteger(raw) && raw >= MIN_IDLE_SECONDS && raw <= MAX_IDLE_SECONDS
      ? raw
      : DEFAULT_IDLE_SECONDS;
  }

  /** Whether study activity is counted without the manual timer. */
  autoEnabled(): boolean {
    return this.readMeta(META_AUTO) !== "0";
  }

  settings(): TimeSettings {
    return {
      dailyGoalMin: this.goalMinutes(),
      idleSeconds: this.idleSeconds(),
      autoEnabled: this.autoEnabled(),
    };
  }

  /** Saves the settings that were sent; every one is checked before any is written. */
  saveSettings(input: Partial<TimeSettings>): TimeSettings {
    const problems: { field: string; message: string }[] = [];
    if (
      input.dailyGoalMin !== undefined &&
      !(
        Number.isInteger(input.dailyGoalMin) &&
        input.dailyGoalMin >= 0 &&
        input.dailyGoalMin <= MAX_GOAL_MIN
      )
    ) {
      problems.push({ field: "dailyGoalMin", message: `Informe de 0 a ${MAX_GOAL_MIN} minutos.` });
    }
    if (
      input.idleSeconds !== undefined &&
      !(
        Number.isInteger(input.idleSeconds) &&
        input.idleSeconds >= MIN_IDLE_SECONDS &&
        input.idleSeconds <= MAX_IDLE_SECONDS
      )
    ) {
      problems.push({
        field: "idleSeconds",
        message: `Informe de ${MIN_IDLE_SECONDS} a ${MAX_IDLE_SECONDS} segundos.`,
      });
    }
    if (problems.length > 0) {
      throw new AppError("VALIDATION_ERROR", "Configuração de tempo inválida.", problems);
    }
    const write = (key: string, value: string): void => {
      this.db
        .insert(meta)
        .values({ key, value })
        .onConflictDoUpdate({ target: meta.key, set: { value } })
        .run();
    };
    if (input.dailyGoalMin !== undefined) write(META_GOAL, String(input.dailyGoalMin));
    if (input.idleSeconds !== undefined) write(META_IDLE, String(input.idleSeconds));
    if (input.autoEnabled !== undefined) write(META_AUTO, input.autoEnabled ? "1" : "0");
    this.options.onChange?.();
    return this.settings();
  }

  /** Time per day, topic and material over the last `days` study days, today included. */
  stats(days: 7 | 30): TimeStats {
    this.flush();
    const now = this.clock.now();
    const list: string[] = [];
    for (let back = days - 1; back >= 0; back -= 1) {
      list.push(studyDay(new Date(now.getTime() - back * 86_400_000), this.offset));
    }
    const first = list[0] ?? this.today();
    const perDay = this.db
      .select({
        day: studySession.day,
        source: studySession.source,
        total: sql<number>`sum(${studySession.seconds})`,
      })
      .from(studySession)
      .where(gte(studySession.day, first))
      .groupBy(studySession.day, studySession.source)
      .all();
    const byDay = list.map((day) => ({ day, cards: 0, practice: 0, reading: 0, manual: 0 }));
    for (const row of perDay) {
      const entry = byDay.find((candidate) => candidate.day === row.day);
      if (entry && (TIME_SOURCES as readonly string[]).includes(row.source)) {
        entry[row.source as TimeSource] += row.total;
      }
    }
    const totals = byDay.map(
      (entry) => entry.cards + entry.practice + entry.reading + entry.manual,
    );
    const totalSeconds = totals.reduce((sum, value) => sum + value, 0);
    let best: TimeStats["bestDay"] = null;
    byDay.forEach((entry, index) => {
      const seconds = totals[index] ?? 0;
      if (seconds > 0 && (!best || seconds > best.seconds)) best = { day: entry.day, seconds };
    });
    const byTopic = this.db
      .select({
        topicId: studySession.topicId,
        name: topic.name,
        seconds: sql<number>`sum(${studySession.seconds})`,
      })
      .from(studySession)
      .leftJoin(topic, eq(topic.id, studySession.topicId))
      .where(gte(studySession.day, first))
      .groupBy(studySession.topicId)
      .all()
      .filter((row) => row.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds);
    const byMaterial = this.db
      .select({
        materialId: material.id,
        title: material.title,
        seconds: sql<number>`sum(${studySession.seconds})`,
      })
      .from(studySession)
      .innerJoin(material, eq(material.id, studySession.materialId))
      .where(gte(studySession.day, first))
      .groupBy(material.id)
      .all()
      .filter((row) => row.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds);
    return {
      totalSeconds,
      avgPerDaySeconds: Math.round(totalSeconds / days),
      bestDay: best,
      byDay,
      byTopic,
      byMaterial,
    };
  }

  /** The most recent intervals, newest first. */
  sessions(limit = 50): SessionInfo[] {
    return this.db
      .select({
        id: studySession.id,
        startedAt: studySession.startedAt,
        endedAt: studySession.endedAt,
        seconds: studySession.seconds,
        source: studySession.source,
        day: studySession.day,
        topicName: topic.name,
        materialTitle: material.title,
      })
      .from(studySession)
      .leftJoin(topic, eq(topic.id, studySession.topicId))
      .leftJoin(material, eq(material.id, studySession.materialId))
      .orderBy(desc(studySession.id))
      .limit(limit)
      .all()
      .map((row) => ({ ...row, source: row.source as TimeSource }));
  }

  /** Removes a closed interval from the history. */
  deleteSession(id: number): void {
    const row = this.db
      .select({ id: studySession.id })
      .from(studySession)
      .where(eq(studySession.id, id))
      .get();
    if (!row) throw new AppError("SESSION_NOT_FOUND", "Sessão não encontrada.");
    if (this.open?.id === id) {
      throw new AppError("VALIDATION_ERROR", "Encerre a sessão antes de excluir este intervalo.");
    }
    this.db.delete(studySession).where(eq(studySession.id, id)).run();
    this.options.onChange?.();
  }

  /** The state shown to the window: the stored time of the day plus the live open interval. */
  state(): TimeState {
    const now = this.clock.now();
    this.expire(now);
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
      source: this.open?.source ?? this.lastSource,
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
    this.expire(this.clock.now());
    if (this.status !== "idle") return this.state();
    if (topicId !== undefined) {
      const found = this.db.select({ id: topic.id }).from(topic).where(eq(topic.id, topicId)).get();
      if (!found) throw new AppError("TOPIC_NOT_FOUND", "Tópico não encontrado.");
    }
    this.beginSession("manual", topicId ?? null, null);
    this.mode = "manual";
    this.openInterval("manual");
    return this.changed();
  }

  /** Pauses the open interval; an automatic session pauses as if the window lost focus. */
  pause(): TimeState {
    if (this.status !== "running") return this.state();
    this.closeInterval();
    this.status = "paused";
    this.pausedReason = this.mode === "auto" ? "blur" : "manual";
    this.pausedAt = this.clock.now();
    return this.changed();
  }

  resume(): TimeState {
    if (this.status !== "paused") return this.state();
    this.status = "running";
    this.pausedReason = null;
    this.pausedAt = null;
    this.lastActivity = this.clock.now();
    this.openInterval(this.mode === "manual" ? "manual" : (this.lastSource ?? "cards"));
    return this.changed();
  }

  /** Ends the session: the open interval is closed and the timer goes back to idle. */
  stop(): TimeState {
    if (this.status === "idle") return this.state();
    this.closeInterval();
    this.reset();
    return this.changed();
  }

  /**
   * The window reports study activity (an interaction on a study screen). It opens an automatic
   * interval, keeps it alive, or moves it to another source, topic or material. While the manual
   * timer runs it is absorbed (counted once), and while it is paused by hand nothing is counted.
   */
  activity(source: Exclude<TimeSource, "manual">, context: ActivityContext = {}): void {
    if (!this.autoEnabled()) return;
    const now = this.clock.now();
    this.expire(now);
    if (this.mode === "manual") {
      if (this.status === "running") this.lastActivity = now;
      return;
    }
    const { topicId, materialId } = this.resolve(source, context);
    const same =
      this.status === "running" &&
      this.open?.source === source &&
      this.topicId === topicId &&
      this.materialId === materialId;
    this.lastActivity = now;
    if (same) return;
    if (this.status === "running") this.closeInterval();
    if (this.status === "idle") this.beginSession(source, topicId, materialId);
    this.topicId = topicId;
    this.materialId = materialId;
    this.mode = "auto";
    this.status = "running";
    this.pausedReason = null;
    this.pausedAt = null;
    this.openInterval(source);
    this.changed();
  }

  /** The window lost focus: the automatic counting pauses until the next interaction. */
  blur(): void {
    const now = this.clock.now();
    this.expire(now);
    if (this.mode !== "auto" || this.status !== "running") return;
    this.closeInterval();
    this.status = "paused";
    this.pausedReason = "blur";
    this.pausedAt = now;
    this.changed();
  }

  /** Closes everything before the workspace or the app goes away. */
  shutdown(): void {
    if (this.status === "idle") return;
    this.closeInterval(this.endOfActivity(this.clock.now()));
    this.reset();
  }

  /** Looks for idleness and writes the open interval; the timer calls it every few seconds. */
  tick(): void {
    const now = this.clock.now();
    this.expire(now);
    if (
      this.open &&
      (!this.lastFlushAt || now.getTime() - this.lastFlushAt.getTime() >= this.flushMs)
    ) {
      this.flush();
    }
  }

  /** Writes the open interval, splitting it when the study day turned over. */
  flush(): void {
    if (!this.open) return;
    const now = this.clock.now();
    const day = studyDay(now, this.offset);
    this.lastFlushAt = now;
    if (day !== this.open.day) {
      const source = this.open.source;
      this.closeInterval();
      this.openInterval(source);
      return;
    }
    this.writeOpen(now);
  }

  /** The end of an automatic interval is its last interaction; a manual one runs to `now`. */
  private endOfActivity(now: Date): Date {
    if (this.mode === "auto" && this.lastActivity && this.lastActivity < now)
      return this.lastActivity;
    return now;
  }

  /** Applies the idle limit and the end of a long-paused automatic session. */
  private expire(now: Date): void {
    if (this.mode !== "auto") return;
    if (this.status === "running" && this.lastActivity) {
      if (now.getTime() - this.lastActivity.getTime() > this.idleSeconds() * 1000) {
        this.closeInterval(this.lastActivity);
        this.status = "paused";
        this.pausedReason = "idle";
        this.pausedAt = this.lastActivity;
        this.changed();
      }
    } else if (this.status === "paused" && this.pausedAt) {
      if (now.getTime() - this.pausedAt.getTime() > SESSION_GAP_MS) {
        this.reset();
        this.changed();
      }
    }
  }

  private beginSession(
    source: TimeSource,
    topicId: number | null,
    materialId: number | null,
  ): void {
    this.topicId = topicId;
    this.materialId = materialId;
    this.closedSeconds = 0;
    this.sessionStart = this.clock.now();
    this.lastSource = source;
    this.status = "running";
    this.pausedReason = null;
    this.pausedAt = null;
    this.lastActivity = this.clock.now();
  }

  /** The topic of the item and the material, each only when it still exists. */
  private resolve(
    source: Exclude<TimeSource, "manual">,
    context: ActivityContext,
  ): { topicId: number | null; materialId: number | null } {
    let topicId: number | null = null;
    let materialId: number | null = null;
    if (source !== "reading" && context.itemId !== undefined) {
      topicId =
        this.db
          .select({ topicId: item.topicId })
          .from(item)
          .where(eq(item.id, context.itemId))
          .get()?.topicId ?? null;
    }
    if (source === "reading" && context.materialId !== undefined) {
      const found = this.db
        .select({ id: material.id })
        .from(material)
        .where(eq(material.id, context.materialId))
        .get();
      materialId = found?.id ?? null;
    }
    return { topicId, materialId };
  }

  private reset(): void {
    this.status = "idle";
    this.mode = null;
    this.pausedReason = null;
    this.pausedAt = null;
    this.lastActivity = null;
    this.closedSeconds = 0;
    this.sessionStart = null;
    this.topicId = null;
    this.materialId = null;
    this.lastSource = null;
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
    this.lastSource = source;
    this.lastFlushAt = now;
    this.timer ??= setInterval(() => this.tick(), this.tickMs);
    this.timer.unref();
  }

  private writeOpen(at: Date): number {
    const open = this.open;
    if (!open) return 0;
    const seconds = Math.max(0, Math.round((at.getTime() - open.startedAt.getTime()) / 1000));
    this.db
      .update(studySession)
      .set({ endedAt: at.toISOString(), seconds })
      .where(eq(studySession.id, open.id))
      .run();
    return seconds;
  }

  private closeInterval(at: Date = this.clock.now()): void {
    if (!this.open) return;
    const seconds = this.writeOpen(at);
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
