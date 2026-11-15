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
  Search,
  SquareArrowOutUpRight,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { useHotkeys, useInvoke } from "../hooks.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { formatClock, useActivity, useTime } from "../time.js";

type Lines = OutputOf<"reader:text">["lines"];
type Hits = OutputOf<"reader:search">["hits"];

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
  const { navigate } = useRouter();
  const time = useTime();
  useActivity("reading", { materialId });
  const info = useInvoke("reader:info", { workspaceId, materialId });
  const [page, setPage] = useState(initialPage ?? 1);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [viewportWidth, setViewportWidth] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<{ page: number; dataUrl: string } | null>(null);
  const [lines, setLines] = useState<Lines>([]);
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
    if (lastPage !== null) setPage(lastPage);
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
    if (!quote || current !== initialPage || total === 0) return undefined;
    let cancelled = false;
    void window.mind
      .invoke("reader:locate", { workspaceId, materialId, page: current, quote })
      .then((result) => {
        if (!cancelled && result.ok) {
          setCited(result.data.rects.map((rect) => ({ ...rect, text: "" })));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, materialId, current, quote, initialPage, total]);

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

  useEffect(() => {
    if (!size) return undefined;
    let cancelled = false;
    void window.mind
      .invoke("reader:page", { workspaceId, materialId, page: current, scale })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setError(null);
          setImage({ page: current, dataUrl: result.data.dataUrl });
          // The next page is drawn ahead of time so turning the page feels instant.
          if (current < total) {
            void window.mind.invoke("reader:page", {
              workspaceId,
              materialId,
              page: current + 1,
              scale,
            });
          }
        } else setError(result.error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, materialId, current, scale, size, total]);

  useEffect(() => {
    if (!size) return undefined;
    let cancelled = false;
    void window.mind
      .invoke("reader:text", { workspaceId, materialId, page: current })
      .then((result) => {
        if (!cancelled) setLines(result.ok ? result.data.lines : []);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, materialId, current, size]);

  const goTo = (next: number): void => {
    if (total > 0) setPage(Math.min(Math.max(next, 1), total));
  };
  const zoomBy = (delta: number): void => {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((effective + delta) * 4) / 4)));
  };

  useHotkeys({
    arrowright: () => goTo(current + 1),
    pagedown: () => goTo(current + 1),
    arrowleft: () => goTo(current - 1),
    pageup: () => goTo(current - 1),
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
    <button
      type="button"
      className="link"
      onClick={() => navigate(sectionPath(workspaceId, "library"))}
    >
      {T.backToLibrary}
    </button>
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

  const data = info.state.data;
  const pageHits = (hits ?? []).flatMap((hit, index) =>
    hit.page === current ? [{ hit, index }] : [],
  );
  const width = (size?.width ?? 595) * effective;
  const height = (size?.height ?? 842) * effective;
  const reading = time?.state?.source === "reading" && time.state.status === "running";

  return (
    <section className="reader" aria-labelledby="reader-title">
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        {back ?? <span />}
        <span className="row">
          {!standalone && (
            <button type="button" className="btn ghost" onClick={openWindow}>
              <SquareArrowOutUpRight size={14} aria-hidden="true" /> {T.openNewWindow}
            </button>
          )}
          <button type="button" className="btn ghost" onClick={openOriginal}>
            <ExternalLink size={14} aria-hidden="true" /> {T.openInSystem}
          </button>
        </span>
      </div>
      <h1 id="reader-title">{data.title}</h1>
      <div className="reader-tools" role="toolbar" aria-label="Controles do leitor">
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
          className="row"
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
        <button
          type="button"
          className="btn ghost"
          aria-label={T.readerZoomOut}
          onClick={() => zoomBy(-ZOOM_STEP)}
        >
          <ZoomOut size={16} aria-hidden="true" />
        </button>
        <span className="muted" aria-live="polite">
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
        <form className="row" role="search" onSubmit={search}>
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
          <span className="row" role="status">
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
      {error && (
        <div className="alert" role="alert">
          {error}
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
          <div className="reader-page" style={{ width, height }}>
            {image && (
              <img
                src={image.dataUrl}
                alt={T.readerPageImage(image.page)}
                width={width}
                height={height}
                draggable={false}
              />
            )}
            {pageHits.flatMap(({ hit, index }) =>
              hit.rects.map((rect, rectIndex) => (
                <div
                  key={`${index}-${rectIndex}`}
                  className={index === hitIndex ? "reader-hit current" : "reader-hit"}
                  style={{
                    left: rect.x * effective,
                    top: rect.y * effective,
                    width: rect.width * effective,
                    height: rect.height * effective,
                  }}
                />
              )),
            )}
            {cited?.map((rect, index) => (
              <div
                key={`cited-${index}`}
                className="reader-hit cited"
                role="img"
                aria-label={T.readerCited}
                style={{
                  left: rect.x * effective,
                  top: rect.y * effective,
                  width: rect.width * effective,
                  height: rect.height * effective,
                }}
              />
            ))}
            <div className="reader-text" aria-label="Texto da página">
              {lines.map((line, index) => (
                <LineText key={`${current}-${index}`} line={line} zoom={effective} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="muted" role="status">
        {T.page} {current} {T.readerOfTotal(total)}
        {reading && time ? ` · ${T.readerReading(formatClock(time.activeSeconds))}` : ""}
      </p>
    </section>
  );
}
