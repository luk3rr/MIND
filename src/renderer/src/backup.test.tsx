/*
 * Filename: backup.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

function open(initial: Partial<FakeState> = {}, workspaces = [ws]) {
  const fake = installFakeMind({ workspaces, nextId: workspaces.length + 1, ...initial });
  render(<App />);
  return fake;
}

async function menu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /Workspace: Estudos/ }));
}

describe("Workspace backup (FR-22)", () => {
  it("exports the workspace and shows where the file was saved", async () => {
    const fake = open({ exportPath: "/home/lucas/mind-estudos-2026-11-14.zip" });
    const user = userEvent.setup();
    await menu(user);
    await user.click(screen.getByRole("menuitem", { name: "Exportar…" }));
    const dialog = await screen.findByRole("dialog", { name: "Backup do workspace" });
    expect(
      within(dialog).getByText("Backup salvo em /home/lucas/mind-estudos-2026-11-14.zip."),
    ).toBeVisible();
    expect(fake.invoke).toHaveBeenCalledWith("workspace:export", { id: 1 });
    await user.click(within(dialog).getByRole("button", { name: "Ok" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says nothing when the user cancels the save dialog", async () => {
    open({ exportPath: null });
    const user = userEvent.setup();
    await menu(user);
    await user.click(screen.getByRole("menuitem", { name: "Exportar…" }));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("imports a backup and opens the new workspace on request", async () => {
    const fake = open({ importName: "Biologia (importado)" });
    const user = userEvent.setup();
    await menu(user);
    await user.click(screen.getByRole("menuitem", { name: "Importar backup…" }));
    const dialog = await screen.findByRole("dialog", { name: "Backup do workspace" });
    expect(within(dialog).getByText('Workspace "Biologia (importado)" importado.')).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Abrir workspace" }));
    await waitFor(() => expect(fake.state.route).toBe("/w/2/today"));
    expect(
      await screen.findByRole("button", { name: /Workspace: Biologia \(importado\)/ }),
    ).toBeVisible();
  });

  it("shows the reason when the backup is refused", async () => {
    open({ importName: "x", backupFailure: "O arquivo não é um .zip válido." });
    const user = userEvent.setup();
    await menu(user);
    await user.click(screen.getByRole("menuitem", { name: "Importar backup…" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível concluir o backup. O arquivo não é um .zip válido.",
    );
  });

  it("shows the export failure", async () => {
    open({ exportPath: "/x.zip", backupFailure: "disco cheio" });
    const user = userEvent.setup();
    await menu(user);
    await user.click(screen.getByRole("menuitem", { name: "Exportar…" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("disco cheio");
  });

  it("lets a first-time user import a backup from the welcome screen", async () => {
    const fake = open({ importName: "Restaurado" }, []);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Importar backup…" }));
    const dialog = await screen.findByRole("dialog", { name: "Backup do workspace" });
    await user.click(within(dialog).getByRole("button", { name: "Abrir workspace" }));
    await waitFor(() => expect(fake.state.route).toBe("/w/1/today"));
  });
});
