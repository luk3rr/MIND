/*
 * Filename: components/StudySettingsForm.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { useInvoke } from "../hooks.js";
import { T } from "../strings.js";
import { HelpTip } from "./HelpTip.js";

type Settings = OutputOf<"study:today">["settings"];

/** Card study settings of the open workspace: the daily routine and the FSRS algorithm. */
export function StudySettingsForm({ workspaceId }: { workspaceId: number }) {
  const { state } = useInvoke("study:today", { workspaceId });
  if (state.status !== "ready") return null;
  return (
    <Fields
      workspaceId={workspaceId}
      initial={state.data.settings}
      defaults={state.data.defaults}
    />
  );
}

/** The values as the form shows them (text), with the retention in the Brazilian format. */
function toForm(settings: Settings) {
  return {
    newPerDay: String(settings.newPerDay),
    goal: String(settings.dailyGoal),
    retention: String(settings.desiredRetention).replace(".", ","),
    maximumInterval: String(settings.maximumInterval),
    learningSteps: settings.learningSteps,
    relearningSteps: settings.relearningSteps,
    fuzz: settings.enableFuzz,
  };
}

/** The fields start from the loaded values, so nothing overwrites what the person is typing. */
function Fields({
  workspaceId,
  initial,
  defaults,
}: {
  workspaceId: number;
  initial: Settings;
  defaults: Settings;
}) {
  const [values, setValues] = useState(() => toForm(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<ReturnType<typeof toForm>>): void => {
    setSaved(false);
    setValues((current) => ({ ...current, ...patch }));
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setSaved(false);
    void window.mind
      .invoke("study:saveSettings", {
        workspaceId,
        newPerDay: Number(values.newPerDay),
        dailyGoal: Number(values.goal),
        desiredRetention: Number(values.retention.replace(",", ".")),
        maximumInterval: Number(values.maximumInterval),
        learningSteps: values.learningSteps.trim(),
        relearningSteps: values.relearningSteps.trim(),
        enableFuzz: values.fuzz,
      })
      .then((result) => {
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

  /** Puts the algorithm back to its defaults in the form; saving is a separate step. */
  const restoreAlgorithm = (): void => {
    const original = toForm(defaults);
    set({
      retention: original.retention,
      maximumInterval: original.maximumInterval,
      learningSteps: original.learningSteps,
      relearningSteps: original.relearningSteps,
      fuzz: original.fuzz,
    });
  };

  const field = (
    id: string,
    label: ReactNode,
    hint: string,
    value: string,
    onChange: (next: string) => void,
    error: string | undefined,
    inputMode: "numeric" | "decimal" | "text" = "numeric",
  ) => (
    <div className="field">
      {typeof label === "string" ? <label htmlFor={id}>{label}</label> : label}
      <input
        id={id}
        inputMode={inputMode}
        value={value}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={`${id}-hint`} className="muted">
        {hint}
      </p>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
    </div>
  );

  return (
    <section className="card stack" aria-labelledby="study-settings-title">
      <h2 id="study-settings-title">{T.studySettingsTitle}</h2>
      <form onSubmit={submit} noValidate className="stack">
        <div className="settings-grid">
          {field(
            "study-new-per-day",
            T.studyNewPerDayLabel,
            T.studyNewPerDayHint,
            values.newPerDay,
            (newPerDay) => set({ newPerDay }),
            errors["newPerDay"],
          )}
          {field(
            "study-goal",
            T.studyGoalLabel,
            T.studyGoalHint,
            values.goal,
            (goal) => set({ goal }),
            errors["dailyGoal"],
          )}
        </div>

        <div className="settings-group stack">
          <h3>{T.algorithmTitle}</h3>
          <p className="muted">{T.algorithmNote}</p>
          <div className="settings-grid">
            {field(
              "study-retention",
              <div className="field-label-row">
                <label htmlFor="study-retention">{T.studyRetentionLabel}</label>
                <HelpTip title={T.helpRetentionTitle} lines={T.helpRetentionLines} />
              </div>,
              T.studyRetentionHint,
              values.retention,
              (retention) => set({ retention }),
              errors["desiredRetention"],
              "decimal",
            )}
            {field(
              "study-max-interval",
              T.maxIntervalLabel,
              T.maxIntervalHint,
              values.maximumInterval,
              (maximumInterval) => set({ maximumInterval }),
              errors["maximumInterval"],
            )}
            {field(
              "study-learning-steps",
              T.learningStepsLabel,
              T.learningStepsHint,
              values.learningSteps,
              (learningSteps) => set({ learningSteps }),
              errors["learningSteps"],
              "text",
            )}
            {field(
              "study-relearning-steps",
              T.relearningStepsLabel,
              T.relearningStepsHint,
              values.relearningSteps,
              (relearningSteps) => set({ relearningSteps }),
              errors["relearningSteps"],
              "text",
            )}
          </div>
          <label className="row" style={{ alignItems: "center", gap: "var(--space-2)" }}>
            <input
              type="checkbox"
              checked={values.fuzz}
              onChange={(event) => set({ fuzz: event.target.checked })}
            />
            {T.fuzzLabel}
          </label>
          <p className="muted">{T.fuzzHint}</p>
        </div>

        <div className="actions">
          <button type="button" className="btn ghost" onClick={restoreAlgorithm}>
            {T.restoreDefaults}
          </button>
          <button type="submit" className="btn">
            {T.studySettingsSave}
          </button>
        </div>
        {saved && <p role="status">{T.studySettingsSaved}</p>}
      </form>
    </section>
  );
}
