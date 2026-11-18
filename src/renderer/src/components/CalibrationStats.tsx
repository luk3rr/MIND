/*
 * Filename: components/CalibrationStats.tsx
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useInvoke } from "../hooks.js";
import { T } from "../strings.js";

const percent = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

/** How sure the student was against how often they got it right, over the last 30 days. */
export function CalibrationStats({ workspaceId }: { workspaceId: number }) {
  const { state } = useInvoke("stats:calibration", { workspaceId });
  if (state.status !== "ready") return null;
  const { hasData, levels, topics } = state.data;
  return (
    <section className="card stack" aria-labelledby="calibration-title">
      <h2 id="calibration-title">{T.calibrationTitle}</h2>
      <p className="muted">{T.calibrationIntro}</p>
      {!hasData ? (
        <p>{T.calibrationEmpty}</p>
      ) : (
        <>
          <table aria-label={T.calibrationTitle}>
            <thead>
              <tr>
                <th scope="col">{T.calibrationLevel}</th>
                <th scope="col">{T.calibrationAnswers}</th>
                <th scope="col">{T.calibrationAccuracy}</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => (
                <tr key={level.level}>
                  <th scope="row">{T.confidenceLevels[String(level.level)]}</th>
                  <td>{level.answers}</td>
                  <td>
                    {level.rate === null ? (
                      "—"
                    ) : (
                      <>
                        <progress
                          max={1}
                          value={level.rate}
                          aria-label={`${T.calibrationAccuracy}: ${percent(level.rate)}`}
                        />{" "}
                        {percent(level.rate)}
                      </>
                    )}
                  </td>
                  <td>
                    {level.flag === "overconfident" ? (
                      <span className="pill warn">{T.calibrationOverconfident}</span>
                    ) : level.answers === 0 ? null : (
                      <span className="muted">{T.calibrationExpected}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">{T.calibrationFlagHint}</p>
          {topics.length > 0 && (
            <div>
              <h3>{T.calibrationTopics}</h3>
              <ul>
                {topics.map((topic) => (
                  <li key={topic.topicId}>
                    {topic.name}: {topic.confidentWrong}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
