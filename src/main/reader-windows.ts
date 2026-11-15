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
}

/** The in-app route of the reader of a material, with an optional page. */
export function readerRoute(target: ReaderTarget): string {
  const base = `/w/${target.workspaceId}/library/${target.materialId}/read`;
  return target.page === undefined ? base : `${base}?page=${target.page}`;
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
