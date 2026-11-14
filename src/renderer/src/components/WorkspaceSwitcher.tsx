/*
 * Filename: components/WorkspaceSwitcher.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { isErrorInfo, useWorkspaces } from "../workspaces.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { PromptDialog } from "./PromptDialog.js";

type Modal = "create" | "rename" | "delete" | null;

/** Lists, switches, creates, renames and deletes workspaces (US-1). */
export function WorkspaceSwitcher({ activeId }: { activeId: number }) {
  const { workspaces, create, rename, remove } = useWorkspaces();
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const active = workspaces.find((workspace) => workspace.id === activeId);

  const choose = (next: Modal): void => {
    setOpen(false);
    setModal(next);
  };

  return (
    <div className="workspace-switcher">
      <button
        type="button"
        className="workspace-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${T.workspace}: ${active?.name ?? ""}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
      >
        <span>{active?.name ?? T.workspace}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="menu"
          role="menu"
          onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
        >
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              role="menuitem"
              aria-current={workspace.id === activeId}
              onClick={() => {
                setOpen(false);
                navigate(sectionPath(workspace.id, "today"));
              }}
            >
              {workspace.name}
            </button>
          ))}
          <hr />
          <button type="button" role="menuitem" onClick={() => choose("create")}>
            {T.newWorkspace}
          </button>
          <button type="button" role="menuitem" onClick={() => choose("rename")}>
            {T.renameWorkspace}
          </button>
          <button type="button" role="menuitem" onClick={() => choose("delete")}>
            {T.deleteWorkspace}
          </button>
        </div>
      )}
      {modal === "create" && (
        <PromptDialog
          title={T.newWorkspace}
          label={T.workspaceName}
          submitLabel={T.create}
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            const result = await create(name);
            if (isErrorInfo(result)) return result.fields?.[0]?.message ?? result.message;
            navigate(sectionPath(result.id, "today"));
            return null;
          }}
        />
      )}
      {modal === "rename" && active && (
        <PromptDialog
          title={T.renameWorkspace}
          label={T.workspaceName}
          initial={active.name}
          submitLabel={T.save}
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            const result = await rename(active.id, name);
            return isErrorInfo(result) ? (result.fields?.[0]?.message ?? result.message) : null;
          }}
        />
      )}
      {modal === "delete" && active && (
        <ConfirmDialog
          title={T.confirmDelete}
          body={T.confirmDeleteBody(active.name)}
          confirmLabel={T.deleteWorkspace}
          onClose={() => setModal(null)}
          onConfirm={() => {
            void remove(active.id).then(() => {
              const next = workspaces.find((workspace) => workspace.id !== active.id);
              navigate(next ? sectionPath(next.id, "today") : "/welcome");
            });
          }}
        />
      )}
    </div>
  );
}
