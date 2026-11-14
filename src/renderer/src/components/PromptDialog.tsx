/*
 * Filename: components/PromptDialog.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useId, useState } from "react";
import type { FormEvent } from "react";
import { T } from "../strings.js";
import { Dialog } from "./Dialog.js";

/** Asks for one line of text; `onSubmit` returns an error message to show, or null on success. */
export function PromptDialog({
  title,
  label,
  initial = "",
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  initial?: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const inputId = useId();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    const message = await onSubmit(value);
    setBusy(false);
    if (message === null) onClose();
    else setError(message);
  };

  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor={inputId}>{label}</label>
        <input
          id={inputId}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? `${inputId}-error` : undefined}
          autoComplete="off"
        />
        {error && (
          <p id={`${inputId}-error`} className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {T.cancel}
          </button>
          <button type="submit" className="btn" disabled={busy}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
