/*
 * Filename: contrast.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  join(import.meta.dirname, "..", "..", "src", "renderer", "src", "styles", "tokens.css"),
  "utf8",
);
const MIN_CONTRAST = 4.5;

function tokens(selector: string): Record<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  const end = CSS.indexOf("}", start);
  const body = CSS.slice(start, end);
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map((m) => [m[1], m[2]]),
  );
}

function luminance(color: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

// (text token, background token): the pairs the interface uses.
const PAIRS: [string, string][] = [
  ["--fg", "--bg"],
  ["--fg", "--panel"],
  ["--muted", "--bg"],
  ["--muted", "--panel"],
  ["--accent", "--bg"],
  ["--accent", "--panel"],
  ["--on-accent", "--accent"],
  ["--side-ink", "--side"],
  ["--danger", "--bg"],
  ["--danger", "--panel"],
  ["--warn", "--panel"],
  ["--info", "--bg"],
  ["--purple", "--panel"],
];

const THEMES: [string, Record<string, string>][] = [
  ["dark", tokens(":root")],
  ["light", { ...tokens(":root"), ...tokens(':root[data-theme="light"]') }],
];

describe("theme tokens meet WCAG AA", () => {
  it("uses the Dracula background and accent in the dark theme", () => {
    const dark = tokens(":root");
    expect(dark["--panel"]).toBe("#282a36");
    expect(dark["--accent"]).toBe("#50fa7b");
  });

  for (const [name, values] of THEMES) {
    for (const [text, background] of PAIRS) {
      it(`${name}: ${text} on ${background}`, () => {
        const foreground = values[text];
        const base = values[background];
        expect(foreground).toBeDefined();
        expect(base).toBeDefined();
        expect(contrast(foreground as string, base as string)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      });
    }
  }
});
