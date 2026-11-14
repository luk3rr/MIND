/*
 * Filename: summary.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { item, generationRun, material } from "../db/workspace-schema.js";
import { tempDir } from "../test/helpers.js";
import { WorkspaceRegistry } from "../workspaces/registry.js";
import { todaySummary } from "./summary.js";

let registry: WorkspaceRegistry;

beforeEach(() => {
  registry = new WorkspaceRegistry(tempDir(), undefined, { warn: () => undefined });
});

afterEach(() => registry.close());

describe("todaySummary", () => {
  it("is empty for a new workspace", () => {
    const workspace = registry.open(registry.create("A").id);
    expect(todaySummary(workspace)).toEqual({ materials: 0, cards: 0, questions: 0 });
  });

  it("counts materials and only approved cards and questions", () => {
    const workspace = registry.open(registry.create("A").id);
    const { db } = workspace.connection;
    db.insert(material).values({ title: "m", kind: "md", filename: "f", storedPath: "p" }).run();
    const run = db
      .insert(generationRun)
      .values({ kind: "card", subtype: "qa", model: "x", requested: 3 })
      .returning()
      .get();
    const base = { runId: run.id, subtype: "qa", payloadJson: "{}" };
    db.insert(item)
      .values([
        { ...base, kind: "card", status: "approved" },
        { ...base, kind: "card", status: "approved" },
        { ...base, kind: "card", status: "draft" },
        { ...base, kind: "question", status: "approved" },
        { ...base, kind: "question", status: "discarded" },
      ])
      .run();
    expect(todaySummary(workspace)).toEqual({ materials: 1, cards: 2, questions: 1 });
  });
});
