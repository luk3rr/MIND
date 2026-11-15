/*
 * Filename: components/TimeStats.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useInvoke } from "../hooks.js";
import { T } from "../strings.js";
import { formatDuration } from "../time.js";
import { ChartBlock, TOOLTIP, shortDay } from "./ChartBlock.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

const SOURCE_LABEL = {
  cards: T.timeSourceCards,
  practice: T.timeSourcePractice,
  reading: T.timeSourceReading,
  manual: T.timeSourceManual,
} as const;

const minutes = (seconds: number): number => Math.round((seconds / 60) * 10) / 10;

/** Time studied by day, topic and material over 7 or 30 days, with the recent intervals. */
export function TimeStats({ workspaceId }: { workspaceId: number }) {
  const [days, setDays] = useState<7 | 30>(7);
  const stats = useInvoke("time:stats", { workspaceId, days });
  const sessions = useInvoke("time:sessions", { workspaceId, limit: 10 });
  const data = stats.state.status === "ready" ? stats.state.data : null;
  const [toDelete, setToDelete] = useState<number | null>(null);

  const reload = (): void => {
    stats.reload();
    sessions.reload();
  };

  return (
    <section className="stack" aria-labelledby="time-stats-title">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 id="time-stats-title">{T.timeStatsTitle}</h2>
        <label className="muted">
          {T.timePeriod}{" "}
          <select value={days} onChange={(event) => setDays(event.target.value === "30" ? 30 : 7)}>
            <option value={7}>{T.timePeriod7}</option>
            <option value={30}>{T.timePeriod30}</option>
          </select>
        </label>
      </div>
      {data && data.totalSeconds === 0 && <p className="muted">{T.timeEmpty}</p>}
      {data && data.totalSeconds > 0 && (
        <>
          <div className="row">
            <div className="card stat">
              <b>{formatDuration(data.totalSeconds)}</b>
              <span className="muted">{T.timeTotal}</span>
            </div>
            <div className="card stat" style={{ borderLeftColor: "var(--info)" }}>
              <b>{formatDuration(data.avgPerDaySeconds)}</b>
              <span className="muted">{T.timeAverage}</span>
            </div>
            <div className="card stat" style={{ borderLeftColor: "var(--warn)" }}>
              <b>
                {data.bestDay
                  ? `${shortDay(data.bestDay.day)} · ${formatDuration(data.bestDay.seconds)}`
                  : "—"}
              </b>
              <span className="muted">{T.timeBestDay}</span>
            </div>
          </div>
          <ChartBlock
            title={T.timeStatsTitle}
            label={`${T.timeStatsTitle}: ${formatDuration(data.totalSeconds)}`}
            columns={[
              "Dia",
              ...Object.values(SOURCE_LABEL).map((label) => `${label} (${T.timeMinutes})`),
            ]}
            rows={data.byDay
              .filter((d) => d.cards + d.practice + d.reading + d.manual > 0)
              .map((d) => [
                d.day,
                minutes(d.cards),
                minutes(d.practice),
                minutes(d.reading),
                minutes(d.manual),
              ])}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.byDay.map((d) => ({
                  day: shortDay(d.day),
                  [SOURCE_LABEL.cards]: minutes(d.cards),
                  [SOURCE_LABEL.practice]: minutes(d.practice),
                  [SOURCE_LABEL.reading]: minutes(d.reading),
                  [SOURCE_LABEL.manual]: minutes(d.manual),
                }))}
              >
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="var(--muted)" />
                <YAxis stroke="var(--muted)" unit={` ${T.timeMinutes}`} />
                <Tooltip {...TOOLTIP} />
                <Bar dataKey={SOURCE_LABEL.cards} stackId="t" fill="var(--accent)" />
                <Bar dataKey={SOURCE_LABEL.practice} stackId="t" fill="var(--info)" />
                <Bar dataKey={SOURCE_LABEL.reading} stackId="t" fill="var(--warn)" />
                <Bar dataKey={SOURCE_LABEL.manual} stackId="t" fill="var(--purple)" />
              </BarChart>
            </ResponsiveContainer>
          </ChartBlock>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div className="card" style={{ flex: 1 }}>
              <h3>{T.timeByTopic}</h3>
              <table aria-label={T.timeByTopic}>
                <tbody>
                  {data.byTopic.map((row) => (
                    <tr key={row.topicId ?? "none"}>
                      <td>{row.name ?? T.timeUntopic}</td>
                      <td>{formatDuration(row.seconds)}</td>
                      <td>{Math.round((row.seconds / data.totalSeconds) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.byMaterial.length > 0 && (
              <div className="card" style={{ flex: 1 }}>
                <h3>{T.timeByMaterial}</h3>
                <table aria-label={T.timeByMaterial}>
                  <tbody>
                    {data.byMaterial.map((row) => (
                      <tr key={row.materialId}>
                        <td>{row.title}</td>
                        <td>{formatDuration(row.seconds)}</td>
                        <td>{Math.round((row.seconds / data.totalSeconds) * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      {sessions.state.status === "ready" && sessions.state.data.sessions.length > 0 && (
        <div className="card">
          <h3>{T.timeRecent}</h3>
          <table aria-label={T.timeRecent}>
            <tbody>
              {sessions.state.data.sessions.map((row) => (
                <tr key={row.id}>
                  <td>{row.day}</td>
                  <td>{SOURCE_LABEL[row.source]}</td>
                  <td>{row.topicName ?? row.materialTitle ?? ""}</td>
                  <td>{formatDuration(row.seconds)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn ghost"
                      aria-label={`${T.timeDeleteSession} ${row.id}`}
                      onClick={() => setToDelete(row.id)}
                    >
                      {T.deleteWorkspace}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {toDelete !== null && (
        <ConfirmDialog
          title={T.timeDeleteSession}
          body={T.timeDeleteBody}
          confirmLabel={T.deleteWorkspace}
          onClose={() => setToDelete(null)}
          onConfirm={() => {
            void window.mind
              .invoke("time:deleteSession", { workspaceId, id: toDelete })
              .then(reload);
          }}
        />
      )}
    </section>
  );
}
