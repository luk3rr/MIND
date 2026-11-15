/*
 * Filename: pages/PracticePage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { FilterSelect, parseFilter } from "../components/FilterSelect.js";
import { SeeInPdf } from "../components/SeeInPdf.js";
import { StudyTabs } from "../components/StudyTabs.js";
import { useHotkeys, useInvoke } from "../hooks.js";
import { MathText } from "../MathText.js";
import { T } from "../strings.js";
import { useActivity } from "../time.js";

type Next = OutputOf<"practice:next">;
type Counts = Next["counts"];
type Question = NonNullable<Next["question"]>;
type Result = OutputOf<"practice:answer">;

/** A question of this session with what the person did on it, so they can leave and come back. */
interface Entry {
  question: Question;
  chosen: string | null;
  result: Result | null;
  cardMessage: string | null;
}

/**
 * Answers approved questions with the correction, comments and source. The session is a list of
 * the questions already shown: **Skip** moves on without answering, **Previous** goes back to
 * one (answered or not), and the skipped ones can be picked up again at the end.
 */
export function PracticePage({ workspaceId }: { workspaceId: number }) {
  const facets = useInvoke("practice:facets", { workspaceId });
  const [filterValue, setFilterValue] = useState("");
  const filter = parseFilter(filterValue);
  const [redo, setRedo] = useState(false);
  const [deck, setDeck] = useState<Entry[]>([]);
  // `index === deck.length` is the end of the queue.
  const [index, setIndex] = useState(0);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(0);
  const generation = useRef(0);

  const entry = deck[index];
  const question = entry?.question;
  useActivity("practice", question ? { itemId: question.item.id } : {});

  /** Asks for the next question that is not in `shown`; null means the queue is over. */
  const fetchNext = useCallback(
    (shown: Entry[], from: number): void => {
      const mine = generation.current;
      const exclude = shown.map((candidate) => candidate.question.item.id);
      void window.mind
        .invoke("practice:next", {
          workspaceId,
          redo,
          ...(filter ? { filter } : {}),
          ...(exclude.length > 0 ? { exclude } : {}),
        })
        .then((response) => {
          if (mine !== generation.current) return;
          setLoaded(true);
          if (!response.ok) {
            setError(response.error.message);
            return;
          }
          setError(null);
          setCounts(response.data.counts);
          if (response.data.question) {
            setDeck([
              ...shown,
              { question: response.data.question, chosen: null, result: null, cardMessage: null },
            ]);
            setIndex(from);
          } else {
            setExhausted(true);
            setIndex(shown.length);
          }
        });
    },
    // `filter` is derived from `filterValue`; the value is the dependency.
    [workspaceId, redo, filterValue],
  );

  // A new filter or the redo option starts the session over.
  useEffect(() => {
    generation.current += 1;
    setDeck([]);
    setIndex(0);
    setExhausted(false);
    setLoaded(false);
    fetchNext([], 0);
  }, [fetchNext]);

  // The time spent on a question counts from the moment it is shown again.
  useEffect(() => {
    shownAt.current = performance.now();
  }, [index, question?.item.id]);

  const update = (position: number, patch: Partial<Entry>): void => {
    setDeck((current) =>
      current.map((candidate, at) => (at === position ? { ...candidate, ...patch } : candidate)),
    );
  };

  const submit = (answer: string | null = entry?.chosen ?? null): void => {
    if (!entry || !answer || entry.result) return;
    const at = index;
    const seconds = Math.round(((performance.now() - shownAt.current) / 1000) * 10) / 10;
    void window.mind
      .invoke("practice:answer", {
        workspaceId,
        itemId: entry.question.item.id,
        answer,
        seconds,
      })
      .then((response) => {
        if (!response.ok) setError(response.error.message);
        else update(at, { result: response.data });
      });
  };

  /** To the next question of the session, asking for a new one when there is none ahead. */
  const forward = (): void => {
    if (index < deck.length - 1) setIndex(index + 1);
    else if (exhausted) setIndex(deck.length);
    else fetchNext(deck, deck.length);
  };
  const previous = (): void => {
    if (index > 0) setIndex(index - 1);
  };
  const skipped = deck.filter((candidate) => candidate.result === null).length;
  const firstSkipped = deck.findIndex((candidate) => candidate.result === null);

  const keys = question?.item.options.map((option) => option.key) ?? [];
  const answered = entry?.result !== null && entry?.result !== undefined;
  useHotkeys(
    {
      ...Object.fromEntries([
        ...keys.map(
          (key, position) =>
            [String(position + 1), () => !answered && update(index, { chosen: key })] as const,
        ),
        ["enter", () => (answered ? forward() : submit())] as const,
      ]),
      arrowright: forward,
      arrowleft: previous,
    },
    question !== undefined,
  );

  return (
    <section aria-labelledby="practice-title">
      <h1 id="practice-title">{T.study}</h1>
      <StudyTabs
        workspaceId={workspaceId}
        active="questions"
        activeCount={counts ? counts.unseen + counts.retry : undefined}
      />
      <h2>{T.practiceTitle}</h2>
      {facets.state.status === "ready" && (
        <FilterSelect
          facets={facets.state.data}
          value={filterValue}
          onChange={setFilterValue}
          kind="questions"
        />
      )}
      {counts && (
        <p className="muted">
          {T.practiceCounts(counts.unseen, counts.retry)} ·{" "}
          {T.practiceAnsweredToday(counts.answeredToday, counts.correctToday)}
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
      {loaded && !question && (
        <div className="card stack">
          <p className="muted">{deck.length === 0 ? T.practiceNoQuestions : T.practiceEnd}</p>
          {skipped > 0 && (
            <div className="row" style={{ alignItems: "center" }}>
              <span className="muted">{T.practiceSkippedCount(skipped)}</span>
              <button type="button" className="btn ghost" onClick={() => setIndex(firstSkipped)}>
                {T.practiceReviewSkipped}
              </button>
            </div>
          )}
          {deck.length > 0 && (
            <div>
              <button type="button" className="btn ghost" onClick={() => setIndex(deck.length - 1)}>
                {T.practicePrevious}
              </button>
            </div>
          )}
        </div>
      )}
      {question && entry && (
        <div className="card stack">
          <p className="muted">
            {question.item.topic ?? ""}
            {question.item.topic ? " · " : ""}
            {T.practicePosition(index + 1, deck.length)}
            {!answered && skipped > 1 ? ` · ${T.practiceSkippedCount(skipped)}` : ""}
          </p>
          <p>
            <strong>
              <MathText text={question.item.front} />
            </strong>
          </p>
          <div className="stack" role="radiogroup" aria-label={T.practiceTitle}>
            {question.item.options.map((option, position) => {
              const result = entry.result;
              const isAnswer = result?.correctKey === option.key;
              const isWrongChoice =
                result !== null && result.answer === option.key && !result.correct;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={entry.chosen === option.key || result?.answer === option.key}
                  disabled={result !== null}
                  className={`option${entry.chosen === option.key ? " chosen" : ""}${isAnswer ? " right" : ""}${isWrongChoice ? " wrong" : ""}`}
                  onClick={() => update(index, { chosen: option.key })}
                >
                  <strong>{option.key}</strong> · <MathText text={option.text} />
                  <span className="muted"> ({position + 1})</span>
                  {result && option.why && <span className="muted"> — {option.why}</span>}
                </button>
              );
            })}
          </div>
          {!entry.result && (
            <div className="row" style={{ alignItems: "center" }}>
              <button
                type="button"
                className="btn"
                disabled={entry.chosen === null}
                onClick={() => submit()}
              >
                {T.practiceAnswer}
              </button>
              <button type="button" className="btn ghost" onClick={previous} disabled={index === 0}>
                {T.practicePrevious}
              </button>
              <button type="button" className="btn ghost" onClick={forward}>
                {T.practiceSkip}
              </button>
            </div>
          )}
          {entry.result && (
            <div role="status" className="stack">
              <p className={entry.result.correct ? "ok" : "alert"}>
                {entry.result.correct ? T.practiceCorrect : T.practiceWrong} {T.practiceRight}:{" "}
                {entry.result.correctKey}
              </p>
              <p>
                <MathText text={entry.result.explanation} />
              </p>
              <blockquote className="source">
                <span className="muted">
                  {T.source}: {question.item.sourceTitle}
                  {question.item.sourcePage !== null
                    ? `, ${T.page} ${question.item.sourcePage}`
                    : ""}
                </span>
                <br />“{question.item.quote}”
                {question.item.pdfSource && (
                  <>
                    <br />
                    <SeeInPdf workspaceId={workspaceId} {...question.item.pdfSource} />
                  </>
                )}
              </blockquote>
              {!entry.result.correct && (
                <div>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() =>
                      void window.mind
                        .invoke("errors:makeCard", { workspaceId, questionId: question.item.id })
                        .then((response) =>
                          update(index, {
                            cardMessage: response.ok
                              ? response.data.created
                                ? T.cardMade
                                : T.cardExists
                              : response.error.message,
                          }),
                        )
                    }
                  >
                    {T.makeCard}
                  </button>
                  {entry.cardMessage && <span className="ok"> {entry.cardMessage}</span>}
                </div>
              )}
              <div className="row">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={previous}
                  disabled={index === 0}
                >
                  {T.practicePrevious}
                </button>
                <button type="button" className="btn" onClick={forward}>
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
