/*
 * Filename: components/StudyTabs.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useRef } from "react";
import { useInvoke } from "../hooks.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { HelpTip } from "./HelpTip.js";

/**
 * The two ways to study, side by side: reviewing **cards** or practicing **questions**. The tab
 * that is open is marked, each shows how many items wait, and a line says what it does.
 * `activeCount` is the live count of the open tab, so the numbers follow the work.
 */
export function StudyTabs({
  workspaceId,
  active,
  activeCount,
}: {
  workspaceId: number;
  active: "cards" | "questions";
  activeCount: number | undefined;
}) {
  const { navigate } = useRouter();
  const cards = useInvoke("study:today", { workspaceId });
  const questions = useInvoke("practice:counts", { workspaceId });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    cards.reload();
    questions.reload();
    // Only a change of the live count asks for new numbers.
  }, [activeCount]);

  const cardCount = cards.state.status === "ready" ? cards.state.data.counts.toStudy : null;
  const questionCount = questions.state.status === "ready" ? questions.state.data.toPractice : null;
  const go = (mode: "cards" | "questions"): void => {
    if (mode === active) return;
    const base = sectionPath(workspaceId, "study");
    navigate(mode === "cards" ? base : `${base}/practice`, { replace: true });
  };
  const tab = (mode: "cards" | "questions", label: string, count: number | null) => (
    <button
      type="button"
      role="tab"
      className="study-tab"
      aria-selected={active === mode}
      tabIndex={active === mode ? 0 : -1}
      onClick={() => go(mode)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft")
          go(mode === "cards" ? "questions" : "cards");
      }}
    >
      {label}
      {count !== null && <span className="pill">{count}</span>}
    </button>
  );

  return (
    <div>
      <div className="study-tabs" role="tablist" aria-label={T.studyModes}>
        {tab("cards", T.studyTabCards, cardCount)}
        {tab("questions", T.studyTabQuestions, questionCount)}
      </div>
      <p className="muted">
        {active === "cards" ? T.studyCardsHint : T.studyQuestionsHint}{" "}
        <HelpTip
          title={active === "cards" ? T.helpCardsTitle : T.helpQuestionsTitle}
          lines={active === "cards" ? T.helpCardsLines : T.helpQuestionsLines}
        />
      </p>
    </div>
  );
}
