/*
 * Filename: components/CropPanel.tsx
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ImageRef } from "../../../core/images/refs.js";
import { T } from "../strings.js";
import type { PageRect } from "./CropOverlay.js";
import { ItemImage } from "./ItemImageList.js";
import { SidePanel } from "./SidePanel.js";

/** What the person chose to do with the picture cut from a page. */
export type CropAction = "card" | "question" | "attach";

/**
 * The picture cut from a page, with a caption and the three things to do with it: a new card, a
 * new question, or a field of an item that already exists.
 */
export function CropPanel({
  workspaceId,
  materialId,
  page,
  rect,
  onChoose,
  onClose,
}: {
  workspaceId: number;
  materialId: number;
  page: number;
  rect: PageRect;
  onChoose: (action: CropAction, image: ImageRef) => void;
  onClose: () => void;
}): ReactNode {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; ref: ImageRef }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [alt, setAlt] = useState("");

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    void window.mind
      .invoke("reader:cropRegion", { workspaceId, materialId, page, rect })
      .then((result) => {
        if (!current) return;
        setState(
          result.ok
            ? { status: "ready", ref: result.data.ref }
            : { status: "error", message: result.error.message },
        );
      });
    return () => {
      current = false;
    };
  }, [workspaceId, materialId, page, rect.x, rect.y, rect.width, rect.height]);

  const choose = (action: CropAction): void => {
    if (state.status !== "ready") return;
    onChoose(action, { ...state.ref, ...(alt.trim() ? { alt: alt.trim() } : {}) });
  };

  return (
    <SidePanel title={T.cropTitle(page)} onClose={onClose}>
      <div className="stack">
        {state.status === "loading" && <p role="status">{T.imageLoading}</p>}
        {state.status === "error" && (
          <p className="field-error" role="alert">
            {state.message}
          </p>
        )}
        {state.status === "ready" && (
          <>
            <ItemImage workspaceId={workspaceId} image={state.ref} />
            <div className="field">
              <label htmlFor="crop-alt">{T.imageAltPlaceholder}</label>
              <input
                id="crop-alt"
                maxLength={300}
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
              />
            </div>
            <div className="actions">
              <button type="button" className="btn" onClick={() => choose("card")}>
                {T.cropNewCard}
              </button>
              <button type="button" className="btn" onClick={() => choose("question")}>
                {T.cropNewQuestion}
              </button>
              <button type="button" className="btn ghost" onClick={() => choose("attach")}>
                {T.cropAttach}
              </button>
            </div>
            <p className="muted">{T.cropHint}</p>
          </>
        )}
      </div>
    </SidePanel>
  );
}
