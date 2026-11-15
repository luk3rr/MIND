/*
 * Filename: files.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { eq } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import { material } from "../db/workspace-schema.js";
import type { OpenWorkspace } from "../workspaces/registry.js";

export interface MaterialFile {
  id: number;
  title: string;
  kind: string;
  path: string;
}

/**
 * The original file of a material, as an absolute path that is guaranteed to be inside the
 * workspace's `files` folder: the renderer never names a path, only a material (NFR-4).
 */
export function materialFile(workspace: OpenWorkspace, materialId: number): MaterialFile {
  const row = workspace.connection.db
    .select({
      id: material.id,
      title: material.title,
      kind: material.kind,
      storedPath: material.storedPath,
    })
    .from(material)
    .where(eq(material.id, materialId))
    .get();
  if (!row) throw new AppError("MATERIAL_NOT_FOUND", "Material não encontrado.");
  const missing = (): AppError =>
    new AppError("FILE_MISSING", "O arquivo original não foi encontrado.");
  if (
    !row.storedPath ||
    isAbsolute(row.storedPath) ||
    row.storedPath.split(/[\\/]/).includes("..")
  ) {
    throw missing();
  }
  const path = resolve(workspace.root, row.storedPath);
  if (!existsSync(path) || !statSync(path).isFile()) throw missing();
  const folder = realpathSync(workspace.filesDir);
  const real = realpathSync(path);
  if (!real.startsWith(folder + sep)) throw missing();
  return { id: row.id, title: row.title, kind: row.kind, path: real };
}
