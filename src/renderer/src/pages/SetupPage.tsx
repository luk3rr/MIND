/*
 * Filename: pages/SetupPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useInvoke } from "../hooks.js";
import { ProviderForm } from "../components/ProviderForm.js";
import { useSettingsStatus } from "../settings-status.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { useWorkspaces } from "../workspaces.js";

/** First-run setup: step 1 asks for the key and models, step 2 for the privacy consent. */
export function SetupPage({ step }: { step: 1 | 2 }) {
  const { navigate } = useRouter();
  const { workspaces } = useWorkspaces();
  const { refresh } = useSettingsStatus();
  const { state, reload } = useInvoke("settings:get", {});

  const leave = (): void => {
    const first = workspaces[0];
    navigate(first ? sectionPath(first.id, "today") : "/welcome");
  };

  return (
    <main className="content" style={{ maxWidth: 640, margin: "6vh auto" }}>
      <h1>{T.setupTitle}</h1>
      <p className="muted">{step === 1 ? T.setupStep1 : T.setupStep2}</p>
      {state.status === "loading" && <p role="status">{T.loading}</p>}
      {state.status === "error" && (
        <div className="alert" role="alert">
          {T.loadError}{" "}
          <button type="button" className="btn ghost" onClick={reload}>
            {T.retry}
          </button>
        </div>
      )}
      {state.status === "ready" && step === 1 && (
        <ProviderForm
          view={state.data}
          submitLabel={T.continue}
          onSaved={() => {
            refresh();
            navigate("/setup/2");
          }}
        />
      )}
      {state.status === "ready" && step === 2 && (
        <>
          <section className="card">
            <h2>{T.privacyTitle}</h2>
            <p>{T.privacyText}</p>
          </section>
          <p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void window.mind.invoke("settings:setConsent", { given: true }).then(() => {
                  refresh();
                  leave();
                });
              }}
            >
              {T.accept}
            </button>
          </p>
        </>
      )}
    </main>
  );
}
