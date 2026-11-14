/*
 * Filename: source-checker.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

export const MIN_QUOTE_CHARS = 15;

const QUOTES = new Map<number, string>([
  ...[0x2018, 0x2019, 0x201a, 0x201b].map((code) => [code, "'"] as const),
  ...[0x201c, 0x201d, 0x201e, 0x00ab, 0x00bb].map((code) => [code, '"'] as const),
  ...[0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2212].map((code) => [code, "-"] as const),
]);
// Soft hyphen, zero-width characters and BOM carry no text.
const IGNORED = new Set([0x00ad, 0x200b, 0x200c, 0x200d, 0xfeff]);

export interface QuoteMatch {
  /** Half-open range `[start, end)` of the quote inside the original chunk text. */
  start: number;
  end: number;
}

export interface CheckResult {
  valid: boolean;
  reason: string | null;
}

const isSpace = (char: string): boolean => /^\s$/u.test(char);

/**
 * Normalizes text for comparison and maps each output character to its source index. Ligatures
 * are expanded (NFKC), typographic quotes and dashes become ASCII, invisible characters are
 * dropped, whitespace runs collapse to one space and case is folded. Indexes are UTF-16 offsets.
 */
export function normalize(text: string): { text: string; positions: number[] } {
  const out: string[] = [];
  const positions: number[] = [];
  let pendingSpace = false;
  let index = 0;
  for (const original of text) {
    const code = original.codePointAt(0) as number;
    const here = index;
    index += original.length;
    if (IGNORED.has(code)) continue;
    const mapped = (QUOTES.get(code) ?? original).normalize("NFKC");
    for (const piece of mapped) {
      if (isSpace(piece)) {
        pendingSpace = out.length > 0;
        continue;
      }
      if (pendingSpace) {
        out.push(" ");
        positions.push(here);
        pendingSpace = false;
      }
      for (const folded of foldCase(piece)) {
        out.push(folded);
        positions.push(here);
      }
    }
  }
  return { text: out.join(""), positions };
}

/** Python's `str.casefold` for the characters that matter here (full case mapping). */
function foldCase(char: string): string {
  if (char === "ß") return "ss";
  return char.toLowerCase();
}

/** Finds `quote` in `chunkText` ignoring spacing, quote style, ligatures and case. */
export function locateQuote(chunkText: string, quote: string): QuoteMatch | null {
  const needle = normalize(quote).text;
  if (!needle) return null;
  const haystack = normalize(chunkText);
  const start = haystack.text.indexOf(needle);
  if (start < 0) return null;
  const last = start + needle.length - 1;
  return {
    start: haystack.positions[start] as number,
    end: (haystack.positions[last] as number) + 1,
  };
}

export class SourceChecker {
  constructor(private readonly minChars = MIN_QUOTE_CHARS) {}

  check(quote: string, chunkText: string): CheckResult {
    if (normalize(quote).text.length < this.minChars)
      return { valid: false, reason: "quote_too_short" };
    if (locateQuote(chunkText, quote) === null)
      return { valid: false, reason: "quote_not_in_chunk" };
    return { valid: true, reason: null };
  }
}
