/*
 * Filename: language.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("document language (NFR-13)", () => {
  it("keeps the window's document language set to pt-BR", () => {
    const html = readFileSync(
      join(import.meta.dirname, "..", "src", "renderer", "index.html"),
      "utf8",
    );
    expect(html).toMatch(/<html lang="pt-BR"/);
  });
});
