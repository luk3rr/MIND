/*
 * Filename: pages/StudyPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useRef, useState } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { useHotkeys, useInvoke } from "../hooks.js";
import { MathText } from "../MathText.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";

type Next = OutputOf<"study:next">;
type Today = OutputOf<"study:today">;
type Filter = { topicId?: number; materialId?: number; subtype?: string };

/** `topic:3`, `material:2` or `subtype:qa`, or an empty string for "everything". */
function parseFilter(value: string): Filter | undefined {
  const [kind, id] = value.split(":");
  if (!kind || !id) return undefined;
  if (kind === "topic") return { topicId: Number(id) };
  if (kind === "material") return { materialId: Number(id) };
  return { subtype: id };
}

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

function FilterSelect({
  facets,
  value,
  onChange,
}: {
  facets: Today["facets"];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor="study-filter">{T.studyFilter}</label>
      <select id="study-filter" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{T.studyAll}</option>
        {facets.topics.length > 0 && (
          <optgroup label={T.studyTopic}>
            {facets.topics.map((facet) => (
              <option key={facet.key} value={`topic:${facet.key}`}>
                {facet.label} ({facet.count})
              </option>
            ))}
          </optgroup>
        )}
        {facets.materials.length > 0 && (
          <optgroup label={T.studyMaterial}>
            {facets.materials.map((facet) => (
              <option key={facet.key} value={`material:${facet.key}`}>
                {facet.label} ({facet.count})
              </option>
            ))}
          </optgroup>
        )}
        {facets.subtypes.length > 0 && (
          <optgroup label={T.studyType}>
            {facets.subtypes.map((facet) => (
              <option key={facet.key} value={`subtype:${facet.key}`}>
                {T.cardTypes[String(facet.key)] ?? facet.label} ({facet.count})
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

/** Studies the day's queue one card at a time: reveal (Space), rate (1 to 4), undo (Ctrl+Z). */
export function StudyPage({ workspaceId }: { workspaceId: number }) {
  const { navigate } = useRouter();
  const today = useInvoke("study:today", { workspaceId });
  const [filterValue, setFilterValue] = useState("");
  const filter = parseFilter(filterValue);
  const [next, setNext] = useState<Next | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(0);

  const load = (): void => {
    void window.mind
      .invoke("study:next", { workspaceId, ...(filter ? { filter } : {}) })
      .then((result) => {
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setError(null);
        setNext(result.data);
        setRevealed(false);
        shownAt.current = performance.now();
      });
  };

  useEffect(load, [workspaceId, filterValue]);

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
    void window.mind.invoke("study:undo", { workspaceId }).then(load);
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
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 id="study-title">{T.study}</h1>
        <button
          type="button"
          className="btn ghost"
          onClick={() => navigate(`${sectionPath(workspaceId, "study")}/practice`)}
        >
          {T.practice}
        </button>
      </div>
      {today.state.status === "ready" && (
        <FilterSelect
          facets={today.state.data.facets}
          value={filterValue}
          onChange={setFilterValue}
        />
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {next && next.card === null && (
        <div className="card">
          <h2>{T.studyDoneTitle}</h2>
          <p className="muted">{T.studyDoneBody}</p>
        </div>
      )}
      {next?.card && (
        <div className="card study-card" aria-live="polite">
          <p className="muted">
            {counts?.toStudy ?? 0} {T.studyRemaining}
            {next.card.isNew ? ` · ${T.studyNew}` : ""}
            {next.card.topic ? ` · ${next.card.topic}` : ""}
          </p>
          <div className="card-front" aria-label="Frente">
            <Pieces pieces={next.card.front} />
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
              </div>
              <p className="muted">
                {T.source}: {next.card.sourceTitle}
                {next.card.sourcePage !== null ? ` · ${T.page} ${next.card.sourcePage}` : ""}
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
          <p>
            <button type="button" className="btn ghost" onClick={undo}>
              {T.undo}
            </button>
          </p>
        </div>
      )}
    </section>
  );
}
