/*
 * Filename: theme.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { applyTheme, DEFAULT_THEME, nextTheme, readTheme, saveTheme, THEME_KEY } from "./theme.js";

describe("theme", () => {
  it("defaults to dark when nothing is saved", () => {
    expect(DEFAULT_THEME).toBe("dark");
    expect(readTheme()).toBe("dark");
  });

  it("reads a saved choice and ignores invalid values", () => {
    saveTheme("light");
    expect(readTheme()).toBe("light");
    localStorage.setItem(THEME_KEY, "purple");
    expect(readTheme()).toBe("dark");
  });

  it("applies the theme to the document", () => {
    applyTheme("light");
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });

  it("alternates between the two themes", () => {
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
  });

  it("keeps working when storage is unavailable", () => {
    const failing = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const failingSet = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readTheme()).toBe("dark");
    expect(() => saveTheme("light")).not.toThrow();
    failing.mockRestore();
    failingSet.mockRestore();
  });
});
