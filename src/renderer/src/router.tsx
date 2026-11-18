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
      /** The feedback that is ready and not seen yet (`/w/:id/study/feedback`). */
      pendingFeedback?: boolean;
      /** The PDF reader of a material (`/w/:id/library/:materialId/read?page=N`). */
      reader?: boolean;
      /** The page the reader opens on. */
      page?: number;
      /** A passage to highlight on that page. */
      quote?: string;
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
  const [empty, prefix, workspace, section, material, action, ...extra] = pathname.split("/");
  const practice = section === "study" && material === "practice";
  const pendingFeedback = section === "study" && material === "feedback";
  const reader = action === "read";
  const valid =
    empty === "" &&
    prefix === "w" &&
    isNumber(workspace) &&
    SECTION_SLUGS.includes(section as SectionSlug) &&
    (material === undefined || isNumber(material) || practice || pendingFeedback) &&
    (action === undefined || (reader && section === "library" && isNumber(material))) &&
    extra.length === 0;
  const params = parseQuery(query);
  const chunk = params?.get("chunk") ?? undefined;
  const topic = params?.get("topic") ?? undefined;
  const subtype = params?.get("subtype") ?? undefined;
  const page = params?.get("page") ?? undefined;
  const quote = params?.get("quote") ?? undefined;
  const allowed = reader ? ["page", "quote"] : ["chunk", "topic", "subtype"];
  const queryValid =
    query === undefined ||
    (params !== null &&
      [...params.keys()].every((key) => allowed.includes(key)) &&
      (chunk === undefined || isNumber(chunk)) &&
      (page === undefined || (isNumber(page) && Number(page) >= 1)) &&
      (quote === undefined ||
        (page !== undefined && quote.length >= 1 && quote.length <= MAX_QUOTE)) &&
      (topic === undefined || (isNumber(topic) && section === "generate")) &&
      (subtype === undefined || (topic !== undefined && /^[a-z_0-9]{1,30}$/.test(subtype))) &&
      (reader ? page !== undefined : chunk !== undefined || topic !== undefined));
  if (!valid || !queryValid) return { name: "unknown" };
  return {
    name: "section",
    workspaceId: Number(workspace),
    section: section as SectionSlug,
    ...(material !== undefined && !practice && !pendingFeedback
      ? { detailId: Number(material) }
      : {}),
    ...(practice ? { practice: true } : {}),
    ...(pendingFeedback ? { pendingFeedback: true } : {}),
    ...(reader ? { reader: true } : {}),
    ...(page !== undefined ? { page: Number(page) } : {}),
    ...(quote !== undefined ? { quote } : {}),
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

/** The longest quote a reader route carries. */
export const MAX_QUOTE = 300;

/** The in-app reader of a PDF material, optionally on a page with a passage to highlight. */
export function readerPath(
  workspaceId: number,
  materialId: number,
  page?: number,
  quote?: string,
): string {
  const base = `/w/${workspaceId}/library/${materialId}/read`;
  if (page === undefined) return base;
  const params = new URLSearchParams({ page: String(page) });
  const text = quote?.replace(/\s+/g, " ").trim().slice(0, MAX_QUOTE);
  if (text) params.set("quote", text);
  return `${base}?${params.toString()}`;
}

/**
 * The route a separate reader window was opened on (`?route=/w/1/library/4/read`), or null in
 * the main window and for anything that is not a reader route.
 */
export function standaloneRoute(search: string): string | null {
  const value = new URLSearchParams(search).get("route");
  if (!value) return null;
  const route = parseRoute(value);
  return route.name === "section" && route.reader ? value : null;
}

interface RouterValue {
  path: string;
  route: Route;
  /** True in a separate reader window, which has no sidebar and does not save its route. */
  standalone: boolean;
  /** The screen the person came from, or null when there is none to go back to. */
  previousPath: string | null;
  /** Goes to a screen; with `replace` it takes the place of the current one in the history. */
  navigate(path: string, options?: { replace?: boolean }): void;
  /** Goes back to the screen the person came from; with none, goes to `fallback`. */
  back(fallback: string): void;
}

const RouterContext = createContext<RouterValue | null>(null);

/** How many screens the back history keeps. */
export const MAX_HISTORY = 50;

function workspaceOf(path: string): number | null {
  const route = parseRoute(path);
  return route.name === "section" ? route.workspaceId : null;
}

/** Keeps the current path and the history of screens, and records the path as the last route (FR-27). */
export function RouterProvider({
  initialPath,
  standalone = false,
  children,
}: {
  initialPath: string;
  standalone?: boolean;
  children: ReactNode;
}) {
  const [stack, setStack] = useState<string[]>([initialPath]);
  const path = stack[stack.length - 1] ?? initialPath;

  const remember = useCallback(
    (next: string): void => {
      // A route that carries a quote is a one-off jump; it is not worth restoring on restart.
      if (!standalone && !next.includes("quote=")) {
        void window.mind.invoke("window:setLastRoute", { route: next });
      }
    },
    [standalone],
  );

  const navigate = useCallback(
    (next: string, options: { replace?: boolean } = {}) => {
      setStack((current) => {
        const last = current[current.length - 1];
        if (last === next) return current;
        if (options.replace && last !== undefined && workspaceOf(last) === workspaceOf(next)) {
          return [...current.slice(0, -1), next];
        }
        // The history belongs to a workspace: changing workspace starts a new one.
        if (last !== undefined && workspaceOf(last) !== workspaceOf(next)) return [next];
        return [...current, next].slice(-MAX_HISTORY);
      });
      remember(next);
    },
    [remember],
  );

  const back = useCallback(
    (fallback: string) => {
      if (stack.length > 1) {
        const previous = stack[stack.length - 2] as string;
        setStack(stack.slice(0, -1));
        remember(previous);
      } else navigate(fallback);
    },
    [stack, remember, navigate],
  );

  const previousPath = stack.length > 1 ? (stack[stack.length - 2] ?? null) : null;
  const value = useMemo(
    () => ({ path, route: parseRoute(path), standalone, previousPath, navigate, back }),
    [path, standalone, previousPath, navigate, back],
  );
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error("useRouter must be used inside RouterProvider");
  return value;
}
