/*
 * Filename: components/WeakTopics.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { OutputOf } from "../../../core/contracts/index.js";
import { trainPath, useRouter } from "../router.js";
import { T } from "../strings.js";

type TopicStat = OutputOf<"stats:overview">["weakest"][number];

/** The topics with the lowest accuracy, each with a button that opens a pre-filled Generate. */
export function WeakTopics({
  workspaceId,
  topics,
}: {
  workspaceId: number;
  topics: readonly TopicStat[];
}) {
  const { navigate } = useRouter();
  const trainable = topics.filter((t) => t.topicId !== null && t.name !== null);
  if (trainable.length === 0) return null;
  return (
    <section className="card" aria-labelledby="weak-title" style={{ marginTop: 16 }}>
      <h2 id="weak-title">{T.weakTitle}</h2>
      <p className="muted">{T.weakHint}</p>
      <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
        {trainable.map((topic) => (
          <li key={topic.topicId} className="row" style={{ justifyContent: "space-between" }}>
            <span>
              <strong>{topic.name}</strong>
              <span className="muted">
                {" "}
                · {T.weakAccuracy(Math.round((topic.accuracy ?? 0) * 100), topic.events)}
              </span>
            </span>
            <button
              type="button"
              className="btn ghost"
              aria-label={`${T.weakTrain} ${topic.name}`}
              onClick={() => navigate(trainPath(workspaceId, topic.topicId as number))}
            >
              {T.weakTrain}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
