/*
 * Filename: pages/ErrorsPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import { useInvoke } from "../hooks.js";
import { T } from "../strings.js";

/** Everything the user got wrong, with a button that turns a missed question into a card. */
export function ErrorsPage({ workspaceId }: { workspaceId: number }) {
  const [topicId, setTopicId] = useState<number | undefined>(undefined);
  const { state, reload } = useInvoke("errors:list", {
    workspaceId,
    ...(topicId !== undefined ? { topicId } : {}),
  });
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section aria-labelledby="errors-title">
      <h1 id="errors-title">{T.errorsTitle}</h1>
      {state.status === "error" && (
        <div className="alert" role="alert">
          {T.loadError} {state.error.message}
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
            <label htmlFor="errors-topic">{T.errorsFilter}</label>
            <select
              id="errors-topic"
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
          {message && (
            <p role="status" className="ok">
              {message}
            </p>
          )}
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
                  {entry.sourcePage !== null ? `, ${T.page} ${entry.sourcePage}` : ""}
                </p>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setMessage(null);
              reload();
            }}
          >
            {T.retry}
          </button>
        </>
      )}
    </section>
  );
}
