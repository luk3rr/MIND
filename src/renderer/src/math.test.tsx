/*
 * Filename: math.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MathText } from "./MathText.js";
import { clozePlain, splitMath } from "./math.js";

describe("splitMath", () => {
  it("splits inline and display formulas from plain text", () => {
    expect(splitMath("A $x^2$ e $$\\frac{a}{b}$$ fim")).toEqual([
      { type: "text", value: "A " },
      { type: "inline", value: "x^2", raw: "$x^2$" },
      { type: "text", value: " e " },
      { type: "display", value: "\\frac{a}{b}", raw: "$$\\frac{a}{b}$$" },
      { type: "text", value: " fim" },
    ]);
  });

  it("does not treat currency amounts as formulas", () => {
    expect(splitMath("Custa $5 e depois $10 reais")).toEqual([
      { type: "text", value: "Custa $5 e depois $10 reais" },
    ]);
  });

  it("accepts a single-character formula and plain text", () => {
    expect(splitMath("o valor $x$ aqui")).toEqual([
      { type: "text", value: "o valor " },
      { type: "inline", value: "x", raw: "$x$" },
      { type: "text", value: " aqui" },
    ]);
    expect(splitMath("sem fórmulas")).toEqual([{ type: "text", value: "sem fórmulas" }]);
    expect(splitMath("")).toEqual([]);
  });
});

describe("clozePlain", () => {
  it("shows cloze gaps as [term]", () => {
    expect(clozePlain("A {{c1::mitocôndria}} produz {{c2::ATP}}.")).toBe(
      "A [mitocôndria] produz [ATP].",
    );
  });
});

describe("MathText", () => {
  it("renders a valid formula with KaTeX", () => {
    const { container } = render(<MathText text="Energia: $E=mc^2$" />);
    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.textContent).toContain("Energia:");
  });

  it("renders a display formula", () => {
    const { container } = render(<MathText text={"$$\\sum_{i=1}^{n} i$$"} />);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("falls back to the raw text for an invalid formula without breaking", () => {
    const { container } = render(<MathText text={"antes $\\frac{1}{$ depois"} />);
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.querySelector(".math-error")?.textContent).toBe("$\\frac{1}{$");
    expect(container.textContent).toContain("antes");
    expect(container.textContent).toContain("depois");
  });
});
