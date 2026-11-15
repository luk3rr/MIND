/*
 * Filename: components/UpdateSettings.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import { useInvoke } from "../hooks.js";
import { T } from "../strings.js";

/** The update notice setting: on or off, the installed version and a manual check. */
export function UpdateSettings() {
  const { state, reload } = useInvoke("update:state", {});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (state.status !== "ready") return null;
  const { enabled, current, checkedAt } = state.data;

  const checkNow = (): void => {
    setBusy(true);
    setMessage(T.updateChecking);
    void window.mind.invoke("update:check", {}).then((result) => {
      setBusy(false);
      if (!result.ok || result.data.outcome === "error") setMessage(T.updateFailed);
      else if (result.data.release) setMessage(T.updateFound(result.data.release.version));
      else setMessage(T.updateUpToDate);
      reload();
    });
  };

  return (
    <section className="card stack" aria-labelledby="update-title">
      <h2 id="update-title">{T.updateSection}</h2>
      <p>{T.updateCurrentVersion(current)}</p>
      <label className="row" style={{ alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) =>
            void window.mind
              .invoke("update:setEnabled", { enabled: event.target.checked })
              .then(reload)
          }
        />
        {T.updateAuto}
      </label>
      <p className="muted">{T.updateAutoHint}</p>
      <div className="row" style={{ alignItems: "center" }}>
        <button type="button" className="btn ghost" disabled={busy} onClick={checkNow}>
          {T.updateCheckNow}
        </button>
        {message && <span role="status">{message}</span>}
      </div>
      {checkedAt && !message && (
        <p className="muted">{T.updateLastChecked(checkedAt.slice(0, 16).replace("T", " "))}</p>
      )}
    </section>
  );
}
