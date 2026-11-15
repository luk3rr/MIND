/*
 * Filename: reader-windows.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

/** What the manager needs from a window; the app passes an adapter around `BrowserWindow`. */
export interface ReaderWindow {
  isDestroyed(): boolean;
  focus(): void;
  /** Loads the reader screen for this route inside the window. */
  loadRoute(route: string): void;
  onClosed(listener: () => void): void;
  close(): void;
}

export interface ReaderTarget {
  workspaceId: number;
  materialId: number;
  page?: number;
  /** Text to highlight on the page. */
  quote?: string;
}

/** The longest quote the reader route carries (the same limit as the renderer's router). */
const MAX_QUOTE = 300;

/** The in-app route of the reader of a material, with an optional page. */
export function readerRoute(target: ReaderTarget): string {
  const base = `/w/${target.workspaceId}/library/${target.materialId}/read`;
  if (target.page === undefined) return base;
  const params = new URLSearchParams({ page: String(target.page) });
  const quote = target.quote?.replace(/\s+/g, " ").trim().slice(0, MAX_QUOTE);
  if (quote) params.set("quote", quote);
  return `${base}?${params.toString()}`;
}

/** Keeps at most one separate reader window per material: opening it again focuses it. */
export class ReaderWindows {
  private readonly windows = new Map<string, ReaderWindow>();

  constructor(private readonly create: (route: string) => ReaderWindow) {}

  open(target: ReaderTarget): void {
    const key = `${target.workspaceId}:${target.materialId}`;
    const route = readerRoute(target);
    const existing = this.windows.get(key);
    if (existing && !existing.isDestroyed()) {
      if (target.page !== undefined) existing.loadRoute(route);
      existing.focus();
      return;
    }
    const created = this.create(route);
    this.windows.set(key, created);
    created.onClosed(() => {
      if (this.windows.get(key) === created) this.windows.delete(key);
    });
  }

  /** Closes every reader window (the app is closing its main window). */
  closeAll(): void {
    for (const window of [...this.windows.values()]) {
      if (!window.isDestroyed()) window.close();
    }
    this.windows.clear();
  }

  get count(): number {
    return this.windows.size;
  }
}
