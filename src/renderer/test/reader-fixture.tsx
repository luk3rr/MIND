/*
 * Filename: reader-fixture.tsx
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { App } from "../src/App.js";
import { installFakeMind } from "./fake-mind.js";
import type { FakeMaterial, FakeState } from "./fake-mind.js";

export const READER_WORKSPACE = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

export const READER_PDF: FakeMaterial = {
  id: 4,
  title: "apostila",
  kind: "pdf",
  filename: "a.pdf",
  status: "indexed",
  pageCount: 3,
  charCount: 10,
  ocrConfidence: null,
  jobId: 1,
  errorCode: null,
  errorDetail: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  sourceUrl: null,
  progress: null,
  chunkCount: 3,
};

export const READER_LINE = "Os juros compostos incidem sobre o capital e os juros acumulados.";

const line = (text: string, y: number) => ({ text, x: 50, y, width: 400, height: 14 });

/** Opens the reader of a three-page PDF whose first page has the given lines of text. */
export async function openReader(
  lines: string[] = [READER_LINE, "Outra linha da página."],
  extra: Partial<FakeState> = {},
) {
  const fake = installFakeMind({
    workspaces: [READER_WORKSPACE],
    route: "/w/1/library/4/read",
    materials: [READER_PDF],
    chunks: [{ id: 9, materialId: 4, ordinal: 0, page: 1, section: null, text: READER_LINE }],
    reader: {
      info: {
        title: "apostila",
        pageCount: 3,
        pages: Array.from({ length: 3 }, () => ({ width: 595, height: 842 })),
        lastPage: null,
      },
      lines: {
        1: lines.map((text, index) => line(text, 100 + index * 30)),
        2: [line("Página dois.", 100)],
      },
      hits: [],
      cited: [],
      saved: [],
      failure: null,
    },
    ...extra,
  });
  render(<App />);
  await screen.findByRole("img", { name: "Página 1" });
  return fake;
}

/** Right-clicks a node, as the person does to open the actions of the selected passage. */
export function rightClick(node: Node): void {
  const target = node instanceof Element ? node : (node.parentElement as Element);
  fireEvent.contextMenu(target, { clientX: 160, clientY: 220 });
}

/** Selects the text of a node the way the mouse would, and tells the page about it. */
export function select(node: Node, end?: Node): void {
  const range = document.createRange();
  if (end) {
    range.setStart(node, 0);
    range.setEnd(end, end.textContent?.length ?? 0);
  } else range.selectNodeContents(node);
  const current = window.getSelection();
  current?.removeAllRanges();
  current?.addRange(range);
  act(() => void document.dispatchEvent(new Event("selectionchange")));
}
