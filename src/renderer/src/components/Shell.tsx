/*
 * Filename: components/Shell.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import { useHotkeys } from "../hooks.js";
import { sectionPath, useRouter } from "../router.js";
import type { SectionSlug } from "../sections.js";
import { T } from "../strings.js";
import { applyTheme, nextTheme, readTheme, saveTheme } from "../theme.js";
import type { Theme } from "../theme.js";
import { QuickSwitcher } from "./QuickSwitcher.js";
import { Sidebar } from "./Sidebar.js";
import { StatusBar } from "./StatusBar.js";
import type { ReactNode } from "react";

/** The application frame: sidebar, content, status bar, theme and global shortcuts. */
export function Shell({
  workspaceId,
  section,
  children,
}: {
  workspaceId: number;
  section: SectionSlug;
  children: ReactNode;
}) {
  const { navigate } = useRouter();
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [quick, setQuick] = useState(false);

  const toggleTheme = (): void => {
    const next = nextTheme(theme);
    applyTheme(next);
    saveTheme(next);
    setTheme(next);
  };

  useHotkeys({
    "mod+k": () => setQuick(true),
    "mod+,": () => navigate(sectionPath(workspaceId, "settings")),
  });

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        {T.skipLink}
      </a>
      <Sidebar workspaceId={workspaceId} active={section} />
      <main id="main" className="content" tabIndex={-1}>
        {children}
      </main>
      <StatusBar theme={theme} onToggleTheme={toggleTheme} />
      {quick && <QuickSwitcher workspaceId={workspaceId} onClose={() => setQuick(false)} />}
    </div>
  );
}
