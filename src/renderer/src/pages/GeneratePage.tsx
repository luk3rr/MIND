/*
 * Filename: pages/GeneratePage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ErrorInfo, OutputOf } from "../../../core/contracts/index.js";
import { useInvoke } from "../hooks.js";
import { sectionPath, useRouter } from "../router.js";
import type { Route } from "../router.js";
import { T } from "../strings.js";

type Run = OutputOf<"generation:list">["runs"][number];
const ACTIVE = new Set(["queued", "running"]);

export function runPath(workspaceId: number, runId: number): string {
  return `${sectionPath(workspaceId, "generate")}/${runId}`;
}

function RunsTable({
  workspaceId,
  runs,
  topics,
  onChange,
}: {
  workspaceId: number;
  runs: Run[];
  topics: Map<number, string>;
  onChange: () => void;
}) {
  const { navigate } = useRouter();
  if (runs.length === 0) return <p className="muted">{T.runsNone}</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>{T.generateType}</th>
          <th>{T.materialStatus}</th>
          <th>Itens</th>
          <th>{T.usd}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.id}>
            <td>{run.createdAt.slice(0, 16).replace("T", " ")}</td>
            <td>
              {T.cardTypes[run.subtype] ?? T.profiles[run.subtype] ?? run.subtype}
              {run.topicId !== null && run.materialId === null && (
                <span className="muted">
                  {" "}
                  · {T.trainRun}: {topics.get(run.topicId) ?? run.topicId}
                </span>
              )}
            </td>
            <td>
              <span className="pill">{T.runStatus[run.status] ?? run.status}</span>
              {run.progress !== null && (
                <progress
                  className="goal-bar"
                  max={1}
                  value={run.progress}
                  aria-label={`${T.materialStatus}: ${Math.round(run.progress * 100)}%`}
                />
              )}
              {run.errorDetail && <p className="muted">{run.errorDetail}</p>}
            </td>
            <td>
              {run.generated}/{run.requested}
              {run.discardedNoSource > 0 && (
                <span className="muted">
                  {" "}
                  · {run.discardedNoSource} {T.discardedBySource}
                </span>
              )}
            </td>
            <td>{run.costUsd.toFixed(4)}</td>
            <td>
              {ACTIVE.has(run.status) ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    void window.mind
                      .invoke("generation:cancel", { workspaceId, runId: run.id })
                      .then(onChange);
                  }}
                >
                  {T.cancelRun}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => navigate(runPath(workspaceId, run.id))}
                >
                  {T.review}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Generate cards from a material: pick the options, see the estimated cost and follow the runs. */
export function GeneratePage({
  workspaceId,
  training,
}: {
  workspaceId: number;
  training?: Pick<Extract<Route, { name: "section" }>, "topicId" | "subtype">;
}) {
  const { navigate } = useRouter();
  const topics = useInvoke("topics:list", { workspaceId });
  const topicNames = new Map(
    topics.state.status === "ready" ? topics.state.data.topics.map((t) => [t.id, t.name]) : [],
  );
  // An unknown topic falls back to the normal material form.
  const trainTopic =
    training?.topicId !== undefined && topicNames.has(training.topicId) ? training.topicId : null;
  const materials = useInvoke("material:list", { workspaceId });
  const runs = useInvoke("generation:list", { workspaceId });
  const [materialId, setMaterialId] = useState<number | null>(null);
  const [pageFrom, setPageFrom] = useState("");
  const [pageTo, setPageTo] = useState("");
  const [kind, setKind] = useState<"card" | "question">("card");
  const [subtype, setSubtype] = useState<
    | "qa"
    | "cloze"
    | "compare"
    | "true_false"
    | "certo_errado"
    | "multiple_choice_4"
    | "multiple_choice_5"
  >(
    (["qa", "cloze", "compare", "true_false"] as const).find((v) => v === training?.subtype) ??
      "qa",
  );
  const [quantity, setQuantity] = useState("20");
  const [estimate, setEstimate] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const indexed =
    materials.state.status === "ready"
      ? materials.state.data.materials.filter((m) => m.status === "indexed")
      : [];
  const selected = materialId ?? indexed[0]?.id ?? null;

  const request = (): Parameters<typeof window.mind.invoke<"generation:start">>[1] | null => {
    const count = Number(quantity);
    if ((trainTopic === null && selected === null) || !Number.isInteger(count)) return null;
    return {
      workspaceId,
      ...(trainTopic !== null ? { topicId: trainTopic } : { materialId: selected as number }),
      subtype,
      quantity: count,
      kind,
      ...(trainTopic === null && pageFrom.trim() ? { pageFrom: Number(pageFrom) } : {}),
      ...(trainTopic === null && pageTo.trim() ? { pageTo: Number(pageTo) } : {}),
    };
  };

  const showError = (error: ErrorInfo): void => {
    const byField = Object.fromEntries((error.fields ?? []).map((f) => [f.field, f.message]));
    setErrors(byField);
    setFormError(Object.keys(byField).length === 0 ? error.message : null);
  };

  const key = JSON.stringify([selected, trainTopic, kind, subtype, quantity, pageFrom, pageTo]);
  useEffect(() => {
    const payload = request();
    if (!payload) {
      setEstimate(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      void window.mind.invoke("generation:estimate", payload).then((result) => {
        if (!result.ok) {
          setEstimate(null);
          return;
        }
        setErrors({});
        setFormError(null);
        setEstimate(
          result.data.estimatedUsd === null
            ? T.generateEstimateUnknown
            : T.generateEstimate(result.data.estimatedUsd),
        );
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [key, workspaceId]);

  const anyActive =
    runs.state.status === "ready" && runs.state.data.runs.some((run) => ACTIVE.has(run.status));
  const reloadRuns = runs.reload;
  useEffect(() => {
    if (!anyActive) return undefined;
    const timer = setInterval(reloadRuns, 1000);
    return () => clearInterval(timer);
  }, [anyActive, reloadRuns]);

  const start = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const payload = request();
    if (!payload) return;
    setBusy(true);
    const result = await window.mind.invoke("generation:start", payload);
    setBusy(false);
    if (!result.ok) {
      showError(result.error);
      return;
    }
    setErrors({});
    setFormError(null);
    runs.reload();
  };

  return (
    <section aria-labelledby="generate-title">
      <h1 id="generate-title">{T.generate}</h1>
      {trainTopic === null && materials.state.status === "ready" && indexed.length === 0 ? (
        <div className="card">
          <p className="muted">{T.generateNoMaterial}</p>
          <button
            type="button"
            className="btn"
            onClick={() => navigate(sectionPath(workspaceId, "library"))}
          >
            {T.library}
          </button>
        </div>
      ) : (
        <form className="card stack" onSubmit={(event) => void start(event)}>
          {formError && (
            <p className="alert" role="alert">
              {formError}
            </p>
          )}
          {trainTopic !== null && (
            <div className="card" role="note">
              <p>
                {T.trainBanner} <strong>{topicNames.get(trainTopic)}</strong>
              </p>
              <p className="muted">{T.trainHint}</p>
              <button
                type="button"
                className="btn ghost"
                onClick={() => navigate(sectionPath(workspaceId, "generate"))}
              >
                {T.trainCancel}
              </button>
            </div>
          )}
          {trainTopic === null && (
            <div className="field">
              <label htmlFor="gen-material">{T.generateMaterial}</label>
              <select
                id="gen-material"
                value={selected ?? ""}
                onChange={(event) => setMaterialId(Number(event.target.value))}
              >
                {indexed.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          {trainTopic === null && (
            <div className="row">
              <div className="field">
                <label htmlFor="gen-from">{T.generatePageFrom}</label>
                <input
                  id="gen-from"
                  inputMode="numeric"
                  value={pageFrom}
                  onChange={(event) => setPageFrom(event.target.value)}
                />
                {errors["pageFrom"] && (
                  <p className="field-error" role="alert">
                    {errors["pageFrom"]}
                  </p>
                )}
              </div>
              <div className="field">
                <label htmlFor="gen-to">{T.generatePageTo}</label>
                <input
                  id="gen-to"
                  inputMode="numeric"
                  value={pageTo}
                  onChange={(event) => setPageTo(event.target.value)}
                />
                {errors["pageTo"] && (
                  <p className="field-error" role="alert">
                    {errors["pageTo"]}
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="row">
            <div className="field">
              <label htmlFor="gen-kind">{T.generateKind}</label>
              <select
                id="gen-kind"
                value={kind}
                onChange={(event) => {
                  const next = event.target.value as "card" | "question";
                  setKind(next);
                  setSubtype(next === "card" ? "qa" : "certo_errado");
                }}
              >
                <option value="card">{T.kindCards}</option>
                <option value="question">{T.kindQuestions}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="gen-type">{kind === "card" ? T.generateType : T.profileLabel}</label>
              <select
                id="gen-type"
                value={subtype}
                onChange={(event) => setSubtype(event.target.value as typeof subtype)}
              >
                {Object.entries(kind === "card" ? T.cardTypes : T.profiles).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="field">
              <label htmlFor="gen-quantity">{T.generateQuantity}</label>
              <input
                id="gen-quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
              {errors["quantity"] && (
                <p className="field-error" role="alert">
                  {errors["quantity"]}
                </p>
              )}
            </div>
          </div>
          {errors["materialId"] && (
            <p className="field-error" role="alert">
              {errors["materialId"]}
            </p>
          )}
          {estimate && (
            <p className="muted" role="status">
              {estimate}
            </p>
          )}
          <div>
            <button
              type="submit"
              className="btn"
              disabled={busy || (trainTopic === null && selected === null)}
            >
              {kind === "card" ? T.generateCards : "Gerar questões"}
            </button>
          </div>
        </form>
      )}
      <section className="card stack" aria-labelledby="runs-title">
        <h2 id="runs-title">{T.runsTitle}</h2>
        {runs.state.status === "ready" && (
          <RunsTable
            workspaceId={workspaceId}
            runs={runs.state.data.runs}
            topics={topicNames}
            onChange={runs.reload}
          />
        )}
      </section>
    </section>
  );
}
