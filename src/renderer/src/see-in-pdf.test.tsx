/*
 * Filename: see-in-pdf.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type {
  FakeErrorEntry,
  FakeItem,
  FakeMaterial,
  FakeState,
  FakeStudyCard,
} from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };
const pdf: FakeMaterial = {
  id: 4,
  title: "apostila",
  kind: "pdf",
  filename: "a.pdf",
  status: "indexed",
  pageCount: 60,
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
const source = { materialId: 4, page: 2, quote: "A fotossíntese converte luz" };

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route, materials: [pdf], ...initial });
  render(<App />);
  return fake;
}

const card = (pdfSource: FakeStudyCard["pdfSource"]): FakeStudyCard => ({
  itemId: 9,
  subtype: "qa",
  topic: "Biologia",
  sourceTitle: "apostila",
  sourcePage: 2,
  ...(pdfSource !== undefined ? { pdfSource } : {}),
  isNew: true,
  front: [{ text: "Pergunta?", hit: false }],
  back: [{ text: "Resposta", hit: false }],
  previews: { "1": "1 min", "2": "6 min", "3": "10 min", "4": "3 d" },
});

describe("See in PDF (FR-22, US-12)", () => {
  it("opens the reader on the cited page with the quote from a studied card", async () => {
    const { invoke } = open("/w/1/study", {
      studyQueue: [card(source)],
      summary: { materials: 1, cards: 1, questions: 0 },
    });
    const user = userEvent.setup();
    await screen.findByText("Pergunta?");
    await user.click(screen.getByRole("button", { name: /Mostrar resposta|Revelar|Mostrar/ }));
    await user.click(await screen.findByRole("button", { name: "Ver no PDF, pág. 2" }));
    expect(await screen.findByRole("img", { name: "Página 2" })).toBeInTheDocument();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("reader:locate", {
        workspaceId: 1,
        materialId: 4,
        page: 2,
        quote: "A fotossíntese converte luz",
      }),
    );
  });

  it("does not offer it when the source is not a PDF page", async () => {
    open("/w/1/study", {
      studyQueue: [card(null)],
      summary: { materials: 1, cards: 1, questions: 0 },
    });
    const user = userEvent.setup();
    await screen.findByText("Pergunta?");
    await user.click(screen.getByRole("button", { name: /Mostrar resposta|Revelar|Mostrar/ }));
    await screen.findByText(/Fonte: apostila/);
    expect(screen.queryByRole("button", { name: /Ver no PDF/ })).not.toBeInTheDocument();
  });

  it("is offered on a practiced question, a review item and an error entry", async () => {
    const item: FakeItem = {
      id: 7,
      runId: 1,
      kind: "question",
      subtype: "multiple_choice",
      front: "Enunciado?",
      back: "Comentário",
      status: "draft",
      topic: "Biologia",
      sourceTitle: "apostila",
      sourcePage: 2,
      quote: source.quote,
      chunkId: 1,
      pdfSource: source,
      edited: false,
      origin: "generated",
      createdAt: "x",
      approvedAt: null,
      options: [{ key: "A", text: "Alternativa A", why: "Porque A" }],
      answer: "A",
    };
    const view = open("/w/1/generate/1", {
      runs: [
        {
          id: 1,
          kind: "question",
          subtype: "multiple_choice",
          materialId: 4,
          pageFrom: null,
          pageTo: null,
          topicId: null,
          model: "m",
          requested: 1,
          generated: 1,
          discardedNoSource: 0,
          discardedInvalid: 0,
          discardedDuplicate: 0,
          discardedUnsupported: 0,
          approved: 0,
          approvedUnedited: 0,
          discardedReview: 0,
          costUsd: 0,
          status: "done",
          discardLog: [],
          errorCode: null,
          errorDetail: null,
          jobId: null,
          createdAt: "x",
          finishedAt: "x",
        } as never,
      ],
      items: [item],
    });
    expect(await screen.findByRole("button", { name: "Ver no PDF, pág. 2" })).toBeInTheDocument();
    expect(view.state.items).toHaveLength(1);
  });

  it("is offered on an error entry and on a practiced question", async () => {
    const entry: FakeErrorEntry = {
      itemId: 3,
      front: "Errei isto",
      topic: null,
      sourceTitle: "apostila",
      sourcePage: 2,
      fromQuestion: false,
      pdfSource: source,
      failures: 1,
      lastErrorAt: "2026-01-02T00:00:00.000Z",
    };
    open("/w/1/errors", { errorEntries: [entry] });
    const item = await screen.findByText("Errei isto");
    expect(
      within(item.closest("li") as HTMLElement).getByRole("button", {
        name: "Ver no PDF, pág. 2",
      }),
    ).toBeInTheDocument();
  });

  it("is offered on a chat citation of a PDF and on a library search hit", async () => {
    const hit = {
      chunkId: 1,
      materialId: 4,
      materialTitle: "apostila",
      page: 2,
      section: null,
      text: "Texto do trecho encontrado na busca",
      score: 1,
    };
    open("/w/1/library", { searchHits: [hit] });
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: "Buscar nos materiais" }),
      "x{Enter}",
    );
    await user.click(await screen.findByRole("button", { name: "Ver no PDF, pág. 2" }));
    expect(await screen.findByRole("img", { name: "Página 2" })).toBeInTheDocument();
  });
});

describe("Reader quote and reading position (FR-22, FR-23, US-13)", () => {
  it("highlights the cited passage on the page", async () => {
    open("/w/1/library/4/read?page=2&quote=A%20fotoss%C3%ADntese", {
      reader: {
        info: {
          title: "apostila",
          pageCount: 3,
          pages: [595, 595, 595].map((width) => ({ width, height: 842 })),
          lastPage: 3,
        },
        lines: {},
        hits: [],
        cited: [{ x: 50, y: 80, width: 120, height: 14 }],
        saved: [],
        failure: null,
      },
    });
    expect(await screen.findByRole("img", { name: "Página 2" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Trecho citado" })).toBeInTheDocument();
  });

  it("resumes on the last page read and saves the new position", async () => {
    const { state } = open("/w/1/library/4/read", {
      reader: {
        info: {
          title: "apostila",
          pageCount: 3,
          pages: [595, 595, 595].map((width) => ({ width, height: 842 })),
          lastPage: 3,
        },
        lines: {},
        hits: [],
        cited: [],
        saved: [],
        failure: null,
      },
    });
    expect(await screen.findByRole("img", { name: "Página 3" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Página anterior" }));
    await screen.findByRole("img", { name: "Página 2" });
    await waitFor(() => expect(state.reader.saved).toContain(2), { timeout: 3000 });
  });

  it("goes to the page of the route even when another page was read last", async () => {
    open("/w/1/library/4/read?page=1", {
      reader: {
        info: {
          title: "apostila",
          pageCount: 3,
          pages: [595, 595, 595].map((width) => ({ width, height: 842 })),
          lastPage: 3,
        },
        lines: {},
        hits: [],
        cited: [],
        saved: [],
        failure: null,
      },
    });
    expect(await screen.findByRole("img", { name: "Página 1" })).toBeInTheDocument();
  });
});

describe("Chat citations", () => {
  it("shows See in PDF only for PDF materials", async () => {
    const reply = {
      id: 1,
      question: "O que é?",
      answer: "Resposta [1]",
      supported: true,
      citations: [
        {
          chunkId: 1,
          materialId: 4,
          materialTitle: "apostila",
          page: 2,
          quote: "A fotossíntese converte luz",
        },
      ],
      model: "m",
      costUsd: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    open("/w/1/chat", { chat: [reply as never] });
    expect(await screen.findByRole("button", { name: "Ver no PDF, pág. 2" })).toBeInTheDocument();
  });
});
