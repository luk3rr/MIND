/*
 * Filename: router.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { SECTION_SLUGS } from "./sections.js";
import type { SectionSlug } from "./sections.js";

export type Route =
  | { name: "welcome" }
  | { name: "section"; workspaceId: number; section: SectionSlug }
  | { name: "unknown" };

const SECTION_PATH = /^\/w\/(\d+)\/([a-z]+)$/;

export function parseRoute(path: string): Route {
  if (path === "/welcome") return { name: "welcome" };
  const match = SECTION_PATH.exec(path);
  if (match) {
    const section = match[2] as SectionSlug;
    if (SECTION_SLUGS.includes(section)) {
      return { name: "section", workspaceId: Number(match[1]), section };
    }
  }
  return { name: "unknown" };
}

export function sectionPath(workspaceId: number, section: SectionSlug): string {
  return `/w/${workspaceId}/${section}`;
}

interface RouterValue {
  path: string;
  route: Route;
  navigate(path: string): void;
}

const RouterContext = createContext<RouterValue | null>(null);

/** Keeps the current path in state and records it as the last route (FR-27). */
export function RouterProvider({
  initialPath,
  children,
}: {
  initialPath: string;
  children: ReactNode;
}) {
  const [path, setPath] = useState(initialPath);
  const navigate = useCallback((next: string) => {
    setPath(next);
    void window.mind.invoke("window:setLastRoute", { route: next });
  }, []);
  const value = useMemo(() => ({ path, route: parseRoute(path), navigate }), [path, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error("useRouter must be used inside RouterProvider");
  return value;
}
