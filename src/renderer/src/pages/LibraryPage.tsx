/*
 * Filename: pages/LibraryPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { PromptDialog } from "../components/PromptDialog.js";
import { useInvoke } from "../hooks.js";
import { materialPath, useRouter, readerPath } from "../router.js";
import { T } from "../strings.js";

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
    </>
  );
}

/** The library: import files, follow the progress, search the text and open a preview. */
export function LibraryPage({ workspaceId }: { workspaceId: number }) {
  const { navigate } = useRouter();
  const { state, reload } = useInvoke("material:list", { workspaceId });
  const [errors, setErrors] = useState<{ file: string; message: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Material | null>(null);
  const [askUrl, setAskUrl] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<OutputOf<"material:search">["hits"] | null>(null);

  const anyActive =
    state.status === "ready" && state.data.materials.some((m) => ACTIVE.has(m.status));
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
                </button>
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
          <table>
            <thead>
              <tr>
                <th>{T.materialName}</th>
                <th>{T.materialKind}</th>
                <th>{T.materialPages}</th>
                <th>{T.materialStatus}</th>
                <th>{T.materialChunks}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.data.materials.map((material) => (
                <tr key={material.id}>
                  <td>
                    <button
                      type="button"
                      className="link"
                      onClick={() => navigate(materialPath(workspaceId, material.id))}
                    >
                      {material.title}
                    </button>
                  </td>
                  <td>{material.kind}</td>
                  <td>{material.pageCount ?? "—"}</td>
                  <td>
                    <StatusCell material={material} />
                  </td>
                  <td>{material.chunkCount}</td>
                  <td>
                    {material.status === "indexed" && (
                      <span className="row" style={{ display: "inline-flex", gap: 6 }}>
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
                              aria-label={T.openActionLabel(T.openNewWindow, material.title)}
                              onClick={() => openAction("reader:openWindow", material.id)}
                            >
                              {T.openNewWindow}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="btn ghost"
                          aria-label={T.openActionLabel(
                            material.kind === "pdf" ? T.openInSystem : T.openOriginal,
                            material.title,
                          )}
                          onClick={() => openAction("material:openOriginal", material.id)}
                        >
                          {material.kind === "pdf" ? T.openInSystem : T.openOriginal}
                        </button>
                      </span>
                    )}{" "}
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setToDelete(material)}
                    >
                      {T.deleteWorkspace}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
