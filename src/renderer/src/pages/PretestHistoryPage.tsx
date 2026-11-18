/*
 * Filename: pages/PretestHistoryPage.tsx
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useInvoke } from "../hooks.js";
import { pretestRoundPath, sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";

/** The pre-test rounds already done for a material, newest first; each opens its answer key. */
export function PretestHistoryPage({
  workspaceId,
  materialId,
}: {
  workspaceId: number;
  materialId: number;
}) {
  const { navigate } = useRouter();
  const materials = useInvoke("material:list", { workspaceId });
  const history = useInvoke("pretest:history", { workspaceId, materialId });
  const title =
    materials.state.status === "ready"
      ? (materials.state.data.materials.find((m) => m.id === materialId)?.title ?? "")
      : "";
  return (
    <section aria-labelledby="pretest-history-title">
      <h1 id="pretest-history-title">{T.pretestHistoryTitle(title)}</h1>
      <p className="muted">{T.pretestHistoryIntro}</p>
      {history.state.status === "loading" && <p className="muted">{T.loading}</p>}
      {history.state.status === "error" && (
        <p className="alert" role="alert">
          {history.state.error.message}
        </p>
      )}
      {history.state.status === "ready" &&
        (history.state.data.rounds.length === 0 ? (
          <p className="muted">{T.pretestHistoryEmpty}</p>
        ) : (
          <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {history.state.data.rounds.map((round) => (
              <li key={round.roundId} className="card row">
                <span>
                  {T.pretestHistoryRound(
                    T.pretestHistoryDate(round.answeredAt),
                    round.correct,
                    round.total,
                  )}
                </span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => navigate(pretestRoundPath(workspaceId, materialId, round.roundId))}
                >
                  {T.pretestHistoryOpen}
                </button>
              </li>
            ))}
          </ul>
        ))}
      <div className="actions">
        <button
          type="button"
          className="btn ghost"
          onClick={() => navigate(sectionPath(workspaceId, "library"))}
        >
          {T.pretestBackLibrary}
        </button>
      </div>
    </section>
  );
}
