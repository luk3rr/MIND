/*
 * Filename: App.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useState } from "react";
import { Shell } from "./components/Shell.js";
import { GeneratePage } from "./pages/GeneratePage.js";
import { LibraryPage } from "./pages/LibraryPage.js";
import { MaterialPreviewPage } from "./pages/MaterialPreviewPage.js";
import { PlaceholderPage } from "./pages/PlaceholderPage.js";
import { ReviewPage } from "./pages/ReviewPage.js";
import { ErrorsPage } from "./pages/ErrorsPage.js";
import { PracticePage } from "./pages/PracticePage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { StatsPage } from "./pages/StatsPage.js";
import { StudyPage } from "./pages/StudyPage.js";
import { SetupPage } from "./pages/SetupPage.js";
import { TodayPage } from "./pages/TodayPage.js";
import { WelcomePage } from "./pages/WelcomePage.js";
import { RouterProvider, parseRoute, sectionPath, useRouter } from "./router.js";
import { T } from "./strings.js";
import { WorkspacesProvider } from "./workspaces.js";
import type { WorkspaceInfo } from "./workspaces.js";

interface Boot {
  workspaces: WorkspaceInfo[];
  route: string | null;
}

/** Picks the first path to show: the saved route if it still points to a workspace. */
export function initialPath(boot: Boot): string {
  const first = boot.workspaces[0];
  if (!first) return "/welcome";
  const saved = boot.route ? parseRoute(boot.route) : null;
  if (saved?.name === "section" && boot.workspaces.some((w) => w.id === saved.workspaceId)) {
    return boot.route as string;
  }
  return sectionPath(first.id, "today");
}

function Screen() {
  const { route } = useRouter();
  if (route.name === "section") {
    return (
      <Shell workspaceId={route.workspaceId} section={route.section}>
        {route.section === "today" && <TodayPage workspaceId={route.workspaceId} />}
        {route.section === "settings" && <SettingsPage />}
        {route.section === "library" && route.detailId === undefined && (
          <LibraryPage workspaceId={route.workspaceId} />
        )}
        {route.section === "library" && route.detailId !== undefined && (
          <MaterialPreviewPage
            key={`${route.detailId}-${route.chunkId ?? ""}`}
            workspaceId={route.workspaceId}
            materialId={route.detailId}
            {...(route.chunkId !== undefined ? { chunkId: route.chunkId } : {})}
          />
        )}
        {route.section === "generate" && route.detailId === undefined && (
          <GeneratePage
            workspaceId={route.workspaceId}
            training={{
              ...(route.topicId !== undefined ? { topicId: route.topicId } : {}),
              ...(route.subtype !== undefined ? { subtype: route.subtype } : {}),
            }}
          />
        )}
        {route.section === "generate" && route.detailId !== undefined && (
          <ReviewPage workspaceId={route.workspaceId} runId={route.detailId} />
        )}
        {route.section === "study" && !route.practice && (
          <StudyPage workspaceId={route.workspaceId} />
        )}
        {route.section === "study" && route.practice && (
          <PracticePage workspaceId={route.workspaceId} />
        )}
        {route.section === "stats" && <StatsPage workspaceId={route.workspaceId} />}
        {route.section === "errors" && <ErrorsPage workspaceId={route.workspaceId} />}
        {!["today", "settings", "library", "generate", "study", "stats", "errors"].includes(
          route.section,
        ) && <PlaceholderPage section={route.section} />}
      </Shell>
    );
  }
  if (route.name === "setup") return <SetupPage step={route.step} />;
  return <WelcomePage />;
}

/** Application root: loads the workspaces and the last route, then renders the shell. */
export function App() {
  const [boot, setBoot] = useState<Boot | "error" | null>(null);

  useEffect(() => {
    void Promise.all([
      window.mind.invoke("workspace:list", {}),
      window.mind.invoke("window:getState", {}),
    ])
      .then(([list, state]) => {
        if (!list.ok || !state.ok) {
          setBoot("error");
          return;
        }
        setBoot({ workspaces: list.data.workspaces, route: state.data.route });
      })
      .catch(() => setBoot("error"));
  }, []);

  if (boot === null) return <p role="status">{T.loading}</p>;
  if (boot === "error") return <p role="alert">{T.unknownError}</p>;
  return (
    <WorkspacesProvider initial={boot.workspaces}>
      <RouterProvider initialPath={initialPath(boot)}>
        <Screen />
      </RouterProvider>
    </WorkspacesProvider>
  );
}
