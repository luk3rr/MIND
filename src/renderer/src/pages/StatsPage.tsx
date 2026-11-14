/*
 * Filename: pages/StatsPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import type { FormEvent } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OutputOf } from "../../../core/contracts/index.js";
import { WeakTopics } from "../components/WeakTopics.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { Dialog } from "../components/Dialog.js";
import { PromptDialog } from "../components/PromptDialog.js";
import { useInvoke } from "../hooks.js";
import { T } from "../strings.js";

type Overview = OutputOf<"stats:overview">;
type TopicStat = Overview["topics"][number];

const TOOLTIP = {
  contentStyle: {
    background: "var(--panel-2)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    color: "var(--fg)",
  },
  labelStyle: { color: "var(--fg)" },
  cursor: { fill: "rgba(189, 147, 249, 0.15)", stroke: "var(--line)" },
};

const percent = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

const shortDay = (day: string): string => day.slice(5).replace("-", "/");

/** A chart plus the same numbers as a table, for screen readers and keyboard users. */
function ChartBlock({
  title,
  hint,
  label,
  children,
  columns,
  rows,
}: {
  title: string;
  hint?: string;
  label: string;
  children: React.ReactNode;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {hint && <p className="muted">{hint}</p>}
      <div role="img" aria-label={label} style={{ width: "100%", height: 220 }}>
        {children}
      </div>
      <details>
        <summary>{T.chartTable}</summary>
        <table aria-label={`${title}: ${T.chartTable}`}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[0])}>
                {row.map((cell, index) => (
                  <td key={index}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function GoalDialog({
  workspaceId,
  goal,
  onClose,
  onSaved,
}: {
  workspaceId: number;
  goal: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(goal));
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void window.mind
      .invoke("study:saveSettings", { workspaceId, dailyGoal: Number(value) })
      .then((result) => {
        if (!result.ok) setError(result.error.fields?.[0]?.message ?? result.error.message);
        else {
          onSaved();
          onClose();
        }
      });
  };
  return (
    <Dialog title={T.statsEditGoal} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="goal-input">{T.statsGoalLabel}</label>
          <input
            id="goal-input"
            type="number"
            min={1}
            max={2000}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
        </div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {T.cancel}
          </button>
          <button type="submit" className="btn">
            {T.save}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

type Action =
  | { kind: "rename"; topic: { id: number; name: string } }
  | { kind: "merge"; topic: { id: number; name: string } }
  | { kind: "delete"; topic: { id: number; name: string } }
  | { kind: "goal" }
  | null;

/** Goal, streak, retention, activity and accuracy per topic, with topic management. */
export function StatsPage({ workspaceId }: { workspaceId: number }) {
  const { state, reload } = useInvoke("stats:overview", { workspaceId });
  const [action, setAction] = useState<Action>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const close = (): void => {
    setAction(null);
    setError(null);
  };

  const run = (channel: "topics:merge" | "topics:delete", payload: never): void => {
    void window.mind.invoke(channel, payload).then((result) => {
      if (!result.ok) setError(result.error.message);
      else {
        close();
        reload();
      }
    });
  };

  return (
    <section aria-labelledby="stats-title">
      <h1 id="stats-title">{T.statsTitle}</h1>
      {state.status === "loading" && <div className="skeleton" />}
      {state.status === "error" && (
        <div className="alert" role="alert">
          {T.loadError} {state.error.message}
        </div>
      )}
      {state.status === "ready" && (
        <>
          <div className="row">
            <div className="card stat">
              <b>{state.data.summary.activityToday}</b>
              <span className="muted">{T.statsToday}</span>
            </div>
            <div className="card stat" style={{ borderLeftColor: "var(--info)" }}>
              <b>
                {state.data.summary.reviewedToday} / {state.data.summary.goal}
              </b>
              <span className="muted">{T.statsGoal}</span>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setAction({ kind: "goal" })}
              >
                {T.statsEditGoal}
              </button>
            </div>
            <div className="card stat" style={{ borderLeftColor: "var(--warn)" }}>
              <b>{T.statsDays(state.data.summary.currentStreak)}</b>
              <span className="muted">{T.statsStreak}</span>
            </div>
            <div className="card stat" style={{ borderLeftColor: "var(--purple)" }}>
              <b>{T.statsDays(state.data.summary.longestStreak)}</b>
              <span className="muted">{T.statsLongest}</span>
            </div>
          </div>
          <p className="muted">
            {T.statsTotals(state.data.summary.totalReviews, state.data.summary.totalAttempts)}
          </p>

          <ChartBlock
            title={T.statsRetention}
            hint={`${T.statsRetentionHint} ${percent(state.data.retention.rate)}`}
            label={`${T.statsRetention}: ${percent(state.data.retention.rate)}`}
            columns={["Dia", "Reviews", "Retenção"]}
            rows={state.data.retention.days
              .filter((d) => d.reviews > 0)
              .map((d) => [d.day, d.reviews, percent(d.rate)])}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={state.data.retention.days.map((d) => ({
                  day: shortDay(d.day),
                  rate: d.rate === null ? null : Math.round(d.rate * 100),
                }))}
              >
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="var(--muted)" />
                <YAxis domain={[0, 100]} unit="%" stroke="var(--muted)" />
                <Tooltip {...TOOLTIP} />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="var(--accent)"
                  connectNulls
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartBlock>

          <ChartBlock
            title={T.statsActivity}
            label={T.statsActivity}
            columns={["Dia", "Cards", "Questões"]}
            rows={state.data.activity
              .filter((d) => d.total > 0)
              .map((d) => [d.day, d.reviews, d.attempts])}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={state.data.activity.map((d) => ({
                  day: shortDay(d.day),
                  Cards: d.reviews,
                  Questões: d.attempts,
                }))}
              >
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="var(--muted)" />
                <YAxis allowDecimals={false} stroke="var(--muted)" />
                <Tooltip {...TOOLTIP} />
                <Bar dataKey="Cards" stackId="a" fill="var(--accent)" />
                <Bar dataKey="Questões" stackId="a" fill="var(--info)" />
              </BarChart>
            </ResponsiveContainer>
          </ChartBlock>

          <WeakTopics workspaceId={workspaceId} topics={state.data.weakest} />

          <div className="card">
            <h2>{T.statsTopics}</h2>
            <table aria-label={T.statsTopics}>
              <thead>
                <tr>
                  <th scope="col">{T.studyTopic}</th>
                  <th scope="col">{T.statsEvents}</th>
                  <th scope="col">{T.statsAccuracy}</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {state.data.topics.map((stat: TopicStat) => (
                  <tr key={stat.topicId ?? "none"}>
                    <td>{stat.name ?? T.statsNoTopic}</td>
                    <td>{stat.events}</td>
                    <td>
                      {percent(stat.accuracy)}
                      {stat.smallSample && stat.events > 0 && (
                        <span className="muted"> ({T.statsSmallSample})</span>
                      )}
                    </td>
                    <td>
                      {stat.topicId !== null && stat.name !== null && (
                        <span className="row">
                          <button
                            type="button"
                            className="btn ghost"
                            aria-label={`${T.topicRename} ${stat.name}`}
                            onClick={() =>
                              setAction({
                                kind: "rename",
                                topic: { id: stat.topicId as number, name: stat.name as string },
                              })
                            }
                          >
                            {T.topicRename}
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            aria-label={`${T.topicMerge} ${stat.name}`}
                            onClick={() =>
                              setAction({
                                kind: "merge",
                                topic: { id: stat.topicId as number, name: stat.name as string },
                              })
                            }
                          >
                            {T.topicMerge}
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            aria-label={`${T.topicDelete} ${stat.name}`}
                            onClick={() =>
                              setAction({
                                kind: "delete",
                                topic: { id: stat.topicId as number, name: stat.name as string },
                              })
                            }
                          >
                            {T.topicDelete}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {action?.kind === "goal" && (
            <GoalDialog
              workspaceId={workspaceId}
              goal={state.data.summary.goal}
              onClose={close}
              onSaved={reload}
            />
          )}
          {action?.kind === "rename" && (
            <PromptDialog
              title={T.topicRenameTitle}
              label={T.topicName}
              initial={action.topic.name}
              submitLabel={T.save}
              onClose={close}
              onSubmit={async (name) => {
                const result = await window.mind.invoke("topics:rename", {
                  workspaceId,
                  topicId: action.topic.id,
                  name,
                });
                if (!result.ok) return result.error.fields?.[0]?.message ?? result.error.message;
                reload();
                return null;
              }}
            />
          )}
          {action?.kind === "merge" && (
            <Dialog title={`${T.topicMergeTitle}: ${action.topic.name}`} onClose={close}>
              <div className="field">
                <label htmlFor="merge-target">{T.topicMergeInto}</label>
                <select
                  id="merge-target"
                  value={mergeTarget}
                  onChange={(event) => setMergeTarget(event.target.value)}
                >
                  <option value="">—</option>
                  {state.data.topics
                    .filter((t) => t.topicId !== null && t.topicId !== action.topic.id)
                    .map((t) => (
                      <option key={t.topicId} value={t.topicId as number}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </div>
              {error && (
                <p role="alert" className="alert">
                  {error}
                </p>
              )}
              <div className="actions">
                <button type="button" className="btn ghost" onClick={close}>
                  {T.cancel}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={mergeTarget === ""}
                  onClick={() =>
                    run("topics:merge", {
                      workspaceId,
                      sourceId: action.topic.id,
                      targetId: Number(mergeTarget),
                    } as never)
                  }
                >
                  {T.topicMerge}
                </button>
              </div>
            </Dialog>
          )}
          {action?.kind === "delete" && (
            <ConfirmDialog
              title={`${T.topicDeleteTitle}: ${action.topic.name}`}
              body={T.topicDeleteBody}
              confirmLabel={T.topicDelete}
              onClose={close}
              onConfirm={() =>
                run("topics:delete", { workspaceId, topicId: action.topic.id } as never)
              }
            />
          )}
        </>
      )}
    </section>
  );
}
