/*
 * Filename: components/ItemActions.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { T } from "../strings.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { EditItemDialog } from "./EditItemDialog.js";

type Item = OutputOf<"review:get">["item"];

/**
 * "Edit" and "Discard" for the item being studied, so a mistake found while studying is fixed
 * on the spot. `onEdited` and `onDiscarded` let the screen reload or move on.
 */
export function ItemActions({
  workspaceId,
  itemId,
  onEdited,
  onDiscarded,
}: {
  workspaceId: number;
  itemId: number;
  onEdited: () => void;
  onDiscarded: () => void;
}) {
  const [editing, setEditing] = useState<Item | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edit = (): void => {
    void window.mind.invoke("review:get", { workspaceId, itemId }).then((result) => {
      if (result.ok) setEditing(result.data.item);
      else setError(result.error.message);
    });
  };
  const discard = (): void => {
    void window.mind.invoke("review:discardApproved", { workspaceId, itemId }).then((result) => {
      if (result.ok) onDiscarded();
      else setError(result.error.message);
    });
  };

  return (
    <>
      <button type="button" className="btn ghost" onClick={edit}>
        {T.edit}
      </button>
      <button type="button" className="btn ghost" onClick={() => setConfirming(true)}>
        {T.discard}
      </button>
      {error && (
        <span className="alert" role="alert">
          {error}
        </span>
      )}
      {editing && (
        <EditItemDialog
          item={editing}
          workspaceId={workspaceId}
          onClose={() => setEditing(null)}
          onSaved={onEdited}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={T.discardItemTitle}
          body={T.discardItemBody}
          confirmLabel={T.discard}
          onConfirm={discard}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
