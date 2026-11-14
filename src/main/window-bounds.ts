/*
 * Filename: window-bounds.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SavedWindow {
  bounds: Bounds | null;
  maximized: boolean;
}

export const MIN_SIZE = { width: 960, height: 600 } as const;
export const DEFAULT_SIZE = { width: 1280, height: 800 } as const;

function intersects(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Decides the bounds of the window at startup. Saved bounds are used only when they still
 * overlap a connected display (a monitor may have been unplugged) and respect the minimum size.
 * Otherwise the window gets the default size and the platform centres it.
 */
export function resolveBounds(
  saved: Bounds | null,
  displays: readonly Bounds[],
): { size: { width: number; height: number }; position: { x: number; y: number } | null } {
  if (saved && displays.some((display) => intersects(saved, display))) {
    return {
      size: {
        width: Math.max(saved.width, MIN_SIZE.width),
        height: Math.max(saved.height, MIN_SIZE.height),
      },
      position: { x: saved.x, y: saved.y },
    };
  }
  return { size: { ...DEFAULT_SIZE }, position: null };
}
