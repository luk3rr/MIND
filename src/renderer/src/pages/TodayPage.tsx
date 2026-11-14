/*
 * Filename: pages/TodayPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useInvoke } from "../hooks.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";

/** Today: real library counts from the database; study indicators arrive with the FSRS unit. */
export function TodayPage({ workspaceId }: { workspaceId: number }) {
  const { navigate } = useRouter();
  const { state, reload } = useInvoke("today:summary", { workspaceId });

  return (
    <section aria-labelledby="today-title">
      <h1 id="today-title">{T.today}</h1>
      {state.status === "loading" && (
        <div className="row" role="status" aria-label={T.loading}>
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      )}
      {state.status === "error" && (
        <div className="alert" role="alert">
          <p>
            {T.loadError} {state.error.message}
          </p>
          <button type="button" className="btn ghost" onClick={reload}>
            {T.retry}
          </button>
        </div>
      )}
      {state.status === "ready" && state.data.materials === 0 && (
        <div className="card">
          <h2>{T.todayEmptyTitle}</h2>
          <p className="muted">{T.todayEmptyBody}</p>
          <button
            type="button"
            className="btn"
            onClick={() => navigate(sectionPath(workspaceId, "library"))}
          >
            {T.todayEmptyAction}
          </button>
        </div>
      )}
      {state.status === "ready" && state.data.materials > 0 && (
        <div className="row">
          <div className="card stat">
            <b>{state.data.materials}</b>
            <span className="muted">{T.todayMaterials}</span>
          </div>
          <div className="card stat">
            <b>{state.data.cards}</b>
            <span className="muted">{T.todayCards}</span>
          </div>
          <div className="card stat">
            <b>{state.data.questions}</b>
            <span className="muted">{T.todayQuestions}</span>
          </div>
        </div>
      )}
    </section>
  );
}
