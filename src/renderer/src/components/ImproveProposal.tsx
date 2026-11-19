/*
 * Filename: components/ImproveProposal.tsx
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { InputOf } from "../../../core/contracts/index.js";
import { T } from "../strings.js";
import { wordDiff } from "../wordDiff.js";

type Draft = InputOf<"items:create">["draft"];
const LETTERS = "ABCDE";

/** One field of the item that the model proposes to change. */
export interface ProposedField {
  key: string;
  label: string;
  before: string;
  after: string;
}

/**
 * Puts what the person wrote beside what the model proposes, field by field, with the changes
 * marked. It changes nothing by itself: the person accepts a field, accepts all or discards.
 */
export function ImproveProposal({
  fields,
  onAcceptField,
  onAcceptAll,
  onDiscard,
}: {
  fields: readonly ProposedField[];
  onAcceptField: (key: string) => void;
  onAcceptAll: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="stack">
      <p className="muted">{T.assistNote}</p>
      {fields.length === 0 && <p role="status">{T.assistNoChange}</p>}
      {fields.map((field) => {
        const segments = wordDiff(field.before, field.after);
        return (
          <section key={field.key} className="stack" aria-label={field.label}>
            <strong>{field.label}</strong>
            <div className="assist-compare">
              <div className="assist-col">
                <h4>{T.assistOriginal}</h4>
                {segments
                  .filter((s) => s.kind !== "ins")
                  .map((s, index) =>
                    s.kind === "del" ? (
                      <del key={index}>{s.text}</del>
                    ) : (
                      <span key={index}>{s.text}</span>
                    ),
                  )}
              </div>
              <div className="assist-col">
                <h4>{T.assistProposal}</h4>
                {segments
                  .filter((s) => s.kind !== "del")
                  .map((s, index) =>
                    s.kind === "ins" ? (
                      <ins key={index}>{s.text}</ins>
                    ) : (
                      <span key={index}>{s.text}</span>
                    ),
                  )}
                <div className="actions" style={{ marginTop: "var(--space-2)" }}>
                  <button
                    type="button"
                    className="btn sm"
                    aria-label={`${T.assistAcceptField}: ${field.label}`}
                    onClick={() => onAcceptField(field.key)}
                  >
                    {T.assistAcceptField}
                  </button>
                </div>
              </div>
            </div>
          </section>
        );
      })}
      <div className="actions">
        {fields.length > 0 && (
          <button type="button" className="btn" onClick={onAcceptAll}>
            {T.assistAcceptAll}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onDiscard}>
          {fields.length === 0 ? T.newItemBack : T.assistDiscard}
        </button>
      </div>
    </div>
  );
}

/** The fields of a proposal that differ from the current draft, in the order they are shown. */
export function changedFields(current: Draft, proposed: Draft): ProposedField[] {
  const out: ProposedField[] = [];
  const add = (key: string, label: string, before: string, after: string): void => {
    if (before !== after) out.push({ key, label, before, after });
  };
  if (current.kind === "card" && proposed.kind === "card") {
    add("front", T.editFront, current.front, proposed.front);
    add("back", T.editBack, current.back, proposed.back);
  } else if (current.kind === "question" && proposed.kind === "question") {
    add("statement", T.editStatement, current.statement, proposed.statement);
    const count = Math.max(current.options.length, proposed.options.length);
    for (let index = 0; index < count; index += 1) {
      const before = current.options[index];
      const after = proposed.options[index];
      const key = LETTERS[index] ?? "";
      add(`option:${index}:text`, T.editOptionText(key), before?.text ?? "", after?.text ?? "");
      add(`option:${index}:why`, T.editOptionWhy(key), before?.why ?? "", after?.why ?? "");
    }
    add("answer", T.newItemAnswer, current.answer, proposed.answer);
    add("explanation", T.newItemExplanation, current.explanation, proposed.explanation);
  }
  return out;
}
