/*
 * Filename: components/ConfirmDialog.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { T } from "../strings.js";
import { Dialog } from "./Dialog.js";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog title={title} onClose={onClose}>
      <p>{body}</p>
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          {T.cancel}
        </button>
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
