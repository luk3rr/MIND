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
      detailId?: number;
      chunkId?: number;
      /** The practice sub-screen of Study (`/w/:id/study/practice`). */
      practice?: boolean;
      /** Generate screen pre-filled to train on a weak topic (`?topic=<id>&subtype=<type>`). */
      topicId?: number;
      subtype?: string;
    }
  | { name: "unknown" };

const isNumber = (text: string | undefined): text is string =>
  text !== undefined && /^\d+$/.test(text);

function parseQuery(query: string | undefined): URLSearchParams | null {
  if (query === undefined) return null;
  const params = new URLSearchParams(query);
  // Repeated keys or stray text are not routes of ours.
  return [...params.keys()].length === new Set(params.keys()).size ? params : null;
}

export function parseRoute(path: string): Route {
  if (path === "/welcome") return { name: "welcome" };
  if (path === "/setup/1") return { name: "setup", step: 1 };
  if (path === "/setup/2") return { name: "setup", step: 2 };
  const [pathname = "", query] = path.split("?");
  const [empty, prefix, workspace, section, material, ...extra] = pathname.split("/");
  const practice = section === "study" && material === "practice";
  const valid =
    empty === "" &&
    prefix === "w" &&
    isNumber(workspace) &&
    SECTION_SLUGS.includes(section as SectionSlug) &&
    (material === undefined || isNumber(material) || practice) &&
    extra.length === 0;
  const params = parseQuery(query);
  const chunk = params?.get("chunk") ?? undefined;
  const topic = params?.get("topic") ?? undefined;
  const subtype = params?.get("subtype") ?? undefined;
  const queryValid =
    query === undefined ||
    (params !== null &&
      [...params.keys()].every((key) => ["chunk", "topic", "subtype"].includes(key)) &&
      (chunk === undefined || isNumber(chunk)) &&
      (topic === undefined || (isNumber(topic) && section === "generate")) &&
      (subtype === undefined || (topic !== undefined && /^[a-z_0-9]{1,30}$/.test(subtype))) &&
      (chunk !== undefined || topic !== undefined));
  if (!valid || !queryValid) return { name: "unknown" };
  return {
    name: "section",
    workspaceId: Number(workspace),
    section: section as SectionSlug,
    ...(material !== undefined && !practice ? { detailId: Number(material) } : {}),
    ...(practice ? { practice: true } : {}),
    ...(chunk !== undefined ? { chunkId: Number(chunk) } : {}),
    ...(topic !== undefined ? { topicId: Number(topic) } : {}),
    ...(subtype !== undefined ? { subtype } : {}),
  };
}

export function sectionPath(workspaceId: number, section: SectionSlug): string {
  return `/w/${workspaceId}/${section}`;
}

/** The Generate screen pre-filled to train on a topic; nothing is generated until the user asks. */
export function trainPath(workspaceId: number, topicId: number, subtype?: string): string {
  const base = `/w/${workspaceId}/generate?topic=${topicId}`;
  return subtype === undefined ? base : `${base}&subtype=${subtype}`;
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
