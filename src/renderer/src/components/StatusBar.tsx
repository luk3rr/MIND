/*
 * Filename: components/StatusBar.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { Moon, Sun } from "lucide-react";
import type { Theme } from "../theme.js";
import { T } from "../strings.js";

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
  return (
    <footer className="statusbar">
      <span>v{__APP_VERSION__}</span>
      <span>{keyConfigured ? T.providerReady : T.providerNone}</span>
      <span className="spacer" />
      <button type="button" onClick={onToggleTheme} aria-label={T.toggleTheme}>
        <Icon size={14} aria-hidden="true" /> {theme === "dark" ? T.themeDark : T.themeLight}
      </button>
      <span>{T.quickHint}</span>
    </footer>
  );
}
