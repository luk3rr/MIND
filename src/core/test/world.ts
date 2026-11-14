/*
 * Filename: world.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { attempt, generationRun, item, reviewLog, topic } from "../db/workspace-schema.js";
import { generationRig } from "./generation-fixture.js";
import type { GenerationRig } from "./generation-fixture.js";
import { fixedClock } from "./helpers.js";

export const NOON = "2026-11-14T15:00:00.000Z";
export const TODAY = "2026-11-14";
/** Brasília time, as the Python tests use. */
export const BRT_OFFSET = () => 180;

export function day(offset: number): string {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** A workspace with a fixed clock that tests fill with topics, items, reviews and attempts. */
export class World {
  readonly rig: GenerationRig;
  readonly clock = fixedClock(NOON);
  private readonly runId: number;

  constructor() {
    this.rig = generationRig({ clock: this.clock, tzOffset: BRT_OFFSET });
    this.runId = this.db
      .insert(generationRun)
      .values({ kind: "card", subtype: "qa", model: "m", requested: 1 })
      .returning({ id: generationRun.id })
      .get().id;
  }

  get db() {
    return this.rig.core.registry.open(this.rig.workspaceId).connection.db;
  }

  get workspaceId(): number {
    return this.rig.workspaceId;
  }

  close(): Promise<void> {
    return this.rig.core.close();
  }

  topic(name: string): number {
    return this.db.insert(topic).values({ name }).returning({ id: topic.id }).get().id;
  }

  item(
    kind: "card" | "question",
    topicId: number | null,
    options: { status?: string; payload?: unknown; subtype?: string; id?: number } = {},
  ): number {
    return this.db
      .insert(item)
      .values({
        ...(options.id !== undefined ? { id: options.id } : {}),
        runId: this.runId,
        kind,
        subtype: options.subtype ?? "qa",
        payloadJson: JSON.stringify(options.payload ?? {}),
        status: options.status ?? "approved",
        topicId,
        sourceTitle: "Aula",
        sourcePage: 7,
        quote: "a mitocôndria é a organela responsável",
        approvedAt: NOON,
      })
      .returning({ id: item.id })
      .get().id;
  }

  reviews(itemId: number, ratings: number[], on = TODAY, state: number | null = null): void {
    for (const rating of ratings) {
      this.db
        .insert(reviewLog)
        .values({
          itemId,
          rating,
          day: on,
          previousStateJson: state === null ? null : JSON.stringify({ state }),
          reviewedAt: NOON,
        })
        .run();
    }
  }

  attempts(itemId: number, results: boolean[], on = TODAY): void {
    for (const correct of results) {
      this.db
        .insert(attempt)
        .values({ itemId, answer: "A", correct, day: on, answeredAt: NOON })
        .run();
    }
  }
}
