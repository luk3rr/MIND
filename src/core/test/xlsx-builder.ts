/*
 * Filename: xlsx-builder.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { crc32 } from "node:zlib";

/** A cell of a hand-made spreadsheet: text, a number, nothing, or a formula with its stored value. */
export type TestCell = string | number | null | { formula: string; cached?: string | number };

const escape = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const column = (index: number): string => String.fromCharCode(65 + index);

function sheetXml(rows: readonly (readonly TestCell[])[]): string {
  const body = rows
    .map((cells, r) => {
      const xml = cells
        .map((cell, c) => {
          const ref = `${column(c)}${r + 1}`;
          if (cell === null) return "";
          if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
          if (typeof cell === "string") {
            return `<c r="${ref}" t="inlineStr"><is><t>${escape(cell)}</t></is></c>`;
          }
          const cached = cell.cached;
          if (cached === undefined) return `<c r="${ref}"><f>${escape(cell.formula)}</f></c>`;
          return typeof cached === "number"
            ? `<c r="${ref}"><f>${escape(cell.formula)}</f><v>${cached}</v></c>`
            : `<c r="${ref}" t="str"><f>${escape(cell.formula)}</f><v>${escape(cached)}</v></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${xml}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

interface Entry {
  name: string;
  data: Buffer;
  /** What the central directory claims about the size once unpacked (to fake a zip bomb). */
  declared?: number;
}

/** A zip with every entry stored without compression. */
export function zip(entries: readonly Entry[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const check = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(check, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, entry.data);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt32LE(check, 16);
    header.writeUInt32LE(entry.data.length, 20);
    header.writeUInt32LE(entry.declared ?? entry.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);
    offset += 30 + name.length + entry.data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** A minimal `.xlsx` with one sheet; `declared` fakes the unpacked size of the sheet entry. */
export function buildXlsx(rows: readonly (readonly TestCell[])[], declared?: number): Buffer {
  const text = (value: string): Buffer => Buffer.from(value);
  return zip([
    {
      name: "[Content_Types].xml",
      data: text(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      ),
    },
    {
      name: "_rels/.rels",
      data: text(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ),
    },
    {
      name: "xl/workbook.xml",
      data: text(
        '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: text(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: text(sheetXml(rows)),
      ...(declared === undefined ? {} : { declared }),
    },
  ]);
}
