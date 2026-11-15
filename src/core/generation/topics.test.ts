/*
 * Filename: topics.test.ts
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { topic } from "../db/workspace-schema.js";
import { generationRig } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";
import { similarTopic, topTopics, topicWords, upsertTopic, withKnownTopics } from "./topics.js";
import type { KnownTopics } from "./topics.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

function known(...names: string[]): { map: KnownTopics } {
  const map: KnownTopics = new Map(
    names.map((name, index) => [
      name.toLowerCase(),
      { id: index + 1, name } as typeof topic.$inferSelect,
    ]),
  );
  return { map };
}

describe("topicWords", () => {
  it("drops accents, punctuation, small words and plurals", () => {
    expect(topicWords("Elasticidade-renda real")).toEqual(["elasticidade", "renda", "real"]);
    expect(topicWords("Elasticidade-preço da demanda")).toEqual([
      "elasticidade",
      "preco",
      "demanda",
    ]);
    expect(topicWords("Juros Compostos")).toEqual(["juro", "composto"]);
    expect(topicWords("  ")).toEqual([]);
  });
});

describe("similarTopic", () => {
  const { map } = known("Elasticidade-renda", "Oferta", "Juros simples");

  it("matches the same words in other spelling, case or order", () => {
    expect(similarTopic(map, "elasticidade renda")?.name).toBe("Elasticidade-renda");
    expect(similarTopic(map, "Renda: Elasticidade")?.name).toBe("Elasticidade-renda");
    expect(similarTopic(map, "Juro simples")?.name).toBe("Juros simples");
  });

  it("matches a label with one extra word", () => {
    expect(similarTopic(map, "Elasticidade-renda real")?.name).toBe("Elasticidade-renda");
  });

  it("keeps different subjects apart", () => {
    expect(similarTopic(map, "Juros compostos")).toBeUndefined();
    // A one-word topic never swallows a longer label, and two extra words are too many.
    expect(similarTopic(map, "Oferta e demanda")).toBeUndefined();
    expect(similarTopic(map, "Elasticidade-renda da demanda agregada")).toBeUndefined();
    expect(similarTopic(map, "Elasticidade")).toBeUndefined();
  });
});

describe("topics in a workspace", () => {
  it("reuses a close variant instead of creating a new topic", () => {
    rig = generationRig();
    const { db } = rig.core.registry.open(rig.workspaceId).connection;
    const topics: KnownTopics = new Map();
    const first = upsertTopic(db, topics, "Elasticidade-renda");
    expect(upsertTopic(db, topics, "elasticidade renda real")?.id).toBe(first?.id);
    expect(upsertTopic(db, topics, "Juros simples")?.id).not.toBe(first?.id);
    expect(db.select().from(topic).all()).toHaveLength(2);
    expect(upsertTopic(db, topics, null)).toBeNull();
  });

  it("lists the most used topics first and shows them to the model", async () => {
    rig = generationRig();
    const generation = rig.core.generation(rig.workspaceId);
    const run = generation.start({
      materialId: rig.materialId,
      subtype: "qa",
      quantity: 4,
      kind: "card",
      topicName: "Fotossíntese",
    });
    await rig.core.queue.wait(rig.workspaceId, run.jobId as number);
    const { db } = rig.core.registry.open(rig.workspaceId).connection;
    expect(topTopics(db)).toEqual(["Fotossíntese"]);

    const messages = withKnownTopics(
      [
        { role: "system", content: "s" },
        { role: "user", content: "u" },
      ],
      topTopics(db),
    );
    expect(messages[0]?.content).toBe("s");
    expect(messages[1]?.content).toContain("already exist");
    expect(messages[1]?.content).toContain("- Fotossíntese");
    expect(withKnownTopics([{ role: "user", content: "u" }], [])).toEqual([
      { role: "user", content: "u" },
    ]);
  });

  it("puts every item of a run in the topic the person named", async () => {
    rig = generationRig();
    const generation = rig.core.generation(rig.workspaceId);
    const run = generation.start({
      materialId: rig.materialId,
      subtype: "qa",
      quantity: 5,
      kind: "card",
      topicName: "  Minha   matéria ",
    });
    await rig.core.queue.wait(rig.workspaceId, run.jobId as number);
    const items = rig.core.review(rig.workspaceId).list({ runId: run.id });
    expect(items.length).toBeGreaterThan(0);
    expect(new Set(items.map((entry) => entry.topic))).toEqual(new Set(["Minha matéria"]));

    // The same name in another case is the same topic.
    const again = generation.start({
      materialId: rig.materialId,
      subtype: "cloze",
      quantity: 3,
      kind: "card",
      topicName: "minha MATÉRIA",
    });
    await rig.core.queue.wait(rig.workspaceId, again.jobId as number);
    const { db } = rig.core.registry.open(rig.workspaceId).connection;
    expect(db.select().from(topic).all()).toHaveLength(1);
  });
});
