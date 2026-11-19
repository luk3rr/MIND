/*
 * Filename: components/ItemEditor.tsx
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { InputOf, OutputOf } from "../../../core/contracts/index.js";
import { useInvoke } from "../hooks.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { ImproveProposal } from "./ImproveProposal.js";
import { changedFields } from "./ImproveProposal.js";
import type { ProposedField } from "./ImproveProposal.js";
import { SearchCombobox } from "./SearchCombobox.js";
import { SidePanel } from "./SidePanel.js";
import { pageOf, SourcePicker } from "./SourcePicker.js";
import type { SourceValue } from "./SourcePicker.js";

type Draft = InputOf<"items:create">["draft"];

/** What an editor stored: the draft as it was saved, its topic and the quote of its source. */
export interface SavedItem {
  draft: Draft;
  topic: string | null;
  quote: string | null;
}
type CardSubtype = Extract<Draft, { kind: "card" }>["subtype"];
type QuestionSubtype = Extract<Draft, { kind: "question" }>["subtype"];
type Kind = Draft["kind"];

const CARD_SUBTYPES: readonly CardSubtype[] = ["qa", "cloze", "compare", "true_false"];
const QUESTION_SUBTYPES: readonly QuestionSubtype[] = ["multiple_choice", "certo_errado"];
const LETTERS = "ABCDE";
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 5;
const DEFAULT_OPTIONS = 4;

type AssistAction = InputOf<"assist:improve">["action"];
type Assist =
  | { status: "idle" }
  | { status: "waiting" }
  | { status: "error"; message: string; code: string; field: string | undefined };

/** Errors that only the settings can fix, so retrying would not help. */
const SETUP_ERRORS = new Set(["PROVIDER_KEY_MISSING", "CONSENT_REQUIRED", "MONTHLY_LIMIT_REACHED"]);

interface OptionText {
  text: string;
  why: string;
}

const blankOptions = (count: number): OptionText[] =>
  Array.from({ length: count }, () => ({ text: "", why: "" }));

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="field-error" role="alert">
      {message}
    </p>
  );
}

/** Creates a card or a question by hand in a side panel, with no reference to any material. */
export function ItemEditor({
  workspaceId,
  origin = "manual",
  initialSource = null,
  initialDraft = null,
  initialTopic = "",
  onBack,
  onClose,
  onSaved,
}: {
  workspaceId: number;
  origin?: InputOf<"items:create">["origin"];
  /** A source to start with, such as the passage selected in the reader. */
  initialSource?: SourceValue | null;
  /** A draft to start with, such as one written by the model from a passage. */
  initialDraft?: Draft | null;
  initialTopic?: string;
  /** When given, a "Voltar" button leaves the editor without saving, back to where it came from. */
  onBack?: () => void;
  onClose: () => void;
  /**
   * Called after each saved item, so the page behind can refresh. `saved` is what was stored
   * (the text may differ from the draft the editor started with).
   */
  onSaved: (created: OutputOf<"items:create">, saved: SavedItem) => void;
}) {
  const [kind, setKind] = useState<Kind>(initialDraft?.kind ?? "card");
  const [cardSubtype, setCardSubtype] = useState<CardSubtype>(
    initialDraft?.kind === "card" ? initialDraft.subtype : "qa",
  );
  const [questionSubtype, setQuestionSubtype] = useState<QuestionSubtype>(
    initialDraft?.kind === "question" ? initialDraft.subtype : "multiple_choice",
  );
  const [front, setFront] = useState(initialDraft?.kind === "card" ? initialDraft.front : "");
  const [back, setBack] = useState(initialDraft?.kind === "card" ? initialDraft.back : "");
  const [statement, setStatement] = useState(
    initialDraft?.kind === "question" ? initialDraft.statement : "",
  );
  const [explanation, setExplanation] = useState(
    initialDraft?.kind === "question" ? initialDraft.explanation : "",
  );
  const [options, setOptions] = useState<OptionText[]>(
    initialDraft?.kind === "question" && initialDraft.options.length > 0
      ? initialDraft.options.map(({ text, why }) => ({ text, why }))
      : blankOptions(DEFAULT_OPTIONS),
  );
  const [answer, setAnswer] = useState(
    initialDraft?.kind === "question" ? initialDraft.answer : "A",
  );
  const [topic, setTopic] = useState(initialTopic);
  const [source, setSource] = useState<SourceValue | null>(initialSource);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notLinked, setNotLinked] = useState(false);
  const { navigate } = useRouter();
  const [assistOpen, setAssistOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [assist, setAssist] = useState<Assist>({ status: "idle" });
  const [proposal, setProposal] = useState<{
    action: AssistAction;
    draft: Draft;
    fields: ProposedField[];
  } | null>(null);
  const [applied, setApplied] = useState(false);
  // A request that was cancelled or replaced must not show its answer when it arrives.
  const assistRun = useRef(0);
  const lastAction = useRef<AssistAction>("improve");
  const firstField = useRef<HTMLTextAreaElement>(null);
  const topics = useInvoke("topics:list", { workspaceId });
  const isQuestion = kind === "question";
  const trueFalse = isQuestion && questionSubtype === "certo_errado";

  const draft = (): Draft =>
    kind === "card"
      ? { kind, subtype: cardSubtype, front, back }
      : {
          kind,
          subtype: questionSubtype,
          statement,
          options:
            questionSubtype === "certo_errado"
              ? []
              : options.map((option, index) => ({ key: LETTERS[index] ?? "", ...option })),
          answer,
          explanation,
        };

  const changeSubtype = (value: QuestionSubtype): void => {
    setQuestionSubtype(value);
    setAnswer(value === "certo_errado" ? "C" : "A");
  };

  const changeOption = (index: number, change: Partial<OptionText>): void =>
    setOptions((all) => all.map((option, i) => (i === index ? { ...option, ...change } : option)));

  const removeOption = (index: number): void => {
    setOptions((all) => all.filter((_, i) => i !== index));
    // The letters are reassigned in order, so an answer past the new end falls back to the last.
    setAnswer((current) => {
      const position = LETTERS.indexOf(current);
      if (position === index) return "A";
      return position > index ? (LETTERS[position - 1] ?? "A") : current;
    });
  };

  const askModel = async (action: AssistAction): Promise<void> => {
    assistRun.current += 1;
    const run = assistRun.current;
    lastAction.current = action;
    setAssist({ status: "waiting" });
    setApplied(false);
    const current = draft();
    const quote = source !== null && source.materialId !== null ? source.quote.trim() : "";
    const result = await window.mind.invoke("assist:improve", {
      workspaceId,
      action,
      ...(action === "adjust" ? { instruction } : {}),
      draft: current,
      topic: topic.trim() || null,
      ...(quote ? { quote } : {}),
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
      action,
      draft: result.data.proposal,
      fields: changedFields(current, result.data.proposal),
    });
  };

  const cancelAsk = (): void => {
    assistRun.current += 1;
    setAssist({ status: "idle" });
  };

  const applyField = (key: string): void => {
    if (!proposal) return;
    const proposed = proposal.draft;
    if (proposed.kind === "card") {
      if (key === "front") setFront(proposed.front);
      if (key === "back") setBack(proposed.back);
    } else {
      if (key === "statement") setStatement(proposed.statement);
      if (key === "explanation") setExplanation(proposed.explanation);
      if (key === "answer") setAnswer(proposed.answer);
      const match = /^option:(\d+):(text|why)$/.exec(key);
      if (match) {
        const index = Number(match[1]);
        const part = match[2] as "text" | "why";
        const value = proposed.options[index]?.[part] ?? "";
        setOptions((all) => {
          const next = [...all];
          while (next.length <= index) next.push({ text: "", why: "" });
          next[index] = { ...(next[index] as OptionText), [part]: value };
          return next;
        });
      }
    }
    const remaining = proposal.fields.filter((f) => f.key !== key);
    // With nothing left to decide, the proposal closes and the form shows the result.
    if (remaining.length === 0) {
      setProposal(null);
      setApplied(true);
    } else setProposal({ ...proposal, fields: remaining });
  };

  const acceptAll = (): void => {
    const proposed = proposal?.draft;
    if (!proposed) return;
    if (proposed.kind === "card") {
      setFront(proposed.front);
      setBack(proposed.back);
    } else {
      setStatement(proposed.statement);
      setExplanation(proposed.explanation);
      setAnswer(proposed.answer);
      if (proposed.subtype === "multiple_choice") {
        setOptions(proposed.options.map(({ text, why }) => ({ text, why })));
      }
    }
    setProposal(null);
    setApplied(true);
  };

  const save = async (another: boolean): Promise<void> => {
    setSaved(false);
    if (source !== null) {
      const missing: Record<string, string> = {};
      if (source.materialId === null) missing["source.material"] = T.sourceNeedMaterial;
      if (!source.quote.trim()) missing["source.quote"] = T.sourceNeedQuote;
      if (Object.keys(missing).length > 0) {
        setErrors(missing);
        return;
      }
    }
    setBusy(true);
    const stored = draft();
    const result = await window.mind.invoke("items:create", {
      workspaceId,
      draft: stored,
      topic: topic.trim() || null,
      origin,
      ...(source !== null && source.materialId !== null
        ? {
            source: {
              materialId: source.materialId,
              page: pageOf(source),
              quote: source.quote.trim(),
            },
          }
        : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setErrors(Object.fromEntries((result.error.fields ?? []).map((f) => [f.field, f.message])));
      return;
    }
    setErrors({});
    onSaved(result.data, {
      draft: stored,
      topic: topic.trim() || null,
      quote: source?.quote.trim() || null,
    });
    // A quote that is not in the material still saves the item; the panel stays to say so.
    const unlinked = source !== null && !result.data.sourceLinked;
    if (!another && !unlinked) {
      onClose();
      return;
    }
    // The next item keeps the type, the number of alternatives and the topic; the text starts over.
    setFront("");
    setBack("");
    setStatement("");
    setExplanation("");
    setOptions((all) => blankOptions(all.length));
    setAnswer(questionSubtype === "certo_errado" ? "C" : "A");
    // The quote belongs to the item just saved; the next one starts without a source.
    setSource(null);
    setNotLinked(unlinked);
    setSaved(true);
    firstField.current?.focus();
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void save(false);
  };

  const actionLabel = { improve: T.assistImprove, fix: T.assistFix, adjust: T.assistAdjust }[
    proposal?.action ?? "improve"
  ].replace("…", "");
  if (proposal !== null) {
    return (
      <SidePanel title={T.assistTitle(actionLabel)} onClose={onClose} wide>
        <ImproveProposal
          fields={proposal.fields}
          onAcceptField={applyField}
          onAcceptAll={acceptAll}
          onDiscard={() => setProposal(null)}
        />
      </SidePanel>
    );
  }

  const title = isQuestion ? T.newQuestionTitle : T.newItemTitle;
  return (
    <SidePanel title={title} onClose={onClose}>
      <form
        className="stack"
        onSubmit={submit}
        aria-label={title}
        onKeyDown={(event) => {
          // Ctrl+Enter (or Cmd+Enter) saves from any field, without reaching for the button.
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !busy) {
            event.preventDefault();
            void save(false);
          }
        }}
      >
        <fieldset className="field">
          <legend>{T.newItemKind}</legend>
          <div className="row">
            {(["card", "question"] as const).map((value) => (
              <label key={value} className="row" style={{ gap: "var(--space-2)" }}>
                <input
                  type="radio"
                  name="new-kind"
                  value={value}
                  checked={kind === value}
                  style={{ width: "auto" }}
                  onChange={() => {
                    setKind(value);
                    setErrors({});
                  }}
                />
                {value === "card" ? T.newItemCard : T.newItemQuestion}
              </label>
            ))}
          </div>
        </fieldset>
        {!isQuestion && (
          <>
            <div className="field">
              <label htmlFor="new-subtype">{T.newItemSubtype}</label>
              <select
                id="new-subtype"
                value={cardSubtype}
                onChange={(event) => setCardSubtype(event.target.value as CardSubtype)}
              >
                {CARD_SUBTYPES.map((value) => (
                  <option key={value} value={value}>
                    {T.cardTypes[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-front">{T.editFront}</label>
              <textarea
                id="new-front"
                ref={firstField}
                autoFocus
                rows={3}
                value={front}
                onChange={(event) => setFront(event.target.value)}
                aria-describedby={errors["front"] ? "new-front-error" : undefined}
              />
              {cardSubtype === "cloze" && <p className="muted">{T.newItemClozeHint}</p>}
              <FieldError id="new-front-error" message={errors["front"]} />
            </div>
            <div className="field">
              <label htmlFor="new-back">{T.editBack}</label>
              <textarea
                id="new-back"
                rows={3}
                value={back}
                onChange={(event) => setBack(event.target.value)}
                aria-describedby={errors["back"] ? "new-back-error" : undefined}
              />
              <FieldError id="new-back-error" message={errors["back"]} />
            </div>
          </>
        )}
        {isQuestion && (
          <>
            <div className="field">
              <label htmlFor="new-qsubtype">{T.newQuestionSubtype}</label>
              <select
                id="new-qsubtype"
                value={questionSubtype}
                onChange={(event) => changeSubtype(event.target.value as QuestionSubtype)}
              >
                {QUESTION_SUBTYPES.map((value) => (
                  <option key={value} value={value}>
                    {T.questionTypes[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-statement">{T.editStatement}</label>
              <textarea
                id="new-statement"
                ref={firstField}
                autoFocus
                rows={3}
                value={statement}
                onChange={(event) => setStatement(event.target.value)}
                aria-describedby={errors["statement"] ? "new-statement-error" : undefined}
              />
              <FieldError id="new-statement-error" message={errors["statement"]} />
            </div>
            {trueFalse ? (
              <fieldset className="field">
                <legend>{T.newItemAnswer}</legend>
                <div className="row">
                  {(
                    [
                      ["C", T.newItemCerto],
                      ["E", T.newItemErrado],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="row" style={{ gap: "var(--space-2)" }}>
                      <input
                        type="radio"
                        name="new-answer"
                        value={key}
                        checked={answer === key}
                        style={{ width: "auto" }}
                        onChange={() => setAnswer(key)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <FieldError id="new-answer-error" message={errors["answer"]} />
              </fieldset>
            ) : (
              <fieldset className="field edit-options">
                <legend>{T.newItemOptions}</legend>
                {options.map((option, index) => {
                  const key = LETTERS[index] ?? "";
                  return (
                    <div key={key} className="stack">
                      <div className="row">
                        <input
                          type="radio"
                          name="new-answer"
                          value={key}
                          checked={answer === key}
                          aria-label={T.editCorrect(key)}
                          style={{ width: "auto" }}
                          onChange={() => setAnswer(key)}
                        />
                        <strong>{key}</strong>
                        <input
                          aria-label={T.editOptionText(key)}
                          value={option.text}
                          onChange={(event) => changeOption(index, { text: event.target.value })}
                        />
                        {options.length > MIN_OPTIONS && (
                          <button
                            type="button"
                            className="btn ghost sm"
                            aria-label={T.newItemRemoveOption(key)}
                            onClick={() => removeOption(index)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <input
                        aria-label={T.editOptionWhy(key)}
                        placeholder={T.editOptionWhyPlaceholder}
                        value={option.why}
                        onChange={(event) => changeOption(index, { why: event.target.value })}
                      />
                      <FieldError
                        id={`new-option-${key}-text`}
                        message={errors[`options.${index}.text`]}
                      />
                      <FieldError
                        id={`new-option-${key}-why`}
                        message={errors[`options.${index}.why`]}
                      />
                    </div>
                  );
                })}
                <FieldError id="new-options-error" message={errors["options"]} />
                <FieldError id="new-answer-error" message={errors["answer"]} />
                {options.length < MAX_OPTIONS && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => setOptions((all) => [...all, { text: "", why: "" }])}
                  >
                    {T.newItemAddOption}
                  </button>
                )}
              </fieldset>
            )}
            <div className="field">
              <label htmlFor="new-explanation">{T.newItemExplanation}</label>
              <textarea
                id="new-explanation"
                rows={3}
                value={explanation}
                onChange={(event) => setExplanation(event.target.value)}
                aria-describedby={errors["explanation"] ? "new-explanation-error" : undefined}
              />
              <FieldError id="new-explanation-error" message={errors["explanation"]} />
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="new-topic">{T.editTopic}</label>
          <SearchCombobox
            inputId="new-topic"
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
        </div>
        <SourcePicker
          workspaceId={workspaceId}
          value={source}
          onChange={(next) => {
            setSource(next);
            setErrors((all) => ({ ...all, "source.material": "", "source.quote": "" }));
          }}
          errors={{ material: errors["source.material"], quote: errors["source.quote"] }}
        />
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
                  <textarea
                    id="assist-instruction"
                    rows={3}
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
        {saved && <p role="status">{notLinked ? T.newItemNotLinked : T.newItemSaved}</p>}
        <div className="actions">
          <button type="submit" className="btn" disabled={busy}>
            {T.newItemSave}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => void save(true)}
          >
            {T.newItemSaveAnother}
          </button>
          {onBack && (
            <button type="button" className="btn ghost" disabled={busy} onClick={onBack}>
              {T.newItemBack}
            </button>
          )}
        </div>
      </form>
    </SidePanel>
  );
}
