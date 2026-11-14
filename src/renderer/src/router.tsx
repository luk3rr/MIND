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
  | { name: "setup"; step: 1 | 2 }
  | {
      name: "section";
      workspaceId: number;
      section: SectionSlug;
      materialId?: number;
      chunkId?: number;
    }
  | { name: "unknown" };

const isNumber = (text: string | undefined): text is string =>
  text !== undefined && /^\d+$/.test(text);

export function parseRoute(path: string): Route {
  if (path === "/welcome") return { name: "welcome" };
  if (path === "/setup/1") return { name: "setup", step: 1 };
  if (path === "/setup/2") return { name: "setup", step: 2 };
  const [pathname = "", query] = path.split("?");
  const [empty, prefix, workspace, section, material, ...extra] = pathname.split("/");
  const valid =
    empty === "" &&
    prefix === "w" &&
    isNumber(workspace) &&
    SECTION_SLUGS.includes(section as SectionSlug) &&
    (material === undefined || isNumber(material)) &&
    extra.length === 0;
  const chunk = query?.startsWith("chunk=") ? query.slice("chunk=".length) : undefined;
  if (!valid || (query !== undefined && !isNumber(chunk))) return { name: "unknown" };
  return {
    name: "section",
    workspaceId: Number(workspace),
    section: section as SectionSlug,
    ...(material !== undefined ? { materialId: Number(material) } : {}),
    ...(chunk !== undefined ? { chunkId: Number(chunk) } : {}),
  };
}

export function sectionPath(workspaceId: number, section: SectionSlug): string {
  return `/w/${workspaceId}/${section}`;
}

export function materialPath(workspaceId: number, materialId: number, chunkId?: number): string {
  const base = `/w/${workspaceId}/library/${materialId}`;
  return chunkId === undefined ? base : `${base}?chunk=${chunkId}`;
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
