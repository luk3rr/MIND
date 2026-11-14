/*
 * Filename: generation-fixture.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { join } from "node:path";
import { createCore } from "../core.js";
import type { Core } from "../core.js";
import { chunk, material } from "../db/workspace-schema.js";
import type { Provider } from "../llm/provider.js";
import { scriptedCardProvider } from "../llm/scripted.js";
import { tempDir } from "./helpers.js";

export interface GenerationRig {
  core: Core;
  workspaceId: number;
  materialId: number;
  chunkIds: number[];
  dir: string;
}

export const TEXTS = [
  "A fotossíntese converte a energia da luz em energia química nos cloroplastos das plantas verdes.",
  "A respiração celular libera energia armazenada nas moléculas de glicose dentro das mitocôndrias.",
  "O ciclo de Calvin fixa o dióxido de carbono em açúcares usando ATP e NADPH produzidos antes.",
];

/** A core with an indexed material of three chunks and a scripted provider that needs no consent. */
export function generationRig(
  options: { provider?: Provider; texts?: string[]; concurrency?: number } = {},
): GenerationRig {
  const dir = tempDir();
  const core = createCore({
    dataDir: dir,
    env: {},
    provider: options.provider ?? scriptedCardProvider(),
    ...(options.concurrency ? { generationConcurrency: options.concurrency } : {}),
  });
  const workspaceId = core.registry.create("Gerar").id;
  const { connection } = core.registry.open(workspaceId);
  const materialId = connection.db
    .insert(material)
    .values({
      title: "Biologia",
      kind: "text",
      filename: "bio.md",
      storedPath: join("files", "x"),
      status: "indexed",
    })
    .returning()
    .get().id;
  const chunkIds = (options.texts ?? TEXTS).map(
    (text, ordinal) =>
      connection.db
        .insert(chunk)
        .values({ materialId, ordinal, page: ordinal + 1, section: null, text })
        .returning()
        .get().id,
  );
  return { core, workspaceId, materialId, chunkIds, dir };
}
