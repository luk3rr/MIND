/*
 * Filename: components/SemanticPanel.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { useInvoke } from "../hooks.js";
import { T } from "../strings.js";

const RUNNING = new Set(["queued", "running"]);

/** Turns the optional semantic search on or off and shows the model download and indexing. */
export function SemanticPanel({ workspaceId }: { workspaceId: number }) {
  const { state, reload } = useInvoke("embeddings:status", { workspaceId });
  const [askDownload, setAskDownload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = state.status === "ready" ? state.data : null;
  const working = status?.job !== null && status !== null && RUNNING.has(status.job.state);

  useEffect(() => {
    if (!working) return undefined;
    const timer = setInterval(reload, 1000);
    return () => clearInterval(timer);
  }, [working, reload]);

  const enable = (): void => {
    setError(null);
    void window.mind.invoke("embeddings:enable", { workspaceId }).then((result) => {
      if (!result.ok) setError(result.error.message);
      reload();
    });
  };

  const disable = (): void => {
    void window.mind.invoke("embeddings:disable", { workspaceId }).then(reload);
  };

  if (!status) return null;
  const failed = status.job?.state === "failed";
  const pending = status.indexed < status.total;
  return (
    <section className="card stack" aria-labelledby="semantic-title">
      <h2 id="semantic-title">{T.semanticTitle}</h2>
      <p className="muted">{T.semanticHint}</p>
      <p role="status">
        <span className="pill">{status.enabled ? T.semanticOn : T.semanticOff}</span>{" "}
        <span className="muted">{T.semanticIndexed(status.indexed, status.total)}</span>
      </p>
      {working && status.job && (
        <p role="status">
          {status.job.message || T.semanticWorking}
          <progress
            className="goal-bar"
            style={{ width: "100%" }}
            max={1}
            value={status.job.progress}
            aria-label={T.semanticWorking}
          />
        </p>
      )}
      {(failed || error) && (
        <p className="alert" role="alert">
          {T.semanticFailed} {error ?? status.job?.errorDetail ?? ""}
        </p>
      )}
      {status.enabled && !status.modelReady && !working && (
        <p className="muted">{T.semanticModelMissing}</p>
      )}
      <div className="row">
        {!status.enabled || !status.modelReady ? (
          <button
            type="button"
            className="btn"
            disabled={working}
            onClick={() => (status.modelReady ? enable() : setAskDownload(true))}
          >
            {T.semanticEnable}
          </button>
        ) : (
          <>
            <button type="button" className="btn ghost" onClick={disable}>
              {T.semanticDisable}
            </button>
            {pending && !working && (
              <button type="button" className="btn ghost" onClick={enable}>
                {T.semanticUpdate}
              </button>
            )}
          </>
        )}
      </div>
      {askDownload && (
        <ConfirmDialog
          title={T.semanticTitle}
          body={T.semanticDownload}
          confirmLabel={T.semanticEnable}
          tone="primary"
          onClose={() => setAskDownload(false)}
          onConfirm={enable}
        />
      )}
    </section>
  );
}
