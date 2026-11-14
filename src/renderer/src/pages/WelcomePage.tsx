/*
 * Filename: pages/WelcomePage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import { PromptDialog } from "../components/PromptDialog.js";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { isErrorInfo, useWorkspaces } from "../workspaces.js";

/** Shown when there is no workspace yet. */
export function WelcomePage() {
  const { create } = useWorkspaces();
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <main className="content" style={{ maxWidth: 560, margin: "10vh auto" }}>
      <h1>{T.welcomeTitle}</h1>
      <div className="card">
        <p>{T.welcomeBody}</p>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          {T.newWorkspace}
        </button>
      </div>
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
