/*
 * Filename: templates.test.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/node";
import { afterEach, describe, expect, it } from "vitest";
import { ImportService, templateName } from "./service.js";
import {
  BOM,
  CARD_COLUMNS,
  columnsOf,
  examplesOf,
  instructionsOf,
  QUESTION_COLUMNS,
  templateCsv,
} from "./templates.js";
import type { WorkspaceRegistry } from "../workspaces/registry.js";
import type { ImportKind } from "./templates.js";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "mind-template-"));
  dirs.push(dir);
  return dir;
};

const KINDS: ImportKind[] = ["card", "question"];

/** Writing a template needs no workspace, so the registry is not used. */
const service = (): ImportService => new ImportService({} as WorkspaceRegistry);

describe("template definitions (FR-13)", () => {
  it("lists the columns the design promises", () => {
    expect([...CARD_COLUMNS]).toEqual(["subtipo", "frente", "verso", "topico"]);
    expect([...QUESTION_COLUMNS]).toEqual([
      "subtipo",
      "enunciado",
      "alternativa_a",
      "alternativa_b",
      "alternativa_c",
      "alternativa_d",
      "alternativa_e",
      "motivo_a",
      "motivo_b",
      "motivo_c",
      "motivo_d",
      "motivo_e",
      "gabarito",
      "explicacao",
      "topico",
    ]);
  });

  it.each(KINDS)("gives every example row of the %s template one value per column", (kind) => {
    for (const row of examplesOf(kind)) expect(row).toHaveLength(columnsOf(kind).length);
    expect(examplesOf(kind).length).toBeGreaterThanOrEqual(1);
    expect(instructionsOf(kind)[0]).toContain(kind === "card" ? "cartões" : "questões");
  });

  it("names the files the save dialog offers", () => {
    expect(templateName("card", "csv")).toBe("modelo-cartoes.csv");
    expect(templateName("card", "xlsx")).toBe("modelo-cartoes.xlsx");
    expect(templateName("question", "csv")).toBe("modelo-questoes.csv");
    expect(templateName("question", "xlsx")).toBe("modelo-questoes.xlsx");
  });
});

describe("CSV templates", () => {
  it.each(KINDS)("opens in Excel: UTF-8 with a BOM, ; as the separator (%s)", (kind) => {
    const csv = templateCsv(kind);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.split("\r\n")[0]).toBe(`${BOM}${columnsOf(kind).join(";")}`);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it.each(KINDS)("is read back as the header and the example rows (%s)", (kind) => {
    const parsed = Papa.parse<string[]>(templateCsv(kind).slice(BOM.length), {
      delimiter: ";",
      skipEmptyLines: true,
    });
    expect(parsed.errors).toEqual([]);
    expect(parsed.data[0]).toEqual([...columnsOf(kind)]);
    expect(parsed.data.slice(1)).toEqual(examplesOf(kind));
  });

  it("keeps accents and the cloze braces intact", () => {
    const csv = templateCsv("card");
    expect(csv).toContain("Qual é a capital da França?");
    expect(csv).toContain("{{c1::Paris}}");
  });
});

describe("XLSX templates", () => {
  it.each(KINDS)(
    "is a workbook with the sheet to fill in and an instructions sheet (%s)",
    async (kind) => {
      const path = join(temp(), "modelo.xlsx");
      await service().writeTemplate(kind, "xlsx", path);
      expect(readFileSync(path).subarray(0, 2).toString("latin1")).toBe("PK");
      const data = await readSheet(path);
      expect(data[0]).toEqual([...columnsOf(kind)]);
      const rows = data
        .slice(1)
        .map((row) => row.map((cell) => (cell === null ? "" : String(cell))));
      expect(rows).toEqual(examplesOf(kind));
      const instructions = await readSheet(path, "Instruções");
      expect(instructions.map((row) => row[0])).toEqual(instructionsOf(kind));
    },
  );
});

describe("ImportService.writeTemplate", () => {
  it("writes the CSV with the same text the function returns", async () => {
    const path = join(temp(), "modelo.csv");
    await service().writeTemplate("question", "csv", path);
    expect(readFileSync(path, "utf8")).toBe(templateCsv("question"));
  });
});

describe("licences of the spreadsheet libraries (NFR-8, M-6)", () => {
  it.each(["papaparse", "read-excel-file", "write-excel-file"])(
    "%s is MIT, which AGPL accepts",
    (name) => {
      const manifest = JSON.parse(
        readFileSync(
          join(import.meta.dirname, "..", "..", "..", "node_modules", name, "package.json"),
          "utf8",
        ),
      ) as { license: string };
      expect(manifest.license).toBe("MIT");
    },
  );
});
