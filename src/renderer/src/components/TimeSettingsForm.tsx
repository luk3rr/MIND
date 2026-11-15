/*
 * Filename: components/TimeSettingsForm.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useInvoke } from "../hooks.js";
import { T } from "../strings.js";

/** Study time settings of the open workspace: daily goal, idle limit and automatic counting. */
export function TimeSettingsForm({ workspaceId }: { workspaceId: number }) {
  const { state } = useInvoke("time:getSettings", { workspaceId });
  const [goal, setGoal] = useState("");
  const [idle, setIdle] = useState("");
  const [auto, setAuto] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (state.status !== "ready") return;
    setGoal(String(state.data.dailyGoalMin));
    setIdle(String(state.data.idleSeconds));
    setAuto(state.data.autoEnabled);
  }, [state]);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setSaved(false);
    void window.mind
      .invoke("time:saveSettings", {
        workspaceId,
        dailyGoalMin: Number(goal),
        idleSeconds: Number(idle),
        autoEnabled: auto,
      })
      .then((result) => {
        if (result.ok) {
          setErrors({});
          setSaved(true);
          return;
        }
        setErrors(
          Object.fromEntries(
            (result.error.fields ?? []).map((field) => [field.field, field.message]),
          ),
        );
      });
  };

  if (state.status !== "ready") return null;
  return (
    <section className="card stack" aria-labelledby="time-settings-title">
      <h2 id="time-settings-title">{T.timeTitle}</h2>
      <form onSubmit={submit} noValidate className="stack">
        <div className="field">
          <label htmlFor="time-goal">{T.timeGoalLabel}</label>
          <input
            id="time-goal"
            type="number"
            min={0}
            max={600}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
          />
          {errors["dailyGoalMin"] && (
            <p role="alert" className="alert">
              {errors["dailyGoalMin"]}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="time-idle">{T.timeIdleLabel}</label>
          <input
            id="time-idle"
            type="number"
            min={30}
            max={600}
            value={idle}
            onChange={(event) => setIdle(event.target.value)}
          />
          {errors["idleSeconds"] && (
            <p role="alert" className="alert">
              {errors["idleSeconds"]}
            </p>
          )}
        </div>
        <label className="row" style={{ alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={auto}
            onChange={(event) => setAuto(event.target.checked)}
          />
          {T.timeAutoLabel}
        </label>
        <div className="actions">
          <button type="submit" className="btn">
            {T.timeSave}
          </button>
        </div>
        {saved && <p role="status">{T.timeSettingsSaved}</p>}
      </form>
    </section>
  );
}
