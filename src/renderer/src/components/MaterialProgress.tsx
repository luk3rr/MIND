/*
 * Filename: components/MaterialProgress.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { OutputOf } from "../../../core/contracts/index.js";
import { useInvoke } from "../hooks.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { ListSearch, Pager, usePagedList } from "./ListControls.js";

type MaterialStat = OutputOf<"stats:materials">["materials"][number];

/** How many materials one page of the progress table shows. */
const MATERIALS_PER_PAGE = 10;

const percent = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

/** Remembers the material as the study filter, the way the filter box would, then opens it. */
function studyMaterial(workspaceId: number, materialId: number): void {
  try {
    window.localStorage.setItem(`mind.filter.${workspaceId}.study-cards`, `material:${materialId}`);
  } catch {
    // The study screen just opens unfiltered.
  }
}

/** What was made from each material and how the study is going, with a suggestion of what's next. */
export function MaterialProgress({ workspaceId }: { workspaceId: number }) {
  const { state } = useInvoke("stats:materials", { workspaceId });
  const { navigate } = useRouter();
  const list = usePagedList(
    state.status === "ready" ? state.data.materials : [],
    MATERIALS_PER_PAGE,
    (stat) => stat.title,
  );
  if (state.status !== "ready" || state.data.materials.length === 0) return null;
  const suggested = state.data.materials.find((m) => m.suggested);
  return (
    <section className="card" aria-labelledby="materials-title">
      <h2 id="materials-title">{T.materialsProgress}</h2>
      <p className="muted">{T.materialsProgressHint}</p>
      {suggested && (
        <p role="status">
          <strong>{T.materialSuggested}:</strong> {suggested.title} ·{" "}
          {T.materialFocus[suggested.focus ?? "unseen"](suggested)}
        </p>
      )}
      <ListSearch list={list} label={T.listSearchMaterials} />
      <table aria-label={T.materialsProgress}>
        <thead>
          <tr>
            <th scope="col">{T.materialColumn}</th>
            <th scope="col">{T.materialCreated}</th>
            <th scope="col">{T.materialToReview}</th>
            <th scope="col">{T.materialApproved}</th>
            <th scope="col">{T.materialStudied}</th>
            <th scope="col">{T.materialUnseen}</th>
            <th scope="col">{T.materialDue}</th>
            <th scope="col">{T.statsAccuracy}</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {list.pageItems.map((stat: MaterialStat) => (
            <tr key={stat.materialId}>
              <td>
                {stat.title}
                {stat.suggested && <span className="pill"> {T.materialSuggested}</span>}
                {stat.focus !== null && !stat.suggested && (
                  <span className="muted"> · {T.materialFocus[stat.focus](stat)}</span>
                )}
              </td>
              <td>{stat.created}</td>
              <td>{stat.toReview}</td>
              <td>{stat.approved}</td>
              <td>{stat.studied}</td>
              <td>{stat.unseen}</td>
              <td>{stat.due}</td>
              <td>
                {percent(stat.accuracy)}
                {stat.smallSample && stat.events > 0 && (
                  <span className="muted"> ({T.statsSmallSample})</span>
                )}
              </td>
              <td>
                {stat.approved > 0 && (
                  <button
                    type="button"
                    className="btn ghost"
                    aria-label={`${T.materialStudy} ${stat.title}`}
                    onClick={() => {
                      studyMaterial(workspaceId, stat.materialId);
                      navigate(sectionPath(workspaceId, "study"));
                    }}
                  >
                    {T.materialStudy}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager list={list} />
    </section>
  );
}
