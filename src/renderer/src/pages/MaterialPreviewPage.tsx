/*
 * Filename: pages/MaterialPreviewPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import type { InputOf, OutputOf } from "../../../core/contracts/index.js";
import { useInvoke } from "../hooks.js";
import { BackLink } from "../components/BackLink.js";
import { T } from "../strings.js";
import { useActivity } from "../time.js";

type Chunk = OutputOf<"material:chunks">["chunks"][number];
type RoleFilter = NonNullable<InputOf<"material:chunks">["role"]>;
type Role = NonNullable<Chunk["role"]>;
const ROLES = [
  "concept",
  "example",
  "exam_question",
  "motivating_text",
  "commentary",
  "other",
] as const satisfies readonly Role[];

/**
 * How the analysis labelled one chunk: its role and whether it opens a unit. Both can be
 * corrected here, which takes effect at once (the units are numbered again).
 */
function ChunkLabels({
  workspaceId,
  chunk,
  onChanged,
}: {
  workspaceId: number;
  chunk: Chunk;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const change = (patch: { role?: Role; startsUnit?: boolean }): void => {
    void window.mind
      .invoke("material:setChunkLabel", { workspaceId, chunkId: chunk.id, ...patch })
      .then((result) => {
        if (result.ok) {
          setError(null);
          onChanged();
        } else setError(result.error.fields?.[0]?.message ?? result.error.message);
      });
  };
  const number = chunk.ordinal + 1;
  return (
    <>
      <div className="row" style={{ alignItems: "center" }}>
        <select
          aria-label={`${T.chunkRoleLabel} ${number}`}
          value={chunk.role ?? ""}
          onChange={(event) => change({ role: event.target.value as Role })}
        >
          {chunk.role === null && (
            <option value="" disabled>
              {T.chunkNoRole}
            </option>
          )}
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {T.chunkRoles[role]}
            </option>
          ))}
        </select>
        <label className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            aria-label={`${T.chunkStartsUnit} ${number}`}
            checked={chunk.startsUnit === true}
            // The first chunk of a material always opens a unit.
            disabled={chunk.ordinal === 0}
            onChange={(event) => change({ startsUnit: event.target.checked })}
          />
          {T.chunkStartsUnit}
        </label>
        {chunk.unit !== null && <span className="pill">{T.chunkUnit(chunk.unit)}</span>}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

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
  useActivity("reading", { materialId });
  const [offset, setOffset] = useState<number | undefined>(undefined);
  const [role, setRole] = useState<RoleFilter | undefined>(undefined);
  // A filter shows its own list, so it never jumps to a chunk of the whole material.
  const request = {
    workspaceId,
    materialId,
    ...(role !== undefined ? { role } : {}),
    ...(offset !== undefined
      ? { offset }
      : chunkId !== undefined && role === undefined
        ? { chunkId }
        : {}),
  };
  const { state, reload } = useInvoke("material:chunks", request);

  return (
    <section aria-labelledby="preview-title">
      <BackLink workspaceId={workspaceId} fallback="library" fallbackLabel={T.backToLibrary} />
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
              : role !== undefined
                ? T.chunkFilterEmpty
                : T.searchEmpty}
          </p>
          {state.data.material.analysis.state === "done" ? (
            <>
              <p className="muted">{T.chunkLabelsHint}</p>
              <div className="field">
                <label htmlFor="chunk-filter">{T.chunkFilter}</label>
                <select
                  id="chunk-filter"
                  value={role ?? ""}
                  onChange={(event) => {
                    setOffset(0);
                    setRole(
                      event.target.value === "" ? undefined : (event.target.value as RoleFilter),
                    );
                  }}
                >
                  <option value="">{T.chunkFilterAll}</option>
                  {ROLES.map((entry) => (
                    <option key={entry} value={entry}>
                      {T.chunkRoles[entry]}
                    </option>
                  ))}
                  <option value="none">{T.chunkNoRole}</option>
                </select>
              </div>
            </>
          ) : (
            <p className="muted">{T.chunkNotAnalyzed}</p>
          )}
          <div className="stack">
            {state.data.chunks.map((chunk) => (
              <div key={chunk.id} className="stack">
                {role === undefined && chunk.startsUnit === true && chunk.unit !== null && (
                  <h2 className="muted" style={{ fontSize: "var(--font-sm, 13px)", margin: 0 }}>
                    {T.chunkUnit(chunk.unit)}
                  </h2>
                )}
                <article
                  className="card"
                  aria-current={chunk.id === chunkId ? "true" : undefined}
                  style={chunk.id === chunkId ? { borderColor: "var(--accent)" } : undefined}
                >
                  <p className="muted">
                    #{chunk.ordinal + 1}
                    {chunk.page !== null ? ` · ${T.page} ${chunk.page}` : ""}
                    {chunk.section ? ` · ${chunk.section}` : ""}
                  </p>
                  {state.data.material.analysis.state === "done" && (
                    <ChunkLabels workspaceId={workspaceId} chunk={chunk} onChanged={reload} />
                  )}
                  <p style={{ whiteSpace: "pre-wrap" }}>{chunk.text}</p>
                </article>
              </div>
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
