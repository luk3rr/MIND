/*
 * Filename: theme.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

export type Theme = "dark" | "light";

export const THEME_KEY = "mind-theme";
export const DEFAULT_THEME: Theme = "dark";

/** The saved theme, or the dark default when nothing valid is saved (FR-29). */
export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage may be unavailable; the default applies.
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset["theme"] = theme;
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The choice just will not persist.
  }
}

export function nextTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}
