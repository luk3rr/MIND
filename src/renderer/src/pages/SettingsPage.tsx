/*
 * Filename: pages/SettingsPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import { ImageStorage } from "../components/ImageStorage.js";
import { ProviderForm } from "../components/ProviderForm.js";
import { useInvoke } from "../hooks.js";
import { useSettingsStatus } from "../settings-status.js";
import { PracticeSettingsForm } from "../components/PracticeSettingsForm.js";
import { StudySettingsForm } from "../components/StudySettingsForm.js";
import { TimeSettingsForm } from "../components/TimeSettingsForm.js";
import { UpdateSettings } from "../components/UpdateSettings.js";
import { T } from "../strings.js";
import { ListSearch, Pager, usePagedList } from "../components/ListControls.js";

/** How many calls of the month one page shows. */
const CALLS_PER_PAGE = 15;

function CostPanel({ month }: { month: string }) {
  const [yearText = "", monthText = ""] = month.split("-");
  const { state } = useInvoke("settings:getCost", {
    year: Number(yearText),
    month: Number(monthText),
  });
  const lines = usePagedList(
    state.status === "ready" ? state.data.lines : [],
    CALLS_PER_PAGE,
    (line) => `${line.at} ${line.model} ${line.purpose}`,
    month,
  );
  return (
    <section className="card stack" aria-labelledby="cost-title">
      <h2 id="cost-title">{T.costLines}</h2>
      {state.status === "ready" && state.data.lines.length === 0 && (
        <p className="muted">{T.costNone}</p>
      )}
      {state.status === "ready" && state.data.lines.length > 0 && (
        <>
          <ListSearch list={lines} label={T.listSearchCalls} />
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Modelo</th>
                <th>Uso</th>
                <th>{T.usd}</th>
              </tr>
            </thead>
            <tbody>
              {lines.pageItems.map((line) => (
                <tr key={`${line.at}-${line.model}-${line.purpose}`}>
                  <td>{line.at.slice(0, 16).replace("T", " ")}</td>
                  <td>{line.model}</td>
                  <td>{line.purpose}</td>
                  <td>{line.costUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager list={lines} />
        </>
      )}
    </section>
  );
}

/** Settings: provider, privacy and cost panels. Backup and appearance arrive in later units. */
export function SettingsPage({ workspaceId }: { workspaceId: number }) {
  const { state, refresh } = useSettingsStatus();
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const changed = (text: string | null): void => {
    setMessage(text);
    setVersion((value) => value + 1);
    refresh();
  };

  if (state.status !== "ready") {
    return (
      <section aria-labelledby="settings-title">
        <h1 id="settings-title">{T.settings}</h1>
        {state.status === "loading" && <p role="status">{T.loading}</p>}
        {state.status === "error" && <p role="alert">{T.loadError}</p>}
      </section>
    );
  }
  const view = state.data;
  return (
    <section aria-labelledby="settings-title">
      <h1 id="settings-title">{T.settings}</h1>
      {message && (
        <p className="muted" role="status">
          {message}
        </p>
      )}
      <section className="card stack" aria-labelledby="provider-title">
        <h2 id="provider-title">{T.provider}</h2>
        <ProviderForm
          key={`${version}-${view.keyConfigured}`}
          view={view}
          submitLabel="Salvar"
          onSaved={() => changed(T.settingsSaved)}
        />
        <div className="row">
          {view.keySource === "stored" && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                void window.mind.invoke("settings:clearKey", {}).then(() => changed(null));
              }}
            >
              {T.keyRemove}
            </button>
          )}
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              void window.mind.invoke("settings:refreshModels", {}).then((result) => {
                changed(
                  result.ok && result.data.refreshed ? T.modelsRefreshed : T.modelsRefreshFailed,
                );
              });
            }}
          >
            {T.refreshModels}
          </button>
        </div>
      </section>
      <StudySettingsForm workspaceId={workspaceId} />
      <PracticeSettingsForm workspaceId={workspaceId} />
      <TimeSettingsForm workspaceId={workspaceId} />
      <UpdateSettings />
      <section className="card stack" aria-labelledby="privacy-title">
        <h2 id="privacy-title">{T.privacyTitle}</h2>
        <p>{T.privacyText}</p>
        <p className="muted">{view.consentGiven ? T.consentGiven : T.consentMissing}</p>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            void window.mind
              .invoke("settings:setConsent", { given: !view.consentGiven })
              .then(() => changed(null));
          }}
        >
          {view.consentGiven ? T.consentRevoke : T.accept}
        </button>
      </section>
      <section className="card stack">
        <h2>{T.spentMonth}</h2>
        <p>
          <strong>
            {T.usd} {view.spentThisMonth.toFixed(2)}
          </strong>{" "}
          <span className="muted">
            ({view.month}, limite {T.usd} {view.monthlyLimitUsd.toFixed(2)})
          </span>
        </p>
      </section>
      <ImageStorage workspaceId={workspaceId} />
      <CostPanel key={`${view.month}-${version}`} month={view.month} />
    </section>
  );
}
