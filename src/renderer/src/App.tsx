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
import { ReaderPage } from "./pages/ReaderPage.js";
import { ReviewPage } from "./pages/ReviewPage.js";
import { ChatPage } from "./pages/ChatPage.js";
import { ItemsPage } from "./pages/ItemsPage.js";
import { ErrorsPage } from "./pages/ErrorsPage.js";
import { PretestPage } from "./pages/PretestPage.js";
import { PendingFeedbackPage } from "./pages/PendingFeedbackPage.js";
import { PracticePage } from "./pages/PracticePage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { StatsPage } from "./pages/StatsPage.js";
import { StudyPage } from "./pages/StudyPage.js";
import { SetupPage } from "./pages/SetupPage.js";
import { TodayPage } from "./pages/TodayPage.js";
import { WelcomePage } from "./pages/WelcomePage.js";
import { RouterProvider, parseRoute, sectionPath, standaloneRoute, useRouter } from "./router.js";
import { TimeProvider } from "./time.js";
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
  const { route, standalone } = useRouter();
  if (standalone && route.name === "section" && route.detailId !== undefined) {
    return (
      <TimeProvider workspaceId={route.workspaceId} pauseOnLeave={false}>
        <main id="main" className="content" tabIndex={-1}>
          <ReaderPage
            standalone
            workspaceId={route.workspaceId}
            materialId={route.detailId}
            {...(route.page !== undefined ? { initialPage: route.page } : {})}
            {...(route.quote !== undefined ? { quote: route.quote } : {})}
          />
        </main>
      </TimeProvider>
    );
  }
  if (route.name === "section") {
    return (
      <Shell workspaceId={route.workspaceId} section={route.section}>
        {route.section === "today" && <TodayPage workspaceId={route.workspaceId} />}
        {route.section === "settings" && <SettingsPage workspaceId={route.workspaceId} />}
        {route.section === "library" && route.detailId === undefined && (
          <LibraryPage workspaceId={route.workspaceId} />
        )}
        {route.section === "library" && route.detailId !== undefined && route.reader && (
          <ReaderPage
            key={`${route.detailId}-${route.page ?? ""}-${route.quote ?? ""}`}
            workspaceId={route.workspaceId}
            materialId={route.detailId}
            {...(route.page !== undefined ? { initialPage: route.page } : {})}
            {...(route.quote !== undefined ? { quote: route.quote } : {})}
          />
        )}
        {route.section === "library" &&
          route.detailId !== undefined &&
          route.pretest &&
          route.count !== undefined && (
            <PretestPage
              workspaceId={route.workspaceId}
              materialId={route.detailId}
              count={route.count}
            />
          )}
        {route.section === "library" &&
          route.detailId !== undefined &&
          !route.reader &&
          !route.pretest && (
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
        {route.section === "items" && <ItemsPage workspaceId={route.workspaceId} />}
        {route.section === "study" && !route.practice && !route.pendingFeedback && (
          <StudyPage workspaceId={route.workspaceId} />
        )}
        {route.section === "study" && route.pendingFeedback && (
          <PendingFeedbackPage workspaceId={route.workspaceId} />
        )}
        {route.section === "study" && route.practice && (
          <PracticePage workspaceId={route.workspaceId} />
        )}
        {route.section === "stats" && <StatsPage workspaceId={route.workspaceId} />}
        {route.section === "errors" && <ErrorsPage workspaceId={route.workspaceId} />}
        {route.section === "chat" && <ChatPage workspaceId={route.workspaceId} />}
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
  const separate = standaloneRoute(window.location.search);
  return (
    <WorkspacesProvider initial={boot.workspaces}>
      <RouterProvider initialPath={separate ?? initialPath(boot)} standalone={separate !== null}>
        <Screen />
      </RouterProvider>
    </WorkspacesProvider>
  );
}
