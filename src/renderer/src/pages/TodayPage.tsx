/*
 * Filename: pages/TodayPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { WeakTopics } from "../components/WeakTopics.js";
import { useInvoke } from "../hooks.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";

/** Today: real library counts from the database; study indicators arrive with the FSRS unit. */
export function TodayPage({ workspaceId }: { workspaceId: number }) {
  const { navigate } = useRouter();
  const { state, reload } = useInvoke("today:summary", { workspaceId });
  const study = useInvoke("study:today", { workspaceId });
  const practice = useInvoke("practice:counts", { workspaceId });
  const overview = useInvoke("stats:overview", { workspaceId });

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
      {state.status === "ready" && study.state.status === "ready" && state.data.materials > 0 && (
        <>
          <div className="row" style={{ justifyContent: "flex-end", marginBottom: 16 }}>
            <button
              type="button"
              className="btn"
              onClick={() => navigate(sectionPath(workspaceId, "study"))}
            >
              {T.todayStudyNow} ({study.state.data.counts.toStudy})
            </button>
          </div>
          <div className="row">
            <div className="card stat">
              <b>{study.state.data.counts.review}</b>
              <span className="muted">{T.todayDue}</span>
            </div>
            <div className="card stat" style={{ borderLeftColor: "var(--warn)" }}>
              <b>{study.state.data.counts.learning}</b>
              <span className="muted">{T.todayLearning}</span>
            </div>
            <div className="card stat" style={{ borderLeftColor: "var(--info)" }}>
              <b>{study.state.data.counts.newAvailable}</b>
              <span className="muted">{T.todayNew}</span>
            </div>
            <div className="card stat" style={{ borderLeftColor: "var(--purple)" }}>
              <b>{study.state.data.counts.reviewedToday}</b>
              <span className="muted">{T.todayDoneToday}</span>
            </div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <strong>{T.todayGoal}</strong>
            <progress
              className="goal-bar"
              style={{ width: "100%" }}
              max={study.state.data.settings.dailyGoal}
              value={Math.min(
                study.state.data.counts.reviewedToday,
                study.state.data.settings.dailyGoal,
              )}
              aria-label={T.todayGoal}
            />
            <p className="muted">
              {study.state.data.counts.reviewedToday} / {study.state.data.settings.dailyGoal}
            </p>
          </div>
          {overview.state.status === "ready" && (
            <WeakTopics workspaceId={workspaceId} topics={overview.state.data.weakest} />
          )}
          {practice.state.status === "ready" && practice.state.data.toPractice > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <strong>
                {T.todayQuestions2}: {practice.state.data.toPractice}
              </strong>{" "}
              <button
                type="button"
                className="btn ghost"
                onClick={() => navigate(`${sectionPath(workspaceId, "study")}/practice`)}
              >
                {T.todayPractice}
              </button>
            </div>
          )}
        </>
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
