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

/**
 * A pre-test round: questions of a material answered before studying it. No key or comment is
 * shown until the end, and nothing here counts as practice.
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
  const [round, setRound] = useState<Round | null>(null);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [answered, setAnswered] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(0);

  useEffect(() => {
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

  const finish = (): void => {
    if (!round || answered === 0) {
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

  const next = (counted: number): void => {
    setChosen(null);
    setConfidence(null);
    if (round && index + 1 < round.questions.length) setIndex(index + 1);
    else if (counted > 0) {
      void window.mind
        .invoke("pretest:summary", { workspaceId, roundId: round?.roundId ?? "" })
        .then((response) => {
          if (!response.ok) setError(response.error.message);
          else setSummary(response.data);
        });
    } else navigate(sectionPath(workspaceId, "library"));
  };

  const submit = (): void => {
    const question = round?.questions[index];
    if (!round || !question || !chosen) return;
    if (askConfidence && confidence === null) return;
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
        setError(null);
        setAnswered((total) => total + 1);
        next(answered + 1);
      });
  };

  const question = round?.questions[index];
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
          {question && round && (
            <div className="card stack">
              <p className="muted">
                {question.topic ?? ""}
                {question.topic ? " · " : ""}
                {T.practicePosition(index + 1, round.questions.length)}
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
                    className={`option${chosen === option.key ? " chosen" : ""}`}
                    onClick={() => setChosen(option.key)}
                  >
                    <strong>{option.key}</strong> · <MathText text={option.text} />
                  </button>
                ))}
              </div>
              {askConfidence && <ConfidencePicker value={confidence} onChange={setConfidence} />}
              <div className="row">
                <button
                  type="button"
                  className="btn"
                  disabled={chosen === null || (askConfidence && confidence === null)}
                  onClick={submit}
                >
                  {T.practiceAnswer}
                </button>
                <button type="button" className="btn ghost" onClick={() => next(answered)}>
                  {T.practiceSkip}
                </button>
                <button type="button" className="btn ghost" onClick={finish}>
                  {T.pretestEnd}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
