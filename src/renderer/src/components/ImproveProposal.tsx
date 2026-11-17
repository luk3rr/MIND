/*
 * Filename: components/ImproveProposal.tsx
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { T } from "../strings.js";
import { wordDiff } from "../wordDiff.js";

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
          {T.assistDiscard}
        </button>
      </div>
    </div>
  );
}
