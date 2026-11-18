/*
 * Filename: components/BackLink.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { parseRoute, sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import type { SectionSlug } from "../sections.js";

/** The text of a back link that returns to `path`. */
export function backLabel(path: string): string | null {
  const route = parseRoute(path);
  if (route.name !== "section") return null;
  if (route.section === "library") {
    if (route.reader) return T.backToReader;
    if (route.pretest || route.pretestHistory) return T.backToPretest;
    return route.detailId !== undefined ? T.backToPreview : T.backToLibrary;
  }
  if (route.section === "study" && route.practice) return T.backToPractice;
  return T.backToSection[route.section];
}

/**
 * Goes back to the screen the person came from (a card, the library, a search...). When there is
 * none, for example right after the app restored the last screen, it goes to `fallback`.
 */
export function BackLink({
  workspaceId,
  fallback,
  fallbackLabel,
}: {
  workspaceId: number;
  fallback: SectionSlug;
  fallbackLabel: string;
}) {
  const { back, previousPath } = useRouter();
  const label = (previousPath ? backLabel(previousPath) : null) ?? fallbackLabel;
  return (
    <button type="button" className="link" onClick={() => back(sectionPath(workspaceId, fallback))}>
      {label}
    </button>
  );
}
