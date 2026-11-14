/*
 * Filename: smoke.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";

describe("toolchain", () => {
  it("runs a test with strict TypeScript", () => {
    const values: readonly number[] = [1, 2, 3];
    expect(values.reduce((sum, value) => sum + value, 0)).toBe(6);
  });
});
