/*
 * Filename: calc.test.ts
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { checkCalculation, evaluate, formatNumber, numbersIn } from "./calc.js";
import type { CalcOption } from "./calc.js";

describe("evaluate", () => {
  it.each([
    ["1+2*3", 7],
    ["(1+2)*3", 9],
    ["2^3^2", 512],
    ["-2^2", -4],
    ["10/4", 2.5],
    ["10000*(1+0.05)^3", 11576.25],
    ["1,000".replace(",", ""), 1000],
    ["sqrt(16)+abs(-3)", 7],
    ["ln(e)", 1],
    ["log10(1000)", 3],
    ["exp(0)", 1],
    ["2*pi", 2 * Math.PI],
    ["1.5e2", 150],
    ["3 × 4 ÷ 2 − 1", 5],
    ["--3", 3],
    ["+4", 4],
  ])("computes %s", (expression, expected) => {
    expect(evaluate(expression)).toBeCloseTo(expected, 9);
  });

  it.each([
    "",
    "   ",
    "1+",
    "(1+2",
    "1+2)",
    "2**3",
    "1/0",
    "0/0",
    "sqrt(-1)",
    "foo(2)",
    "process.exit()",
    "constructor(1)",
    "__proto__",
    "1 2",
    "1,5*2",
    "x+1",
    "9".repeat(400),
    `${"(".repeat(60)}1${")".repeat(60)}`,
    "10^400",
  ])("refuses %j", (expression) => {
    expect(evaluate(expression)).toBeNull();
  });
});

describe("numbersIn and formatNumber", () => {
  it.each([
    ["R$ 1.234,56", [1234.56]],
    ["12,5%", [12.5]],
    ["1234.56", [1234.56]],
    ["1.234", [1234]],
    ["3.14", [3.14]],
    ["1,234.50", [1234.5]],
    ["−5,5 °C", [-5.5]],
    ["R$ 100 em 2 anos", [100, 2]],
    ["sem número", []],
  ])("reads %j", (text, expected) => {
    expect(numbersIn(text)).toEqual(expected);
  });

  it("formats in the Brazilian way with fixed decimals", () => {
    expect(formatNumber(11576.25, 2)).toBe("11.576,25");
    expect(formatNumber(12.5, 0)).toBe("13");
    expect(formatNumber(0.5, 3)).toBe("0,500");
  });
});

describe("checkCalculation", () => {
  const calculation = { expression: "10000*(1+0.05)^3", decimals: 2, unit: "R$" };
  const options = (overrides: Record<string, Partial<CalcOption>> = {}): CalcOption[] =>
    [
      { key: "A", text: "R$ 11.576,25", value: 11576.25 },
      { key: "B", text: "R$ 11.500,00", value: 11500 },
      { key: "C", text: "R$ 11.025,00", value: 11025 },
      { key: "D", text: "R$ 10.500,00", value: 10500 },
    ].map((option) => ({ ...option, ...overrides[option.key] }));

  it("accepts a question whose answer is the computed value and no other option is", () => {
    const check = checkCalculation(calculation, options(), "A");
    expect(check.problem).toBeNull();
    expect(check.computed).toBeCloseTo(11576.25, 9);
  });

  it("accepts a value that only matches after rounding to the stated decimals", () => {
    const rounded = options({ A: { value: 11576.2512, text: "R$ 11.576,25" } });
    expect(checkCalculation(calculation, rounded, "A").problem).toBeNull();
  });

  it.each([
    ["no calculation", null, options(), "A", "calc_missing"],
    [
      "an expression that cannot be computed",
      { ...calculation, expression: "10/0" },
      options(),
      "A",
      "calc_expression",
    ],
    [
      "a missing option value",
      calculation,
      options({ C: { value: null } }),
      "A",
      "calc_missing_value",
    ],
    ["the wrong key as the answer", calculation, options(), "B", "calc_mismatch"],
    [
      "no option with the computed value",
      calculation,
      options({ A: { value: 11576, text: "R$ 11.576,00" } }),
      "A",
      "calc_mismatch",
    ],
    [
      "two options with the computed value",
      calculation,
      options({ B: { value: 11576.25, text: "R$ 11.500,00" } }),
      "A",
      "calc_duplicate_values",
    ],
    [
      "two options with the same value",
      calculation,
      options({ C: { value: 11500, text: "R$ 11.025,00" } }),
      "A",
      "calc_duplicate_values",
    ],
    [
      "an answer text that states another number",
      calculation,
      options({ A: { text: "R$ 11.500,00" } }),
      "A",
      "calc_text_mismatch",
    ],
    [
      "a wrong option that shows the right number",
      calculation,
      options({ D: { text: "R$ 11.576,25" } }),
      "A",
      "calc_ambiguous",
    ],
  ] as const)("flags %s", (_name, calc, list, answer, problem) => {
    expect(checkCalculation(calc, list as CalcOption[], answer).problem).toBe(problem);
  });
});
