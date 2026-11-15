/*
 * Filename: pages/ReviewPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { EditItemDialog } from "../components/EditItemDialog.js";
import { useInvoke } from "../hooks.js";
import { MathText } from "../MathText.js";
import { clozePlain } from "../math.js";
import { BackLink } from "../components/BackLink.js";
import { T } from "../strings.js";
import { SeeInPdf } from "../components/SeeInPdf.js";
import { ListSearch, Pager, usePagedList } from "../components/ListControls.js";
import { ItemActions } from "../components/ItemActions.js";

type Item = OutputOf<"review:list">["items"][number];
type Status = "draft" | "approved" | "discarded";

/** How many items of a run one page of the review shows (each one is a tall card). */
const ITEMS_PER_PAGE = 10;

/** Review of one generation run: each item next to the quote that supports it. */
export function ReviewPage({ workspaceId, runId }: { workspaceId: number; runId: number }) {
  const [status, setStatus] = useState<Status>("draft");
  const { state, reload } = useInvoke("review:list", { workspaceId, runId, status });
  const [editing, setEditing] = useState<Item | null>(null);
  const list = usePagedList(
    state.status === "ready" ? state.data.items : [],
    ITEMS_PER_PAGE,
    (entry) =>
      [
        entry.front,
        entry.back,
        entry.topic ?? "",
        entry.quote,
        entry.sourceTitle,
        ...entry.options.map((option) => option.text),
      ].join(" "),
    status,
  );

  const act = (channel: "review:approve" | "review:discard", id: number): void => {
    void window.mind.invoke(channel, { workspaceId, ids: [id] }).then(reload);
  };

  return (
    <section aria-labelledby="review-title">
      <BackLink workspaceId={workspaceId} fallback="generate" fallbackLabel={T.backToGenerate} />
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
          <ListSearch list={list} label={T.listSearchItems} />
          <div className="stack">
            {list.pageItems.map((item) => (
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
                {item.status === "discarded" && (
                  <div className="row">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        void window.mind
                          .invoke("review:restore", { workspaceId, itemId: item.id })
                          .then(reload);
                      }}
                    >
                      {T.restore}
                    </button>
                  </div>
                )}
                {item.status === "approved" && (
                  <div className="row">
                    <ItemActions
                      workspaceId={workspaceId}
                      itemId={item.id}
                      onEdited={reload}
                      onDiscarded={reload}
                    />
                  </div>
                )}
              </article>
            ))}
          </div>
          <Pager list={list} />
        </>
      )}
      {editing && (
        <EditItemDialog
          item={editing}
          workspaceId={workspaceId}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </section>
  );
}
