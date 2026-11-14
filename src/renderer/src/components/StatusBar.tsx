/*
 * Filename: components/StatusBar.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { Moon, Pause, Play, Square, Sun } from "lucide-react";
import type { Theme } from "../theme.js";
import { T } from "../strings.js";
import { formatClock, useTime } from "../time.js";

export function StatusBar({
  theme,
  onToggleTheme,
  keyConfigured,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  keyConfigured: boolean;
}) {
  const Icon = theme === "dark" ? Moon : Sun;
  const time = useTime();
  const active = time?.state && time.state.status !== "idle" ? time.state : null;
  return (
    <footer className="statusbar">
      <span>v{__APP_VERSION__}</span>
      <span>{keyConfigured ? T.providerReady : T.providerNone}</span>
      {time && active && (
        <span className="timer" role="group" aria-label={T.timeSessionActive}>
          <span aria-hidden="true">{active.status === "running" ? "●" : "○"}</span>
          <span>{formatClock(time.activeSeconds)}</span>
          <span>{active.status === "running" ? T.timeRunning : T.timePaused}</span>
          {active.status === "running" ? (
            <button type="button" onClick={time.pause} aria-label={T.timePause}>
              <Pause size={12} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" onClick={time.resume} aria-label={T.timeResume}>
              <Play size={12} aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={time.stop} aria-label={T.timeStop}>
            <Square size={12} aria-hidden="true" />
          </button>
        </span>
      )}
      <span className="spacer" />
      <button type="button" onClick={onToggleTheme} aria-label={T.toggleTheme}>
        <Icon size={14} aria-hidden="true" /> {theme === "dark" ? T.themeDark : T.themeLight}
      </button>
      <span>{T.quickHint}</span>
    </footer>
  );
}
