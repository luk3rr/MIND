/*
 * Filename: components/SubjectDialog.tsx
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useId, useState } from "react";
import type { FormEvent } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { Dialog } from "./Dialog.js";

type Material = OutputOf<"material:list">["materials"][number];

/** Errors that only the settings can fix, so asking again would not help. */
const SETUP_ERRORS = new Set(["PROVIDER_KEY_MISSING", "CONSENT_REQUIRED"]);

/** What the analysis found about the subject, or why it did not, in the words of the dialog. */
function Inferred({ material }: { material: Material }) {
  const { analysis, subject } = material;
  if (analysis.state === "analyzing") {
    return (
      <span className="pill" role="status">
        {T.analysisAnalyzing}
      </span>
    );
  }
  if (analysis.state === "failed") return <span className="pill bad">{T.analysisFailed}</span>;
  if (analysis.state === "paused") return <span className="pill warn">{T.analysisPaused}</span>;
  return <>{subject.inferred ?? <span className="muted">{T.subjectNotFound}</span>}</>;
}

/**
 * Names the subject of a material, or leaves it to the one the analysis found, and offers to run
 * the analysis again when it failed or stopped. The same dialog opens from the library and from
 * the generate screen.
 */
export function SubjectDialog({
  workspaceId,
  material,
  onClose,
  onChanged,
}: {
  workspaceId: number;
  material: Material;
  onClose: () => void;
  /** Something changed on the material (a subject saved, an analysis started). */
  onChanged: () => void;
}) {
  const inputId = useId();
  const { navigate } = useRouter();
  const [value, setValue] = useState(material.subject.informed ?? "");
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const { analysis } = material;
  const canAnalyze = ["failed", "paused", "none"].includes(analysis.state);
  const needsSetup =
    setup || (analysis.state === "failed" && SETUP_ERRORS.has(analysis.errorCode ?? ""));

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    const result = await window.mind.invoke("material:setSubject", {
      workspaceId,
      id: material.id,
      subject: value.trim() || null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.fields?.[0]?.message ?? result.error.message);
      return;
    }
    onChanged();
    onClose();
  };

  const analyze = async (): Promise<void> => {
    setBusy(true);
    const result = await window.mind.invoke("material:analyze", { workspaceId, id: material.id });
    setBusy(false);
    if (!result.ok) {
      setSetup(SETUP_ERRORS.has(result.error.code));
      setError(SETUP_ERRORS.has(result.error.code) ? null : result.error.message);
      return;
    }
    setError(null);
    setSetup(false);
    onChanged();
  };

  return (
    <Dialog title={T.subjectDialogTitle(material.title)} onClose={onClose}>
      <form onSubmit={(event) => void save(event)} className="stack">
        <div className="field">
          <label htmlFor={inputId}>{T.subjectLabel}</label>
          <input
            id={inputId}
            value={value}
            maxLength={200}
            placeholder={T.subjectPlaceholder}
            autoComplete="off"
            onChange={(event) => setValue(event.target.value)}
            aria-describedby={`${inputId}-hint`}
          />
          <span id={`${inputId}-hint`} className="muted">
            {T.subjectHint}
          </span>
        </div>
        <div className="card">
          <span className="muted">{T.subjectInferredLabel}</span>
          <br />
          <Inferred material={material} />
        </div>
        {needsSetup && (
          <div className="banner" role="alert">
            {T.analysisSetupBanner}{" "}
            <button
              type="button"
              className="link"
              onClick={() => {
                onClose();
                navigate(sectionPath(workspaceId, "settings"));
              }}
            >
              {T.analysisSettings}
            </button>
          </div>
        )}
        {analysis.state === "paused" && (
          <div className="banner" role="alert">
            {T.analysisLimitBanner}
          </div>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {T.cancel}
          </button>
          {canAnalyze && (
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => void analyze()}
            >
              {T.analyzeAgain}
            </button>
          )}
          <button type="submit" className="btn" disabled={busy}>
            {T.save}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
