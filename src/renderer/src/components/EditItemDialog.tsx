/*
 * Filename: components/EditItemDialog.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { InputOf, OutputOf } from "../../../core/contracts/index.js";
import { useInvoke } from "../hooks.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { changedFields, ImproveProposal } from "./ImproveProposal.js";
import type { ProposedField } from "./ImproveProposal.js";
import { SearchCombobox } from "./SearchCombobox.js";
import { Dialog } from "./Dialog.js";

type Item = OutputOf<"review:list">["items"][number];
type Draft = InputOf<"assist:improve">["draft"];
type AssistAction = InputOf<"assist:improve">["action"];
type Assist =
  | { status: "idle" }
  | { status: "waiting" }
  | { status: "error"; message: string; code: string; field: string | undefined };

/** Errors that only the settings can fix, so retrying would not help. */
const SETUP_ERRORS = new Set(["PROVIDER_KEY_MISSING", "CONSENT_REQUIRED", "MONTHLY_LIMIT_REACHED"]);
const LETTERS = "ABCDE";

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
  const [options, setOptions] = useState(item.options);
  const [answer, setAnswer] = useState(item.answer ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const topics = useInvoke("topics:list", { workspaceId });
  const { navigate } = useRouter();
  const [assistOpen, setAssistOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [assist, setAssist] = useState<Assist>({ status: "idle" });
  const [proposal, setProposal] = useState<{ draft: Draft; fields: ProposedField[] } | null>(null);
  const [applied, setApplied] = useState(false);
  // A request that was cancelled or replaced must not show its answer when it arrives.
  const assistRun = useRef(0);
  const lastAction = useRef<AssistAction>("improve");
  const isQuestion = item.kind === "question";
  // True/false only has a verdict to choose; the other questions have texts to rewrite as well.
  const rewritable = isQuestion && item.subtype !== "certo_errado";

  /** The text now in the form, as the model sees it: a question's front is its statement. */
  const draft = (): Draft =>
    item.kind === "question"
      ? {
          kind: "question",
          subtype: item.subtype as Extract<Draft, { kind: "question" }>["subtype"],
          statement: front,
          options: rewritable
            ? options.map((option, index) => ({ ...option, key: LETTERS[index] ?? option.key }))
            : [],
          answer,
          explanation: back,
        }
      : {
          kind: "card",
          subtype: item.subtype as Extract<Draft, { kind: "card" }>["subtype"],
          front,
          back,
        };

  const askModel = async (action: AssistAction): Promise<void> => {
    assistRun.current += 1;
    const run = assistRun.current;
    lastAction.current = action;
    setAssist({ status: "waiting" });
    setApplied(false);
    const current = draft();
    const result = await window.mind.invoke("assist:improve", {
      workspaceId,
      action,
      ...(action === "adjust" ? { instruction } : {}),
      draft: current,
      topic: topic.trim() || null,
      ...(item.quote ? { quote: item.quote.slice(0, 2000) } : {}),
    });
    if (run !== assistRun.current) return;
    if (!result.ok) {
      setAssist({
        status: "error",
        message: result.error.message,
        code: result.error.code,
        field: result.error.fields?.[0]?.field,
      });
      return;
    }
    setAssist({ status: "idle" });
    setProposal({
      draft: result.data.proposal,
      fields: changedFields(current, result.data.proposal),
    });
  };

  const cancelAsk = (): void => {
    assistRun.current += 1;
    setAssist({ status: "idle" });
  };

  /** Copies the fields of the proposal named by `keys` into the form. */
  const apply = (proposed: Draft, keys: readonly string[]): void => {
    const wants = (key: string): boolean => keys.includes(key);
    if (proposed.kind === "card") {
      if (wants("front")) setFront(proposed.front);
      if (wants("back")) setBack(proposed.back);
    } else {
      if (wants("statement")) setFront(proposed.statement);
      if (wants("explanation")) setBack(proposed.explanation);
      if (wants("answer")) setAnswer(proposed.answer);
      if (rewritable) {
        setOptions((all) =>
          all.map((option, index) => {
            const next = proposed.options[index];
            if (!next) return option;
            return {
              ...option,
              ...(wants(`option:${index}:text`) ? { text: next.text } : {}),
              ...(wants(`option:${index}:why`) ? { why: next.why } : {}),
            };
          }),
        );
      }
    }
  };

  const acceptField = (key: string): void => {
    if (!proposal) return;
    apply(proposal.draft, [key]);
    const remaining = proposal.fields.filter((f) => f.key !== key);
    if (remaining.length === 0) {
      setProposal(null);
      setApplied(true);
    } else setProposal({ ...proposal, fields: remaining });
  };

  const acceptAll = (): void => {
    if (!proposal) return;
    apply(
      proposal.draft,
      proposal.fields.map((f) => f.key),
    );
    setProposal(null);
    setApplied(true);
  };

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const result = await window.mind.invoke("review:edit", {
      workspaceId,
      itemId: item.id,
      front,
      back,
      topic: topic.trim() || null,
      ...(isQuestion && options.length > 0 ? { answer, ...(rewritable ? { options } : {}) } : {}),
    });
    if (!result.ok) {
      setErrors(Object.fromEntries((result.error.fields ?? []).map((f) => [f.field, f.message])));
      return;
    }
    onSaved();
    onClose();
  };

  if (proposal !== null) {
    return (
      <Dialog title={T.edit} onClose={onClose} wide>
        <ImproveProposal
          fields={proposal.fields}
          onAcceptField={acceptField}
          onAcceptAll={acceptAll}
          onDiscard={() => setProposal(null)}
        />
      </Dialog>
    );
  }

  return (
    <Dialog title={T.edit} onClose={onClose} wide>
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
        {isQuestion && options.length > 0 && (
          <fieldset className="field edit-options">
            <legend>{T.editOptions}</legend>
            {options.map((option, index) => (
              <div key={option.key} className="stack">
                <div className="row">
                  <input
                    type="radio"
                    name="edit-answer"
                    value={option.key}
                    checked={answer === option.key}
                    aria-label={T.editCorrect(option.key)}
                    onChange={() => setAnswer(option.key)}
                    style={{ width: "auto" }}
                  />
                  <strong>{option.key}</strong>
                  {rewritable ? (
                    <input
                      aria-label={T.editOptionText(option.key)}
                      value={option.text}
                      onChange={(event) =>
                        setOptions((all) =>
                          all.map((o, i) => (i === index ? { ...o, text: event.target.value } : o)),
                        )
                      }
                    />
                  ) : (
                    <span>{option.text}</span>
                  )}
                </div>
                {rewritable && (
                  <textarea
                    rows={2}
                    aria-label={T.editOptionWhy(option.key)}
                    placeholder={T.editOptionWhyPlaceholder}
                    value={option.why}
                    onChange={(event) =>
                      setOptions((all) =>
                        all.map((o, i) => (i === index ? { ...o, why: event.target.value } : o)),
                      )
                    }
                  />
                )}
                {errors[`option:${option.key}`] && (
                  <p className="field-error" role="alert">
                    {errors[`option:${option.key}`]}
                  </p>
                )}
              </div>
            ))}
            {(errors["answer"] || errors["options"]) && (
              <p className="field-error" role="alert">
                {errors["answer"] ?? errors["options"]}
              </p>
            )}
          </fieldset>
        )}
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
          <SearchCombobox
            inputId="edit-topic"
            label={T.editTopic}
            placeholder={T.editTopicPlaceholder}
            options={
              topics.state.status === "ready"
                ? topics.state.data.topics.map((t) => ({
                    key: t.id,
                    label: t.name,
                    count: t.cards + t.questions,
                  }))
                : []
            }
            text={topic}
            onText={setTopic}
          />
          <p className="muted">{T.editTopicHint}</p>
        </div>
        <div className="field stack">
          <button
            type="button"
            className="btn ghost sm"
            aria-expanded={assistOpen}
            onClick={() => setAssistOpen((open) => !open)}
          >
            ✦ {T.assistButton}
          </button>
          {assistOpen && (
            <div role="group" aria-label={T.assistButton} className="stack">
              <div className="actions">
                {(
                  [
                    ["improve", T.assistImprove],
                    ["fix", T.assistFix],
                  ] as const
                ).map(([action, label]) => (
                  <button
                    key={action}
                    type="button"
                    className="btn ghost sm"
                    disabled={assist.status === "waiting"}
                    onClick={() => void askModel(action)}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn ghost sm"
                  aria-pressed={adjusting}
                  onClick={() => setAdjusting((open) => !open)}
                >
                  {T.assistAdjust}
                </button>
              </div>
              {adjusting && (
                <div className="field">
                  <label htmlFor="assist-instruction">{T.assistInstruction}</label>
                  <input
                    id="assist-instruction"
                    maxLength={500}
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                  />
                  {assist.status === "error" && assist.field === "instruction" && (
                    <p className="field-error" role="alert">
                      {assist.message}
                    </p>
                  )}
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={assist.status === "waiting"}
                    onClick={() => void askModel("adjust")}
                  >
                    {T.assistAsk}
                  </button>
                </div>
              )}
              {assist.status === "waiting" && (
                <p role="status">
                  {T.assistWaiting}{" "}
                  <button type="button" className="btn ghost sm" onClick={cancelAsk}>
                    {T.assistCancel}
                  </button>
                </p>
              )}
              {assist.status === "error" && assist.field !== "instruction" && (
                <div className="alert" role="alert">
                  <p>{assist.message}</p>
                  {SETUP_ERRORS.has(assist.code) ? (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => navigate(sectionPath(workspaceId, "settings"))}
                    >
                      {T.assistSettings}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => void askModel(lastAction.current)}
                    >
                      {T.assistRetry}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {applied && <p role="status">{T.assistApplied}</p>}
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
