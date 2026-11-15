/*
 * Filename: components/FilterSelect.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { OutputOf } from "../../../core/contracts/index.js";
import { T } from "../strings.js";

export type Facets = OutputOf<"study:today">["facets"];
export type StudyFilter = { topicId?: number; materialId?: number; subtype?: string };

/** `topic:3`, `material:2` or `subtype:qa`, or an empty string for "everything". */
export function parseFilter(value: string): StudyFilter | undefined {
  const [kind, id] = value.split(":");
  if (!kind || !id) return undefined;
  if (kind === "topic") return { topicId: Number(id) };
  if (kind === "material") return { materialId: Number(id) };
  return { subtype: id };
}

/** Narrows what is studied to a topic, a material or a type; used by cards and by questions. */
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
  return (
    <div className="field">
      <select
        id="study-filter"
        aria-label={T.studyFilter}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{kind === "cards" ? T.studyAll : T.studyAllQuestions}</option>
        {facets.topics.length > 0 && (
          <optgroup label={T.studyTopic}>
            {facets.topics.map((facet) => (
              <option key={facet.key} value={`topic:${facet.key}`}>
                {facet.label} ({facet.count})
              </option>
            ))}
          </optgroup>
        )}
        {facets.materials.length > 0 && (
          <optgroup label={T.studyMaterial}>
            {facets.materials.map((facet) => (
              <option key={facet.key} value={`material:${facet.key}`}>
                {facet.label} ({facet.count})
              </option>
            ))}
          </optgroup>
        )}
        {facets.subtypes.length > 0 && (
          <optgroup label={T.studyType}>
            {facets.subtypes.map((facet) => (
              <option key={facet.key} value={`subtype:${facet.key}`}>
                {names[String(facet.key)] ?? facet.label} ({facet.count})
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}
