/*
 * Filename: components/ImportPanel.tsx
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useRef, useState } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { T } from "../strings.js";
import { Dialog } from "./Dialog.js";

type Kind = "card" | "question";
type Format = "csv" | "xlsx";
type Status = "all" | "valid" | "error" | "duplicate";
type Row = OutputOf<"import:previewRows">["rows"][number];
type Preview = Extract<OutputOf<"import:preview">, { cancelled: false }>;
type Outcome = OutputOf<"import:commit">;

const TEMPLATES: readonly [Kind, Format][] = [
  ["card", "csv"],
  ["card", "xlsx"],
  ["question", "csv"],
  ["question", "xlsx"],
];

/** Rows asked for at a time (the same size the core sends with the preview). */
const PAGE = 500;

function Steps({ current }: { current: number }) {
  return (
    <p className="muted" aria-label="Etapas">
      {T.importSteps.map((label, index) => (
        <span key={label}>
          {index > 0 && " › "}
          {index === current ? <strong style={{ color: "var(--fg)" }}>{label}</strong> : label}
        </span>
      ))}
    </p>
  );
}

const STATUS_LABEL: Record<Row["status"], string> = {
  valid: T.importStatusValid,
  error: T.importStatusError,
  duplicate: T.importStatusDuplicate,
};

/** Importing items from a spreadsheet: choose the file, see what it holds, confirm. */
export function ImportPanel({
  workspaceId,
  onClose,
  onImported,
  onShowImported,
}: {
  workspaceId: number;
  onClose: () => void;
  /** Called once the items are stored, so the list behind can refresh. */
  onImported: () => void;
  /** Called to see what was just imported (closes the dialog). */
  onShowImported: () => void;
}) {
  const [kind, setKind] = useState<Kind>("card");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<Status>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [include, setInclude] = useState<ReadonlySet<number>>(new Set());
  const [working, setWorking] = useState(false);
  const [expired, setExpired] = useState(false);
  const [outcome, setOutcome] = useState<{ result: Outcome; kind: Kind } | null>(null);
  const token = useRef<string | null>(null);

  // A preview that is left behind (the dialog closes) is thrown away in the core too.
  useEffect(
    () => () => {
      if (token.current !== null) {
        void window.mind.invoke("import:discard", { workspaceId, token: token.current });
      }
    },
    [workspaceId],
  );

  const download = async (templateKind: Kind, format: Format): Promise<void> => {
    setSaved(false);
    setError(null);
    const result = await window.mind.invoke("import:template", {
      workspaceId,
      kind: templateKind,
      format,
    });
    if (!result.ok) setError(result.error.message);
    else setSaved(result.data.saved);
  };

  const choose = async (): Promise<void> => {
    setError(null);
    setSaved(false);
    setReading(true);
    const result = await window.mind.invoke("import:preview", { workspaceId, kind });
    setReading(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    if (result.data.cancelled) return;
    token.current = result.data.token;
    setPreview(result.data);
    setStatus("all");
    setRows(result.data.rows);
    setTotal(result.data.totals.rows);
    setInclude(new Set());
  };

  const load = async (next: Status, offset: number): Promise<void> => {
    if (!preview) return;
    const result = await window.mind.invoke("import:previewRows", {
      workspaceId,
      token: preview.token,
      status: next,
      offset,
      limit: PAGE,
    });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setRows((current) => (offset === 0 ? result.data.rows : [...current, ...result.data.rows]));
    setTotal(result.data.total);
  };

  const filter = (next: Status): void => {
    setStatus(next);
    if (next === "all" && preview) {
      setRows(preview.rows);
      setTotal(preview.totals.rows);
    } else void load(next, 0);
  };

  const confirm = async (): Promise<void> => {
    if (!preview) return;
    setWorking(true);
    setError(null);
    const result = await window.mind.invoke("import:commit", {
      workspaceId,
      token: preview.token,
      includeDuplicates: [...include],
    });
    setWorking(false);
    if (!result.ok) {
      setError(result.error.message);
      setExpired(result.error.code === "IMPORT_EXPIRED");
      return;
    }
    // The preview is used up by the import, so there is nothing left to throw away.
    token.current = null;
    setOutcome({ result: result.data, kind });
    onImported();
  };

  const back = (): void => {
    setExpired(false);
    setError(null);
    if (token.current !== null) {
      void window.mind.invoke("import:discard", { workspaceId, token: token.current });
      token.current = null;
    }
    setPreview(null);
    setRows([]);
    setInclude(new Set());
  };

  const toggle = (line: number): void =>
    setInclude((current) => {
      const next = new Set(current);
      if (!next.delete(line)) next.add(line);
      return next;
    });

  if (outcome) {
    const { result } = outcome;
    return (
      <Dialog key="result" title={T.importDoneTitle} onClose={onClose} wide>
        <div className="stack">
          <Steps current={2} />
          <p role="status" className="card" style={{ margin: 0 }}>
            {T.importDone(result.imported, result.skippedDuplicates, result.skippedErrors)}
            {result.topicsCreated > 0 && ` ${T.importTopicsCreated(result.topicsCreated)}`}
          </p>
          <table aria-label={T.importDoneTitle}>
            <thead>
              <tr>
                <th scope="col">{T.importColKind}</th>
                <th scope="col">{T.importColAdded}</th>
                <th scope="col">{T.importColIgnored}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{outcome.kind === "card" ? T.kindCards : T.kindQuestions}</td>
                <td>{result.imported}</td>
                <td>{result.skippedDuplicates + result.skippedErrors}</td>
              </tr>
            </tbody>
          </table>
          <div className="actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={onShowImported}>
              {T.importShowImported}
            </button>
            <button type="button" className="btn" onClick={onClose}>
              {T.importClose}
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  if (preview) {
    const { totals } = preview;
    const entering = totals.valid + include.size;
    const filters: readonly [Status, string][] = [
      ["all", T.importFilterAll(totals.rows)],
      ["valid", T.importFilterValid(totals.valid)],
      ["error", T.importFilterError(totals.errors)],
      ["duplicate", T.importFilterDuplicate(totals.duplicates)],
    ];
    return (
      <Dialog key="preview" title={T.importTitle} onClose={onClose} wide>
        <div className="stack">
          <Steps current={1} />
          <p style={{ margin: 0 }}>
            <strong>{T.importFileSummary(preview.fileName, totals.rows)}</strong>{" "}
            <span className="pill">{T.importValid(totals.valid)}</span>{" "}
            <span className="pill">{T.importErrors(totals.errors)}</span>{" "}
            <span className="pill">{T.importDuplicates(totals.duplicates)}</span>
          </p>
          <div className="actions" role="group" aria-label={T.importFilterLabel}>
            {filters.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="btn ghost sm"
                aria-pressed={status === value}
                onClick={() => filter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {rows.length === 0 ? (
            <p className="muted">{T.importNoRows}</p>
          ) : (
            <table aria-label={T.importTable}>
              <thead>
                <tr>
                  <th scope="col">{T.importColLine}</th>
                  <th scope="col">{T.importColText}</th>
                  <th scope="col">{T.importColTopic}</th>
                  <th scope="col">{T.importColStatus}</th>
                  <th scope="col">{T.importColInclude}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.line}>
                    <td>{row.line}</td>
                    <td>{row.text || <span className="muted">(vazio)</span>}</td>
                    <td>
                      {row.topic}
                      {row.topicIsNew && <span className="pill">{T.importNewTopic}</span>}
                    </td>
                    <td>
                      <span className="pill">{STATUS_LABEL[row.status]}</span>
                      {row.problem && <div className="muted">{row.problem}</div>}
                    </td>
                    <td>
                      {row.status === "valid" && T.importWillImport}
                      {row.status === "duplicate" && (
                        <label className="row" style={{ gap: "var(--space-2)" }}>
                          <input
                            type="checkbox"
                            style={{ width: "auto" }}
                            aria-label={T.importIncludeLine(row.line)}
                            checked={include.has(row.line)}
                            onChange={() => toggle(row.line)}
                          />
                          {T.importIncludeAnyway}
                        </label>
                      )}
                      {row.status === "error" && "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rows.length < total && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => void load(status, rows.length)}
            >
              {T.importMore}
            </button>
          )}
          {preview.newTopics.length > 0 && (
            <p className="muted">{T.importNewTopics(preview.newTopics.join(", "))}</p>
          )}
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <span className="muted">
              {T.importSummary(entering, totals.errors, totals.duplicates - include.size)}
            </span>
            <span className="actions">
              <button type="button" className="btn ghost" onClick={back} disabled={working}>
                {T.importBack}
              </button>
              {!expired && (
                <button
                  type="button"
                  className="btn"
                  disabled={working || entering === 0}
                  onClick={() => void confirm()}
                >
                  {working ? T.importWorking : T.importConfirm(entering)}
                </button>
              )}
            </span>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog key="file" title={T.importTitle} onClose={onClose} wide>
      <div className="stack">
        <Steps current={0} />
        <p className="muted">{T.importHint}</p>
        <fieldset className="field">
          <legend>{T.importKindLabel}</legend>
          <div className="row">
            {(
              [
                ["card", T.kindCards],
                ["question", T.kindQuestions],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="row" style={{ gap: "var(--space-2)" }}>
                <input
                  type="radio"
                  name="import-kind"
                  value={value}
                  checked={kind === value}
                  style={{ width: "auto" }}
                  onChange={() => setKind(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="card" style={{ textAlign: "center" }}>
          <p className="muted">{T.importDrop}</p>
          <button type="button" className="btn" disabled={reading} onClick={() => void choose()}>
            {T.importChoose}
          </button>
        </div>
        {reading && <p role="status">{T.importReading}</p>}
        <div className="field">
          <span id="import-templates">{T.importTemplates}</span>
          <div className="actions" role="group" aria-labelledby="import-templates">
            {TEMPLATES.map(([templateKind, format]) => (
              <button
                key={`${templateKind}-${format}`}
                type="button"
                className="btn ghost sm"
                onClick={() => void download(templateKind, format)}
              >
                {T.importTemplate(templateKind, format)}
              </button>
            ))}
          </div>
        </div>
        {saved && <p role="status">{T.importTemplateSaved}</p>}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            {T.importClose}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
