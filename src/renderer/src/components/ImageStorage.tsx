/*
 * Filename: components/ImageStorage.tsx
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { useInvoke } from "../hooks.js";
import { T } from "../strings.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

/** "12 MB", "340 KB" or "0 KB": the size of the pictures, for a person. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** How much room the pictures of the items take, and a way to clear the ones nothing uses. */
export function ImageStorage({ workspaceId }: { workspaceId: number }): ReactNode {
  const { state, reload } = useInvoke("image:stats", { workspaceId });
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (state.status !== "ready") return null;
  const stats = state.data;
  const clear = async (): Promise<void> => {
    const result = await window.mind.invoke("image:sweep", { workspaceId, now: true });
    setMessage(
      result.ok
        ? T.imageStorageCleared(result.data.removed, formatBytes(result.data.freedBytes))
        : result.error.message,
    );
    reload();
  };
  return (
    <section className="card stack" aria-labelledby="image-storage-title">
      <h2 id="image-storage-title">{T.imageStorageTitle}</h2>
      <p>
        <strong>{formatBytes(stats.bytes)}</strong>{" "}
        <span className="muted">{T.imageStorageCount(stats.count)}</span>
      </p>
      {stats.unusedCount > 0 ? (
        <div className="alert info" role="status">
          <p>{T.imageStorageUnused(stats.unusedCount, formatBytes(stats.unusedBytes))}</p>
          <button type="button" className="btn ghost sm" onClick={() => setConfirm(true)}>
            {T.imageStorageClear}
          </button>
        </div>
      ) : (
        <p className="muted">{T.imageStorageNoneUnused}</p>
      )}
      <p className="muted">{T.imageStorageHint}</p>
      {message && (
        <p role="status" className="muted">
          {message}
        </p>
      )}
      {confirm && (
        <ConfirmDialog
          title={T.imageStorageClear}
          body={T.imageStorageConfirm}
          confirmLabel={T.imageStorageClear}
          onConfirm={() => void clear()}
          onClose={() => setConfirm(false)}
        />
      )}
    </section>
  );
}
