/*
 * Filename: topics.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { item } from "../db/workspace-schema.js";
import { World } from "../test/world.js";

let world: World | undefined;
afterEach(async () => {
  await world?.close();
  world = undefined;
});

const setup = (): World => (world = new World());
const topics = (w: World) => w.rig.core.topics(w.workspaceId);

describe("TopicService", () => {
  it("lists topics alphabetically with their approved counts", () => {
    const w = setup();
    const energy = w.topic("energia");
    const cells = w.topic("Células");
    for (let i = 0; i < 3; i += 1) w.item("card", cells);
    for (let i = 0; i < 2; i += 1) w.item("question", cells);
    for (let i = 0; i < 4; i += 1) w.item("card", cells, { status: "draft" });
    w.item("card", energy);
    expect(
      topics(w)
        .list()
        .map((t) => [t.name, t.cards, t.questions]),
    ).toEqual([
      ["Células", 3, 2],
      ["energia", 1, 0],
    ]);
  });

  it("cleans names on rename and keeps them unique ignoring case", () => {
    const w = setup();
    const first = w.topic("Células");
    const second = w.topic("Energia");
    expect(topics(w).rename(first, "  Biologia   celular ").name).toBe("Biologia celular");
    expect(() => topics(w).rename(second, "biologia CELULAR")).toThrowError(
      expect.objectContaining({ fields: [expect.objectContaining({ field: "name" })] }),
    );
    expect(topics(w).rename(second, "ENERGIA").name).toBe("ENERGIA");
    for (const bad of ["", "   "])
      expect(() => topics(w).rename(first, bad)).toThrowError(/não pode ser vazio/);
    expect(() => topics(w).rename(999, "X")).toThrowError(/Não existe tópico/);
  });

  it("merges every item into the target and removes the source", () => {
    const w = setup();
    const source = w.topic("Celula");
    const target = w.topic("Células");
    const moved = [w.item("card", source), w.item("card", source), w.item("question", source)];
    w.item("card", target);
    const merged = topics(w).merge(source, target);
    expect([merged.name, merged.cards, merged.questions]).toEqual(["Células", 3, 1]);
    expect(
      topics(w)
        .list()
        .map((t) => t.name),
    ).toEqual(["Células"]);
    const ids = w.db
      .select()
      .from(item)
      .all()
      .filter((i) => moved.includes(i.id))
      .map((i) => i.topicId);
    expect(new Set(ids)).toEqual(new Set([target]));
  });

  it("rejects merging the same or unknown topics", () => {
    const w = setup();
    const only = w.topic("Único");
    expect(() => topics(w).merge(only, only)).toThrowError(/dois tópicos diferentes/);
    expect(() => topics(w).merge(only, 999)).toThrowError(/Não existe tópico/);
    expect(() => topics(w).merge(999, only)).toThrowError(/Não existe tópico/);
  });

  it("deletes a topic and leaves its items without a topic", () => {
    const w = setup();
    const t = w.topic("Apagar");
    const id = w.item("card", t);
    topics(w).delete(t);
    expect(topics(w).list()).toEqual([]);
    expect(
      w.db
        .select()
        .from(item)
        .all()
        .find((i) => i.id === id)?.topicId,
    ).toBeNull();
    expect(() => topics(w).delete(t)).toThrowError(/Não existe tópico/);
    expect(() => topics(w).get(t)).toThrowError(/Não existe tópico/);
  });
});
