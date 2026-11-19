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

/** The passage selected inside `root`, or null when there is none that counts. */
function currentPassage(root: HTMLElement | null): PassageSelection | null {
  const current = window.getSelection();
  if (!root || !current || current.isCollapsed || current.rangeCount === 0) return null;
  const range = current.getRangeAt(0);
  const page = pageOfNode(range.startContainer);
  // A triple click ends the selection at the next block, which is outside the reader, so only
  // the start has to be inside it.
  if (!root.contains(range.startContainer) || page === null) return null;
  // With no page element in the clone the selection sits inside one text node.
  const covered = pagesWithText(range);
  if (covered.size > 1 || (covered.size === 1 && !covered.has(page))) return null;
  const text = current.toString().replace(/\s+/g, " ").trim();
  if (!text) return null;
  const box =
    typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
  return { page, text, left: box?.left ?? 0, bottom: box?.bottom ?? 0 };
}

/**
 * Offers the text selected inside `container` (the pages of the reader) on a right click, so
 * dragging to select more is never interrupted by a bar that comes and goes. A selection that
 * starts and ends on different pages, or outside the text layer, does not count and the usual
 * menu of the system is left alone. The actions close when the selection changes, on a click
 * elsewhere or on Esc.
 */
export function usePassageSelection(
  container: RefObject<HTMLElement | null>,
): [PassageSelection | null, () => void] {
  const [selection, setSelection] = useState<PassageSelection | null>(null);
  /** The range the open actions belong to. */
  const opened = useRef<Range | null>(null);

  useEffect(() => {
    const close = (): void => {
      opened.current = null;
      setSelection(null);
    };
    const open = (event: MouseEvent): void => {
      // The pages are not there while the reader is still opening, so the listener is on the
      // document and the target says where the click was.
      if (!(event.target instanceof Node && container.current?.contains(event.target))) return;
      const passage = currentPassage(container.current);
      if (!passage) return;
      event.preventDefault();
      const range = window.getSelection()?.getRangeAt(0);
      opened.current = range ? range.cloneRange() : null;
      // From the keyboard (the menu key) there is no pointer, so the actions go by the text.
      const keyboard = event.clientX === 0 && event.clientY === 0;
      setSelection(
        keyboard ? passage : { ...passage, left: event.clientX, bottom: event.clientY - 8 },
      );
    };
    const away = (event: MouseEvent): void => {
      if (!(event.target instanceof Element && event.target.closest(".selection-bar"))) close();
    };
    document.addEventListener("contextmenu", open);
    // Only a different selection closes the actions: moving the focus to them must not. The text
    // is not compared because a selection that ends in the next block can include a live line.
    const changed = (): void => {
      const now = window.getSelection();
      const kept = opened.current;
      const same =
        kept !== null &&
        now !== null &&
        now.rangeCount > 0 &&
        !now.isCollapsed &&
        now.getRangeAt(0).compareBoundaryPoints(Range.START_TO_START, kept) === 0 &&
        now.getRangeAt(0).compareBoundaryPoints(Range.END_TO_END, kept) === 0;
      if (!same) close();
    };
    document.addEventListener("selectionchange", changed);
    document.addEventListener("mousedown", away);
    return () => {
      document.removeEventListener("contextmenu", open);
      document.removeEventListener("selectionchange", changed);
      document.removeEventListener("mousedown", away);
    };
  }, [container]);

  const clear = useCallback((): void => {
    window.getSelection()?.removeAllRanges();
    opened.current = null;
    setSelection(null);
  }, []);
  return [selection, clear];
}

const BAR_WIDTH = 280;

/**
 * The actions for a passage selected in the reader, opened with a right click next to the
 * pointer. The mouse keeps the selection when it presses a button; from the keyboard, Tab leads
 * to the first action and Esc dismisses the bar.
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
      if (event.key === "Escape") {
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
