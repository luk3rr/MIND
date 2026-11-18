/*
 * Filename: pages/PendingFeedbackPage.tsx
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useState } from "react";
import { FeedbackList } from "../components/FeedbackList.js";
import type { Feedback } from "../components/FeedbackList.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";

/** The feedback that is ready and not seen yet; opening the screen marks what it shows as seen. */
export function PendingFeedbackPage({ workspaceId }: { workspaceId: number }) {
  const { navigate } = useRouter();
  const [entries, setEntries] = useState<Feedback[] | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void window.mind.invoke("practice:openFeedback", { workspaceId }).then((response) => {
      if (!current) return;
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      setEntries(response.data.entries);
      setRemaining(response.data.remaining);
    });
    return () => {
      current = false;
    };
  }, [workspaceId]);

  const back = (): void => navigate(sectionPath(workspaceId, "today"));
  return (
    <section aria-labelledby="pending-title">
      <h1 id="pending-title">{T.pendingTitle}</h1>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {entries !== null && entries.length === 0 && (
        <div className="card stack">
          <p className="muted">{T.pendingEmpty}</p>
          <div>
            <button type="button" className="btn ghost" onClick={back}>
              {T.pendingBackToday}
            </button>
          </div>
        </div>
      )}
      {entries !== null && entries.length > 0 && (
        <>
          <p className="muted">{T.pendingIntro(entries.length)}</p>
          <FeedbackList
            workspaceId={workspaceId}
            entries={entries}
            title={T.pendingListTitle}
            backLabel={T.pendingBackToday}
            onBack={back}
          />
          {remaining > 0 && <p className="muted">{T.pendingMore(remaining)}</p>}
        </>
      )}
    </section>
  );
}
