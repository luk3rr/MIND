/*
 * Filename: components/ImageField.tsx
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useRef, useState } from "react";
import type { ClipboardEvent, DragEvent, ReactNode } from "react";
import type { ImageRef } from "../../../core/images/refs.js";
import { T } from "../strings.js";
import { ImageEditorDialog } from "./ImageEditorDialog.js";
import { ItemImage } from "./ItemImageList.js";

/** The bytes of a file the window holds (a pasted or dropped picture). */
function readBytes(file: Blob): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function move(list: readonly ImageRef[], from: number, to: number): ImageRef[] {
  const next = [...list];
  const [taken] = next.splice(from, 1);
  next.splice(to, 0, taken as ImageRef);
  return next;
}

type Large = { megabytes: number; retry: () => Promise<void> };

/**
 * Wraps a field of text and lets the person attach pictures to it: the "＋ Imagem" button opens
 * the file chooser, and a picture can be pasted (Ctrl+V) or dropped on the field. The core checks
 * every file; this component only shows what it answered.
 */
export function ImageField({
  workspaceId,
  value,
  onChange,
  warnAnswer = false,
  children,
}: {
  workspaceId: number;
  value: readonly ImageRef[];
  onChange: (images: ImageRef[]) => void;
  /** The field is read before the answer: remind that the picture must not give it away. */
  warnAnswer?: boolean;
  /** The text field the pictures belong to. */
  children: ReactNode;
}): ReactNode {
  const [error, setError] = useState<string | null>(null);
  const [large, setLarge] = useState<Large | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  // The latest list, so two pictures attached one after the other both stay.
  const current = useRef(value);
  current.current = value;

  const attach = async (
    source:
      | { kind: "bytes"; bytes: Uint8Array<ArrayBuffer> }
      | { kind: "dialog" }
      | { kind: "confirm"; token: string },
    confirmLarge = false,
    replaceAt: number | null = null,
  ): Promise<void> => {
    setError(null);
    setLarge(null);
    setBusy(true);
    const result = await window.mind.invoke("image:put", {
      workspaceId,
      source,
      ...(confirmLarge ? { confirmLarge } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const { data } = result;
    if (data.stored && data.ref) {
      const stored = data.ref;
      if (replaceAt === null) onChange([...current.current, stored]);
      else {
        // Replacing keeps the place and the description of the picture that was there.
        onChange(
          current.current.map((image, at) =>
            at === replaceAt ? { ...stored, ...(image.alt ? { alt: image.alt } : {}) } : image,
          ),
        );
      }
      return;
    }
    if (data.warning === "LARGE_FILE" && data.info) {
      const megabytes = Math.round(data.info.bytes / (1024 * 1024));
      const retry =
        source.kind === "bytes"
          ? () => attach(source, true, replaceAt)
          : data.token
            ? () => attach({ kind: "confirm", token: data.token as string }, false, replaceAt)
            : () => Promise.resolve();
      setLarge({ megabytes, retry });
    }
  };

  const attachFile = async (file: File): Promise<void> => {
    if (file.type !== "" && !file.type.startsWith("image/")) {
      setError(T.imageNotAnImage);
      return;
    }
    await attach({ kind: "bytes", bytes: await readBytes(file) });
  };

  const onPaste = (event: ClipboardEvent): void => {
    const files = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;
    // A pasted picture is not text: the field must not also receive a file name.
    event.preventDefault();
    for (const file of files) void attachFile(file);
  };

  const onDrop = (event: DragEvent): void => {
    setOver(false);
    const files = [...event.dataTransfer.files];
    if (files.length === 0) return;
    event.preventDefault();
    for (const file of files) void attachFile(file);
  };

  return (
    <div
      className={over ? "image-field drop-target" : "image-field"}
      onPaste={onPaste}
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes("Files")) {
          event.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {children}
      {value.length > 0 && (
        <ol className="image-edit-list" aria-label={T.imageListLabel}>
          {value.map((image, index) => (
            <li key={`${image.hash}-${index}`} className="image-edit-row">
              <span className="muted">{index + 1}</span>
              <ItemImage workspaceId={workspaceId} image={image} thumb />
              <div className="stack image-edit-controls">
                <input
                  aria-label={T.imageAltLabel(index + 1)}
                  placeholder={T.imageAltPlaceholder}
                  maxLength={300}
                  value={image.alt ?? ""}
                  onChange={(event) =>
                    onChange(
                      value.map((entry, at) => {
                        if (at !== index) return entry;
                        return event.target.value
                          ? { ...entry, alt: event.target.value }
                          : { hash: entry.hash, ...(entry.source ? { source: entry.source } : {}) };
                      }),
                    )
                  }
                />
                <div className="actions">
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={index === 0}
                    aria-label={T.imageMoveUp(index + 1)}
                    onClick={() => onChange(move(value, index, index - 1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={index === value.length - 1}
                    aria-label={T.imageMoveDown(index + 1)}
                    onClick={() => onChange(move(value, index, index + 1))}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn ghost sm"
                    aria-label={T.imageEdit(index + 1)}
                    onClick={() => setEditing(index)}
                  >
                    {T.imageEditShort}
                  </button>
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={busy}
                    onClick={() => void attach({ kind: "dialog" }, false, index)}
                  >
                    {T.imageReplace}
                  </button>
                  <button
                    type="button"
                    className="btn ghost sm"
                    aria-label={T.imageRemove(index + 1)}
                    onClick={() => onChange(value.filter((_, at) => at !== index))}
                  >
                    {T.imageRemoveShort}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {warnAnswer && value.length > 0 && <p className="hint muted">{T.imageAnswerWarning}</p>}
      <div className="actions image-actions">
        <button
          type="button"
          className="btn ghost sm"
          disabled={busy}
          onClick={() => void attach({ kind: "dialog" })}
        >
          {T.imageAdd}
        </button>
        <span className="drop-hint">{over ? T.imageDrop : T.imageAddHint}</span>
      </div>
      {editing !== null && value[editing] && (
        <ImageEditorDialog
          workspaceId={workspaceId}
          image={value[editing]}
          onCancel={() => setEditing(null)}
          onUse={(ref) => {
            onChange(value.map((entry, at) => (at === editing ? ref : entry)));
            setEditing(null);
          }}
        />
      )}
      {large && (
        <div className="alert warn" role="alert">
          <p>{T.imageLargeWarning(large.megabytes)}</p>
          <div className="actions">
            <button type="button" className="btn sm" onClick={() => void large.retry()}>
              {T.imageLargeConfirm}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setLarge(null)}>
              {T.imageLargeCancel}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
