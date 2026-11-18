/*
 * Filename: mix-handlers.test.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { studyRig } from "../../core/test/study-fixture.js";
import type { StudyRig } from "../../core/test/study-fixture.js";
import { createHandlers } from "./handlers.js";
import { createRouter } from "./router.js";

let rig: StudyRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

async function dispatcher() {
  const opened = await studyRig(4);
  rig = opened;
  const { sqlite } = opened.core.registry.open(opened.workspaceId).connection;
  const a = Number(sqlite.prepare("INSERT INTO topic (name) VALUES ('A')").run().lastInsertRowid);
  const b = Number(sqlite.prepare("INSERT INTO topic (name) VALUES ('B')").run().lastInsertRowid);
  opened.itemIds.forEach((id, index) => {
    sqlite.prepare("UPDATE item SET topic_id = ? WHERE id = ?").run(index < 3 ? a : b, id);
  });
  const dispatch = createRouter(
    createHandlers(opened.core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
    { error: () => undefined },
  );
  return { dispatch, workspaceId: opened.workspaceId, ids: opened.itemIds, a, b };
}

describe("mix on study:next and practice:next (FR-13, NFR-7)", () => {
  it("returns the key of the card shown and rotates when it is sent back", async () => {
    const { dispatch, workspaceId, ids, a, b } = await dispatcher();
    const first = await dispatch("study:next", {
      workspaceId,
      mix: { by: "topic", afterKey: null },
    });
    expect(first).toMatchObject({ ok: true, data: { card: { itemId: ids[0] }, mixKey: `t:${a}` } });
    const second = await dispatch("study:next", {
      workspaceId,
      mix: { by: "topic", afterKey: `t:${a}` },
    });
    expect(second).toMatchObject({
      ok: true,
      data: { card: { itemId: ids[3] }, mixKey: `t:${b}` },
    });
  });

  it("answers with no key when the queue is not mixed", async () => {
    const { dispatch, workspaceId, ids } = await dispatcher();
    expect(await dispatch("study:next", { workspaceId })).toMatchObject({
      ok: true,
      data: { card: { itemId: ids[0] }, mixKey: null },
    });
    expect(await dispatch("practice:next", { workspaceId })).toMatchObject({
      ok: true,
      data: { question: null, mixKey: null },
    });
  });

  it("rejects a mix by something else, a missing key field and unknown fields", async () => {
    const { dispatch, workspaceId } = await dispatcher();
    for (const mix of [
      { by: "difficulty", afterKey: null },
      { by: "topic" },
      { by: "topic", afterKey: null, extra: true },
    ]) {
      expect(await dispatch("study:next", { workspaceId, mix })).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR" },
      });
    }
  });
});
