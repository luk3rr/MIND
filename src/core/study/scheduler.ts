/*
 * Filename: scheduler.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { createEmptyCard, fsrs, generatorParameters } from "ts-fsrs";
import type { Card } from "ts-fsrs";

export const DAY_ROLLOVER_HOUR = 4;
export const LEARN_AHEAD_MS = 20 * 60 * 1000;
export const REVIEW_STATE = 2;

export enum Rating {
  AGAIN = 1,
  HARD = 2,
  GOOD = 3,
  EASY = 4,
}

/** Scheduling state of one card, ready to be stored. */
export interface CardSchedule {
  fsrsJson: string;
  due: string;
  state: number;
  reps: number;
  lapses: number;
}

/** Minutes the local clock is behind UTC (what `Date.getTimezoneOffset` returns). */
export type TzOffset = (moment: Date) => number;
export const systemOffset: TzOffset = (moment) => moment.getTimezoneOffset();

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = 24 * HOUR;

/** The study day (ISO date) a moment belongs to; the day turns over at `rolloverHour` local time. */
export function studyDay(
  moment: Date,
  offset: TzOffset = systemOffset,
  rolloverHour = DAY_ROLLOVER_HOUR,
): string {
  const local = moment.getTime() - offset(moment) * MINUTE - rolloverHour * HOUR;
  return new Date(local).toISOString().slice(0, 10);
}

/** The next study-day turnover after `moment`, as an aware UTC instant. */
export function dayEnd(
  moment: Date,
  offset: TzOffset = systemOffset,
  rolloverHour = DAY_ROLLOVER_HOUR,
): Date {
  const shift = offset(moment) * MINUTE;
  const local = moment.getTime() - shift;
  const midnight = Math.floor(local / DAY) * DAY;
  let boundary = midnight + rolloverHour * HOUR;
  if (local >= boundary) boundary += DAY;
  return new Date(boundary + shift);
}

interface StoredCard extends Omit<Card, "due" | "last_review"> {
  due: string;
  last_review: string | null;
}

function serialize(card: Card): string {
  const stored: StoredCard = {
    ...card,
    due: card.due.toISOString(),
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
  return JSON.stringify(stored);
}

function parse(json: string): Card {
  const stored = JSON.parse(json) as StoredCard;
  return {
    ...stored,
    due: new Date(stored.due),
    last_review: stored.last_review ? new Date(stored.last_review) : undefined,
  } as Card;
}

/** FSRS scheduling behind a small interface of our own. */
export class Scheduler {
  private readonly engine: ReturnType<typeof fsrs>;

  constructor(desiredRetention = 0.9, enableFuzz = true) {
    this.engine = fsrs(
      generatorParameters({ request_retention: desiredRetention, enable_fuzz: enableFuzz }),
    );
  }

  private card(state: CardSchedule | null, now: Date): Card {
    return state ? parse(state.fsrsJson) : createEmptyCard(now);
  }

  /** Applies a rating and returns the new state (the input is never modified). */
  review(state: CardSchedule | null, rating: Rating, now: Date): CardSchedule {
    const card = this.card(state, now);
    const wasReview = card.state === REVIEW_STATE;
    const { card: updated } = this.engine.next(card, now, rating as never);
    return {
      fsrsJson: serialize(updated),
      due: updated.due.toISOString(),
      state: updated.state,
      reps: (state?.reps ?? 0) + 1,
      lapses: (state?.lapses ?? 0) + (rating === Rating.AGAIN && wasReview ? 1 : 0),
    };
  }

  /** Milliseconds until the card is due again for each rating, without saving anything. */
  preview(state: CardSchedule | null, now: Date): Record<Rating, number> {
    const result = {} as Record<Rating, number>;
    for (const rating of [Rating.AGAIN, Rating.HARD, Rating.GOOD, Rating.EASY]) {
      const updated = this.review(state, rating, now);
      result[rating] = Math.max(Date.parse(updated.due) - now.getTime(), 0);
    }
    return result;
  }
}

/** "1 min", "10 min", "3 h", "3 d", "2 meses", "1,2 anos". */
export function formatInterval(ms: number): string {
  const seconds = Math.max(Math.floor(ms / 1000), 0);
  if (seconds < 60) return "< 1 min";
  if (seconds < 3600) return `${pyRoundInt(seconds / 60)} min`;
  if (seconds < 86_400) return `${pyRoundInt(seconds / 3600)} h`;
  const days = pyRoundInt(seconds / 86_400);
  if (days < 30) return `${days} d`;
  if (days < 365) {
    const months = Math.max(pyRoundInt(days / 30), 1);
    return `${months} ${months === 1 ? "mês" : "meses"}`;
  }
  const years = days / 365;
  const text = years.toFixed(1).replace(".", ",");
  return `${text} ${years < 1.5 && text === "1,0" ? "ano" : "anos"}`;
}

/** Python's `round` (halves to even) for non-negative numbers. */
function pyRoundInt(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}
