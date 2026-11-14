/*
 * Filename: topics.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { eq, sql } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import { item, topic } from "../db/workspace-schema.js";
import { cleanTopic } from "../generation/cards.js";
import type { OpenWorkspace } from "../workspaces/registry.js";

export interface TopicInfo {
  id: number;
  name: string;
  /** Approved cards. */
  cards: number;
  /** Approved questions. */
  questions: number;
}

/** Topic management: list, rename, merge and delete. */
export class TopicService {
  constructor(private readonly workspace: OpenWorkspace) {}

  private get db() {
    return this.workspace.connection.db;
  }

  list(): TopicInfo[] {
    const counts = new Map<string, number>();
    for (const row of this.db
      .select({ topicId: item.topicId, kind: item.kind, total: sql<number>`count(*)` })
      .from(item)
      .where(sql`${item.status} = 'approved' and ${item.topicId} is not null`)
      .groupBy(item.topicId, item.kind)
      .all()) {
      counts.set(`${row.topicId}:${row.kind}`, row.total);
    }
    return this.db
      .select()
      .from(topic)
      .orderBy(sql`lower(${topic.name})`)
      .all()
      .map((t) => ({
        id: t.id,
        name: t.name,
        cards: counts.get(`${t.id}:card`) ?? 0,
        questions: counts.get(`${t.id}:question`) ?? 0,
      }));
  }

  private require(topicId: number): typeof topic.$inferSelect {
    const found = this.db.select().from(topic).where(eq(topic.id, topicId)).get();
    if (!found) throw new AppError("TOPIC_NOT_FOUND", `Não existe tópico com id ${topicId}.`);
    return found;
  }

  get(topicId: number): TopicInfo {
    const found = this.list().find((t) => t.id === topicId);
    if (!found) throw new AppError("TOPIC_NOT_FOUND", `Não existe tópico com id ${topicId}.`);
    return found;
  }

  rename(topicId: number, rawName: string): TopicInfo {
    const name = cleanTopic(rawName);
    if (name === null) {
      throw new AppError("VALIDATION_ERROR", "O nome do tópico não pode ser vazio.", [
        { field: "name", message: "Informe um nome." },
      ]);
    }
    this.require(topicId);
    const clash = this.db
      .select({ id: topic.id })
      .from(topic)
      .where(sql`lower(${topic.name}) = ${name.toLowerCase()} and ${topic.id} != ${topicId}`)
      .get();
    if (clash) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Já existe um tópico com esse nome. Use a mesclagem para juntá-los.",
        [{ field: "name", message: "Nome já em uso." }],
      );
    }
    this.db.update(topic).set({ name }).where(eq(topic.id, topicId)).run();
    return this.get(topicId);
  }

  /** Moves every item of `sourceId` to `targetId` and removes the source topic. */
  merge(sourceId: number, targetId: number): TopicInfo {
    if (sourceId === targetId) {
      throw new AppError("VALIDATION_ERROR", "Escolha dois tópicos diferentes para mesclar.");
    }
    this.require(sourceId);
    this.require(targetId);
    this.db.transaction((tx) => {
      tx.update(item).set({ topicId: targetId }).where(eq(item.topicId, sourceId)).run();
      tx.delete(topic).where(eq(topic.id, sourceId)).run();
    });
    return this.get(targetId);
  }

  /** Deletes a topic; its items stay, without a topic. */
  delete(topicId: number): void {
    this.require(topicId);
    this.db.delete(topic).where(eq(topic.id, topicId)).run();
  }
}
