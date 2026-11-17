/*
 * Filename: components/SelectionBar.tsx
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { T } from "../strings.js";

/** A passage the person selected on one page of the reader. */
export interface PassageSelection {
  page: number;
  /** The selected text with its spacing normalised. */
  text: string;
  /** Where the selection ends on the screen, so the actions can sit next to it. */
  left: number;
  bottom: number;
}

/** The page number of the text layer a node is in, or null when it is not in one. */
function pageOfNode(node: Node | null): number | null {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  if (!element?.closest(".reader-text")) return null;
  const page = Number(element.closest("[data-page]")?.getAttribute("data-page"));
  return Number.isInteger(page) && page > 0 ? page : null;
}

/**
 * The pages that hold selected text. A drag stays inside one text node or one page; a triple
 * click selects a whole block and its end point lands outside the text layer, so the end points
 * say little: the cloned selection shows which pages really have selected lines.
 */
function pagesWithText(range: Range): Set<number> {
  const pages = new Set<number>();
  const clone = range.cloneContents();
  for (const element of clone.querySelectorAll<HTMLElement>(".reader-page[data-page]")) {
    if (element.textContent?.trim()) pages.add(Number(element.getAttribute("data-page")));
  }
  return pages;
}

/**
 * Follows the text selected inside `container` (the pages of the reader). A selection that
 * starts and ends on different pages, or outside the text layer, does not count.
 */
export function usePassageSelection(
  container: RefObject<HTMLElement | null>,
): [PassageSelection | null, () => void] {
  const [selection, setSelection] = useState<PassageSelection | null>(null);

  useEffect(() => {
    const update = (): void => {
      const current = window.getSelection();
      if (!current || current.isCollapsed || current.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = current.getRangeAt(0);
      const root = container.current;
      const page = pageOfNode(range.startContainer);
      // A triple click ends the selection at the next block, which is outside the reader, so only
      // the start has to be inside it.
      if (!root || !root.contains(range.startContainer) || page === null) {
        setSelection(null);
        return;
      }
      // With no page element in the clone the selection sits inside one text node.
      const covered = pagesWithText(range);
      if (covered.size > 1 || (covered.size === 1 && !covered.has(page))) {
        setSelection(null);
        return;
      }
      const text = current.toString().replace(/\s+/g, " ").trim();
      if (!text) {
        setSelection(null);
        return;
      }
      const box =
        typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
      setSelection({ page, text, left: box?.left ?? 0, bottom: box?.bottom ?? 0 });
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [container]);

  const clear = useCallback((): void => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);
  return [selection, clear];
}

const BAR_WIDTH = 280;

/**
 * The actions for a passage selected in the reader. The mouse keeps the selection when it
 * presses a button; from the keyboard, Tab leads to the first action and Esc dismisses the bar.
 */
export function SelectionBar({
  selection,
  onGenerate,
  onCreate,
  onDismiss,
}: {
  selection: PassageSelection;
  onGenerate: () => void;
  onCreate: () => void;
  onDismiss: () => void;
}) {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const inside = bar.current?.contains(document.activeElement) ?? false;
      if (event.key === "Escape" && inside) {
        event.preventDefault();
        onDismiss();
      } else if (event.key === "Tab" && !event.shiftKey && !inside) {
        const first = bar.current?.querySelector<HTMLElement>("button");
        if (first) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const left = Math.max(8, Math.min(selection.left, window.innerWidth - BAR_WIDTH - 8));
  return (
    <>
      <p className="sr-only" role="status">
        {T.selectionAnnounce(selection.text.length)}
      </p>
      <div
        ref={bar}
        className="selection-bar"
        role="toolbar"
        aria-label={T.selectionBar}
        style={{ left, top: selection.bottom + 8 }}
        onMouseDown={(event) => event.preventDefault()}
      >
        <button type="button" className="btn sm" onClick={onGenerate}>
          ✦ {T.selectionGenerate}
        </button>
        <button type="button" className="btn ghost sm" onClick={onCreate}>
          + {T.selectionCreate}
        </button>
      </div>
    </>
  );
}
