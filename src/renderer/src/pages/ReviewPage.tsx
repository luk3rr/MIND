/*
 * Filename: pages/ReviewPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import type { FormEvent } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { Dialog } from "../components/Dialog.js";
import { useInvoke } from "../hooks.js";
import { MathText } from "../MathText.js";
import { clozePlain } from "../math.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { SeeInPdf } from "../components/SeeInPdf.js";

type Item = OutputOf<"review:list">["items"][number];
type Status = "draft" | "approved" | "discarded";

function EditDialog({
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
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const result = await window.mind.invoke("review:edit", {
      workspaceId,
      itemId: item.id,
      front,
      back,
      topic: topic.trim() || null,
    });
    if (!result.ok) {
      setErrors(Object.fromEntries((result.error.fields ?? []).map((f) => [f.field, f.message])));
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Dialog title={T.edit} onClose={onClose}>
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
          <input id="edit-topic" value={topic} onChange={(event) => setTopic(event.target.value)} />
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

/** Review of one generation run: each item next to the quote that supports it. */
export function ReviewPage({ workspaceId, runId }: { workspaceId: number; runId: number }) {
  const { navigate } = useRouter();
  const [status, setStatus] = useState<Status>("draft");
  const { state, reload } = useInvoke("review:list", { workspaceId, runId, status });
  const [editing, setEditing] = useState<Item | null>(null);

  const act = (channel: "review:approve" | "review:discard", id: number): void => {
    void window.mind.invoke(channel, { workspaceId, ids: [id] }).then(reload);
  };

  return (
    <section aria-labelledby="review-title">
      <button
        type="button"
        className="link"
        onClick={() => navigate(sectionPath(workspaceId, "generate"))}
      >
        {T.backToGenerate}
      </button>
      <h1 id="review-title">{T.reviewTitle}</h1>
      {state.status === "loading" && <p role="status">{T.loading}</p>}
      {state.status === "error" && (
        <div className="alert" role="alert">
          {state.error.message}
        </div>
      )}
      {state.status === "ready" && (
        <>
          <div className="row" role="tablist">
            {(
              [
                ["draft", T.tabDraft],
                ["approved", T.tabApproved],
                ["discarded", T.tabDiscarded],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={status === value}
                className={status === value ? "btn" : "btn ghost"}
                onClick={() => setStatus(value)}
              >
                {label} ({state.data.counts[value]})
              </button>
            ))}
            {status === "draft" && state.data.counts.draft > 0 && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void window.mind.invoke("review:approveAll", { workspaceId, runId }).then(reload);
                }}
              >
                {T.approveAll}
              </button>
            )}
          </div>
          {state.data.items.length === 0 && <p className="muted">{T.nothingHere}</p>}
          <div className="stack">
            {state.data.items.map((item) => (
              <article key={item.id} className="card">
                <p className="muted">
                  {item.kind === "question"
                    ? T.kindQuestions
                    : (T.cardTypes[item.subtype] ?? item.subtype)}
                  {item.topic ? ` · ${item.topic}` : ""}
                  {item.edited ? " · editado" : ""}
                </p>
                <p>
                  <strong>
                    <MathText text={clozePlain(item.front)} />
                  </strong>
                </p>
                {item.kind === "question" && (
                  <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
                    {item.options.map((option) => (
                      <li
                        key={option.key}
                        className={option.key === item.answer ? "ok" : undefined}
                      >
                        <strong>{option.key}</strong> · <MathText text={option.text} />
                        {option.why && <span className="muted"> — {option.why}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {item.kind === "question" && item.options.length === 0 && (
                  <p className="ok">
                    {T.answerKey}: {item.answer}
                  </p>
                )}
                {item.back && (
                  <p>
                    <MathText text={item.back} />
                  </p>
                )}
                <blockquote className="source">
                  <span className="muted">
                    {T.source}: {item.sourceTitle}
                    {item.sourcePage !== null ? `, ${T.page} ${item.sourcePage}` : ""}
                  </span>
                  <br />“{item.quote}”
                  {item.pdfSource && (
                    <>
                      <br />
                      <SeeInPdf workspaceId={workspaceId} {...item.pdfSource} />
                    </>
                  )}
                </blockquote>
                {item.status === "draft" && (
                  <div className="row">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => act("review:approve", item.id)}
                    >
                      {T.approve}
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setEditing(item)}>
                      {T.edit}
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => act("review:discard", item.id)}
                    >
                      {T.discard}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {editing && (
        <EditDialog
          item={editing}
          workspaceId={workspaceId}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </section>
  );
}
