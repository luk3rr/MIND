/*
 * Filename: pages/PracticePage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { FilterSelect, parseFilter, usePersistedFilter } from "../components/FilterSelect.js";
import { ConfidencePicker } from "../components/ConfidencePicker.js";
import type { Confidence } from "../components/ConfidencePicker.js";
import { FeedbackEntry, FeedbackList } from "../components/FeedbackList.js";
import type { Feedback } from "../components/FeedbackList.js";
import { ItemActions } from "../components/ItemActions.js";
import { MixControl, useMix } from "../components/MixControl.js";
import { StudyTabs } from "../components/StudyTabs.js";
import { useHotkeys, useInvoke } from "../hooks.js";
import { MathText } from "../MathText.js";
import { T } from "../strings.js";
import { useActivity } from "../time.js";

type Next = OutputOf<"practice:next">;
type Counts = Next["counts"];
type Question = NonNullable<Next["question"]>;

/** A question of this session with what the person did on it, so they can leave and come back. */
interface Entry {
  question: Question;
  /** The group of the question in a mixed queue, so the rotation continues from it. */
  mixKey: string | null;
  chosen: string | null;
  /** How sure the student said they were, when the workspace asks for it. */
  confidence: Confidence | null;
  /** The answer given, once there is one; its feedback may still be waiting for the block. */
  answered: { answer: string; attemptId: number; releaseAt: string | null } | null;
  feedback: Feedback | null;
  cardMessage: string | null;
}

/**
 * Answers approved questions with the correction, comments and source. The session is a list of
 * the questions already shown: **Skip** moves on without answering, **Previous** goes back to
 * one (answered or not), and the skipped ones can be picked up again at the end.
 */
export function PracticePage({ workspaceId }: { workspaceId: number }) {
  const facets = useInvoke("practice:facets", { workspaceId });
  const [filterValue, setFilterValue] = usePersistedFilter(
    `mind.filter.${workspaceId}.study-questions`,
  );
  const filter = parseFilter(filterValue);
  const mix = useMix(workspaceId, filter !== undefined);
  const practiceSettings = useInvoke("practice:settings", { workspaceId });
  const askConfidence =
    practiceSettings.state.status === "ready" && practiceSettings.state.data.settings.confidence;
  const [redo, setRedo] = useState(false);
  const [deck, setDeck] = useState<Entry[]>([]);
  // `index === deck.length` is the end of the queue.
  const [index, setIndex] = useState(0);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The feedback of the block, once released: it replaces the questions on the screen.
  const [block, setBlock] = useState<Feedback[] | null>(null);
  const [needsConfidence, setNeedsConfidence] = useState(false);
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
          ...(mix.request
            ? { mix: { by: mix.request.by, afterKey: shown.at(-1)?.mixKey ?? null } }
            : {}),
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
              {
                question: response.data.question,
                mixKey: response.data.mixKey,
                chosen: null,
                confidence: null,
                answered: null,
                feedback: null,
                cardMessage: null,
              },
            ]);
            setIndex(from);
          } else {
            setExhausted(true);
            setIndex(shown.length);
          }
        });
    },
    // `filter` is derived from `filterValue`; the value is the dependency.
    [workspaceId, redo, filterValue, mix.on, mix.by],
  );

  // A new filter or the redo option starts the session over.
  // Feedback of a block left unfinished is released when the practice opens again.
  useEffect(() => {
    void window.mind.invoke("practice:releaseAbandoned", { workspaceId });
  }, [workspaceId]);

  const restart = useCallback((): void => {
    generation.current += 1;
    setDeck([]);
    setIndex(0);
    setExhausted(false);
    setLoaded(false);
    setBlock(null);
    fetchNext([], 0);
  }, [fetchNext]);
  useEffect(() => restart(), [restart]);

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
    if (!entry || !answer || entry.answered) return;
    if (askConfidence && entry.confidence === null) {
      setNeedsConfidence(true);
      return;
    }
    const at = index;
    const seconds = Math.round(((performance.now() - shownAt.current) / 1000) * 10) / 10;
    void window.mind
      .invoke("practice:answer", {
        workspaceId,
        itemId: entry.question.item.id,
        answer,
        seconds,
        ...(askConfidence && entry.confidence !== null ? { confidence: entry.confidence } : {}),
      })
      .then((response) => {
        if (!response.ok) setError(response.error.message);
        else {
          update(at, {
            answered: {
              answer,
              attemptId: response.data.attemptId,
              releaseAt: response.data.releaseAt,
            },
            feedback: response.data.feedback,
          });
        }
      });
  };

  /** Answers given in this session whose feedback still waits for the end of the block. */
  const waiting = deck.filter(
    (candidate) =>
      candidate.answered && !candidate.feedback && candidate.answered.releaseAt === null,
  );

  /** Releases the feedback of the waiting answers and shows it, ending the block. */
  const releaseBlock = (): void => {
    const ids = waiting.map((candidate) => candidate.answered?.attemptId as number);
    if (ids.length === 0) return;
    void window.mind
      .invoke("practice:releaseBlock", { workspaceId, attemptIds: ids })
      .then((response) => {
        if (!response.ok) {
          setError(response.error.message);
          return;
        }
        const byAttempt = new Map(response.data.entries.map((entry) => [entry.attemptId, entry]));
        setDeck((current) =>
          current.map((candidate) =>
            candidate.answered && !candidate.feedback && candidate.answered.releaseAt === null
              ? { ...candidate, feedback: byAttempt.get(candidate.answered.attemptId) ?? null }
              : candidate,
          ),
        );
        setBlock(response.data.entries);
      });
  };

  // At the end of the queue the waiting feedback is released by itself.
  const releasing = useRef(false);
  const atEnd = loaded && exhausted && index >= deck.length;
  useEffect(() => {
    if (!atEnd || waiting.length === 0 || block || releasing.current) return;
    releasing.current = true;
    releaseBlock();
  }, [atEnd, waiting.length, block]);
  useEffect(() => {
    if (waiting.length === 0) releasing.current = false;
  }, [waiting.length]);

  /** To the next question of the session, asking for a new one when there is none ahead. */
  const forward = (): void => {
    if (index < deck.length - 1) setIndex(index + 1);
    else if (exhausted) setIndex(deck.length);
    else fetchNext(deck, deck.length);
  };
  const previous = (): void => {
    if (index > 0) setIndex(index - 1);
  };
  /** Takes the question out of the session after it was discarded, and moves to the next one. */
  const dropCurrent = (): void => {
    const rest = deck.filter((_, at) => at !== index);
    setDeck(rest);
    if (index < rest.length) return;
    if (exhausted) setIndex(rest.length);
    else fetchNext(rest, rest.length);
  };
  /** Shows the text of the question after an edit, including the comment of an answered one. */
  const refreshCurrent = (): void => {
    const at = index;
    const itemId = question?.item.id;
    if (itemId === undefined) return;
    void window.mind.invoke("review:get", { workspaceId, itemId }).then((response) => {
      if (!response.ok) return;
      const fresh = response.data.item;
      setDeck((current) =>
        current.map((candidate, position) =>
          position === at
            ? {
                ...candidate,
                question: {
                  ...candidate.question,
                  item: { ...candidate.question.item, statement: fresh.front },
                },
                feedback: candidate.feedback
                  ? { ...candidate.feedback, statement: fresh.front, explanation: fresh.back }
                  : candidate.feedback,
              }
            : candidate,
        ),
      );
    });
  };
  const skipped = deck.filter((candidate) => candidate.answered === null).length;
  const firstSkipped = deck.findIndex((candidate) => candidate.answered === null);

  const keys = question?.item.options.map((option) => option.key) ?? [];
  const answered = entry?.answered !== null && entry?.answered !== undefined;
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
    question !== undefined && block === null,
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
      <MixControl mix={mix} />
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
      {block && (
        <FeedbackList
          workspaceId={workspaceId}
          entries={block}
          onBack={() => setBlock(null)}
          onNewBlock={restart}
        />
      )}
      {!block && loaded && !question && (
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
      {!block && question && entry && (
        <div className="card stack">
          <p className="muted">
            {question.item.topic ?? ""}
            {question.item.topic ? " · " : ""}
            {T.practicePosition(index + 1, deck.length)}
            {!answered && skipped > 1 ? ` · ${T.practiceSkippedCount(skipped)}` : ""}
          </p>
          <p>
            <strong>
              <MathText text={question.item.statement} />
            </strong>
          </p>
          <div className="stack" role="radiogroup" aria-label={T.practiceTitle}>
            {question.item.options.map((option, position) => {
              const feedback = entry.feedback;
              const isAnswer = feedback?.correctKey === option.key;
              const isWrongChoice =
                feedback !== null && feedback.answer === option.key && !feedback.correct;
              const why = feedback?.options.find((candidate) => candidate.key === option.key)?.why;
              const given = entry.answered?.answer === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={entry.chosen === option.key || given}
                  disabled={answered}
                  className={`option${entry.chosen === option.key || given ? " chosen" : ""}${isAnswer ? " right" : ""}${isWrongChoice ? " wrong" : ""}`}
                  onClick={() => update(index, { chosen: option.key })}
                >
                  <strong>{option.key}</strong> · <MathText text={option.text} />
                  <span className="muted"> ({position + 1})</span>
                  {why && <span className="muted"> — {why}</span>}
                </button>
              );
            })}
          </div>
          {!entry.answered && askConfidence && (
            <ConfidencePicker
              value={entry.confidence}
              onChange={(level) => {
                setNeedsConfidence(false);
                update(index, { confidence: level });
              }}
            />
          )}
          {!entry.answered && askConfidence && needsConfidence && entry.confidence === null && (
            <p role="alert" className="alert">
              {T.confidenceNeeded}
            </p>
          )}
          {!entry.answered && (
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
          {entry.answered && !entry.feedback && (
            <div role="status" className="stack">
              <p className="muted">
                {entry.answered.releaseAt === null
                  ? T.practiceRegistered
                  : T.practiceRegisteredNextDay}
              </p>
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
                {entry.answered.releaseAt === null && (
                  <button type="button" className="btn ghost" onClick={releaseBlock}>
                    {T.practiceSeeFeedbackNow}
                  </button>
                )}
              </div>
            </div>
          )}
          {entry.answered && entry.feedback && (
            <div role="status" className="stack">
              <FeedbackEntry
                workspaceId={workspaceId}
                entry={entry.feedback}
                message={entry.cardMessage}
                onMessage={(text) => update(index, { cardMessage: text })}
              />
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
                <ItemActions
                  workspaceId={workspaceId}
                  itemId={question.item.id}
                  onEdited={refreshCurrent}
                  onDiscarded={dropCurrent}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
