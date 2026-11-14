/*
 * Filename: components/Shell.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import { useInvoke } from "../hooks.js";
import { SettingsStatusContext } from "../settings-status.js";
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
  const { state: status, reload: refresh } = useInvoke("settings:get", {});
  const needsSetup =
    status.status === "ready" && !(status.data.keyConfigured && status.data.consentGiven);

  const toggleTheme = (): void => {
    const next = nextTheme(theme);
    applyTheme(next);
    saveTheme(next);
    setTheme(next);
  };

  useHotkeys({
    "mod+s": () => setQuick(true),
    "mod+,": () => navigate(sectionPath(workspaceId, "settings")),
  });

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        {T.skipLink}
      </a>
      <Sidebar workspaceId={workspaceId} active={section} />
      <main id="main" className="content" tabIndex={-1}>
        {needsSetup && (
          <p className="alert warn" role="status">
            {T.setupBanner}{" "}
            <button type="button" className="btn ghost" onClick={() => navigate("/setup/1")}>
              {T.setupBannerLink}
            </button>
          </p>
        )}
        <SettingsStatusContext.Provider value={{ state: status, refresh }}>
          {children}
        </SettingsStatusContext.Provider>
      </main>
      <StatusBar
        theme={theme}
        onToggleTheme={toggleTheme}
        keyConfigured={status.status === "ready" && status.data.keyConfigured}
      />
      {quick && <QuickSwitcher workspaceId={workspaceId} onClose={() => setQuick(false)} />}
    </div>
  );
}
