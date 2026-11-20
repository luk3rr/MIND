/*
 * Filename: pages/LibraryPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { ActionMenu } from "../components/ActionMenu.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { PromptDialog } from "../components/PromptDialog.js";
import { SubjectDialog } from "../components/SubjectDialog.js";
import { useInvoke } from "../hooks.js";
import {
  materialPath,
  pretestHistoryPath,
  pretestPath,
  sectionPath,
  useRouter,
  readerPath,
} from "../router.js";
import { Dialog } from "../components/Dialog.js";
import { unfinishedPretest } from "./PretestPage.js";
import { T } from "../strings.js";
import { ListSearch, Pager, usePagedList } from "../components/ListControls.js";
import { SeeInPdf } from "../components/SeeInPdf.js";

type Material = OutputOf<"material:list">["materials"][number];

const ACTIVE = new Set(["queued", "importing"]);

const STATUS_LABEL: Record<string, string> = {
  queued: T.statusQueued,
  importing: T.statusImporting,
  indexed: T.statusIndexed,
  failed: T.statusFailed,
};

function StatusCell({ material }: { material: Material }) {
  const label = STATUS_LABEL[material.status] ?? material.status;
  return (
    <>
      <span className="pill">{label}</span>
      {material.progress !== null && (
        <progress
          className="goal-bar"
          max={1}
          value={material.progress}
          aria-label={`${T.materialStatus}: ${Math.round(material.progress * 100)}%`}
        />
      )}
      {material.ocrConfidence !== null && (
        <span className="muted">
          {" "}
          {T.ocrConfidence} {Math.round(material.ocrConfidence)}%
        </span>
      )}
      {material.errorDetail && <p className="muted">{material.errorDetail}</p>}
      {material.status === "indexed" && <AnalysisPill material={material} />}
    </>
  );
}

/** Where the analysis of the chunks of a material stands, next to its import status. */
function AnalysisPill({ material }: { material: Material }) {
  const { analysis } = material;
  if (analysis.state === "analyzing") {
    const percent = Math.round((analysis.progress ?? 0) * 100);
    return (
      <>
        {" "}
        <span className="pill warn" role="status">
          {T.analysisAnalyzingPercent(percent)}
        </span>
      </>
    );
  }
  if (analysis.state === "done") {
    return (
      <>
        {" "}
        <span className="pill ok">{T.analysisDone}</span>
      </>
    );
  }
  if (analysis.state === "failed") {
    return (
      <>
        {" "}
        <span className="pill bad" title={analysis.errorDetail ?? undefined}>
          {T.analysisFailed}
        </span>
      </>
    );
  }
  if (analysis.state === "paused") {
    return (
      <>
        {" "}
        <span className="pill warn" title={T.analysisPausedNote}>
          {T.analysisPaused}
        </span>
      </>
    );
  }
  return null;
}

/** The library: import files, follow the progress, search the text and open a preview. */
/** How many materials one page of the library shows. */
const MATERIALS_PER_PAGE = 10;

/** The day and time a material was imported, as the person reads dates (dd/mm/aaaa hh:mm). */
function importedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function LibraryPage({ workspaceId }: { workspaceId: number }) {
  const { navigate } = useRouter();
  const { state, reload } = useInvoke("material:list", { workspaceId });
  const [errors, setErrors] = useState<{ file: string; message: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Material | null>(null);
  const [toRename, setToRename] = useState<Material | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [pretestFor, setPretestFor] = useState<Material | null>(null);
  const [askUrl, setAskUrl] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<OutputOf<"material:search">["hits"] | null>(null);

  // The list comes newest first; the name column can sort it A to Z, Z to A, or back to newest.
  const [order, setOrder] = useState<"recent" | "asc" | "desc">("recent");
  const materials = useMemo(() => {
    const all = state.status === "ready" ? state.data.materials : [];
    if (order === "recent") return all;
    const sign = order === "asc" ? 1 : -1;
    return [...all].sort(
      (a, b) =>
        sign * a.title.localeCompare(b.title, "pt-BR", { numeric: true, sensitivity: "base" }),
    );
  }, [state, order]);
  const list = usePagedList(
    materials,
    MATERIALS_PER_PAGE,
    (material) => `${material.title} ${material.kind} ${material.filename}`,
  );
  // The dialog shows the material as the list has it now, so a running analysis moves on in it.
  const toSubject = materials.find((m) => m.id === subjectId) ?? null;
  const anyActive =
    state.status === "ready" &&
    state.data.materials.some((m) => ACTIVE.has(m.status) || m.analysis.state === "analyzing");
  useEffect(() => {
    if (!anyActive) return undefined;
    const timer = setInterval(reload, 1000);
    return () => clearInterval(timer);
  }, [anyActive, reload]);

  const importFiles = async (): Promise<void> => {
    setImporting(true);
    const result = await window.mind.invoke("material:import", { workspaceId });
    setImporting(false);
    if (result.ok) setErrors(result.data.errors);
    reload();
  };

  const search = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!query.trim()) {
      setHits(null);
      return;
    }
    const result = await window.mind.invoke("material:search", { workspaceId, query });
    setHits(result.ok ? result.data.hits : []);
  };

  const importButton = (
    <button type="button" className="btn" onClick={() => void importFiles()} disabled={importing}>
      {T.importFile}
    </button>
  );

  const openAction = (
    channel: "reader:openWindow" | "material:openOriginal",
    materialId: number,
  ): void => {
    void window.mind.invoke(channel, { workspaceId, materialId }).then((result) => {
      setOpenError(result.ok ? null : result.error.message);
    });
  };

  return (
    <section aria-labelledby="library-title">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 id="library-title">{T.library}</h1>
        <div className="row">
          <button type="button" className="btn ghost" onClick={() => setAskUrl(true)}>
            {T.importUrl}
          </button>
          {importButton}
        </div>
      </div>
      {errors.length > 0 && (
        <div className="alert" role="alert">
          <strong>{T.importErrorsTitle}</strong>
          <ul>
            {errors.map((error) => (
              <li key={error.file}>
                {error.file}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <form onSubmit={(event) => void search(event)} className="row" role="search">
        <input
          aria-label={T.searchMaterials}
          placeholder={T.searchMaterials}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="search-input"
        />
        <button type="submit" className="btn ghost">
          {T.search}
        </button>
      </form>
      {hits !== null && (
        <section className="card stack" aria-label="Resultados da busca">
          {hits.length === 0 && <p className="muted">{T.searchEmpty}</p>}
          <ul className="hits">
            {hits.map((hit) => (
              <li key={hit.chunkId}>
                <button
                  type="button"
                  className="link"
                  onClick={() => navigate(materialPath(workspaceId, hit.materialId, hit.chunkId))}
                >
                  {hit.materialTitle}
                  {hit.page !== null ? `, ${T.page} ${hit.page}` : ""}
                  {hit.section ? `, ${hit.section}` : ""}
                </button>{" "}
                {hit.page !== null &&
                  state.status === "ready" &&
                  state.data.materials.find((entry) => entry.id === hit.materialId)?.kind ===
                    "pdf" && (
                    <SeeInPdf
                      workspaceId={workspaceId}
                      materialId={hit.materialId}
                      page={hit.page}
                      quote={hit.text.slice(0, 200)}
                    />
                  )}
                <p className="muted">{hit.text.slice(0, 280)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {openError && (
        <div className="alert" role="alert">
          {openError}
        </div>
      )}
      {state.status === "loading" && (
        <div className="row" role="status" aria-label={T.loading}>
          <div className="skeleton" />
        </div>
      )}
      {state.status === "error" && (
        <div className="alert" role="alert">
          <p>
            {T.loadError} {state.error.message}
          </p>
          <button type="button" className="btn ghost" onClick={reload}>
            {T.retry}
          </button>
        </div>
      )}
      {state.status === "ready" && state.data.materials.length === 0 && (
        <div className="card">
          <h2>{T.libraryEmptyTitle}</h2>
          <p className="muted">{T.libraryEmptyBody}</p>
        </div>
      )}
      {state.status === "ready" && state.data.materials.length > 0 && (
        <div className="card">
          <ListSearch list={list} label={T.listSearchMaterials} />
          <table>
            <thead>
              <tr>
                <th
                  aria-sort={
                    order === "asc" ? "ascending" : order === "desc" ? "descending" : "none"
                  }
                >
                  <button
                    type="button"
                    className="sort-header"
                    aria-label={T.materialSortByName}
                    onClick={() => {
                      setOrder((current) =>
                        current === "recent" ? "asc" : current === "asc" ? "desc" : "recent",
                      );
                      list.setPage(1);
                    }}
                  >
                    {T.materialName}
                    {order === "asc" ? " ▲" : order === "desc" ? " ▼" : ""}
                  </button>
                </th>
                <th>{T.materialKind}</th>
                <th>{T.materialPages}</th>
                <th>{T.materialStatus}</th>
                <th>{T.materialChunks}</th>
                <th>{T.materialImportedAt}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.pageItems.map((material) => (
                <tr key={material.id}>
                  <td>
                    <button
                      type="button"
                      className="link"
                      onClick={() => navigate(materialPath(workspaceId, material.id))}
                    >
                      {material.title}
                    </button>
                    {material.subject.source !== "title" && (
                      <div className="muted">{material.subject.value}</div>
                    )}
                  </td>
                  <td>{material.kind}</td>
                  <td>{material.pageCount ?? "—"}</td>
                  <td>
                    <StatusCell material={material} />
                  </td>
                  <td>{material.chunkCount}</td>
                  <td>{importedAt(material.createdAt)}</td>
                  <td>
                    <span className="row" style={{ display: "inline-flex", gap: 6 }}>
                      {material.status === "indexed" && (
                        <>
                          {material.kind === "pdf" && (
                            <>
                              <button
                                type="button"
                                className="btn"
                                aria-label={T.openActionLabel(T.readAction, material.title)}
                                onClick={() => navigate(readerPath(workspaceId, material.id))}
                              >
                                {T.readAction}
                              </button>
                              <button
                                type="button"
                                className="btn ghost"
                                aria-label={T.openActionLabel(T.readNewWindow, material.title)}
                                onClick={() => openAction("reader:openWindow", material.id)}
                              >
                                {T.readNewWindow}
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="btn ghost"
                            aria-label={T.openActionLabel(
                              unfinishedPretest(workspaceId, material.id) === null
                                ? T.pretestAction
                                : T.pretestContinue,
                              material.title,
                            )}
                            onClick={() => {
                              const open = unfinishedPretest(workspaceId, material.id);
                              if (open === null) setPretestFor(material);
                              else navigate(pretestPath(workspaceId, material.id, open));
                            }}
                          >
                            {unfinishedPretest(workspaceId, material.id) === null
                              ? T.pretestAction
                              : T.pretestContinue}
                          </button>
                        </>
                      )}
                      <ActionMenu
                        label={T.openActionLabel(T.moreActions, material.title)}
                        items={[
                          ...(material.status === "indexed"
                            ? [
                                {
                                  label: T.pretestHistoryAction,
                                  onSelect: () =>
                                    navigate(pretestHistoryPath(workspaceId, material.id)),
                                },
                                {
                                  label: material.kind === "pdf" ? T.openInSystem : T.openOriginal,
                                  onSelect: () => openAction("material:openOriginal", material.id),
                                },
                              ]
                            : []),
                          { label: T.renameMaterial, onSelect: () => setToRename(material) },
                          ...(material.status === "indexed"
                            ? [
                                {
                                  label: T.subjectAction,
                                  onSelect: () => setSubjectId(material.id),
                                },
                                ...(["failed", "paused"].includes(material.analysis.state)
                                  ? [
                                      {
                                        label: T.analyzeAgain,
                                        onSelect: () => {
                                          void window.mind
                                            .invoke("material:analyze", {
                                              workspaceId,
                                              id: material.id,
                                            })
                                            .then(reload);
                                        },
                                      },
                                    ]
                                  : []),
                              ]
                            : []),
                          {
                            label: T.deleteWorkspace,
                            danger: true,
                            onSelect: () => setToDelete(material),
                          },
                        ]}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager list={list} />
        </div>
      )}
      {askUrl && (
        <PromptDialog
          title={T.importUrl}
          label={T.urlLabel}
          submitLabel={T.importUrl}
          onClose={() => setAskUrl(false)}
          onSubmit={async (url) => {
            const result = await window.mind.invoke("material:importUrl", { workspaceId, url });
            if (!result.ok) return result.error.fields?.[0]?.message ?? result.error.message;
            reload();
            return null;
          }}
        />
      )}
      {pretestFor && (
        <PretestDialog
          material={pretestFor}
          onClose={() => setPretestFor(null)}
          onGenerate={() => {
            setPretestFor(null);
            navigate(sectionPath(workspaceId, "generate"));
          }}
          onStart={(count) => {
            setPretestFor(null);
            navigate(pretestPath(workspaceId, pretestFor.id, count));
          }}
        />
      )}
      {toRename && (
        <PromptDialog
          title={T.renameMaterialTitle}
          label={T.renameMaterialLabel}
          initial={toRename.title}
          submitLabel={T.save}
          onClose={() => setToRename(null)}
          onSubmit={async (title) => {
            const result = await window.mind.invoke("material:rename", {
              workspaceId,
              id: toRename.id,
              title,
            });
            if (!result.ok) return result.error.fields?.[0]?.message ?? result.error.message;
            reload();
            return null;
          }}
        />
      )}
      {toSubject && (
        <SubjectDialog
          workspaceId={workspaceId}
          material={toSubject}
          onClose={() => setSubjectId(null)}
          onChanged={reload}
        />
      )}
      {toDelete && (
        <ConfirmDialog
          title={T.deleteMaterial}
          body={T.deleteMaterialBody(toDelete.title)}
          confirmLabel={T.deleteWorkspace}
          onClose={() => setToDelete(null)}
          onConfirm={() => {
            void window.mind
              .invoke("material:delete", { workspaceId, id: toDelete.id })
              .then(reload);
          }}
        />
      )}
    </section>
  );
}

/** Asks how many questions the pre-test of a material should have. */
function PretestDialog({
  material,
  onClose,
  onStart,
  onGenerate,
}: {
  material: Material;
  onClose: () => void;
  onStart: (count: number) => void;
  onGenerate: () => void;
}) {
  const [text, setText] = useState(String(Math.min(10, material.pretestEligible)));
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const count = Number(text);
    if (!/^\d+$/.test(text.trim()) || count < 1 || count > 20) {
      setError(T.pretestCountError);
      return;
    }
    onStart(count);
  };
  if (material.pretestEligible === 0) {
    return (
      <Dialog title={T.pretestDialogTitle(material.title)} onClose={onClose}>
        <div className="stack">
          <p>{T.pretestNoQuestions}</p>
          <p className="muted">{T.pretestNoQuestionsHint}</p>
          <div className="actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              {T.cancel}
            </button>
            <button type="button" className="btn" onClick={onGenerate}>
              {T.pretestGoGenerate}
            </button>
          </div>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog title={T.pretestDialogTitle(material.title)} onClose={onClose}>
      <form onSubmit={submit} noValidate className="stack">
        <p className="muted">{T.pretestDialogIntro}</p>
        <div className="field">
          <label htmlFor="pretest-count">{T.pretestCountLabel}</label>
          <input
            id="pretest-count"
            inputMode="numeric"
            value={text}
            aria-describedby="pretest-count-hint"
            onChange={(event) => setText(event.target.value)}
          />
          <p id="pretest-count-hint" className="muted">
            {T.pretestEligible(material.pretestEligible)}. {T.pretestOnlyUnanswered}
          </p>
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
        </div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {T.cancel}
          </button>
          <button type="submit" className="btn">
            {T.pretestStart}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
