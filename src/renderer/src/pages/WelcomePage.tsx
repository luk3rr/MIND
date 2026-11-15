/*
 * Filename: pages/WelcomePage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import { useBackup } from "../components/BackupDialog.js";
import { PromptDialog } from "../components/PromptDialog.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { isErrorInfo, useWorkspaces } from "../workspaces.js";

/** The start screen: the first workspace to create, or the list to pick from, create or import. */
export function WelcomePage() {
  const { create, workspaces } = useWorkspaces();
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const backup = useBackup();

  return (
    <main className="content" style={{ maxWidth: 560, margin: "10vh auto" }}>
      <h1>{workspaces.length > 0 ? T.welcomePickTitle : T.welcomeTitle}</h1>
      <div className="card stack">
        <p>{workspaces.length > 0 ? T.welcomePickBody : T.welcomeBody}</p>
        {workspaces.length > 0 && (
          <ul className="quick-list" aria-label={T.workspace}>
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <button
                  type="button"
                  aria-label={T.welcomeOpen(workspace.name)}
                  onClick={() => navigate(sectionPath(workspace.id, "today"))}
                >
                  {workspace.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          {T.newWorkspace}
        </button>{" "}
        <button type="button" className="btn ghost" onClick={backup.importBackup}>
          {T.importWorkspace}
        </button>
      </div>
      {backup.notice}
      {open && (
        <PromptDialog
          title={T.newWorkspace}
          label={T.workspaceName}
          submitLabel={T.create}
          onClose={() => setOpen(false)}
          onSubmit={async (name) => {
            const result = await create(name);
            if (isErrorInfo(result)) return result.fields?.[0]?.message ?? result.message;
            navigate(sectionPath(result.id, "today"));
            return null;
          }}
        />
      )}
    </main>
  );
}
