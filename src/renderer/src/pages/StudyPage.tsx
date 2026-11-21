/*
 * Filename: pages/StudyPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useRef, useState } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { useHotkeys, useInvoke } from "../hooks.js";
import { MathText } from "../MathText.js";
import { T } from "../strings.js";
import { useActivity } from "../time.js";
import { SeeInPdf } from "../components/SeeInPdf.js";
import { FilterSelect, parseFilter, usePersistedFilter } from "../components/FilterSelect.js";
import { MixControl, useMix } from "../components/MixControl.js";
import { StudyTabs } from "../components/StudyTabs.js";
import { sectionPath, useRouter } from "../router.js";
import { ItemActions } from "../components/ItemActions.js";
import { ItemImageList } from "../components/ItemImageList.js";

type Next = OutputOf<"study:next">;

/** How many extra new cards "study more" lets in. */
const MORE_NEW = 10;

function Pieces({ pieces }: { pieces: { text: string; hit: boolean }[] }) {
  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {pieces.map((piece, index) =>
        piece.hit ? (
          <mark key={index}>
            <MathText text={piece.text} />
          </mark>
        ) : (
          <MathText key={index} text={piece.text} />
        ),
      )}
    </span>
  );
}

/** Studies the day's queue one card at a time: reveal (Space), rate (1 to 4), undo (Ctrl+Z). */
export function StudyPage({ workspaceId }: { workspaceId: number }) {
  const today = useInvoke("study:today", { workspaceId });
  const [filterValue, setFilterValue] = usePersistedFilter(
    `mind.filter.${workspaceId}.study-cards`,
  );
  const filter = parseFilter(filterValue);
  const mix = useMix(workspaceId, filter !== undefined);
  // The group of the card shown, so the rotation of a mixed queue continues from it.
  const mixKey = useRef<string | null>(null);
  const [next, setNext] = useState<Next | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // New cards allowed today on top of the daily limit, asked for with "study more".
  const [extraNew, setExtraNew] = useState(0);
  // Cards due later today, pulled forward because the person did not want to wait.
  const [early, setEarly] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const { navigate } = useRouter();
  const shownAt = useRef(0);
  useActivity("cards", next?.card ? { itemId: next.card.itemId } : {});

  const load = (keepCard?: number): void => {
    void window.mind
      .invoke("study:next", {
        workspaceId,
        ...(filter ? { filter } : {}),
        ...(extraNew > 0 ? { extraNew } : {}),
        ...(early ? { early } : {}),
        ...(mix.request ? { mix: { by: mix.request.by, afterKey: mixKey.current } } : {}),
        // After an edit the same card stays, with its new text; the queue is not advanced.
        ...(keepCard !== undefined ? { itemId: keepCard } : {}),
      })
      .then((result) => {
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setError(null);
        if (keepCard === undefined) mixKey.current = result.data.mixKey;
        setNext(result.data);
        if (keepCard === undefined) {
          setRevealed(false);
          shownAt.current = performance.now();
        }
      });
  };

  // A new filter or a change of the mix starts the rotation over.
  useEffect(() => {
    mixKey.current = null;
  }, [workspaceId, filterValue, mix.on, mix.by]);
  useEffect(() => load(), [workspaceId, filterValue, extraNew, early, mix.on, mix.by]);

  // While cards wait for their time, the countdown follows the clock and the card comes back
  // by itself when the time arrives.
  const waiting = next?.card === null ? next.waiting : null;
  useEffect(() => {
    if (!waiting) return;
    const due = Date.parse(waiting.due);
    const tick = setInterval(() => setClock(Date.now()), 15_000);
    const arrive = setTimeout(
      () => load(),
      Math.min(Math.max(due - Date.now(), 0) + 500, 2 ** 31 - 1),
    );
    return () => {
      clearInterval(tick);
      clearTimeout(arrive);
    };
  }, [waiting?.due]);

  const rate = (rating: 1 | 2 | 3 | 4): void => {
    if (!next?.card || !revealed) return;
    const durationMs = Math.round(performance.now() - shownAt.current);
    void window.mind
      .invoke("study:rate", { workspaceId, itemId: next.card.itemId, rating, durationMs })
      .then((result) => {
        if (!result.ok) setError(result.error.message);
        else load();
      });
  };

  const undo = (): void => {
    void window.mind.invoke("study:undo", { workspaceId }).then(() => load());
  };

  useHotkeys(
    {
      space: () => setRevealed(true),
      "1": () => rate(1),
      "2": () => rate(2),
      "3": () => rate(3),
      "4": () => rate(4),
      "mod+z": undo,
    },
    next?.card !== null && next !== null,
  );

  const counts = next?.counts;
  return (
    <section aria-labelledby="study-title">
      <h1 id="study-title">{T.study}</h1>
      <StudyTabs workspaceId={workspaceId} active="cards" activeCount={counts?.toStudy} />
      <h2>{T.studySubCards}</h2>
      {today.state.status === "ready" && (
        <FilterSelect
          facets={today.state.data.facets}
          value={filterValue}
          onChange={setFilterValue}
        />
      )}
      <MixControl mix={mix} />
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {next && next.card === null && (
        <div className="card stack">
          {(() => {
            const limit = counts && counts.newWaiting > 0 ? counts : null;
            return (
              <>
                {waiting ? (
                  <>
                    <h2>{T.studyDoneTitle}</h2>
                    <p className="muted">
                      {T.studyWaiting(
                        waiting.count,
                        new Date(waiting.due).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                        Math.ceil((Date.parse(waiting.due) - clock) / 60_000),
                      )}
                    </p>
                    <div className="actions">
                      <button type="button" className="btn" onClick={() => setEarly(true)}>
                        {T.studyEarly(waiting.count)}
                      </button>
                    </div>
                  </>
                ) : limit ? null : (
                  <>
                    <h2>{T.studyDoneTitle}</h2>
                    <p className="muted">{T.studyDoneBody}</p>
                  </>
                )}
                {limit && (
                  <section aria-label={T.studyLimitTitle} className="stack">
                    {waiting ? <h3>{T.studyLimitTitle}</h3> : <h2>{T.studyLimitTitle}</h2>}
                    <p className="muted">
                      {T.studyLimitBody(limit.newStudiedToday, limit.newWaiting)}
                    </p>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setExtraNew((value) => value + MORE_NEW)}
                      >
                        {T.studyMoreNew(Math.min(MORE_NEW, limit.newWaiting))}
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => navigate(sectionPath(workspaceId, "settings"))}
                      >
                        {T.studyChangeLimit}
                      </button>
                    </div>
                  </section>
                )}
              </>
            );
          })()}
        </div>
      )}
      {next?.card && (
        <div className="card study-card" aria-live="polite">
          <p className="muted">
            {counts?.toStudy ?? 0} {T.studyRemaining}
            {counts
              ? ` (${T.studyBreakdown(counts.newAvailable, counts.learning, counts.review)})`
              : ""}
            {next.card.isNew ? ` · ${T.studyNew}` : ""}
            {next.card.topic ? ` · ${next.card.topic}` : ""}
          </p>
          <div className="card-front" aria-label="Frente">
            <Pieces pieces={next.card.front} />
            <ItemImageList workspaceId={workspaceId} images={next.card.images?.front} />
          </div>
          {!revealed && (
            <p>
              <button type="button" className="btn" onClick={() => setRevealed(true)}>
                {T.showAnswer} ({T.showAnswerHint})
              </button>
            </p>
          )}
          {revealed && (
            <>
              <hr />
              <div className="card-back" aria-label="Verso">
                <Pieces pieces={next.card.back} />
                <ItemImageList workspaceId={workspaceId} images={next.card.images?.back} />
              </div>
              <p className="muted">
                {T.source}: {next.card.sourceTitle}
                {next.card.sourcePage !== null ? ` · ${T.page} ${next.card.sourcePage}` : ""}{" "}
                {next.card.pdfSource && (
                  <SeeInPdf workspaceId={workspaceId} {...next.card.pdfSource} />
                )}
              </p>
              <div className="rating-row row">
                {(["1", "2", "3", "4"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`btn rating rating-${key}`}
                    onClick={() => rate(Number(key) as 1 | 2 | 3 | 4)}
                  >
                    <span>
                      {key} · {T.ratingNames[key]}
                    </span>
                    <span className="muted"> {next.card?.previews[key]}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="row study-actions">
            <button type="button" className="btn ghost" onClick={undo}>
              {T.undo}
            </button>
            {revealed && (
              <ItemActions
                workspaceId={workspaceId}
                itemId={next.card.itemId}
                onEdited={() => load(next.card?.itemId)}
                onDiscarded={() => load()}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
