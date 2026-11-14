/*
 * Filename: workspaces.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ErrorInfo, OutputOf } from "../../core/contracts/index.js";

export type WorkspaceInfo = OutputOf<"workspace:create">;

interface WorkspacesValue {
  workspaces: WorkspaceInfo[];
  create(name: string): Promise<ErrorInfo | WorkspaceInfo>;
  rename(id: number, name: string): Promise<ErrorInfo | WorkspaceInfo>;
  remove(id: number): Promise<ErrorInfo | null>;
  exportBackup(id: number): Promise<ErrorInfo | OutputOf<"workspace:export">>;
  importBackup(): Promise<ErrorInfo | OutputOf<"workspace:import">>;
}

const WorkspacesContext = createContext<WorkspacesValue | null>(null);

export function isErrorInfo(value: object | null): value is ErrorInfo {
  return value !== null && "code" in value;
}

/** Holds the workspace list and the create, rename and delete actions. */
export function WorkspacesProvider({
  initial,
  children,
}: {
  initial: WorkspaceInfo[];
  children: ReactNode;
}) {
  const [workspaces, setWorkspaces] = useState(initial);

  const refresh = useCallback(async () => {
    const result = await window.mind.invoke("workspace:list", {});
    if (result.ok) setWorkspaces(result.data.workspaces);
  }, []);

  useEffect(() => {
    setWorkspaces(initial);
  }, [initial]);

  const value = useMemo<WorkspacesValue>(
    () => ({
      workspaces,
      async create(name) {
        const result = await window.mind.invoke("workspace:create", { name });
        if (!result.ok) return result.error;
        await refresh();
        return result.data;
      },
      async rename(id, name) {
        const result = await window.mind.invoke("workspace:rename", { id, name });
        if (!result.ok) return result.error;
        await refresh();
        return result.data;
      },
      async exportBackup(id) {
        const result = await window.mind.invoke("workspace:export", { id });
        return result.ok ? result.data : result.error;
      },
      async importBackup() {
        const result = await window.mind.invoke("workspace:import", {});
        if (!result.ok) return result.error;
        if (!result.data.cancelled) await refresh();
        return result.data;
      },
      async remove(id) {
        const result = await window.mind.invoke("workspace:delete", { id });
        if (!result.ok) return result.error;
        await refresh();
        return null;
      },
    }),
    [workspaces, refresh],
  );
  return <WorkspacesContext.Provider value={value}>{children}</WorkspacesContext.Provider>;
}

export function useWorkspaces(): WorkspacesValue {
  const value = useContext(WorkspacesContext);
  if (!value) throw new Error("useWorkspaces must be used inside WorkspacesProvider");
  return value;
}
