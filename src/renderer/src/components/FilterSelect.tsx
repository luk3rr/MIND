/*
 * Filename: components/FilterSelect.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useState } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { T } from "../strings.js";
import { SearchCombobox } from "./SearchCombobox.js";

export type Facets = OutputOf<"study:today">["facets"];
export type StudyFilter = { topicId?: number; materialId?: number; subtype?: string };

/** The filter as one string: `topic:3|material:2|subtype:qa`, with only the parts in use. */
export function parseFilter(value: string): StudyFilter | undefined {
  const filter: StudyFilter = {};
  for (const part of value.split("|")) {
    const [kind, id] = part.split(":");
    if (!kind || !id) continue;
    if (kind === "topic" && Number.isInteger(Number(id))) filter.topicId = Number(id);
    else if (kind === "material" && Number.isInteger(Number(id))) filter.materialId = Number(id);
    else if (kind === "subtype") filter.subtype = id;
  }
  return Object.keys(filter).length > 0 ? filter : undefined;
}

function encode(filter: StudyFilter): string {
  return [
    filter.topicId !== undefined ? `topic:${filter.topicId}` : "",
    filter.materialId !== undefined ? `material:${filter.materialId}` : "",
    filter.subtype !== undefined ? `subtype:${filter.subtype}` : "",
  ]
    .filter(Boolean)
    .join("|");
}

function readStored(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/** The filter of a study screen, remembered per workspace and screen between visits. */
export function usePersistedFilter(key: string): [string, (next: string) => void] {
  const [value, setValue] = useState(() => readStored(key));
  useEffect(() => setValue(readStored(key)), [key]);
  const change = (next: string): void => {
    setValue(next);
    try {
      if (next) window.localStorage.setItem(key, next);
      else window.localStorage.removeItem(key);
    } catch {
      // The filter just is not remembered.
    }
  };
  return [value, change];
}

/**
 * Narrows what is studied by topic, material and type at the same time; used by cards and by
 * questions. The topic has a search box because that list grows the most.
 */
export function FilterSelect({
  facets,
  value,
  onChange,
  kind = "cards",
}: {
  facets: Facets;
  value: string;
  onChange: (next: string) => void;
  kind?: "cards" | "questions";
}) {
  const names = kind === "cards" ? T.cardTypes : T.questionTypes;
  const filter = parseFilter(value) ?? {};

  // A remembered filter may point at something that no longer has items: drop that part.
  useEffect(() => {
    const clean: StudyFilter = { ...filter };
    if (clean.topicId !== undefined && !facets.topics.some((f) => f.key === clean.topicId))
      delete clean.topicId;
    if (clean.materialId !== undefined && !facets.materials.some((f) => f.key === clean.materialId))
      delete clean.materialId;
    if (clean.subtype !== undefined && !facets.subtypes.some((f) => f.key === clean.subtype))
      delete clean.subtype;
    if (encode(clean) !== encode(filter)) onChange(encode(clean));
  }, [facets, value]);

  const update = (patch: StudyFilter): void => {
    const merged = { ...filter, ...patch };
    onChange(
      encode({
        ...(merged.topicId !== undefined ? { topicId: merged.topicId } : {}),
        ...(merged.materialId !== undefined ? { materialId: merged.materialId } : {}),
        ...(merged.subtype ? { subtype: merged.subtype } : {}),
      }),
    );
  };

  return (
    <div className="filters" role="group" aria-label={T.studyFilter}>
      {facets.topics.length > 0 && (
        <div className="filter-field filter-topic">
          <label htmlFor="filter-topic">{T.studyTopic}</label>
          <SearchCombobox
            inputId="filter-topic"
            label={T.studyTopic}
            placeholder={T.filterTopicPlaceholder}
            emptyText={T.filterNoTopic}
            options={facets.topics}
            selectedKey={filter.topicId}
            onSelect={(key) => update({ topicId: key === undefined ? undefined : Number(key) })}
          />
        </div>
      )}
      {facets.materials.length > 0 && (
        <div className="filter-field">
          <label htmlFor="filter-material">{T.studyMaterial}</label>
          <select
            id="filter-material"
            value={filter.materialId ?? ""}
            onChange={(event) =>
              update({ materialId: event.target.value ? Number(event.target.value) : undefined })
            }
          >
            <option value="">{T.filterAllMaterials}</option>
            {facets.materials.map((facet) => (
              <option key={facet.key} value={facet.key}>
                {facet.label} ({facet.count})
              </option>
            ))}
          </select>
        </div>
      )}
      {facets.subtypes.length > 0 && (
        <div className="filter-field">
          <label htmlFor="filter-type">{T.studyType}</label>
          <select
            id="filter-type"
            value={filter.subtype ?? ""}
            onChange={(event) => update({ subtype: event.target.value || undefined })}
          >
            <option value="">{T.filterAllTypes}</option>
            {facets.subtypes.map((facet) => (
              <option key={facet.key} value={String(facet.key)}>
                {names[String(facet.key)] ?? facet.label} ({facet.count})
              </option>
            ))}
          </select>
        </div>
      )}
      {value !== "" && (
        <button type="button" className="btn ghost sm filter-clear" onClick={() => onChange("")}>
          {T.filterClear}
        </button>
      )}
    </div>
  );
}
