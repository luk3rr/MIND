/*
 * Filename: components/ImageEditorDialog.tsx
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ImageRef } from "../../../core/images/refs.js";
import { adjustToPng } from "../images/canvas.js";
import { cut, isIdentity, NO_ADJUST, turn } from "../images/transform.js";
import type { Adjust } from "../images/transform.js";
import { T } from "../strings.js";
import { Dialog } from "./Dialog.js";

type Edge = "left" | "top" | "right" | "bottom";
const EDGES: readonly Edge[] = ["left", "top", "right", "bottom"];

type Original =
  | { status: "loading" }
  | { status: "ready"; dataUrl: string; mime: string }
  | { status: "missing" };

/**
 * Cuts the edges and turns a picture by 90 degrees. It always starts from the original file, so
 * the original is never lost; the result is stored as a new picture that remembers it.
 */
export function ImageEditorDialog({
  workspaceId,
  image,
  onUse,
  onCancel,
}: {
  workspaceId: number;
  image: ImageRef;
  /** Called with the reference to keep in the field (the original again when nothing changed). */
  onUse: (ref: ImageRef) => void;
  onCancel: () => void;
}): ReactNode {
  const originalHash = image.source ?? image.hash;
  const [original, setOriginal] = useState<Original>({ status: "loading" });
  const [adjust, setAdjust] = useState<Adjust>(NO_ADJUST);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    let current = true;
    void window.mind.invoke("image:get", { workspaceId, hash: originalHash }).then((result) => {
      if (!current) return;
      setOriginal(
        result.ok
          ? { status: "ready", dataUrl: result.data.dataUrl, mime: result.data.mime }
          : { status: "missing" },
      );
    });
    return () => {
      current = false;
    };
  }, [workspaceId, originalHash]);

  // The preview is the result itself, drawn again at each change; only the latest one is shown.
  useEffect(() => {
    if (original.status !== "ready") return;
    run.current += 1;
    const mine = run.current;
    void adjustToPng(original.dataUrl, adjust)
      .then((bytes) => {
        if (mine !== run.current) return;
        setPreview(`data:image/png;base64,${toBase64(bytes)}`);
      })
      .catch(() => {
        if (mine === run.current) setError(T.imageEditorFailed);
      });
  }, [original, adjust]);

  const use = async (): Promise<void> => {
    setError(null);
    const alt = image.alt ? { alt: image.alt } : {};
    if (isIdentity(adjust)) {
      onUse({ hash: originalHash, ...alt });
      return;
    }
    if (original.status !== "ready") return;
    setBusy(true);
    try {
      const bytes = await adjustToPng(original.dataUrl, adjust);
      const result = await window.mind.invoke("image:put", {
        workspaceId,
        source: { kind: "bytes", bytes },
        // The person asked for this picture, so a large result needs no second question.
        confirmLarge: true,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (result.data.ref) onUse({ hash: result.data.ref.hash, source: originalHash, ...alt });
    } catch {
      setError(T.imageEditorFailed);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <Dialog title={T.imageEditorTitle} onClose={onCancel} wide>
      {original.status === "loading" && <p className="muted">{T.imageLoading}</p>}
      {original.status === "missing" && (
        <p className="alert" role="alert">
          {T.imageMissing}
        </p>
      )}
      {original.status === "ready" && (
        <div className="stack">
          <div className="image-editor-stage">
            {preview ? (
              <img className="item-image" src={preview} alt={T.imageEditorPreview} />
            ) : (
              <span className="muted">{T.imageLoading}</span>
            )}
          </div>
          {original.mime === "image/gif" && <p className="muted">{T.imageEditorGif}</p>}
          <div className="actions">
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setAdjust((all) => turn(all, "left"))}
            >
              {T.imageEditorTurnLeft}
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setAdjust((all) => turn(all, "right"))}
            >
              {T.imageEditorTurnRight}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setAdjust(NO_ADJUST)}>
              {T.imageEditorReset}
            </button>
          </div>
          <div className="image-editor-cuts">
            {EDGES.map((edge) => (
              <label key={edge} className="field">
                {T.imageEditorCut[edge]} ({adjust[edge]}%)
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={1}
                  value={adjust[edge]}
                  onChange={(event) =>
                    setAdjust((all) => cut(all, edge, Number(event.target.value)))
                  }
                />
              </label>
            ))}
          </div>
          <p className="muted">{T.imageEditorOriginalKept}</p>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={busy || original.status !== "ready"}
          onClick={() => void use()}
        >
          {T.imageEditorUse}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {T.imageLargeCancel}
        </button>
      </div>
    </Dialog>,
    document.body,
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
