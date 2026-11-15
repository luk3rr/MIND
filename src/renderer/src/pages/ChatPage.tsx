/*
 * Filename: pages/ChatPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { SemanticPanel } from "../components/SemanticPanel.js";
import { useInvoke } from "../hooks.js";
import { MathText } from "../MathText.js";
import { materialPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { SeeInPdf } from "../components/SeeInPdf.js";

type Reply = OutputOf<"chat:ask">;

/** Asks the knowledge base: answers only from the retrieved excerpts, with verified citations. */
export function ChatPage({ workspaceId }: { workspaceId: number }) {
  const { navigate } = useRouter();
  const history = useInvoke("chat:history", { workspaceId });
  const library = useInvoke("material:list", { workspaceId });
  const kinds = new Map(
    library.state.status === "ready"
      ? library.state.data.materials.map((entry) => [entry.id, entry.kind] as const)
      : [],
  );
  const [messages, setMessages] = useState<Reply[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (history.state.status === "ready") setMessages(history.state.data.messages);
  }, [history.state]);

  const ask = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await window.mind.invoke("chat:ask", { workspaceId, question });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.fields?.[0]?.message ?? result.error.message);
      return;
    }
    setMessages((current) => [...current, result.data]);
    setQuestion("");
  };

  return (
    <section aria-labelledby="chat-title">
      <h1 id="chat-title">{T.chatTitle}</h1>
      <p className="muted">{T.chatHint}</p>
      <SemanticPanel workspaceId={workspaceId} />
      <form className="card stack" onSubmit={(event) => void ask(event)}>
        <div className="field">
          <label htmlFor="chat-question">{T.chatQuestion}</label>
          <textarea
            id="chat-question"
            rows={3}
            maxLength={1000}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="row">
          <button type="submit" className="btn" disabled={busy || !question.trim()}>
            {T.chatAsk}
          </button>
          {busy && (
            <span className="muted" role="status">
              {T.chatAsking}
            </span>
          )}
        </div>
      </form>
      {messages.length === 0 && history.state.status === "ready" && (
        <p className="muted">{T.chatEmpty}</p>
      )}
      <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
        {[...messages].reverse().map((message) => (
          <li key={message.id} className="card">
            <p>
              <strong>{message.question}</strong>
            </p>
            {message.supported ? (
              <p style={{ whiteSpace: "pre-wrap" }}>
                <MathText text={message.answer} />
              </p>
            ) : (
              <p className="alert" role="note">
                <strong>{T.chatNoSupport}.</strong> {message.answer}
              </p>
            )}
            {message.citations.length > 0 && (
              <div>
                <p className="muted">{T.chatCitations}</p>
                <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
                  {message.citations.map((citation) => (
                    <li key={`${citation.chunkId}-${citation.quote}`}>
                      <blockquote className="source">“{citation.quote}”</blockquote>
                      <button
                        type="button"
                        className="link"
                        onClick={() =>
                          navigate(materialPath(workspaceId, citation.materialId, citation.chunkId))
                        }
                      >
                        {T.chatOpenSource}: {citation.materialTitle}
                        {citation.page !== null ? `, ${T.page} ${citation.page}` : ""}
                      </button>{" "}
                      {citation.page !== null && kinds.get(citation.materialId) === "pdf" && (
                        <SeeInPdf
                          workspaceId={workspaceId}
                          materialId={citation.materialId}
                          page={citation.page}
                          quote={citation.quote}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
      {messages.length > 0 && (
        <button type="button" className="btn ghost" onClick={() => setConfirmClear(true)}>
          {T.chatClear}
        </button>
      )}
      {confirmClear && (
        <ConfirmDialog
          title={T.chatClearTitle}
          body={T.chatClearBody}
          confirmLabel={T.chatClear}
          onClose={() => setConfirmClear(false)}
          onConfirm={() => {
            void window.mind.invoke("chat:clear", { workspaceId }).then((result) => {
              if (result.ok) setMessages([]);
            });
          }}
        />
      )}
    </section>
  );
}
