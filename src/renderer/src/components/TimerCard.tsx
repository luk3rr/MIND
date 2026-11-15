/*
 * Filename: components/TimerCard.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { Pause, Play, Square } from "lucide-react";
import { useState } from "react";
import { useInvoke } from "../hooks.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { formatClock, useTime } from "../time.js";

/** Study time of today with the manual timer controls (shown on the Today screen). */
export function TimerCard({ workspaceId }: { workspaceId: number }) {
  const time = useTime();
  const { navigate } = useRouter();
  const topics = useInvoke("topics:list", { workspaceId });
  const [topicId, setTopicId] = useState<number | undefined>(undefined);
  if (!time?.state) return null;
  const { state } = time;
  const parts = (
    [
      ["cards", T.timeSourceCards],
      ["practice", T.timeSourcePractice],
      ["reading", T.timeSourceReading],
      ["manual", T.timeSourceManual],
    ] as const
  )
    .filter(([key]) => state.bySource[key] > 0)
    .map(([key, label]) => `${label} ${Math.max(1, Math.round(state.bySource[key] / 60))} min`)
    .join(" · ");

  return (
    <section className="card stack" aria-labelledby="time-title">
      <strong id="time-title">{T.timeTitle}</strong>
      <div className="row" style={{ alignItems: "baseline", gap: 16 }}>
        <b
          style={{ fontSize: 28 }}
          aria-label={`${T.timeToday}: ${formatClock(time.todaySeconds)}`}
        >
          {formatClock(time.todaySeconds)}
        </b>
        <span className="muted">{T.timeToday}</span>
      </div>
      {state.goalMinutes > 0 ? (
        <div>
          <progress
            className="goal-bar"
            style={{ width: "100%" }}
            max={state.goalMinutes * 60}
            value={Math.min(time.todaySeconds, state.goalMinutes * 60)}
            aria-label={T.timeGoalOf(state.goalMinutes)}
          />
          <p className="muted">
            {T.timeGoalOf(state.goalMinutes)} ·{" "}
            {time.todaySeconds >= state.goalMinutes * 60
              ? T.timeGoalReached
              : `${Math.floor((time.todaySeconds / (state.goalMinutes * 60)) * 100)}%`}
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="link"
          onClick={() => navigate(sectionPath(workspaceId, "settings"))}
        >
          {T.timeGoalSet}
        </button>
      )}
      <p className="muted">{time.todaySeconds === 0 ? T.timeNone : T.timeBreakdown(parts)}</p>
      <div className="row" style={{ alignItems: "center" }}>
        {state.status === "idle" && (
          <>
            <label className="muted">
              {T.timeTopic}{" "}
              <select
                value={topicId ?? ""}
                onChange={(event) =>
                  setTopicId(event.target.value === "" ? undefined : Number(event.target.value))
                }
              >
                <option value="">{T.timeNoTopic}</option>
                {topics.state.status === "ready" &&
                  topics.state.data.topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
              </select>
            </label>
            <button type="button" className="btn" onClick={() => time.start(topicId)}>
              <Play size={14} aria-hidden="true" /> {T.timeStart}
            </button>
          </>
        )}
        {state.status === "running" && (
          <button type="button" className="btn ghost" onClick={time.pause}>
            <Pause size={14} aria-hidden="true" /> {T.timePause}
          </button>
        )}
        {state.status === "paused" && (
          <button type="button" className="btn" onClick={time.resume}>
            <Play size={14} aria-hidden="true" /> {T.timeResume}
          </button>
        )}
        {state.status !== "idle" && (
          <>
            <button type="button" className="btn ghost" onClick={time.stop}>
              <Square size={14} aria-hidden="true" /> {T.timeStop}
            </button>
            <span role="status">
              {formatClock(time.activeSeconds)} ·{" "}
              {state.status === "running" ? T.timeRunning : T.timePaused}
            </span>
          </>
        )}
      </div>
    </section>
  );
}
