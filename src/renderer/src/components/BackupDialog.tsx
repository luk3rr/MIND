/*
 * Filename: components/BackupDialog.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import { sectionPath, useRouter } from "../router.js";
import { T } from "../strings.js";
import { isErrorInfo, useWorkspaces } from "../workspaces.js";
import { Dialog } from "./Dialog.js";

type Notice = { kind: "ok" | "error"; message: string; openId?: number };

/** Runs the backup actions and reports the result in a dialog (FR-22). */
export function useBackup(): {
  exportBackup(id: number): void;
  importBackup(): void;
  notice: React.ReactNode;
} {
  const { exportBackup, importBackup } = useWorkspaces();
  const { navigate } = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = (next: Notice | null): void => {
    setBusy(false);
    setNotice(next);
  };

  return {
    exportBackup(id) {
      setBusy(true);
      void exportBackup(id).then((result) => {
        if (isErrorInfo(result)) finish({ kind: "error", message: result.message });
        else if (result.cancelled || result.path === null) finish(null);
        else finish({ kind: "ok", message: T.backupExported(result.path) });
      });
    },
    importBackup() {
      setBusy(true);
      void importBackup().then((result) => {
        if (isErrorInfo(result)) finish({ kind: "error", message: result.message });
        else if (result.cancelled || result.workspace === null) finish(null);
        else {
          finish({
            kind: "ok",
            message: T.backupImported(result.workspace.name),
            openId: result.workspace.id,
          });
        }
      });
    },
    notice: (
      <>
        {busy && (
          <p role="status" className="muted">
            {T.backupWorking}
          </p>
        )}
        {notice && (
          <Dialog title={T.backupTitle} onClose={() => setNotice(null)}>
            <p role={notice.kind === "error" ? "alert" : "status"}>
              {notice.kind === "error" ? `${T.backupFailed} ${notice.message}` : notice.message}
            </p>
            <div className="actions">
              {notice.openId !== undefined && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    navigate(sectionPath(notice.openId as number, "today"));
                    setNotice(null);
                  }}
                >
                  {T.backupOpen}
                </button>
              )}
              <button type="button" className="btn ghost" onClick={() => setNotice(null)}>
                {T.backupOk}
              </button>
            </div>
          </Dialog>
        )}
      </>
    ),
  };
}
