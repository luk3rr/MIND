/*
 * Filename: calc.ts
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

const MAX_EXPRESSION = 300;
const MAX_DEPTH = 40;

const FUNCTIONS: Record<string, (value: number) => number> = {
  sqrt: Math.sqrt,
  ln: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  abs: Math.abs,
};
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

/** Cuts an expression into numbers, names and one-character symbols (anything else is a symbol). */
function split(text: string): string[] {
  const pieces: string[] = [];
  let at = 0;
  const digit = (index: number): boolean =>
    text[index] !== undefined && text[index] >= "0" && text[index] <= "9";
  const letter = (index: number): boolean => /[a-z0-9]/.test(text[index] ?? "");
  while (at < text.length) {
    const char = text[at] as string;
    if (char === " " || char === "\t" || char === "\n") {
      at += 1;
    } else if (digit(at)) {
      let end = at;
      while (digit(end)) end += 1;
      if (text[end] === "." && digit(end + 1)) {
        end += 1;
        while (digit(end)) end += 1;
      }
      if (text[end] === "e" || text[end] === "E") {
        let exponent = end + 1;
        if (text[exponent] === "+" || text[exponent] === "-") exponent += 1;
        if (digit(exponent)) {
          while (digit(exponent)) exponent += 1;
          end = exponent;
        }
      }
      pieces.push(text.slice(at, end));
      at = end;
    } else if (char >= "a" && char <= "z") {
      let end = at + 1;
      while (letter(end)) end += 1;
      pieces.push(text.slice(at, end));
      at = end;
    } else {
      pieces.push(char);
      at += 1;
    }
  }
  return pieces;
}

/**
 * Evaluates an arithmetic expression without running any code: numbers with a decimal point,
 * `+ - * / ^`, parentheses, `sqrt ln log10 exp abs` and the constants `pi` and `e`. Returns null
 * for anything else, for a malformed expression and for a result that is not a finite number.
 */
export function evaluate(expression: string): number | null {
  const text = expression.replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-").trim();
  if (!text || text.length > MAX_EXPRESSION) return null;
  const pieces = split(text);
  let position = 0;
  let depth = 0;

  const fail = (): never => {
    throw new SyntaxError("bad expression");
  };
  const peek = (): string | undefined => pieces[position];
  const take = (): string => pieces[position++] ?? fail();

  const primary = (): number => {
    const symbol = take();
    if (/^\d/.test(symbol)) return Number(symbol);
    if (symbol === "(") {
      depth += 1;
      if (depth > MAX_DEPTH) fail();
      const inner = sum();
      if (take() !== ")") fail();
      depth -= 1;
      return inner;
    }
    if (Object.hasOwn(FUNCTIONS, symbol)) {
      if (take() !== "(") fail();
      depth += 1;
      if (depth > MAX_DEPTH) fail();
      const inner = sum();
      if (take() !== ")") fail();
      depth -= 1;
      return (FUNCTIONS[symbol] as (value: number) => number)(inner);
    }
    if (Object.hasOwn(CONSTANTS, symbol)) return CONSTANTS[symbol] as number;
    return fail();
  };
  const unary = (): number => {
    const symbol = peek();
    if (symbol === "-") {
      take();
      return -unary();
    }
    if (symbol === "+") {
      take();
      return unary();
    }
    return power();
  };
  const power = (): number => {
    const base = primary();
    if (peek() === "^") {
      take();
      return Math.pow(base, unary());
    }
    return base;
  };
  const product = (): number => {
    let value = unary();
    while (peek() === "*" || peek() === "/") {
      value = take() === "*" ? value * unary() : value / unary();
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (peek() === "+" || peek() === "-") {
      value = take() === "+" ? value + product() : value - product();
    }
    return value;
  };

  try {
    const value = sum();
    if (position !== pieces.length) return null;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** `1.234` or `12.345.678`: groups of three digits separated by dots. */
function isThousands(raw: string): boolean {
  const groups = raw.split(".");
  const [first, ...rest] = groups;
  return (
    rest.length > 0 &&
    first !== undefined &&
    first.length >= 1 &&
    first.length <= 3 &&
    groups.every((group) => group.length > 0 && [...group].every((c) => c >= "0" && c <= "9")) &&
    rest.every((group) => group.length === 3)
  );
}

/** The numbers written in a text, reading Brazilian (`1.234,56`) and plain (`1234.56`) formats. */
export function numbersIn(text: string): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(/(-|−)?\s?(\d[\d.,]*\d|\d)/g)) {
    let raw = match[2] as string;
    const lastDot = raw.lastIndexOf(".");
    const lastComma = raw.lastIndexOf(",");
    if (lastDot >= 0 && lastComma >= 0) {
      raw =
        lastComma > lastDot ? raw.replaceAll(".", "").replace(",", ".") : raw.replaceAll(",", "");
    } else if (lastComma >= 0) {
      raw = raw.replace(",", ".");
    } else if (isThousands(raw)) {
      raw = raw.replaceAll(".", "");
    }
    const value = Number(raw);
    if (Number.isFinite(value)) found.push(match[1] ? -value : value);
  }
  return found;
}

/** A number in Brazilian format with a fixed count of decimals (`11.576,25`). */
export function formatNumber(value: number, decimals: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export interface Calculation {
  expression: string;
  decimals: number;
  unit?: string | null | undefined;
}

export interface CalcOption {
  key: string;
  text: string;
  value?: number | null | undefined;
}

export interface CalcCheck {
  problem: string | null;
  /** The value the expression gives, when it could be computed. */
  computed: number | null;
}

/**
 * Checks a calculation question by doing the arithmetic: the expression must evaluate, the
 * answer option must hold that value (at the stated decimals) in both `value` and its text, and
 * no other option may hold it, so exactly one option is right and the key is not the model's word.
 */
export function checkCalculation(
  calculation: Calculation | null | undefined,
  options: readonly CalcOption[],
  answer: string,
): CalcCheck {
  if (!calculation) return { problem: "calc_missing", computed: null };
  const computed = evaluate(calculation.expression);
  if (computed === null) return { problem: "calc_expression", computed: null };
  const tolerance = 0.5 * 10 ** -calculation.decimals * (1 + 1e-9) + 1e-12;
  const values: number[] = [];
  for (const option of options) {
    if (typeof option.value !== "number" || !Number.isFinite(option.value)) {
      return { problem: "calc_missing_value", computed };
    }
    values.push(option.value);
  }
  for (let first = 0; first < values.length; first += 1) {
    for (let second = first + 1; second < values.length; second += 1) {
      if (Math.abs((values[first] as number) - (values[second] as number)) <= tolerance) {
        return { problem: "calc_duplicate_values", computed };
      }
    }
  }
  const matching = options.filter(
    (_, index) => Math.abs((values[index] as number) - computed) <= tolerance,
  );
  if (matching.length !== 1 || matching[0]?.key !== answer) {
    return { problem: "calc_mismatch", computed };
  }
  const close = (text: string): boolean =>
    numbersIn(text).some((number) => Math.abs(number - computed) <= tolerance);
  if (!close(matching[0].text)) return { problem: "calc_text_mismatch", computed };
  // A wrong option must not show the right number either, whatever its `value` says.
  if (options.some((option) => option.key !== answer && close(option.text))) {
    return { problem: "calc_ambiguous", computed };
  }
  return { problem: null, computed };
}
