/*
 * Filename: components/EditItemDialog.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import type { FormEvent } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { T } from "../strings.js";
import { Dialog } from "./Dialog.js";

type Item = OutputOf<"review:list">["items"][number];

/** Edits the text and topic of a draft or approved item. */
export function EditItemDialog({
  item,
  workspaceId,
  onClose,
  onSaved,
}: {
  item: Item;
  workspaceId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [front, setFront] = useState(item.front);
  const [back, setBack] = useState(item.back);
  const [topic, setTopic] = useState(item.topic ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const result = await window.mind.invoke("review:edit", {
      workspaceId,
      itemId: item.id,
      front,
      back,
      topic: topic.trim() || null,
    });
    if (!result.ok) {
      setErrors(Object.fromEntries((result.error.fields ?? []).map((f) => [f.field, f.message])));
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Dialog title={T.edit} onClose={onClose}>
      <form onSubmit={(event) => void save(event)} className="stack">
        <div className="field">
          <label htmlFor="edit-front">
            {item.kind === "question" ? T.editStatement : T.editFront}
          </label>
          <textarea
            id="edit-front"
            rows={3}
            value={front}
            onChange={(event) => setFront(event.target.value)}
          />
          {errors["front"] && (
            <p className="field-error" role="alert">
              {errors["front"]}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="edit-back">{item.kind === "question" ? T.editComment : T.editBack}</label>
          <textarea
            id="edit-back"
            rows={3}
            value={back}
            onChange={(event) => setBack(event.target.value)}
          />
          {errors["back"] && (
            <p className="field-error" role="alert">
              {errors["back"]}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="edit-topic">{T.editTopic}</label>
          <input id="edit-topic" value={topic} onChange={(event) => setTopic(event.target.value)} />
        </div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {T.cancel}
          </button>
          <button type="submit" className="btn">
            {T.save}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
