/*
 * Filename: pages/MaterialPreviewPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import { useInvoke } from "../hooks.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { useActivity } from "../time.js";

/** A paginated preview of the chunks of one material, highlighting an optional chunk. */
export function MaterialPreviewPage({
  workspaceId,
  materialId,
  chunkId,
}: {
  workspaceId: number;
  materialId: number;
  chunkId?: number;
}) {
  const { navigate } = useRouter();
  useActivity("reading", { materialId });
  const [offset, setOffset] = useState<number | undefined>(undefined);
  const request = {
    workspaceId,
    materialId,
    ...(offset !== undefined ? { offset } : chunkId !== undefined ? { chunkId } : {}),
  };
  const { state, reload } = useInvoke("material:chunks", request);

  return (
    <section aria-labelledby="preview-title">
      <button
        type="button"
        className="link"
        onClick={() => navigate(sectionPath(workspaceId, "library"))}
      >
        {T.backToLibrary}
      </button>
      {state.status === "loading" && <p role="status">{T.loading}</p>}
      {state.status === "error" && (
        <div className="alert" role="alert">
          {T.loadError} {state.error.message}{" "}
          <button type="button" className="btn ghost" onClick={reload}>
            {T.retry}
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <>
          <h1 id="preview-title">{state.data.material.title}</h1>
          <p className="muted">
            {state.data.total > 0
              ? T.chunkOf(
                  state.data.offset + 1,
                  state.data.offset + state.data.chunks.length,
                  state.data.total,
                )
              : T.searchEmpty}
          </p>
          <div className="stack">
            {state.data.chunks.map((chunk) => (
              <article
                key={chunk.id}
                className="card"
                aria-current={chunk.id === chunkId ? "true" : undefined}
                style={chunk.id === chunkId ? { borderColor: "var(--accent)" } : undefined}
              >
                <p className="muted">
                  #{chunk.ordinal + 1}
                  {chunk.page !== null ? ` · ${T.page} ${chunk.page}` : ""}
                  {chunk.section ? ` · ${chunk.section}` : ""}
                </p>
                <p style={{ whiteSpace: "pre-wrap" }}>{chunk.text}</p>
              </article>
            ))}
          </div>
          <div className="row">
            {state.data.previousOffset !== null && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => setOffset(state.data.previousOffset as number)}
              >
                {T.previous}
              </button>
            )}
            {state.data.nextOffset !== null && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => setOffset(state.data.nextOffset as number)}
              >
                {T.next}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
