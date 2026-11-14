/*
 * Filename: pages/PracticePage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useRef, useState } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { useHotkeys } from "../hooks.js";
import { MathText } from "../MathText.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";

type Next = OutputOf<"practice:next">;
type Result = OutputOf<"practice:answer">;

/** Answers approved questions one at a time, with the correction, comments and source. */
export function PracticePage({ workspaceId }: { workspaceId: number }) {
  const { navigate } = useRouter();
  const [next, setNext] = useState<Next | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [redo, setRedo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<number[]>([]);
  const [cardMessage, setCardMessage] = useState<string | null>(null);
  const shownAt = useRef(0);

  const load = (exclude: number[] = seen): void => {
    void window.mind
      .invoke("practice:next", { workspaceId, redo, ...(exclude.length > 0 ? { exclude } : {}) })
      .then((response) => {
        if (!response.ok) {
          setError(response.error.message);
          return;
        }
        setError(null);
        setNext(response.data);
        setChosen(null);
        setResult(null);
        setCardMessage(null);
        shownAt.current = performance.now();
      });
  };

  useEffect(() => load([]), [workspaceId, redo]);

  const question = next?.question;
  const submit = (answer: string | null = chosen): void => {
    if (!question || !answer || result) return;
    const seconds = Math.round(((performance.now() - shownAt.current) / 1000) * 10) / 10;
    void window.mind
      .invoke("practice:answer", { workspaceId, itemId: question.item.id, answer, seconds })
      .then((response) => {
        if (!response.ok) setError(response.error.message);
        else setResult(response.data);
      });
  };

  const advance = (): void => {
    if (!question) return;
    const updated = [...seen, question.item.id];
    setSeen(updated);
    load(updated);
  };

  const keys = question?.item.options.map((option) => option.key) ?? [];
  useHotkeys(
    Object.fromEntries([
      ...keys.map((key, index) => [String(index + 1), () => !result && setChosen(key)] as const),
      ["enter", () => (result ? advance() : submit())] as const,
    ]),
    question !== null && question !== undefined,
  );

  return (
    <section aria-labelledby="practice-title">
      <button
        type="button"
        className="link"
        onClick={() => navigate(sectionPath(workspaceId, "study"))}
      >
        {T.backToStudy}
      </button>
      <h1 id="practice-title">{T.practiceTitle}</h1>
      {next && (
        <p className="muted">
          {T.practiceCounts(next.counts.unseen, next.counts.retry)} ·{" "}
          {T.practiceAnsweredToday(next.counts.answeredToday, next.counts.correctToday)}
        </p>
      )}
      <label>
        <input type="checkbox" checked={redo} onChange={(event) => setRedo(event.target.checked)} />{" "}
        {T.practiceRedo}
      </label>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {next && !question && (
        <div className="card">
          <p className="muted">{T.practiceNoQuestions}</p>
        </div>
      )}
      {question && (
        <div className="card stack">
          <p className="muted">
            {question.item.topic ?? ""}
            {question.attempts > 0 ? ` · ${question.attempts} tentativa(s)` : ""}
          </p>
          <p>
            <strong>
              <MathText text={question.item.front} />
            </strong>
          </p>
          <div className="stack" role="radiogroup" aria-label={T.practiceTitle}>
            {question.item.options.map((option, index) => {
              const isAnswer = result?.correctKey === option.key;
              const isWrongChoice =
                result !== null && result.answer === option.key && !result.correct;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={chosen === option.key}
                  disabled={result !== null}
                  className={`option${chosen === option.key ? " chosen" : ""}${isAnswer ? " right" : ""}${isWrongChoice ? " wrong" : ""}`}
                  onClick={() => setChosen(option.key)}
                >
                  <strong>{option.key}</strong> · <MathText text={option.text} />
                  <span className="muted"> ({index + 1})</span>
                  {result && option.why && <span className="muted"> — {option.why}</span>}
                </button>
              );
            })}
          </div>
          {!result && (
            <div>
              <button
                type="button"
                className="btn"
                disabled={chosen === null}
                onClick={() => submit()}
              >
                {T.practiceAnswer}
              </button>
            </div>
          )}
          {result && (
            <div role="status" className="stack">
              <p className={result.correct ? "ok" : "alert"}>
                {result.correct ? T.practiceCorrect : T.practiceWrong} {T.practiceRight}:{" "}
                {result.correctKey}
              </p>
              <p>
                <MathText text={result.explanation} />
              </p>
              <blockquote className="source">
                <span className="muted">
                  {T.source}: {question.item.sourceTitle}
                  {question.item.sourcePage !== null
                    ? `, ${T.page} ${question.item.sourcePage}`
                    : ""}
                </span>
                <br />“{question.item.quote}”
              </blockquote>
              {!result.correct && (
                <div>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() =>
                      void window.mind
                        .invoke("errors:makeCard", { workspaceId, questionId: question.item.id })
                        .then((response) =>
                          setCardMessage(
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
                  {cardMessage && <span className="ok"> {cardMessage}</span>}
                </div>
              )}
              <div>
                <button type="button" className="btn" onClick={advance}>
                  {T.practiceNext}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
