/*
 * Filename: import-bundle.test.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { createWriteStream, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import writeXlsxFile from "write-excel-file/node";
import yazl from "yazl";
import { afterEach, describe, expect, it } from "vitest";
import { item } from "../db/workspace-schema.js";
import { tempDir } from "../test/helpers.js";
import { World } from "../test/world.js";
import { CARD_COLUMNS, QUESTION_COLUMNS } from "./templates.js";

let world: World | undefined;
afterEach(async () => {
  await world?.close();
  world = undefined;
});

const setup = (): World => (world = new World());
const importing = (w: World) => w.rig.core.importing;
const fixture = (name: string): Buffer =>
  readFileSync(join(import.meta.dirname, "..", "images", "fixtures", name));

async function makeZip(files: Record<string, Buffer | string>): Promise<string> {
  const target = join(tempDir(), "pacote.zip");
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) {
    zip.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name);
  }
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(target));
  return target;
}

const csv = (rows: readonly (readonly string[])[]): string =>
  rows.map((row) => row.join(";")).join("\r\n");

/** Card rows: subtipo, frente, verso, topico, imagem_frente, imagem_verso. */
const cardSheet = (rows: string[][]): string =>
  csv([[...CARD_COLUMNS, "imagem_frente", "imagem_verso"], ...rows]);
const row = (front: string, back: string, ...pictures: [string, string]): string[] => [
  "",
  front,
  back,
  "",
  ...pictures,
];

const stored = (w: World) =>
  w.db
    .select()
    .from(item)
    .all()
    .filter((r) => r.origin === "import")
    .map(
      (r) => JSON.parse(r.payloadJson) as { front?: string; images?: Record<string, unknown[]> },
    );
const imageFiles = (w: World): string[] => {
  try {
    return readdirSync(w.rig.core.images(w.workspaceId).directory);
  } catch {
    return [];
  }
};

describe("a .zip with a spreadsheet and its pictures (FR-15)", () => {
  it("links the pictures the rows name and stores each picture once", async () => {
    const w = setup();
    const path = await makeZip({
      "cartoes.csv": cardSheet([
        row("Estrutura A?", "Núcleo.", "figuras/a.png", ""),
        row("Estrutura B?", "Mitocôndria.", "A.PNG", "b.jpg"),
        row("Sem figura?", "Sim.", "", ""),
      ]),
      "figuras/a.png": fixture("square.png"),
      "b.jpg": fixture("photo.jpg"),
    });
    const result = await importing(w).preview(w.workspaceId, "card", path);
    expect(result.totals).toMatchObject({
      rows: 3,
      valid: 3,
      errors: 0,
      images: 2,
      missingImages: 0,
    });
    expect(result.rows.every((r) => r.warning === undefined)).toBe(true);
    // Nothing is stored until the confirmation.
    expect(imageFiles(w)).toEqual([]);

    await importing(w).prepare(w.workspaceId, result.token, []);
    const outcome = importing(w).commit(w.workspaceId, result.token, []);
    expect(outcome).toMatchObject({ imported: 3, images: 2 });
    const items = stored(w);
    expect(items.map((i) => Object.keys(i.images ?? {}))).toEqual([
      ["front"],
      ["front", "back"],
      [],
    ]);
    // The same file named in two rows is one picture on disk.
    expect(items[0]?.images?.["front"]).toEqual(items[1]?.images?.["front"]);
    expect(imageFiles(w)).toHaveLength(2);
  });

  it("lets a row that names a picture be only that picture, and refuses it when the picture is missing", async () => {
    const w = setup();
    const path = await makeZip({
      "cartoes.csv": cardSheet([
        row("", "Resposta com figura.", "a.png", ""),
        row("", "Sem texto nem figura.", "falta.png", ""),
      ]),
      "a.png": fixture("square.png"),
    });
    const result = await importing(w).preview(w.workspaceId, "card", path);
    // An empty front is fine when a picture of the zip stands in for it, and an error when not.
    expect(result.rows.map((r) => r.status)).toEqual(["valid", "error"]);
    expect(result.rows[1]?.problem).toMatch(/frente/i);
    const second = await makeZip({
      "cartoes.csv": cardSheet([row("", "Só a figura na frente.", "a.png", "")]),
      "a.png": fixture("square.png"),
    });
    const ok = await importing(w).preview(w.workspaceId, "card", second);
    expect(ok.rows[0]).toMatchObject({ status: "valid" });
    await importing(w).prepare(w.workspaceId, ok.token, []);
    importing(w).commit(w.workspaceId, ok.token, []);
    expect(stored(w)[0]).toMatchObject({ front: "", images: { front: [expect.any(Object)] } });
  });

  it("imports a row whose picture is not in the zip, without it and with a warning", async () => {
    const w = setup();
    const path = await makeZip({
      "cartoes.csv": cardSheet([
        row("Estrutura A?", "Núcleo.", "falta.png", "b.jpg"),
        row("Estrutura B?", "Outra.", "arte.svg", "quebrada.png"),
      ]),
      "b.jpg": fixture("photo.jpg"),
      "arte.svg": fixture("vector.svg"),
      "quebrada.png": fixture("truncated.png"),
    });
    const result = await importing(w).preview(w.workspaceId, "card", path);
    expect(result.totals).toMatchObject({ valid: 2, missingImages: 3, images: 1 });
    expect(result.rows[0]?.warning).toMatch(/“falta.png” não está no \.zip.*entra sem elas/);
    expect(result.rows[1]?.warning).toMatch(/“arte.svg” não é uma imagem aceita/);
    expect(result.rows[1]?.warning).toMatch(/Não foi possível ler a imagem “quebrada.png”/);
    await importing(w).prepare(w.workspaceId, result.token, []);
    importing(w).commit(w.workspaceId, result.token, []);
    const [first, second] = stored(w);
    expect(Object.keys(first?.images ?? {})).toEqual(["back"]);
    expect(second?.images).toBeUndefined();
  });

  it("reads several names in one cell and the columns of a question", async () => {
    const w = setup();
    const header = [...QUESTION_COLUMNS, "imagem_enunciado", "imagem_a", "imagem_explicacao"];
    const sheet = csv([
      header,
      [
        "multipla_escolha",
        "Observe a figura.",
        "",
        "Texto B",
        "",
        "",
        "",
        "É a figura.",
        "Não.",
        "",
        "",
        "",
        "A",
        "Veja.",
        "",
        '"a.png; b.jpg"',
        "b.jpg",
        "a.png",
      ],
    ]);
    const path = await makeZip({
      "questoes.csv": sheet,
      "a.png": fixture("square.png"),
      "b.jpg": fixture("photo.jpg"),
    });
    const result = await importing(w).preview(w.workspaceId, "question", path);
    expect(result.totals).toMatchObject({ valid: 1, images: 2 });
    await importing(w).prepare(w.workspaceId, result.token, []);
    importing(w).commit(w.workspaceId, result.token, []);
    const payload = w.db.select().from(item).all()[0];
    const images = (
      JSON.parse(payload?.payloadJson ?? "{}") as { images: Record<string, unknown[]> }
    ).images;
    expect(Object.keys(images).sort()).toEqual(["explanation", "option.A", "statement"]);
    expect(images["statement"]).toHaveLength(2);
  });

  it("reads an .xlsx spreadsheet inside the zip", async () => {
    const w = setup();
    const sheet = await writeXlsxFile([
      {
        sheet: "Cartões",
        data: [
          [...CARD_COLUMNS, "imagem_frente"].map((value) => ({ value })),
          ["", "Pergunta xlsx?", "Resposta.", "", "a.png"].map((value) => ({ value })),
        ],
      },
    ]).toBuffer();
    const path = await makeZip({ "planilha.xlsx": sheet, "a.png": fixture("square.png") });
    const result = await importing(w).preview(w.workspaceId, "card", path);
    expect(result.totals).toMatchObject({ valid: 1, images: 1 });
  });

  it("ignores the files a file manager adds and the folders", async () => {
    const w = setup();
    const path = await makeZip({
      "pasta/cartoes.csv": cardSheet([row("F?", "B.", "a.png", "")]),
      "pasta/a.png": fixture("square.png"),
      "__MACOSX/pasta/._cartoes.csv": "lixo",
      ".DS_Store": "lixo",
    });
    const result = await importing(w).preview(w.workspaceId, "card", path);
    expect(result.totals).toMatchObject({ valid: 1, images: 1 });
  });

  it("refuses a zip with no spreadsheet, with two, or that is not a zip", async () => {
    const w = setup();
    await expect(
      importing(w).preview(
        w.workspaceId,
        "card",
        await makeZip({ "a.png": fixture("square.png") }),
      ),
    ).rejects.toMatchObject({
      code: "IMPORT_FILE_INVALID",
      message: expect.stringContaining("não tem uma planilha"),
    });
    await expect(
      importing(w).preview(
        w.workspaceId,
        "card",
        await makeZip({ "um.csv": cardSheet([]), "dois.csv": cardSheet([]) }),
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining("mais de uma planilha") });
    const fake = join(tempDir(), "falso.zip");
    writeFileSync(fake, "isto não é um zip");
    await expect(importing(w).preview(w.workspaceId, "card", fake)).rejects.toMatchObject({
      code: "IMPORT_FILE_INVALID",
    });
  });

  it("refuses an entry whose path climbs out of the archive", async () => {
    const w = setup();
    const path = await makeZip({
      "cartoes.csv": cardSheet([row("F?", "B.", "", "")]),
      "xx/evil.png": fixture("square.png"),
    });
    // The name has the same length, so the offsets of the archive stay valid.
    const bytes = readFileSync(path);
    writeFileSync(
      path,
      Buffer.from(bytes.toString("latin1").replaceAll("xx/evil.png", "../evil.png"), "latin1"),
    );
    await expect(importing(w).preview(w.workspaceId, "card", path)).rejects.toMatchObject({
      code: "IMPORT_FILE_INVALID",
    });
  });

  it("asks for the file again when the zip is gone at the confirmation", async () => {
    const w = setup();
    const path = await makeZip({
      "cartoes.csv": cardSheet([row("F?", "B.", "a.png", "")]),
      "a.png": fixture("square.png"),
    });
    const result = await importing(w).preview(w.workspaceId, "card", path);
    rmSync(path);
    await expect(importing(w).prepare(w.workspaceId, result.token, [])).rejects.toMatchObject({
      code: "IMPORT_EXPIRED",
    });
    expect(stored(w)).toEqual([]);
  });

  it("keeps a plain spreadsheet exactly as before", async () => {
    const w = setup();
    const path = join(tempDir(), "simples.csv");
    writeFileSync(path, csv([[...CARD_COLUMNS], ["", "Pergunta?", "Resposta.", ""]]));
    const result = await importing(w).preview(w.workspaceId, "card", path);
    expect(result.totals).toEqual({ rows: 1, valid: 1, errors: 0, duplicates: 0 });
    expect(await importing(w).prepare(w.workspaceId, result.token, [])).toBe(0);
    expect(importing(w).commit(w.workspaceId, result.token, [])).toEqual({
      imported: 1,
      skippedDuplicates: 0,
      skippedErrors: 0,
      topicsCreated: 0,
    });
  });
});
