/*
 * Filename: components/GenerateFromSelection.tsx
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useRef, useState } from "react";
import type { InputOf, OutputOf } from "../../../core/contracts/index.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { ItemEditor } from "./ItemEditor.js";
import { SidePanel } from "./SidePanel.js";

type Generated = OutputOf<"selection:generate">["drafts"][number];
type Kind = InputOf<"selection:generate">["kind"];

/** Longest passage the model can use; the same limit the core enforces. */
const MAX_CHARS = 8000;
const MAX_ITEMS = 20;
const SETUP_ERRORS = new Set(["PROVIDER_KEY_MISSING", "CONSENT_REQUIRED", "MONTHLY_LIMIT_REACHED"]);

interface Row {
  id: number;
  generated: Generated;
  state: "pending" | "saved" | "discarded";
  /** True when the saved item points to a chunk (so "Ver no PDF" works). */
  linked: boolean;
  error: string | null;
}

const textOf = (generated: Generated): string =>
  generated.draft.kind === "card" ? generated.draft.front : generated.draft.statement;
const detailOf = (generated: Generated): string =>
  generated.draft.kind === "card" ? generated.draft.back : generated.draft.explanation;
const subtypeLabel = (generated: Generated): string =>
  generated.draft.kind === "card"
    ? (T.cardTypes[generated.draft.subtype] ?? generated.draft.subtype)
    : (T.questionTypes[generated.draft.subtype] ?? generated.draft.subtype);
const key = (text: string): string => text.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Asks the model for items from the passage selected in the reader (how many and about what are
 * optional) and lists them as drafts to save, edit or discard. Nothing is stored until a draft is
 * saved, so closing the panel throws the rest away.
 */
export function GenerateFromSelection({
  workspaceId,
  materialId,
  page,
  text,
  onClose,
}: {
  workspaceId: number;
  materialId: number;
  page: number;
  text: string;
  onClose: () => void;
}) {
  const { navigate } = useRouter();
  const [kind, setKind] = useState<Kind>("card");
  const [quantity, setQuantity] = useState("");
  const [subject, setSubject] = useState("");
  const [subtype, setSubtype] = useState("");
  const [instructions, setInstructions] = useState("");
  const [estimate, setEstimate] = useState<number | null | undefined>(undefined);
  const [waiting, setWaiting] = useState(false);
  const [failure, setFailure] = useState<{ message: string; code: string } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [discarded, setDiscarded] = useState(0);
  const [asked, setAsked] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const next = useRef(1);
  const run = useRef(0);

  const tooLong = text.length > MAX_CHARS;
  const amount = quantity === "" ? undefined : Number(quantity);
  const badQuantity = amount !== undefined && (amount < 1 || amount > MAX_ITEMS);
  const request = {
    workspaceId,
    materialId,
    page,
    text,
    kind,
    ...(amount !== undefined && !badQuantity ? { quantity: amount } : {}),
    ...(subject.trim() ? { subject: subject.trim() } : {}),
    ...(subtype ? { subtype: subtype as InputOf<"selection:generate">["subtype"] } : {}),
    ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
  } satisfies InputOf<"selection:generate">;

  // The estimate follows the type and the quantity; the person sees it before asking.
  useEffect(() => {
    if (tooLong || badQuantity) {
      setEstimate(undefined);
      return;
    }
    let current = true;
    void window.mind.invoke("selection:estimate", request).then((result) => {
      if (current) setEstimate(result.ok ? result.data.estimatedUsd : undefined);
    });
    return () => {
      current = false;
    };
    // The subject only changes the size a little; the request is rebuilt from the same state.
  }, [kind, subtype, quantity, tooLong, badQuantity, text, materialId]);

  const generate = async (): Promise<void> => {
    run.current += 1;
    const mine = run.current;
    setWaiting(true);
    setFailure(null);
    const result = await window.mind.invoke("selection:generate", request);
    if (mine !== run.current) return;
    setWaiting(false);
    setAsked(true);
    if (!result.ok) {
      setFailure({ message: result.error.message, code: result.error.code });
      return;
    }
    setDiscarded(
      (count) =>
        count +
        result.data.discarded.noSource +
        result.data.discarded.invalid +
        result.data.discarded.duplicate,
    );
    setRows((current) => {
      // A second request can repeat a draft that is still on the list: keep only the new ones.
      const known = new Set(current.map((row) => key(textOf(row.generated))));
      const added = result.data.drafts
        .filter((generated) => !known.has(key(textOf(generated))))
        .map<Row>((generated) => ({
          id: next.current++,
          generated,
          state: "pending",
          linked: false,
          error: null,
        }));
      return [...current, ...added];
    });
  };

  const patch = (id: number, change: Partial<Row>): void =>
    setRows((all) => all.map((row) => (row.id === id ? { ...row, ...change } : row)));

  const save = async (row: Row): Promise<void> => {
    const result = await window.mind.invoke("items:create", {
      workspaceId,
      draft: row.generated.draft,
      topic: row.generated.topic,
      origin: "reader",
      source: { materialId, page, quote: row.generated.quote },
    });
    if (!result.ok) {
      patch(row.id, { error: result.error.message });
      return;
    }
    patch(row.id, { state: "saved", linked: result.data.sourceLinked, error: null });
  };

  if (editing) {
    return (
      <ItemEditor
        workspaceId={workspaceId}
        origin="reader"
        initialDraft={editing.generated.draft}
        initialTopic={editing.generated.topic ?? ""}
        initialSource={{ materialId, page: String(page), quote: editing.generated.quote }}
        onClose={() => setEditing(null)}
        onBack={() => setEditing(null)}
        onSaved={(created) =>
          patch(editing.id, { state: "saved", linked: created.sourceLinked, error: null })
        }
      />
    );
  }

  const visible = rows.filter((row) => row.state !== "discarded");
  return (
    <SidePanel title={T.genTitle} onClose={onClose}>
      <div className="stack">
        <div className="card" style={{ background: "var(--bg)" }}>
          <span className="muted">{T.genPassage(page, text.length)}</span>
          <p style={{ margin: "var(--space-1) 0 0" }}>
            “{text.length > 240 ? `${text.slice(0, 240)}…` : text}”
          </p>
        </div>
        {tooLong && (
          <p className="field-error" role="alert">
            {T.genTooLong}
          </p>
        )}
        <fieldset className="field">
          <legend>{T.genKind}</legend>
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
                  name="gen-kind"
                  value={value}
                  checked={kind === value}
                  style={{ width: "auto" }}
                  onChange={() => {
                    setKind(value);
                    // A type of one kind does not exist in the other.
                    setSubtype("");
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="gen-type">{T.genType}</label>
          <select
            id="gen-type"
            value={subtype}
            onChange={(event) => setSubtype(event.target.value)}
          >
            <option value="">{T.genTypeAuto}</option>
            {(kind === "card"
              ? Object.entries(T.cardTypes)
              : Object.entries(T.genQuestionTypes)
            ).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="gen-quantity">{T.genQuantity}</label>
          <input
            id="gen-quantity"
            inputMode="numeric"
            maxLength={2}
            placeholder={T.genQuantityHint}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ""))}
          />
          {badQuantity && (
            <p className="field-error" role="alert">
              {T.genQuantityError}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="gen-subject">{T.genSubject}</label>
          <input
            id="gen-subject"
            maxLength={200}
            placeholder={T.genSubjectHint}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="gen-instructions">{T.genInstructions}</label>
          <textarea
            id="gen-instructions"
            rows={3}
            maxLength={1000}
            placeholder={T.genInstructionsHint}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </div>
        {estimate !== undefined && (
          <p className="muted">
            {estimate === null ? T.generateEstimateUnknown : T.generateEstimate(estimate)}
          </p>
        )}
        {waiting && <p role="status">{T.assistWaiting}</p>}
        {failure && (
          <div className="alert" role="alert">
            <p>{failure.message}</p>
            {SETUP_ERRORS.has(failure.code) ? (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => navigate(sectionPath(workspaceId, "settings"))}
              >
                {T.assistSettings}
              </button>
            ) : (
              <button type="button" className="btn ghost sm" onClick={() => void generate()}>
                {T.assistRetry}
              </button>
            )}
          </div>
        )}
        <div className="actions">
          <button
            type="button"
            className="btn"
            disabled={waiting || tooLong || badQuantity}
            onClick={() => void generate()}
          >
            {asked ? T.genMore : T.genStart}
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            {T.genClose}
          </button>
        </div>
        {visible.length > 0 && <h3 style={{ margin: 0 }}>{T.genDrafts(visible.length)}</h3>}
        {asked && !waiting && !failure && visible.length === 0 && (
          <p className="muted" role="status">
            {T.genNone}
          </p>
        )}
        {visible.map((row) => (
          <article
            key={row.id}
            className="card stack"
            aria-label={T.genItemLabel(textOf(row.generated).slice(0, 60))}
          >
            <div>
              <span className="pill">{subtypeLabel(row.generated)}</span>
              {row.generated.topic && <span className="pill">{row.generated.topic}</span>}
            </div>
            <p style={{ margin: 0 }}>{textOf(row.generated)}</p>
            <p className="muted" style={{ margin: 0 }}>
              {detailOf(row.generated)}
            </p>
            {row.error && (
              <p className="field-error" role="alert">
                {row.error}
              </p>
            )}
            {row.state === "saved" ? (
              <p role="status" style={{ margin: 0 }}>
                {row.linked ? T.genSaved : T.genSavedNoLink}
              </p>
            ) : (
              <div className="actions">
                <button type="button" className="btn sm" onClick={() => void save(row)}>
                  {T.genSave}
                </button>
                <button type="button" className="btn ghost sm" onClick={() => setEditing(row)}>
                  {T.genEdit}
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => patch(row.id, { state: "discarded" })}
                >
                  {T.genDiscard}
                </button>
              </div>
            )}
          </article>
        ))}
        {discarded > 0 && <p className="muted">{T.genDiscarded(discarded)}</p>}
        {visible.some((row) => row.state === "pending") && <p className="muted">{T.genClosing}</p>}
      </div>
    </SidePanel>
  );
}
