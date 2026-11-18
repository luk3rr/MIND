/*
 * Filename: components/PracticeSettingsForm.tsx
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import type { FormEvent } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { useInvoke } from "../hooks.js";
import { T } from "../strings.js";

type Settings = OutputOf<"practice:settings">["settings"];

const MODES = ["immediate", "block", "next_day"] as const;

/** The study practices of the open workspace: when feedback shows, confidence and mixing. */
export function PracticeSettingsForm({ workspaceId }: { workspaceId: number }) {
  const { state } = useInvoke("practice:settings", { workspaceId });
  if (state.status !== "ready") return null;
  return (
    <Fields
      workspaceId={workspaceId}
      initial={state.data.settings}
      defaults={state.data.defaults}
    />
  );
}

/** The fields start from the loaded values, so nothing overwrites what the person is choosing. */
function Fields({
  workspaceId,
  initial,
  defaults,
}: {
  workspaceId: number;
  initial: Settings;
  defaults: Settings;
}) {
  const [values, setValues] = useState<Settings>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<Settings>): void => {
    setSaved(false);
    setValues((current) => ({ ...current, ...patch }));
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setSaved(false);
    void window.mind.invoke("practice:saveSettings", { workspaceId, ...values }).then((result) => {
      if (result.ok) {
        setErrors({});
        setSaved(true);
        return;
      }
      setErrors(
        Object.fromEntries(
          (result.error.fields ?? []).map((field) => [field.field, field.message]),
        ),
      );
    });
  };

  return (
    <section className="card stack" aria-labelledby="practice-settings-title">
      <h2 id="practice-settings-title">{T.practiceSettingsTitle}</h2>
      <p className="muted">{T.practiceSettingsNote}</p>
      <form onSubmit={submit} noValidate className="stack">
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>
            <strong>{T.practiceFeedbackLabel}</strong>
          </legend>
          {MODES.map((mode) => (
            <label key={mode} className="row" style={{ alignItems: "flex-start" }}>
              <input
                type="radio"
                name="practice-feedback"
                value={mode}
                checked={values.feedback === mode}
                onChange={() => set({ feedback: mode })}
              />
              <span>
                {T.practiceFeedbackModes[mode]?.label}
                <br />
                <span className="muted">{T.practiceFeedbackModes[mode]?.hint}</span>
              </span>
            </label>
          ))}
          {errors["feedback"] && (
            <p role="alert" className="alert">
              {errors["feedback"]}
            </p>
          )}
        </fieldset>

        <label className="row" style={{ alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={values.confidence}
            onChange={(event) => set({ confidence: event.target.checked })}
          />
          <span>
            {T.practiceConfidenceLabel}
            <br />
            <span className="muted">{T.practiceConfidenceHint}</span>
          </span>
        </label>

        <label className="row" style={{ alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={values.interleave}
            onChange={(event) => set({ interleave: event.target.checked })}
          />
          <span>
            {T.practiceInterleaveLabel}
            <br />
            <span className="muted">{T.practiceInterleaveHint}</span>
          </span>
        </label>

        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => set({ ...defaults })}>
            {T.practiceRestoreDefaults}
          </button>
          <button type="submit" className="btn">
            {T.practiceSettingsSave}
          </button>
        </div>
        {saved && <p role="status">{T.practiceSettingsSaved}</p>}
      </form>
    </section>
  );
}
