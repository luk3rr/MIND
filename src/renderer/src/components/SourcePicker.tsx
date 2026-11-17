/*
 * Filename: components/SourcePicker.tsx
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import { useInvoke } from "../hooks.js";
import { T } from "../strings.js";

/** The source a person is typing: the material, an optional page and the quoted text. */
export interface SourceValue {
  materialId: number | null;
  page: string;
  quote: string;
}

export const EMPTY_SOURCE: SourceValue = { materialId: null, page: "", quote: "" };

/** The page typed as a number, or null when it is empty or not a positive whole number. */
export function pageOf(value: SourceValue): number | null {
  const page = Number(value.page);
  return value.page.trim() !== "" && Number.isInteger(page) && page >= 1 ? page : null;
}

type Check = "full" | "partial" | "none";

/**
 * Lets a person tie an item to a material, a page and a quote, or leave it with no source. It is
 * optional: with no value it only offers to add one.
 */
export function SourcePicker({
  workspaceId,
  value,
  onChange,
  errors,
}: {
  workspaceId: number;
  value: SourceValue | null;
  onChange: (next: SourceValue | null) => void;
  errors: { material?: string | undefined; quote?: string | undefined };
}) {
  const materials = useInvoke("material:list", { workspaceId });
  const [check, setCheck] = useState<Check | null>(null);

  if (value === null) {
    return (
      <div className="field">
        <span className="pill">{T.sourceNone}</span>{" "}
        <button type="button" className="btn ghost sm" onClick={() => onChange(EMPTY_SOURCE)}>
          {T.sourceAdd}
        </button>
      </div>
    );
  }

  const change = (next: Partial<SourceValue>): void => {
    setCheck(null);
    onChange({ ...value, ...next });
  };
  const verify = async (): Promise<void> => {
    if (value.materialId === null || !value.quote.trim()) return;
    const result = await window.mind.invoke("source:resolve", {
      workspaceId,
      materialId: value.materialId,
      page: pageOf(value),
      text: value.quote,
    });
    if (result.ok) setCheck(result.data.match);
  };
  const options =
    materials.state.status === "ready"
      ? materials.state.data.materials.filter((m) => m.status === "indexed")
      : [];

  return (
    <fieldset className="field stack">
      <legend>{T.sourceLegend}</legend>
      <div className="field">
        <label htmlFor="source-material">{T.sourceMaterial}</label>
        <select
          id="source-material"
          value={value.materialId ?? ""}
          onChange={(event) =>
            change({ materialId: event.target.value === "" ? null : Number(event.target.value) })
          }
        >
          <option value="">{T.sourceMaterialPlaceholder}</option>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
        {errors.material && (
          <p className="field-error" role="alert">
            {errors.material}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="source-page">{T.sourcePage}</label>
        <input
          id="source-page"
          inputMode="numeric"
          value={value.page}
          onChange={(event) => change({ page: event.target.value.replace(/\D/g, "") })}
        />
      </div>
      <div className="field">
        <label htmlFor="source-quote">{T.sourceQuote}</label>
        <textarea
          id="source-quote"
          rows={3}
          maxLength={2000}
          value={value.quote}
          onChange={(event) => change({ quote: event.target.value })}
        />
        {errors.quote && (
          <p className="field-error" role="alert">
            {errors.quote}
          </p>
        )}
      </div>
      {check && (
        <p role="status" className={check === "full" ? "muted" : "field-error"}>
          {check === "full"
            ? T.sourceFull
            : check === "partial"
              ? T.sourcePartial
              : T.sourceNotFound}
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          className="btn ghost sm"
          disabled={value.materialId === null || !value.quote.trim()}
          onClick={() => void verify()}
        >
          {T.sourceVerify}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => onChange(null)}>
          {T.sourceRemove}
        </button>
      </div>
    </fieldset>
  );
}
