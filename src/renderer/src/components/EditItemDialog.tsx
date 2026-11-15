/*
 * Filename: components/EditItemDialog.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import type { FormEvent } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { useInvoke } from "../hooks.js";
import { T } from "../strings.js";
import { SearchCombobox } from "./SearchCombobox.js";
import { Dialog } from "./Dialog.js";

type Item = OutputOf<"review:list">["items"][number];

/** Edits the text and topic of a draft or approved item. */
export function EditItemDialog({
  item,
  workspaceId,
  onClose,
  onSaved,
}: {
  item: Item;
  workspaceId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [front, setFront] = useState(item.front);
  const [back, setBack] = useState(item.back);
  const [topic, setTopic] = useState(item.topic ?? "");
  const [options, setOptions] = useState(item.options);
  const [answer, setAnswer] = useState(item.answer ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const topics = useInvoke("topics:list", { workspaceId });
  const isQuestion = item.kind === "question";
  // True/false only has a verdict to choose; the other questions have texts to rewrite as well.
  const rewritable = isQuestion && item.subtype !== "certo_errado";

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const result = await window.mind.invoke("review:edit", {
      workspaceId,
      itemId: item.id,
      front,
      back,
      topic: topic.trim() || null,
      ...(isQuestion && options.length > 0 ? { answer, ...(rewritable ? { options } : {}) } : {}),
    });
    if (!result.ok) {
      setErrors(Object.fromEntries((result.error.fields ?? []).map((f) => [f.field, f.message])));
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Dialog title={T.edit} onClose={onClose} wide>
      <form onSubmit={(event) => void save(event)} className="stack">
        <div className="field">
          <label htmlFor="edit-front">
            {item.kind === "question" ? T.editStatement : T.editFront}
          </label>
          <textarea
            id="edit-front"
            rows={3}
            value={front}
            onChange={(event) => setFront(event.target.value)}
          />
          {errors["front"] && (
            <p className="field-error" role="alert">
              {errors["front"]}
            </p>
          )}
        </div>
        {isQuestion && options.length > 0 && (
          <fieldset className="field edit-options">
            <legend>{T.editOptions}</legend>
            {options.map((option, index) => (
              <div key={option.key} className="stack">
                <div className="row">
                  <input
                    type="radio"
                    name="edit-answer"
                    value={option.key}
                    checked={answer === option.key}
                    aria-label={T.editCorrect(option.key)}
                    onChange={() => setAnswer(option.key)}
                    style={{ width: "auto" }}
                  />
                  <strong>{option.key}</strong>
                  {rewritable ? (
                    <input
                      aria-label={T.editOptionText(option.key)}
                      value={option.text}
                      onChange={(event) =>
                        setOptions((all) =>
                          all.map((o, i) => (i === index ? { ...o, text: event.target.value } : o)),
                        )
                      }
                    />
                  ) : (
                    <span>{option.text}</span>
                  )}
                </div>
                {rewritable && (
                  <textarea
                    rows={2}
                    aria-label={T.editOptionWhy(option.key)}
                    placeholder={T.editOptionWhyPlaceholder}
                    value={option.why}
                    onChange={(event) =>
                      setOptions((all) =>
                        all.map((o, i) => (i === index ? { ...o, why: event.target.value } : o)),
                      )
                    }
                  />
                )}
                {errors[`option:${option.key}`] && (
                  <p className="field-error" role="alert">
                    {errors[`option:${option.key}`]}
                  </p>
                )}
              </div>
            ))}
            {(errors["answer"] || errors["options"]) && (
              <p className="field-error" role="alert">
                {errors["answer"] ?? errors["options"]}
              </p>
            )}
          </fieldset>
        )}
        <div className="field">
          <label htmlFor="edit-back">{item.kind === "question" ? T.editComment : T.editBack}</label>
          <textarea
            id="edit-back"
            rows={3}
            value={back}
            onChange={(event) => setBack(event.target.value)}
          />
          {errors["back"] && (
            <p className="field-error" role="alert">
              {errors["back"]}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="edit-topic">{T.editTopic}</label>
          <SearchCombobox
            inputId="edit-topic"
            label={T.editTopic}
            placeholder={T.editTopicPlaceholder}
            options={
              topics.state.status === "ready"
                ? topics.state.data.topics.map((t) => ({
                    key: t.id,
                    label: t.name,
                    count: t.cards + t.questions,
                  }))
                : []
            }
            text={topic}
            onText={setTopic}
          />
          <p className="muted">{T.editTopicHint}</p>
        </div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {T.cancel}
          </button>
          <button type="submit" className="btn">
            {T.save}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
