/*
 * Filename: pages/ErrorsPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import { useInvoke } from "../hooks.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { SeeInPdf } from "../components/SeeInPdf.js";

/** Everything the user got wrong, with a button that turns a missed question into a card. */
export function ErrorsPage({ workspaceId }: { workspaceId: number }) {
  const [topicId, setTopicId] = useState<number | undefined>(undefined);
  const { state, reload } = useInvoke("errors:list", {
    workspaceId,
    ...(topicId !== undefined ? { topicId } : {}),
  });
  const retries = useInvoke("practice:counts", { workspaceId });
  const { navigate } = useRouter();
  const retryCount = retries.state.status === "ready" ? retries.state.data.retry : 0;

  return (
    <section aria-labelledby="errors-title">
      <h1 id="errors-title">{T.errorsTitle}</h1>
      {state.status === "error" && (
        <div className="alert" role="alert">
          {T.loadError} {state.error.message}{" "}
          <button type="button" className="btn ghost" onClick={reload}>
            {T.retry}
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <>
          <p className="muted">
            {T.errorsCounts(
              state.data.counts.total,
              state.data.counts.fromQuestions,
              state.data.counts.failedCards,
            )}
          </p>
          <div className="field">
            <select
              id="errors-topic"
              aria-label={T.errorsFilter}
              value={topicId ?? ""}
              onChange={(event) =>
                setTopicId(event.target.value === "" ? undefined : Number(event.target.value))
              }
            >
              <option value="">{T.errorsAllTopics}</option>
              {state.data.topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </div>
          {state.data.entries.length === 0 && (
            <div className="card">
              <p className="muted">{T.errorsEmpty}</p>
            </div>
          )}
          <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
            {state.data.entries.map((entry) => (
              <li key={entry.itemId} className="card">
                <p style={{ whiteSpace: "pre-wrap" }}>
                  <strong>{entry.front}</strong>
                </p>
                <p className="muted">
                  {entry.fromQuestion ? T.errorFromQuestion : T.cards}
                  {entry.topic ? ` · ${entry.topic}` : ""}
                  {entry.failures > 0 ? ` · ${T.errorFailures(entry.failures)}` : ""} · {T.source}:{" "}
                  {entry.sourceTitle}
                  {entry.sourcePage !== null ? `, ${T.page} ${entry.sourcePage}` : ""}{" "}
                  {entry.pdfSource && <SeeInPdf workspaceId={workspaceId} {...entry.pdfSource} />}
                </p>
              </li>
            ))}
          </ul>
          <div className="card stack">
            <p className="muted">{T.errorsActionsHint}</p>
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={retryCount === 0}
                onClick={() => navigate(`${sectionPath(workspaceId, "study")}/practice`)}
              >
                {T.errorsRedoQuestions(retryCount)}
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={state.data.entries.length === 0}
                onClick={() => navigate(sectionPath(workspaceId, "study"))}
              >
                {T.errorsStudyCards}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
