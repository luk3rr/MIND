/*
 * Filename: seed.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { join } from "node:path";
import type { Core } from "../../core.js";
import { chunk, material } from "../../db/workspace-schema.js";
import { CASES, SUBJECT } from "./cases.js";

/** Puts the handout of the fixtures in a workspace as an indexed material, one chunk per excerpt. */
export function seedHandout(
  core: Core,
  workspaceId: number,
  options: { analyzed?: boolean } = {},
): { materialId: number; chunkIds: Map<string, number> } {
  const { connection } = core.registry.open(workspaceId);
  const materialId = connection.db
    .insert(material)
    .values({
      title: SUBJECT,
      kind: "text",
      filename: "apostila.md",
      storedPath: join("files", "relevance"),
      status: "indexed",
      // An analyzed handout has the end of its analysis set: the roles and units come below.
      ...(options.analyzed ? { analyzedAt: "2026-11-19T00:00:00.000Z" } : {}),
    })
    .returning()
    .get().id;
  const chunkIds = new Map<string, number>();
  CASES.forEach((entry, ordinal) => {
    const id = connection.db
      .insert(chunk)
      .values({
        materialId,
        ordinal,
        page: Math.floor(ordinal / 3) + 1,
        section: null,
        text: entry.text,
        ...(options.analyzed
          ? {
              role: entry.role,
              unit: entry.unit,
              startsUnit: CASES[ordinal - 1]?.unit === entry.unit ? 0 : 1,
            }
          : {}),
      })
      .returning()
      .get().id;
    chunkIds.set(entry.id, id);
  });
  return { materialId, chunkIds };
}
