/*
 * Filename: pages/ReaderPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Maximize2,
  Rows3,
  Search,
  SquareArrowOutUpRight,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { useHotkeys, useInvoke } from "../hooks.js";
import { BackLink } from "../components/BackLink.js";
import { GenerateFromSelection } from "../components/GenerateFromSelection.js";
import { ItemEditor } from "../components/ItemEditor.js";
import { SelectionBar, usePassageSelection } from "../components/SelectionBar.js";
import { T } from "../strings.js";
import { formatClock, useActivity, useTime } from "../time.js";

type Lines = OutputOf<"reader:text">["lines"];
type Hits = OutputOf<"reader:search">["hits"];

/** The longest quote an item keeps (the reader can highlight up to this many characters). */
const MAX_QUOTE = 2000;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

/** One line of the invisible text layer, stretched to the box the page draws it in. */
function LineText({ line, zoom }: { line: Lines[number]; zoom: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [stretch, setStretch] = useState(1);
  useLayoutEffect(() => {
    const natural = ref.current?.scrollWidth ?? 0;
    const target = line.width * zoom;
    if (natural > 0 && target > 0) setStretch(target / natural);
  }, [line, zoom]);
  return (
    <span
      ref={ref}
      className="reader-line"
      style={{
        left: line.x * zoom,
        top: line.y * zoom,
        fontSize: line.height * zoom * 0.8,
        lineHeight: `${line.height * zoom}px`,
        transform: `scaleX(${stretch})`,
      }}
    >
      {line.text}
    </span>
  );
}

type PageSize = OutputOf<"reader:info">["pages"][number];

/** Where a cited passage sits on screen: a third of the way down the area, never above its page. */
const CITED_LINE = 0.3;
const citedTop = (lines: Lines): number => Math.min(...lines.map((line) => line.y));

/** Space between two pages in the continuous scroll mode, in pixels. */
const GAP = 16;
const MODE_KEY = "mind.reader.mode";

/** The reading mode the person chose last time ("page" when nothing was saved). */
function savedMode(): "page" | "scroll" {
  try {
    return window.localStorage.getItem(MODE_KEY) === "scroll" ? "scroll" : "page";
  } catch {
    return "page";
  }
}

function saveMode(mode: "page" | "scroll"): void {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // The choice is only a convenience; without storage the reader starts in page mode.
  }
}

/** The image and the text lines of one page, loaded while `enabled`; the last ones stay on screen. */
function usePageData(
  workspaceId: number,
  materialId: number,
  page: number,
  scale: number,
  enabled: boolean,
) {
  const [image, setImage] = useState<{ page: number; dataUrl: string } | null>(null);
  const [text, setText] = useState<{ page: number; lines: Lines } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    void window.mind
      .invoke("reader:page", { workspaceId, materialId, page, scale })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setError(null);
          setImage({ page, dataUrl: result.data.dataUrl });
        } else setError(result.error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, materialId, page, scale, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    void window.mind.invoke("reader:text", { workspaceId, materialId, page }).then((result) => {
      if (!cancelled) setText({ page, lines: result.ok ? result.data.lines : [] });
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, materialId, page, enabled]);

  return { image, text, error };
}

interface PageHit {
  rects: { x: number; y: number; width: number; height: number }[];
  current: boolean;
}

/** One drawn page: the image, the search highlights, the cited passage and the selectable text. */
function PageSurface({
  number,
  size,
  zoom,
  data,
  hits,
  cited,
  style,
}: {
  number: number;
  size: PageSize;
  zoom: number;
  data: ReturnType<typeof usePageData>;
  hits: PageHit[];
  cited: Lines | null;
  style?: React.CSSProperties;
}) {
  const width = size.width * zoom;
  const height = size.height * zoom;
  const box = (rect: PageHit["rects"][number]): React.CSSProperties => ({
    left: rect.x * zoom,
    top: rect.y * zoom,
    width: rect.width * zoom,
    height: rect.height * zoom,
  });
  return (
    <div className="reader-page" style={{ width, height, ...style }} data-page={number}>
      {data.image && (
        <img
          src={data.image.dataUrl}
          alt={T.readerPageImage(data.image.page)}
          width={width}
          height={height}
          draggable={false}
        />
      )}
      {hits.flatMap((hit, index) =>
        hit.rects.map((rect, rectIndex) => (
          <div
            key={`${index}-${rectIndex}`}
            className={hit.current ? "reader-hit current" : "reader-hit"}
            style={box(rect)}
          />
        )),
      )}
      {cited?.map((rect, index) => (
        <div
          key={`cited-${index}`}
          className="reader-hit cited"
          role="img"
          aria-label={T.readerCited}
          style={box(rect)}
        />
      ))}
      <div className="reader-text" aria-label="Texto da página">
        {data.text?.page === number &&
          data.text.lines.map((line, index) => (
            <LineText key={`${number}-${index}`} line={line} zoom={zoom} />
          ))}
      </div>
    </div>
  );
}

/** A page of the continuous mode: it only loads its image and text while it is near the screen. */
function ScrollPage({
  workspaceId,
  materialId,
  number,
  size,
  zoom,
  scale,
  near,
  hits,
  cited,
}: {
  workspaceId: number;
  materialId: number;
  number: number;
  size: PageSize;
  zoom: number;
  scale: number;
  near: boolean;
  hits: PageHit[];
  cited: Lines | null;
}) {
  const data = usePageData(workspaceId, materialId, number, scale, near);
  const style = { margin: `0 auto ${GAP}px` };
  if (!near) {
    return (
      <div
        className="reader-page placeholder"
        style={{ width: size.width * zoom, height: size.height * zoom, ...style }}
        data-page={number}
      />
    );
  }
  return (
    <PageSurface
      number={number}
      size={size}
      zoom={zoom}
      data={data}
      hits={hits}
      cited={cited}
      style={style}
    />
  );
}

/**
 * All the pages one after the other. Every page has its final size from the start, so the scroll
 * bar is exact; only the pages within a screen of the visible area are drawn.
 */
function ScrollPages({
  workspaceId,
  materialId,
  pages,
  zoom,
  fitWidth,
  ratio,
  viewport,
  request,
  hitsByPage,
  cited,
  citedPage,
  onVisiblePage,
}: {
  workspaceId: number;
  materialId: number;
  pages: PageSize[];
  /** A fixed zoom for every page, or "fit": each page is as wide as the area (pages of other widths included). */
  zoom: number | "fit";
  /** The width a fitted page takes, in pixels. */
  fitWidth: number;
  /** Device pixel ratio, for the resolution the pages are drawn at. */
  ratio: number;
  viewport: React.RefObject<HTMLDivElement | null>;
  /** Asks for a scroll to a page; a new object scrolls even to the same page again. */
  request: { page: number } | null;
  hitsByPage: Map<number, PageHit[]>;
  cited: Lines | null;
  citedPage: number | undefined;
  onVisiblePage: (page: number) => void;
}) {
  // With "fit" every page gets its own zoom, so a wide page never rescales the others: the
  // position of each page depends only on the pages before it and does not change while reading.
  const zooms = useMemo(
    () =>
      pages.map((size) =>
        zoom === "fit" ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fitWidth / size.width)) : zoom,
      ),
    [pages, zoom, fitWidth],
  );
  const offsets = useMemo(() => {
    let top = 0;
    return pages.map((size, index) => {
      const at = top;
      top += size.height * (zooms[index] ?? 1) + GAP;
      return at;
    });
  }, [pages, zooms]);
  const [range, setRange] = useState<[number, number]>([0, 1]);
  const quiet = useRef(0);
  const latest = useRef(1);
  const later = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const update = useCallback(() => {
    const element = viewport.current;
    if (!element || offsets.length === 0) return;
    const top = element.scrollTop;
    const height = element.clientHeight || 800;
    const from = top - height;
    const to = top + 2 * height;
    let first = offsets.length - 1;
    let last = 0;
    let current = 0;
    offsets.forEach((offset, index) => {
      const bottom = offset + (pages[index]?.height ?? 0) * (zooms[index] ?? 1);
      if (bottom >= from && offset <= to) {
        first = Math.min(first, index);
        last = Math.max(last, index);
      }
      if (offset <= top + height * 0.25) current = index;
    });
    setRange((previous) =>
      previous[0] === first && previous[1] === last ? previous : [first, last],
    );
    latest.current = current + 1;
    const wait = quiet.current - Date.now();
    if (wait <= 0) onVisiblePage(current + 1);
    else {
      // A scroll made right after a jump is looked at again once the quiet period is over.
      clearTimeout(later.current);
      later.current = setTimeout(update, wait + 20);
    }
  }, [viewport, offsets, pages, zooms, onVisiblePage]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return undefined;
    let frame = 0;
    const onScroll = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(later.current);
      element.removeEventListener("scroll", onScroll);
    };
  }, [viewport, update]);

  // Going to a page (buttons, panel, search, shortcuts) scrolls to it; the scroll that follows
  // must not make the page counter jump back, so it is ignored for a moment.
  const goToRequest = useCallback(
    (page: number): void => {
      const element = viewport.current;
      if (!element) return;
      quiet.current = Date.now() + 400;
      element.scrollTop = offsets[page - 1] ?? 0;
      latest.current = page;
      update();
    },
    [viewport, offsets, update],
  );
  useLayoutEffect(() => {
    if (!request) return undefined;
    // When the reader opens already scrolling (See in PDF, resume), this component and its scroll
    // area mount together and the area is not attached yet: apply the request right after.
    if (viewport.current) {
      goToRequest(request.page);
      return undefined;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) goToRequest(request.page);
    });
    return () => {
      cancelled = true;
    };
  }, [request]);

  // A new zoom changes every height: stay on the page being read.
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    quiet.current = Date.now() + 400;
    element.scrollTop = offsets[latest.current - 1] ?? 0;
    update();
  }, [zooms]);

  // The passage a card cites is brought into view, not only its page: a page is taller than the
  // area, so the top of the page can show nothing of it.
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || !cited || cited.length === 0 || citedPage === undefined) return;
    const index = citedPage - 1;
    quiet.current = Date.now() + 400;
    element.scrollTop = Math.max(
      offsets[index] ?? 0,
      (offsets[index] ?? 0) +
        citedTop(cited) * (zooms[index] ?? 1) -
        element.clientHeight * CITED_LINE,
    );
    latest.current = citedPage;
    update();
  }, [cited]);

  return (
    <div className="reader-scroll">
      {pages.map((size, index) => (
        <ScrollPage
          key={index}
          workspaceId={workspaceId}
          materialId={materialId}
          number={index + 1}
          size={size}
          zoom={zooms[index] ?? 1}
          scale={Math.round((zooms[index] ?? 1) * ratio * 20) / 20}
          near={index >= range[0] && index <= range[1]}
          hits={hitsByPage.get(index + 1) ?? []}
          cited={citedPage === index + 1 ? cited : null}
        />
      ))}
    </div>
  );
}

/** Reads the original PDF of a material inside the app: pages, zoom, search and copy. */
export function ReaderPage({
  workspaceId,
  materialId,
  initialPage,
  quote,
  standalone = false,
}: {
  workspaceId: number;
  materialId: number;
  initialPage?: number;
  /** A passage to highlight on the first page shown. */
  quote?: string;
  /** True in a separate reader window: no way back to the library and no further windows. */
  standalone?: boolean;
}) {
  const time = useTime();
  useActivity("reading", { materialId });
  const info = useInvoke("reader:info", { workspaceId, materialId });
  const [page, setPage] = useState(initialPage ?? 1);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [viewportWidth, setViewportWidth] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [selection, clearSelection] = usePassageSelection(viewport);
  const [creating, setCreating] = useState<{ page: number; quote: string } | null>(null);
  const [generating, setGenerating] = useState<{ page: number; text: string } | null>(null);
  const [mode, setMode] = useState<"page" | "scroll">(savedMode);
  const [scrollRequest, setScrollRequest] = useState<{ page: number } | null>({
    page: initialPage ?? 1,
  });
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hits | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [hitIndex, setHitIndex] = useState(0);
  const [pageDraft, setPageDraft] = useState<string | null>(null);
  const [cited, setCited] = useState<Lines | null>(null);
  const resumed = useRef(initialPage !== undefined);

  const report = (result: { ok: boolean; error?: { message: string } }): void => {
    setError(result.ok ? null : (result.error?.message ?? T.openFailed));
  };
  const openWindow = (): void => {
    void window.mind
      .invoke("reader:openWindow", { workspaceId, materialId, page: current })
      .then(report);
  };
  const openOriginal = (): void => {
    void window.mind.invoke("material:openOriginal", { workspaceId, materialId }).then(report);
  };

  const total = info.state.status === "ready" ? info.state.data.pageCount : 0;
  const current = total > 0 ? Math.min(Math.max(page, 1), total) : page;
  const size = info.state.status === "ready" ? info.state.data.pages[current - 1] : undefined;
  const lastPage = info.state.status === "ready" ? info.state.data.lastPage : null;

  // Without a page in the route the reader resumes where the person stopped last time (FR-23).
  useEffect(() => {
    if (resumed.current || info.state.status !== "ready") return;
    resumed.current = true;
    if (lastPage !== null) {
      setPage(lastPage);
      setScrollRequest({ page: lastPage });
    }
  }, [info.state.status, lastPage]);

  useEffect(() => {
    if (total === 0) return undefined;
    const timer = setTimeout(() => {
      void window.mind.invoke("reader:savePosition", { workspaceId, materialId, page: current });
    }, 800);
    return () => clearTimeout(timer);
  }, [workspaceId, materialId, current, total]);

  // The passage a card or answer cites is highlighted on the page it points to (FR-22).
  useEffect(() => {
    setCited(null);
    if (!quote || initialPage === undefined || total === 0) return undefined;
    let cancelled = false;
    void window.mind
      .invoke("reader:locate", { workspaceId, materialId, page: initialPage, quote })
      .then((result) => {
        if (!cancelled && result.ok) {
          setCited(result.data.rects.map((rect) => ({ ...rect, text: "" })));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, materialId, quote, initialPage, total]);

  // Page by page: the same, scrolling inside the page to the cited passage.
  useEffect(() => {
    const area = viewport.current;
    if (mode !== "page" || !area || !cited || cited.length === 0 || !size) return;
    const target = area.querySelector<HTMLElement>(".reader-page");
    if (!target) return;
    const top =
      target.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop;
    const zoomNow = target.getBoundingClientRect().height / size.height;
    area.scrollTop = Math.max(0, top + citedTop(cited) * zoomNow - area.clientHeight * CITED_LINE);
  }, [cited, mode]);

  useEffect(() => {
    const element = viewport.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setViewportWidth(element.clientWidth));
    observer.observe(element);
    setViewportWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [info.state.status]);

  const fitZoom = size
    ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, ((viewportWidth || 800) - 32) / size.width))
    : 1;
  const effective = zoom === "fit" ? fitZoom : zoom;
  const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const scale = Math.round(effective * ratio * 20) / 20;

  const data = usePageData(workspaceId, materialId, current, scale, mode === "page" && !!size);

  // The next page is drawn ahead of time so turning the page feels instant.
  useEffect(() => {
    if (mode !== "page" || data.image?.page !== current || current >= total) return;
    void window.mind.invoke("reader:page", {
      workspaceId,
      materialId,
      page: current + 1,
      scale,
    });
  }, [mode, data.image?.page, current, total, workspaceId, materialId, scale]);

  // Ctrl + mouse wheel zooms the page smoothly, like in a browser (the wheel alone scrolls).
  const effectiveRef = useRef(1);
  effectiveRef.current = effective;
  useEffect(() => {
    const element = viewport.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const next = effectiveRef.current * Math.exp(-event.deltaY * 0.002);
      setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 20) / 20)));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [info.state.status]);

  const goTo = (next: number): void => {
    if (total === 0) return;
    const clamped = Math.min(Math.max(next, 1), total);
    setPage(clamped);
    setScrollRequest({ page: clamped });
  };
  const changeMode = (next: "page" | "scroll"): void => {
    setMode(next);
    saveMode(next);
    setScrollRequest({ page: current });
  };
  const visiblePage = useCallback((next: number): void => setPage(next), []);
  const zoomBy = (delta: number): void => {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((effective + delta) * 4) / 4)));
  };

  useHotkeys({
    arrowright: () => goTo(current + 1),
    arrowleft: () => goTo(current - 1),
    // In the continuous mode these keys scroll the page the usual way.
    ...(mode === "page"
      ? { pagedown: () => goTo(current + 1), pageup: () => goTo(current - 1) }
      : {}),
    "mod+f": () => searchInput.current?.focus(),
    "mod+=": () => zoomBy(ZOOM_STEP),
    "mod++": () => zoomBy(ZOOM_STEP),
    "mod+-": () => zoomBy(-ZOOM_STEP),
    "mod+0": () => setZoom("fit"),
  });

  const search = (event: FormEvent): void => {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    void window.mind
      .invoke("reader:search", { workspaceId, materialId, query: text })
      .then((result) => {
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setHits(result.data.hits);
        setTruncated(result.data.truncated);
        setHitIndex(0);
        const first = result.data.hits[0];
        if (first) goTo(first.page);
      });
  };
  const moveHit = (step: number): void => {
    if (!hits || hits.length === 0) return;
    const next = (hitIndex + step + hits.length) % hits.length;
    setHitIndex(next);
    const hit = hits[next];
    if (hit) goTo(hit.page);
  };

  const back = standalone ? null : (
    <BackLink workspaceId={workspaceId} fallback="library" fallbackLabel={T.backToLibrary} />
  );
  if (info.state.status === "loading") {
    return (
      <section aria-labelledby="reader-title">
        {back}
        <h1 id="reader-title">{T.readAction}</h1>
        <p role="status">{T.readerOpening}</p>
      </section>
    );
  }
  if (info.state.status === "error") {
    return (
      <section aria-labelledby="reader-title">
        {back}
        <h1 id="reader-title">{T.readAction}</h1>
        <div className="alert" role="alert">
          {info.state.error.message}{" "}
          <button type="button" className="btn ghost" onClick={info.reload}>
            {T.retry}
          </button>{" "}
          <button type="button" className="btn ghost" onClick={openOriginal}>
            {T.openInSystem}
          </button>
        </div>
      </section>
    );
  }

  const doc = info.state.data;
  const hitsByPage = new Map<number, PageHit[]>();
  (hits ?? []).forEach((hit, index) => {
    const list = hitsByPage.get(hit.page) ?? [];
    list.push({ rects: hit.rects, current: index === hitIndex });
    hitsByPage.set(hit.page, list);
  });
  const reading = time?.state?.source === "reading" && time.state.status === "running";

  return (
    <section
      className={`reader${standalone ? " standalone" : ""}${creating || generating ? " with-panel" : ""}`}
      aria-labelledby="reader-title"
    >
      {/* In a separate window the title, the controls and the actions share one row, so the
          page gets the height. */}
      <div className="reader-head">
        <div
          className="row reader-actions"
          style={{ alignItems: "center", justifyContent: "space-between" }}
        >
          {back ?? <span />}
          <span className="row">
            {!standalone && (
              <button type="button" className="btn ghost" onClick={openWindow}>
                <SquareArrowOutUpRight size={14} aria-hidden="true" /> {T.openNewWindow}
              </button>
            )}
            <button
              type="button"
              className="btn ghost"
              aria-label={T.openInSystem}
              title={T.openInSystem}
              onClick={openOriginal}
            >
              <ExternalLink size={14} aria-hidden="true" />
              <span className="reader-action-text"> {T.openInSystem}</span>
            </button>
          </span>
        </div>
        <h1 id="reader-title" title={doc.title}>
          {doc.title}
        </h1>
        <div className="reader-tools" role="toolbar" aria-label="Controles do leitor">
          <div className="group">
            <button
              type="button"
              className="btn ghost"
              aria-label={T.readerPrev}
              onClick={() => goTo(current - 1)}
              disabled={current <= 1}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <form
              className="group"
              onSubmit={(event) => {
                event.preventDefault();
                goTo(Number(pageDraft ?? current));
                setPageDraft(null);
              }}
            >
              <input
                aria-label={T.readerGoTo}
                className="reader-page-input"
                inputMode="numeric"
                value={pageDraft ?? String(current)}
                onChange={(event) => setPageDraft(event.target.value)}
                onBlur={() => setPageDraft(null)}
              />
              <span className="muted">{T.readerOfTotal(total)}</span>
            </form>
            <button
              type="button"
              className="btn ghost"
              aria-label={T.readerNext}
              onClick={() => goTo(current + 1)}
              disabled={current >= total}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="group">
            <button
              type="button"
              className="btn ghost"
              aria-label={T.readerZoomOut}
              onClick={() => zoomBy(-ZOOM_STEP)}
            >
              <ZoomOut size={16} aria-hidden="true" />
            </button>
            <span className="muted zoom-label" aria-live="polite">
              {Math.round(effective * 100)}%
            </span>
            <button
              type="button"
              className="btn ghost"
              aria-label={T.readerZoomIn}
              onClick={() => zoomBy(ZOOM_STEP)}
            >
              <ZoomIn size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn ghost"
              aria-label={T.readerFitWidth}
              onClick={() => setZoom("fit")}
            >
              <Maximize2 size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn ghost"
              aria-label={T.readerScrollMode}
              aria-pressed={mode === "scroll"}
              title={T.readerScrollMode}
              onClick={() => changeMode(mode === "scroll" ? "page" : "scroll")}
            >
              <Rows3 size={16} aria-hidden="true" />
            </button>
          </div>
          <form className="group" role="search" onSubmit={search}>
            <input
              ref={searchInput}
              className="search-input"
              aria-label={T.readerSearch}
              placeholder={T.readerSearch}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" className="btn ghost" aria-label={T.readerSearchGo}>
              <Search size={16} aria-hidden="true" />
            </button>
          </form>
          {hits !== null && (
            <span className="group" role="status">
              {hits.length === 0 ? (
                T.readerNoHits
              ) : (
                <>
                  {T.readerHitOf(hitIndex + 1, hits.length)}
                  {truncated ? ` · ${T.readerHitsLimit}` : ""}
                  <button
                    type="button"
                    className="btn ghost"
                    aria-label={T.readerPrev}
                    onClick={() => moveHit(-1)}
                  >
                    <ChevronLeft size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    aria-label={T.readerNext}
                    onClick={() => moveHit(1)}
                  >
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </>
              )}
            </span>
          )}
        </div>
      </div>
      {(error ?? data.error) && (
        <div className="alert" role="alert">
          {error ?? data.error}
        </div>
      )}
      <div className="reader-body">
        <nav className="reader-pages" aria-label={T.readerPagesPanel}>
          {Array.from({ length: total }, (_, index) => index + 1).map((number) => (
            <button
              key={number}
              type="button"
              className="reader-page-link"
              aria-current={number === current ? "page" : undefined}
              onClick={() => goTo(number)}
            >
              {number}
            </button>
          ))}
        </nav>
        <div className="reader-viewport" ref={viewport}>
          {mode === "page" ? (
            <PageSurface
              number={current}
              size={size ?? { width: 595, height: 842 }}
              zoom={effective}
              data={data}
              hits={hitsByPage.get(current) ?? []}
              cited={current === initialPage ? cited : null}
            />
          ) : (
            <ScrollPages
              workspaceId={workspaceId}
              materialId={materialId}
              pages={doc.pages}
              zoom={zoom}
              fitWidth={(viewportWidth || 800) - 32}
              ratio={ratio}
              viewport={viewport}
              request={scrollRequest}
              hitsByPage={hitsByPage}
              cited={cited}
              citedPage={initialPage}
              onVisiblePage={visiblePage}
            />
          )}
        </div>
      </div>
      {selection && !creating && !generating && (
        <SelectionBar
          selection={selection}
          onGenerate={() => {
            setGenerating({ page: selection.page, text: selection.text });
            clearSelection();
          }}
          onCreate={() => {
            // The passage is kept in the panel; the selection itself is no longer needed.
            setCreating({ page: selection.page, quote: selection.text.slice(0, MAX_QUOTE) });
            clearSelection();
          }}
          onDismiss={clearSelection}
        />
      )}
      {generating && (
        <GenerateFromSelection
          key={`${generating.page}:${generating.text}`}
          workspaceId={workspaceId}
          materialId={materialId}
          page={generating.page}
          text={generating.text}
          onClose={() => setGenerating(null)}
        />
      )}
      {creating && (
        <ItemEditor
          key={`${creating.page}:${creating.quote}`}
          workspaceId={workspaceId}
          origin="reader"
          initialSource={{ materialId, page: String(creating.page), quote: creating.quote }}
          onClose={() => setCreating(null)}
          onSaved={() => undefined}
        />
      )}
      <p className="muted" role="status">
        {T.page} {current} {T.readerOfTotal(total)}
        {reading && time ? ` · ${T.readerReading(formatClock(time.activeSeconds))}` : ""}
      </p>
    </section>
  );
}
