/*
 * Filename: components/ProviderForm.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useId, useState } from "react";
import type { FormEvent } from "react";
import type { ErrorInfo, OutputOf } from "../../../core/contracts/index.js";
import { T } from "../strings.js";

type SettingsView = OutputOf<"settings:get">;

function keyStatus(view: SettingsView): string {
  if (view.keySource === "environment") return T.keyEnvironment;
  if (view.keySource === "stored") return T.keyStored;
  return T.keyNone;
}

/** Parses a decimal typed with a comma or a dot; returns NaN for anything else. */
export function parseLimit(text: string): number {
  const cleaned = text.trim().replace(",", ".");
  const [whole = "", fraction, ...rest] = cleaned.split(".");
  const digits = (part: string): boolean =>
    part.length > 0 && [...part].every((c) => c >= "0" && c <= "9");
  const valid = rest.length === 0 && digits(whole) && (fraction === undefined || digits(fraction));
  return valid ? Number(cleaned) : Number.NaN;
}

/** The provider form shared by the first-run setup and the Settings screen. */
export function ProviderForm({
  view,
  submitLabel,
  onSaved,
}: {
  view: SettingsView;
  submitLabel: string;
  onSaved: () => void;
}) {
  const id = useId();
  const [apiKey, setApiKey] = useState("");
  const [generationModel, setGenerationModel] = useState(view.generationModel);
  const [judgeModel, setJudgeModel] = useState(view.judgeModel);
  const [limit, setLimit] = useState(String(view.monthlyLimitUsd));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    const monthlyLimitUsd = parseLimit(limit);
    const result = await window.mind.invoke("settings:save", {
      ...(apiKey.trim() ? { apiKey } : {}),
      generationModel,
      judgeModel,
      ...(Number.isNaN(monthlyLimitUsd) ? {} : { monthlyLimitUsd }),
    });
    setBusy(false);
    if (Number.isNaN(monthlyLimitUsd)) {
      setErrors({ monthlyLimitUsd: "Informe um valor maior que zero." });
      return;
    }
    if (!result.ok) {
      showErrors(result.error);
      return;
    }
    setErrors({});
    setApiKey("");
    onSaved();
  };

  const showErrors = (error: ErrorInfo): void => {
    const byField = Object.fromEntries((error.fields ?? []).map((f) => [f.field, f.message]));
    setErrors(byField);
    if (Object.keys(byField).length === 0) setFormError(error.message);
  };

  const field = (name: string, label: string, control: React.ReactNode) => (
    <div className="field">
      <label htmlFor={`${id}-${name}`}>{label}</label>
      {control}
      {errors[name] && (
        <p className="field-error" role="alert">
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={(event) => void submit(event)} className="stack">
      {formError && (
        <p className="alert" role="alert">
          {formError}
        </p>
      )}
      <p className="muted">{keyStatus(view)}</p>
      {field(
        "apiKey",
        T.apiKey,
        <input
          id={`${id}-apiKey`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />,
      )}
      <p className="muted">
        {T.apiKeyHelp} {view.keyConfigured ? T.keyReplaceHint : ""}
      </p>
      {field(
        "generationModel",
        T.generationModel,
        <input
          id={`${id}-generationModel`}
          list={`${id}-models`}
          value={generationModel}
          onChange={(event) => setGenerationModel(event.target.value)}
        />,
      )}
      {field(
        "judgeModel",
        T.judgeModel,
        <input
          id={`${id}-judgeModel`}
          list={`${id}-models`}
          value={judgeModel}
          onChange={(event) => setJudgeModel(event.target.value)}
        />,
      )}
      <datalist id={`${id}-models`}>
        {view.knownModels.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
      {field(
        "monthlyLimitUsd",
        T.monthlyLimit,
        <input
          id={`${id}-monthlyLimitUsd`}
          inputMode="decimal"
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
        />,
      )}
      <button type="submit" className="btn" disabled={busy}>
        {submitLabel}
      </button>
    </form>
  );
}
