/*
 * Filename: components/FeedbackList.tsx
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { MathText } from "../MathText.js";
import { T } from "../strings.js";
import { SeeInPdf } from "./SeeInPdf.js";

export type Feedback = NonNullable<OutputOf<"practice:answer">["feedback"]>;

/** What the student said about their confidence and, when it clashed with the result, a notice. */
function ConfidenceNote({ entry }: { entry: Feedback }) {
  if (entry.confidence === null) return null;
  const label = T.confidenceLevels[String(entry.confidence)] ?? "";
  return (
    <p className="muted">
      {T.confidenceGiven(label)}
      {!entry.correct && entry.confidence === 3 && (
        <>
          {" "}
          <span className="pill warn">{T.confidenceDivergence}</span>
        </>
      )}
    </p>
  );
}

/**
 * The alternatives of a question after the answer: the one chosen and the key are marked with a
 * label (not only a color) and each alternative says why it is right or wrong. Without
 * alternatives it falls back to a single line with the two letters.
 */
function AnswerOptions({ entry }: { entry: Feedback }) {
  if (entry.options.length === 0) {
    return (
      <p className="muted">
        {T.feedbackYourAnswer}: {entry.answer} · {T.practiceRight}: {entry.correctKey}
      </p>
    );
  }
  return (
    <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {entry.options.map((option) => {
        const isKey = option.key === entry.correctKey;
        const isChosen = option.key === entry.answer;
        const mark =
          isKey && isChosen
            ? T.feedbackChosenKey
            : isKey
              ? T.practiceRight
              : isChosen
                ? T.feedbackChosen
                : null;
        return (
          <li
            key={option.key}
            className={`option static${isKey ? " right" : ""}${isChosen && !isKey ? " wrong" : ""}`}
          >
            <strong>{option.key}</strong> · <MathText text={option.text} />
            {mark && (
              <>
                {" "}
                <span className={`pill ${isKey ? "ok" : "bad"}`}>{mark}</span>
              </>
            )}
            {option.why && (
              <span className="muted">
                {" "}
                — <MathText text={option.why} />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The result of one answer: what was chosen, the key, the comment and where it comes from. */
export function FeedbackEntry({
  workspaceId,
  entry,
  message,
  onMessage,
}: {
  workspaceId: number;
  entry: Feedback;
  message?: string | null;
  /** Keeps the outcome of "make card" where the screen can show it again after coming back. */
  onMessage?: (text: string) => void;
}) {
  return (
    <>
      <p className={entry.correct ? "ok" : "alert"}>
        {entry.correct ? T.practiceCorrect : T.practiceWrong} {T.practiceRight}: {entry.correctKey}
      </p>
      <ConfidenceNote entry={entry} />
      <p>
        <MathText text={entry.explanation} />
      </p>
      <blockquote className="source">
        <span className="muted">
          {T.source}: {entry.sourceTitle}
          {entry.sourcePage !== null ? `, ${T.page} ${entry.sourcePage}` : ""}
        </span>
        <br />“{entry.quote}”
        {entry.pdfSource && (
          <>
            <br />
            <SeeInPdf workspaceId={workspaceId} {...entry.pdfSource} />
          </>
        )}
      </blockquote>
      {!entry.correct && (
        <MakeCard
          workspaceId={workspaceId}
          itemId={entry.itemId}
          message={message}
          {...(onMessage ? { onMessage } : {})}
        />
      )}
    </>
  );
}

/** Turns a wrong answer into a card of the error notebook. */
export function MakeCard({
  workspaceId,
  itemId,
  message,
  onMessage,
}: {
  workspaceId: number;
  itemId: number;
  message?: string | null;
  onMessage?: (text: string) => void;
}) {
  const [own, setOwn] = useState<string | null>(null);
  const text = message ?? own;
  const setText = (next: string): void => {
    setOwn(next);
    onMessage?.(next);
  };
  return (
    <div>
      <button
        type="button"
        className="btn ghost"
        onClick={() =>
          void window.mind
            .invoke("errors:makeCard", { workspaceId, questionId: itemId })
            .then((response) =>
              setText(
                response.ok
                  ? response.data.created
                    ? T.cardMade
                    : T.cardExists
                  : response.error.message,
              ),
            )
        }
      >
        {T.makeCard}
      </button>
      {text && <span className="ok"> {text}</span>}
    </div>
  );
}

/** The feedback of a block of answers, released together: the score and each answer. */
export function FeedbackList({
  workspaceId,
  entries,
  title = T.feedbackBlockTitle,
  backLabel = T.feedbackBack,
  allowMakeCard = true,
  onBack,
  onNewBlock,
}: {
  workspaceId: number;
  entries: Feedback[];
  title?: string;
  backLabel?: string;
  /** False where a mistake must not become a card (the pre-test summary). */
  allowMakeCard?: boolean;
  onBack: () => void;
  /** Starts another block; left out where there is no block to start (the pending screen). */
  onNewBlock?: () => void;
}) {
  const right = entries.filter((entry) => entry.correct).length;
  return (
    <section className="card stack" aria-labelledby="feedback-block-title">
      <h2 id="feedback-block-title">{title}</h2>
      <p role="status">
        <strong>{T.feedbackScore(right, entries.length)}</strong>
      </p>
      <ol className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {entries.map((entry) => (
          <li key={entry.attemptId} className="card stack">
            <p>
              <span className={`pill ${entry.correct ? "ok" : "bad"}`}>
                {entry.correct ? T.feedbackRight : T.feedbackWrong}
              </span>{" "}
              <strong>
                <MathText text={entry.statement} />
              </strong>
            </p>
            <AnswerOptions entry={entry} />
            <ConfidenceNote entry={entry} />
            <p>
              <MathText text={entry.explanation} />
            </p>
            <blockquote className="source">
              <span className="muted">
                {T.source}: {entry.sourceTitle}
                {entry.sourcePage !== null ? `, ${T.page} ${entry.sourcePage}` : ""}
              </span>
              <br />“{entry.quote}”
              {entry.pdfSource && (
                <>
                  <br />
                  <SeeInPdf workspaceId={workspaceId} {...entry.pdfSource} />
                </>
              )}
            </blockquote>
            {allowMakeCard && !entry.correct && (
              <MakeCard workspaceId={workspaceId} itemId={entry.itemId} />
            )}
          </li>
        ))}
      </ol>
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onBack}>
          {backLabel}
        </button>
        {onNewBlock && (
          <button type="button" className="btn" onClick={onNewBlock}>
            {T.feedbackNewBlock}
          </button>
        )}
      </div>
    </section>
  );
}
