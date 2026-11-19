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
import { SearchCombobox } from "../components/SearchCombobox.js";
import { ListSearch, Pager, usePagedList } from "../components/ListControls.js";

type Run = OutputOf<"generation:list">["runs"][number];
const ACTIVE = new Set(["queued", "running"]);

export function runPath(workspaceId: number, runId: number): string {
  return `${sectionPath(workspaceId, "generate")}/${runId}`;
}

/** Keeps only the digits, so a number field cannot hold letters, signs or spaces. */
function digits(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

/** The most items one run may ask for, as the core allows. */
const MAX_ITEMS = { card: 60, question: 30 } as const;

/** The reason of one discarded item, in Portuguese; the reviewer's own words follow its prefix. */
function reasonText(reason: string): string {
  if (reason.startsWith("unsupported:")) {
    const why = reason.slice("unsupported:".length).trim();
    return why ? `${T.discardReasonUnsupported}: ${why}` : T.discardReasonUnsupported;
  }
  if (reason.startsWith("out_of_scope:")) {
    const why = reason.slice("out_of_scope:".length).trim();
    return why ? `${T.discardReasonOutOfScope}: ${why}` : T.discardReasonOutOfScope;
  }
  return T.discardReasons[reason] ?? reason;
}

/** How many items a run produced and, when fewer than asked, why. */
function RunItems({ run }: { run: Run }) {
  const discarded =
    run.discardedNoSource +
    run.discardedInvalid +
    run.discardedDuplicate +
    run.discardedUnsupported +
    run.discardedOutOfScope;
  // What neither became an item nor was discarded: the model simply returned fewer.
  const shortfall = Math.max(run.requested - run.generated - discarded, 0);
  const parts = [
    run.discardedNoSource > 0 ? T.discardedNoSourceLabel(run.discardedNoSource) : null,
    run.discardedInvalid > 0 ? T.discardedInvalidLabel(run.discardedInvalid) : null,
    run.discardedDuplicate > 0 ? T.discardedDuplicateLabel(run.discardedDuplicate) : null,
    run.discardedUnsupported > 0 ? T.discardedUnsupportedLabel(run.discardedUnsupported) : null,
    run.discardedOutOfScope > 0 ? T.discardedOutOfScopeLabel(run.discardedOutOfScope) : null,
    run.rounds > 1 ? T.runSecondRound : null,
    shortfall > 0 && run.status === "done" ? T.runShortfall(shortfall) : null,
  ].filter((part): part is string => part !== null);
  return (
    <>
      {run.generated}/{run.requested}
      {parts.length > 0 && <span className="muted"> · {parts.join(" · ")}</span>}
      {run.discardLog.length > 0 && (
        <details>
          <summary>{T.runWhyIncomplete}</summary>
          <ul className="muted" aria-label={T.runReasonsTitle}>
            {run.discardLog.map((entry, index) => (
              <li key={index}>
                {reasonText(entry.reason)} — “{entry.front}”
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** How many generations one page of the table shows. */
const RUNS_PER_PAGE = 10;

/** A finished run with drafts that no one has approved or discarded yet. */
function needsReview(run: Run): boolean {
  return !ACTIVE.has(run.status) && run.pending > 0;
}

/** The pages a run covered, in words; empty for a run that used the whole material. */
function pagesText(run: Run): string {
  const { pageFrom, pageTo } = run;
  if (pageFrom !== null && pageTo !== null)
    return pageFrom === pageTo ? T.runPage(pageFrom) : T.runPages(pageFrom, pageTo);
  if (pageFrom !== null) return T.runFromPage(pageFrom);
  if (pageTo !== null) return T.runToPage(pageTo);
  return T.runAllPages;
}

/** Every material the workspace has, by id, for the titles in the runs table. */
function materialTitles(
  materials: ReturnType<typeof useInvoke<"material:list">>,
): [number, string][] {
  return materials.state.status === "ready"
    ? materials.state.data.materials.map((entry) => [entry.id, entry.title])
    : [];
}

function RunsTable({
  workspaceId,
  runs,
  topics,
  materials,
  onChange,
}: {
  workspaceId: number;
  runs: Run[];
  topics: Map<number, string>;
  materials: Map<number, string>;
  onChange: () => void;
}) {
  const { navigate } = useRouter();
  const list = usePagedList(runs, RUNS_PER_PAGE, (run) =>
    [
      run.createdAt,
      run.materialId !== null ? materials.get(run.materialId) : null,
      run.topicId !== null ? topics.get(run.topicId) : null,
      run.kind === "question" ? T.kindQuestions : T.kindCards,
      T.cardTypes[run.subtype] ?? T.profiles[run.subtype] ?? run.subtype,
      T.runStatus[run.status] ?? run.status,
      pagesText(run),
    ].join(" "),
  );
  if (runs.length === 0) return <p className="muted">{T.runsNone}</p>;
  return (
    <>
      <ListSearch list={list} label={T.listSearchRuns} />
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>{T.runMaterial}</th>
            <th>{T.runType}</th>
            <th>{T.materialStatus}</th>
            <th>Itens</th>
            <th>{T.usd}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.pageItems.map((run) => (
            <tr key={run.id} className={needsReview(run) ? "needs-review" : undefined}>
              <td>{run.createdAt.slice(0, 16).replace("T", " ")}</td>
              <td>
                {run.topicId !== null && run.materialId === null ? (
                  <>
                    {T.trainRun}: {topics.get(run.topicId) ?? run.topicId}
                  </>
                ) : (
                  <>
                    {run.materialId !== null
                      ? (materials.get(run.materialId) ?? T.runMaterialGone)
                      : T.runMaterialGone}
                    <br />
                    <span className="muted">{pagesText(run)}</span>
                  </>
                )}
              </td>
              <td>
                {run.kind === "question" ? T.kindQuestions : T.kindCards}
                <br />
                <span className="muted">
                  {T.cardTypes[run.subtype] ?? T.profiles[run.subtype] ?? run.subtype}
                </span>
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
                <RunItems run={run} />
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
                    className={needsReview(run) ? "btn" : "btn ghost"}
                    onClick={() => navigate(runPath(workspaceId, run.id))}
                  >
                    {run.pending === 0 && run.generated > 0 ? T.reviewed : T.review}
                    {needsReview(run) && <span className="pill"> {run.pending}</span>}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager list={list} />
    </>
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
    | "calculation_4"
    | "calculation_5"
  >(
    (["qa", "cloze", "compare", "true_false"] as const).find((v) => v === training?.subtype) ??
      "qa",
  );
  const [quantity, setQuantity] = useState("20");
  const [instructions, setInstructions] = useState("");
  const [topicName, setTopicName] = useState("");
  const [variations, setVariations] = useState(false);
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
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      ...(trainTopic === null && topicName.trim() ? { topicName: topicName.trim() } : {}),
      ...(variations ? { variations: true } : {}),
    };
  };

  const showError = (error: ErrorInfo): void => {
    const byField = Object.fromEntries((error.fields ?? []).map((f) => [f.field, f.message]));
    setErrors(byField);
    const shown = [
      "pageFrom",
      "pageTo",
      "quantity",
      "instructions",
      "variations",
      "materialId",
      "topicId",
    ];
    setFormError(
      Object.keys(byField).every((field) => !shown.includes(field)) ? error.message : null,
    );
  };

  const key = JSON.stringify([
    selected,
    trainTopic,
    kind,
    subtype,
    quantity,
    pageFrom,
    pageTo,
    instructions,
    topicName,
    variations,
  ]);
  useEffect(() => {
    // Editing the form is what clears the messages of an earlier attempt; a late cost estimate
    // must not wipe an error the person has not had the chance to read.
    setErrors({});
    setFormError(null);
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
              {errors["topicId"] && (
                <p className="field-error" role="alert">
                  {errors["topicId"]}
                </p>
              )}
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
                  pattern="[0-9]*"
                  maxLength={5}
                  placeholder={T.generatePageFromPlaceholder}
                  aria-describedby="gen-pages-hint"
                  value={pageFrom}
                  onChange={(event) => setPageFrom(digits(event.target.value, 5))}
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
                  pattern="[0-9]*"
                  maxLength={5}
                  placeholder={
                    indexed.find((entry) => entry.id === selected)?.pageCount?.toString() ??
                    T.generatePageToPlaceholder
                  }
                  aria-describedby="gen-pages-hint"
                  value={pageTo}
                  onChange={(event) => setPageTo(digits(event.target.value, 5))}
                />
                {errors["pageTo"] && (
                  <p className="field-error" role="alert">
                    {errors["pageTo"]}
                  </p>
                )}
              </div>
            </div>
          )}
          {trainTopic === null && (
            <p id="gen-pages-hint" className="muted">
              {T.generatePagesHint(
                indexed.find((entry) => entry.id === selected)?.pageCount ?? null,
              )}
            </p>
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
                pattern="[0-9]*"
                maxLength={3}
                aria-describedby="gen-quantity-hint"
                value={quantity}
                onChange={(event) => setQuantity(digits(event.target.value, 3))}
              />
              <p id="gen-quantity-hint" className="muted">
                {T.generateQuantityHint(MAX_ITEMS[kind])}
              </p>
              {errors["quantity"] && (
                <p className="field-error" role="alert">
                  {errors["quantity"]}
                </p>
              )}
            </div>
          </div>
          {trainTopic === null && (
            <div className="field">
              <label htmlFor="gen-topic">{T.generateTopic}</label>
              <SearchCombobox
                inputId="gen-topic"
                label={T.generateTopic}
                placeholder={T.generateTopicPlaceholder}
                options={[...topicNames.entries()].map(([key, label]) => ({ key, label }))}
                text={topicName}
                onText={setTopicName}
              />
              <p id="gen-topic-hint" className="muted">
                {T.generateTopicHint}
              </p>
            </div>
          )}
          <div className="field">
            <label htmlFor="gen-instructions">{T.generateInstructions}</label>
            <textarea
              id="gen-instructions"
              rows={3}
              maxLength={500}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              aria-describedby="gen-instructions-hint"
            />
            <p id="gen-instructions-hint" className="muted">
              {T.generateInstructionsHint} ({instructions.length}/500)
            </p>
            {errors["instructions"] && (
              <p className="field-error" role="alert">
                {errors["instructions"]}
              </p>
            )}
          </div>
          <div className="field">
            <label className="row" style={{ alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={variations}
                onChange={(event) => setVariations(event.target.checked)}
                style={{ width: "auto" }}
              />
              {T.generateVariations}
            </label>
            <p className="muted">{T.generateVariationsHint}</p>
            {errors["variations"] && (
              <p className="field-error" role="alert">
                {errors["variations"]}
              </p>
            )}
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
            materials={new Map(materialTitles(materials))}
            onChange={runs.reload}
          />
        )}
      </section>
    </section>
  );
}
