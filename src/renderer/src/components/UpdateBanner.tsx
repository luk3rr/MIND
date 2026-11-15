/*
 * Filename: components/UpdateBanner.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect } from "react";
import { useInvoke } from "../hooks.js";
import { T } from "../strings.js";

/** Tells that a newer version was released, with a link to it; "Agora não" hides it for that version. */
export function UpdateBanner() {
  const { state, reload } = useInvoke("update:state", {});
  useEffect(() => window.mind.on("update:available", () => reload()), [reload]);
  if (state.status !== "ready" || !state.data.available) return null;
  const { available, current } = state.data;
  return (
    <p className="alert info" role="status">
      {T.updateAvailable(available.version, current)}{" "}
      <button
        type="button"
        className="btn"
        onClick={() => void window.mind.invoke("update:openRelease", {})}
      >
        {T.updateSee}
      </button>{" "}
      <button
        type="button"
        className="btn ghost"
        onClick={() =>
          void window.mind.invoke("update:dismiss", { version: available.version }).then(reload)
        }
      >
        {T.updateLater}
      </button>
    </p>
  );
}
