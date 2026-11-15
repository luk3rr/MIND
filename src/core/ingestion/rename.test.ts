/*
 * Filename: rename.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { createHandlers } from "../../main/ipc/handlers.js";
import { createRouter } from "../../main/ipc/router.js";
import { studyRig } from "../test/study-fixture.js";
import type { StudyRig } from "../test/study-fixture.js";

let rig: StudyRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

describe("renaming a material", () => {
  it("changes the title, cleans the spaces and updates the cards made from it", async () => {
    rig = await studyRig(2);
    const { core, workspaceId, materialId } = rig;
    const before = core.review(workspaceId).list();
    expect(before.length).toBeGreaterThan(0);
    const renamed = core.materials(workspaceId).rename(materialId, "  Aula 01 —   Moeda ");
    expect(renamed.title).toBe("Aula 01 — Moeda");
    expect(core.materials(workspaceId).get(materialId).filename).not.toBe("Aula 01 — Moeda");
    expect(
      core
        .review(workspaceId)
        .list()
        .every((entry) => entry.sourceTitle === "Aula 01 — Moeda"),
    ).toBe(true);
  });

  it("refuses an empty or too long title and an unknown material", async () => {
    rig = await studyRig(1);
    const { core, workspaceId, materialId } = rig;
    const service = core.materials(workspaceId);
    expect(() => service.rename(materialId, "   ")).toThrowError(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        fields: [expect.objectContaining({ field: "title" })],
      }),
    );
    expect(() => service.rename(materialId, "x".repeat(201))).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
    expect(() => service.rename(999, "ok")).toThrowError(
      expect.objectContaining({ code: "MATERIAL_NOT_FOUND" }),
    );
  });

  it("works through the validated channel", async () => {
    rig = await studyRig(1);
    const { core, workspaceId, materialId } = rig;
    const dispatch = createRouter(
      createHandlers(core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
      { error: () => undefined },
    );
    expect(
      await dispatch("material:rename", { workspaceId, id: materialId, title: "Novo nome" }),
    ).toMatchObject({ ok: true, data: { id: materialId, title: "Novo nome" } });
    expect(
      await dispatch("material:rename", { workspaceId, id: materialId, title: "" }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await dispatch("material:list", { workspaceId })).toMatchObject({
      data: { materials: [expect.objectContaining({ title: "Novo nome" })] },
    });
  });
});
