/*
 * Filename: components/AttachToItem.tsx
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import type { ReactNode } from "react";
import type { ImageRef } from "../../../core/images/refs.js";
import { useInvoke } from "../hooks.js";
import { T } from "../strings.js";
import { Dialog } from "./Dialog.js";

/** The fields of an item that take pictures, in the order they are read. */
export function fieldsOf(kind: string, options: readonly { key: string }[]): string[] {
  if (kind === "card") return ["front", "back"];
  return ["statement", ...options.map((option) => `option.${option.key}`), "explanation"];
}

function fieldLabel(field: string): string {
  if (field.startsWith("option.")) return T.attachFieldOption(field.slice("option.".length));
  return (
    {
      front: T.editFront,
      back: T.editBack,
      statement: T.editStatement,
      explanation: T.editComment,
    }[field] ?? field
  );
}

/** Puts a picture that already exists at the end of a field of an item that is already saved. */
export function AttachToItem({
  workspaceId,
  image,
  onDone,
  onClose,
}: {
  workspaceId: number;
  image: ImageRef;
  onDone: () => void;
  onClose: () => void;
}): ReactNode {
  const items = useInvoke("items:list", { workspaceId });
  const [itemId, setItemId] = useState<number | null>(null);
  const [field, setField] = useState<string | null>(null);
  const [options, setOptions] = useState<{ key: string }[]>([]);
  const [kind, setKind] = useState<string>("card");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (id: number): Promise<void> => {
    setItemId(id);
    setField(null);
    setError(null);
    const result = await window.mind.invoke("review:get", { workspaceId, itemId: id });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setKind(result.data.item.kind);
    setOptions(result.data.item.options);
    setField(fieldsOf(result.data.item.kind, result.data.item.options)[0] ?? null);
  };

  const attach = async (): Promise<void> => {
    if (itemId === null || field === null) return;
    setBusy(true);
    setError(null);
    const current = await window.mind.invoke("review:get", { workspaceId, itemId });
    if (!current.ok) {
      setBusy(false);
      setError(current.error.message);
      return;
    }
    const { item } = current.data;
    const images = { ...(item.images ?? {}) } as Record<string, ImageRef[]>;
    images[field] = [...(images[field] ?? []), image];
    const saved = await window.mind.invoke("review:edit", {
      workspaceId,
      itemId,
      front: item.front,
      back: item.back,
      topic: item.topic,
      images,
    });
    setBusy(false);
    if (!saved.ok) {
      setError(saved.error.message);
      return;
    }
    onDone();
  };

  const entries = items.state.status === "ready" ? items.state.data.items : [];
  return (
    <Dialog title={T.attachTitle} onClose={onClose}>
      <div className="field">
        <label htmlFor="attach-item">{T.attachItem}</label>
        <select
          id="attach-item"
          value={itemId ?? ""}
          onChange={(event) => void choose(Number(event.target.value))}
        >
          <option value="" disabled>
            {T.attachPick}
          </option>
          {entries
            .filter((entry) => entry.status !== "discarded")
            .map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.front.slice(0, 80) || T.attachNoText}
              </option>
            ))}
        </select>
      </div>
      {field !== null && (
        <div className="field">
          <label htmlFor="attach-field">{T.attachField}</label>
          <select
            id="attach-field"
            value={field}
            onChange={(event) => setField(event.target.value)}
          >
            {fieldsOf(kind, options).map((name) => (
              <option key={name} value={name}>
                {fieldLabel(name)}
              </option>
            ))}
          </select>
        </div>
      )}
      {items.state.status === "ready" && entries.length === 0 && (
        <p className="muted">{T.attachNoItems}</p>
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
          disabled={busy || field === null}
          onClick={() => void attach()}
        >
          {T.attachConfirm}
        </button>
        <button type="button" className="btn ghost" onClick={onClose}>
          {T.imageLargeCancel}
        </button>
      </div>
    </Dialog>
  );
}
