/*
 * Filename: pages/PretestRoundPage.tsx
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { FeedbackList } from "../components/FeedbackList.js";
import { useInvoke } from "../hooks.js";
import { materialPath, pretestHistoryPath, sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";

/**
 * A finished pre-test round with its answer key. It is read from the saved answers by the round
 * id in the route, so it survives leaving the screen (to the PDF, for instance) and can be
 * opened again later from the history.
 */
export function PretestRoundPage({
  workspaceId,
  materialId,
  roundId,
}: {
  workspaceId: number;
  materialId: number;
  roundId: string;
}) {
  const { navigate } = useRouter();
  const summary = useInvoke("pretest:summary", { workspaceId, roundId });
  return (
    <section aria-labelledby="pretest-title">
      <h1 id="pretest-title">{T.pretestAction}</h1>
      {summary.state.status === "loading" && <p className="muted">{T.loading}</p>}
      {summary.state.status === "error" && (
        <p className="alert" role="alert">
          {summary.state.error.message}
        </p>
      )}
      {summary.state.status === "ready" && (
        <>
          <p className="muted">{T.pretestSummaryNote}</p>
          <FeedbackList
            workspaceId={workspaceId}
            entries={summary.state.data.entries}
            title={T.pretestSummaryTitle}
            backLabel={T.pretestBackLibrary}
            allowMakeCard={false}
            onBack={() => navigate(sectionPath(workspaceId, "library"))}
          />
        </>
      )}
      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => navigate(materialPath(workspaceId, materialId))}
        >
          {T.pretestReadMaterial}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => navigate(pretestHistoryPath(workspaceId, materialId))}
        >
          {T.pretestHistoryAction}
        </button>
      </div>
    </section>
  );
}
