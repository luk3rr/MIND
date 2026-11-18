/*
 * Filename: components/MixControl.tsx
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useState } from "react";
import { useInvoke } from "../hooks.js";
import { T } from "../strings.js";

export type MixBy = "topic" | "material";

export interface MixState {
  on: boolean;
  by: MixBy;
  setOn: (on: boolean) => void;
  setBy: (by: MixBy) => void;
  /** What to send with the request: null when mixing is off or a filter is active. */
  request: { by: MixBy } | null;
  disabled: boolean;
}

/**
 * Whether the queue of the screen is mixed. It starts from the default of the workspace and lasts
 * as long as the screen does; a topic or material filter turns the option off.
 */
export function useMix(workspaceId: number, filtered: boolean): MixState {
  const settings = useInvoke("practice:settings", { workspaceId });
  const [on, setOn] = useState(false);
  const [by, setBy] = useState<MixBy>("topic");
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    if (applied || settings.state.status !== "ready") return;
    setApplied(true);
    setOn(settings.state.data.settings.interleave);
  }, [applied, settings.state]);
  return { on, by, setOn, setBy, request: on && !filtered ? { by } : null, disabled: filtered };
}

/** The "mix topics" option of Study and Practice, with what to alternate by. */
export function MixControl({ mix }: { mix: MixState }) {
  return (
    <div className="stack" role="group" aria-label={T.mixLabel}>
      <label className="row" style={{ alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={mix.on && !mix.disabled}
          disabled={mix.disabled}
          onChange={(event) => mix.setOn(event.target.checked)}
        />
        <span>
          {T.mixLabel}
          <br />
          <span className="muted">{mix.disabled ? T.mixDisabledHint : T.mixHint}</span>
        </span>
      </label>
      {mix.on && !mix.disabled && (
        <label className="row" style={{ alignItems: "center" }}>
          {T.mixByLabel}
          <select
            value={mix.by}
            onChange={(event) => mix.setBy(event.target.value as MixBy)}
            aria-label={T.mixByLabel}
          >
            <option value="topic">{T.mixByTopic}</option>
            <option value="material">{T.mixByMaterial}</option>
          </select>
        </label>
      )}
    </div>
  );
}
