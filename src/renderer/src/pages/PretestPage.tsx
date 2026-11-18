/*
 * Filename: pages/PretestPage.tsx
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useRef, useState } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { ConfidencePicker } from "../components/ConfidencePicker.js";
import type { Confidence } from "../components/ConfidencePicker.js";
import { FeedbackList } from "../components/FeedbackList.js";
import { useInvoke } from "../hooks.js";
import { MathText } from "../MathText.js";
import { materialPath, sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";

type Round = OutputOf<"pretest:start">;
type Summary = OutputOf<"pretest:summary">;

/** A round in progress, kept while the app is open so leaving the screen does not lose it. */
interface Progress {
  count: number;
  round: Round;
  index: number;
  /** The farthest position the student reached; unanswered questions before it were skipped. */
  reached: number;
  /** Ids of the questions already answered; the others were skipped or not reached. */
  answeredIds: number[];
}
const inProgress = new Map<string, Progress>();
const keyOf = (workspaceId: number, materialId: number): string => `${workspaceId}:${materialId}`;

/** Forgets every round in progress (a test starts from a clean slate). */
export function forgetPretests(): void {
  inProgress.clear();
}

/** The size of the round the student left unfinished for a material, if there is one. */
export function unfinishedPretest(workspaceId: number, materialId: number): number | null {
  return inProgress.get(keyOf(workspaceId, materialId))?.count ?? null;
}

/**
 * A pre-test round: questions of a material answered before studying it. No key or comment is
 * shown until the end, and nothing here counts as practice. Skipped questions can be reached
 * again with Previous or from the end of the round.
 */
export function PretestPage({
  workspaceId,
  materialId,
  count,
}: {
  workspaceId: number;
  materialId: number;
  count: number;
}) {
  const { navigate } = useRouter();
  const settings = useInvoke("practice:settings", { workspaceId });
  const askConfidence =
    settings.state.status === "ready" && settings.state.data.settings.confidence;
  const saved = inProgress.get(keyOf(workspaceId, materialId));
  const resumed = saved !== undefined && saved.count === count ? saved : undefined;
  const [round, setRound] = useState<Round | null>(resumed?.round ?? null);
  // `index === questions.length` is the end of the round.
  const [index, setIndex] = useState(resumed?.index ?? 0);
  const [reached, setReached] = useState(resumed?.reached ?? 0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [answeredIds, setAnsweredIds] = useState<number[]>(resumed?.answeredIds ?? []);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsConfidence, setNeedsConfidence] = useState(false);
  const shownAt = useRef(0);

  // Keep the round while it is open; a finished one is forgotten.
  useEffect(() => {
    const key = keyOf(workspaceId, materialId);
    if (round && !summary) inProgress.set(key, { count, round, index, reached, answeredIds });
    else inProgress.delete(key);
  }, [workspaceId, materialId, count, round, index, reached, answeredIds, summary]);

  useEffect(() => {
    if (resumed) return;
    let current = true;
    void window.mind
      .invoke("pretest:start", { workspaceId, materialId, count })
      .then((response) => {
        if (!current) return;
        if (!response.ok) setError(response.error.message);
        else setRound(response.data);
      });
    return () => {
      current = false;
    };
  }, [workspaceId, materialId, count]);

  useEffect(() => {
    shownAt.current = performance.now();
  }, [index, round]);

  const questions = round?.questions ?? [];
  const question = questions[index];
  const isAnswered = (id: number): boolean => answeredIds.includes(id);
  // Skipped: passed over without an answer (the ones not reached yet are not skipped).
  const skipped = questions.filter(
    (candidate, position) => position < Math.max(reached, index) && !isAnswered(candidate.id),
  );
  const atEnd = round !== null && index >= questions.length;

  const goTo = (position: number): void => {
    setChosen(null);
    setConfidence(null);
    setNeedsConfidence(false);
    setError(null);
    setIndex(position);
    setReached((current) => Math.max(current, position));
  };

  /** Shows the summary of the answers so far; with none, there is nothing to show. */
  const finish = (given: number = answeredIds.length): void => {
    if (!round || given === 0) {
      navigate(sectionPath(workspaceId, "library"));
      return;
    }
    void window.mind
      .invoke("pretest:summary", { workspaceId, roundId: round.roundId })
      .then((response) => {
        if (!response.ok) setError(response.error.message);
        else setSummary(response.data);
      });
  };

  /** To the next question, or to the end of the round when it was the last one. */
  const forward = (given: number = answeredIds.length): void => {
    if (given === questions.length) finish(given);
    else if (index + 1 < questions.length) goTo(index + 1);
    else goTo(questions.length);
  };

  const submit = (): void => {
    if (!round || !question || !chosen) return;
    if (askConfidence && confidence === null) {
      setNeedsConfidence(true);
      return;
    }
    const seconds = Math.round(((performance.now() - shownAt.current) / 1000) * 10) / 10;
    void window.mind
      .invoke("pretest:answer", {
        workspaceId,
        roundId: round.roundId,
        itemId: question.id,
        answer: chosen,
        seconds,
        ...(askConfidence && confidence !== null ? { confidence } : {}),
      })
      .then((response) => {
        if (!response.ok) {
          setError(response.error.message);
          return;
        }
        setAnsweredIds((current) => [...current, question.id]);
        forward(answeredIds.length + 1);
      });
  };

  return (
    <section aria-labelledby="pretest-title">
      <h1 id="pretest-title">{T.pretestAction}</h1>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {summary ? (
        <>
          <p className="muted">{T.pretestSummaryNote}</p>
          <FeedbackList
            workspaceId={workspaceId}
            entries={summary.entries}
            title={T.pretestSummaryTitle}
            backLabel={T.pretestBackLibrary}
            allowMakeCard={false}
            onBack={() => navigate(sectionPath(workspaceId, "library"))}
          />
          <div className="actions">
            <button
              type="button"
              className="btn"
              onClick={() => navigate(materialPath(workspaceId, materialId))}
            >
              {T.pretestReadMaterial}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="alert warn" role="note">
            {T.pretestBanner}
          </div>
          {round && round.available < count && (
            <p className="muted">{T.pretestLimit(round.available)}</p>
          )}
          {atEnd && (
            <div className="card stack">
              <p className="muted">{T.pretestEndOfRound}</p>
              {skipped.length > 0 && <p>{T.pretestSkippedCount(skipped.length)}</p>}
              <div className="row">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => goTo(Math.max(questions.length - 1, 0))}
                >
                  {T.practicePrevious}
                </button>
                {skipped.length > 0 && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() =>
                      goTo(questions.findIndex((candidate) => !isAnswered(candidate.id)))
                    }
                  >
                    {T.pretestReviewSkipped}
                  </button>
                )}
                <button type="button" className="btn" onClick={() => finish()}>
                  {T.pretestSeeSummary}
                </button>
              </div>
            </div>
          )}
          {question && (
            <div className="card stack">
              <p className="muted">
                {question.topic ?? ""}
                {question.topic ? " · " : ""}
                {T.practicePosition(index + 1, questions.length)}
                {skipped.length > 0 && !isAnswered(question.id)
                  ? ` · ${T.pretestSkippedCount(skipped.length)}`
                  : ""}
              </p>
              <p>
                <strong>
                  <MathText text={question.statement} />
                </strong>
              </p>
              <div className="stack" role="radiogroup" aria-label={T.pretestAction}>
                {question.options.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={chosen === option.key}
                    disabled={isAnswered(question.id)}
                    className={`option${chosen === option.key ? " chosen" : ""}`}
                    onClick={() => setChosen(option.key)}
                  >
                    <strong>{option.key}</strong> · <MathText text={option.text} />
                  </button>
                ))}
              </div>
              {isAnswered(question.id) ? (
                <>
                  <p className="muted">{T.pretestAlreadyAnswered}</p>
                  <div className="row">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => goTo(index - 1)}
                      disabled={index === 0}
                    >
                      {T.practicePrevious}
                    </button>
                    <button type="button" className="btn" onClick={() => forward()}>
                      {T.practiceNext}
                    </button>
                    <button type="button" className="btn ghost" onClick={() => finish()}>
                      {T.pretestEnd}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {askConfidence && (
                    <ConfidencePicker
                      value={confidence}
                      onChange={(level) => {
                        setConfidence(level);
                        setNeedsConfidence(false);
                      }}
                    />
                  )}
                  {needsConfidence && (
                    <p role="alert" className="alert">
                      {T.confidenceNeeded}
                    </p>
                  )}
                  <div className="row">
                    <button
                      type="button"
                      className="btn"
                      disabled={chosen === null}
                      onClick={submit}
                    >
                      {T.practiceAnswer}
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => goTo(index - 1)}
                      disabled={index === 0}
                    >
                      {T.practicePrevious}
                    </button>
                    <button type="button" className="btn ghost" onClick={() => forward()}>
                      {T.practiceSkip}
                    </button>
                    <button type="button" className="btn ghost" onClick={() => finish()}>
                      {T.pretestEnd}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
