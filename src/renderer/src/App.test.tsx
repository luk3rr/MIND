/*
 * Filename: App.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import { App, initialPath } from "./App.js";
import { applyTheme, readTheme } from "./theme.js";

const ws = (id: number, name: string) => ({ id, name, createdAt: "2026-01-01T00:00:00.000Z" });

async function ready() {
  render(<App />);
  await waitFor(() => expect(screen.queryByRole("status", { name: "Carregando" })).toBeNull());
}

describe("initialPath", () => {
  it("opens the welcome page without workspaces", () => {
    expect(initialPath({ workspaces: [], route: "/w/1/study" })).toBe("/welcome");
  });

  it("restores the saved route only when its workspace still exists", () => {
    const workspaces = [ws(2, "B")];
    expect(initialPath({ workspaces, route: "/w/2/study" })).toBe("/w/2/study");
    expect(initialPath({ workspaces, route: "/w/9/study" })).toBe("/w/2/today");
    expect(initialPath({ workspaces, route: null })).toBe("/w/2/today");
    expect(initialPath({ workspaces, route: "/garbage" })).toBe("/w/2/today");
  });
});

describe("App", () => {
  it("shows the welcome page and creates the first workspace", async () => {
    const { state } = installFakeMind();
    await ready();
    const user = userEvent.setup();
    expect(await screen.findByRole("heading", { name: "Bem-vindo ao MIND" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Novo workspace" }));
    await user.type(screen.getByLabelText("Nome do workspace"), "Biologia");
    await user.click(screen.getByRole("button", { name: "Criar" }));
    expect(await screen.findByRole("heading", { name: "Hoje" })).toBeVisible();
    expect(state.workspaces.map((w) => w.name)).toEqual(["Biologia"]);
    expect(state.route).toBe("/w/1/today");
  });

  it("shows the sidebar with the eight sections and marks the active one", async () => {
    installFakeMind({ workspaces: [ws(1, "Estudos")] });
    await ready();
    const nav = await screen.findByRole("navigation", { name: "Principal" });
    const labels = within(nav)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(labels).toEqual([
      "Hoje",
      "Biblioteca",
      "Gerar",
      "Estudar",
      "Estatísticas",
      "Erros",
      "Chat",
    ]);
    expect(screen.getByRole("button", { name: "Configurações" })).toBeVisible();
    expect(within(nav).getByRole("button", { name: "Hoje" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("navigates between sections and records the route", async () => {
    const { state } = installFakeMind({ workspaces: [ws(1, "Estudos")] });
    await ready();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Gerar" }));
    expect(await screen.findByRole("heading", { name: "Gerar" })).toBeVisible();
    expect(screen.getByText("Esta seção chega em breve.")).toBeVisible();
    expect(state.route).toBe("/w/1/generate");
    expect(screen.getByRole("button", { name: "Gerar" })).toHaveAttribute("aria-current", "page");
  });

  it("restores the saved route on start", async () => {
    installFakeMind({ workspaces: [ws(1, "Estudos")], route: "/w/1/stats" });
    await ready();
    expect(await screen.findByRole("heading", { name: "Estatísticas" })).toBeVisible();
  });

  it("starts dark and keeps the toggle choice across a rerender", async () => {
    installFakeMind({ workspaces: [ws(1, "Estudos")] });
    applyTheme(readTheme());
    await ready();
    const user = userEvent.setup();
    expect(document.documentElement.dataset["theme"]).toBe("dark");
    await user.click(await screen.findByRole("button", { name: "Alternar tema claro/escuro" }));
    expect(document.documentElement.dataset["theme"]).toBe("light");
    expect(readTheme()).toBe("light");
    await user.click(screen.getByRole("button", { name: "Alternar tema claro/escuro" }));
    expect(readTheme()).toBe("dark");
  });

  it("opens the quick switcher with Ctrl+K and goes to a section", async () => {
    installFakeMind({ workspaces: [ws(1, "Estudos")] });
    await ready();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Hoje" });
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Ir para" });
    await user.type(within(dialog).getByRole("textbox"), "esta");
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Estatísticas"]);
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Estatísticas" })).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the quick switcher with Escape and returns the focus", async () => {
    installFakeMind({ workspaces: [ws(1, "Estudos")] });
    await ready();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Hoje" });
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens Settings with Ctrl+,", async () => {
    installFakeMind({ workspaces: [ws(1, "Estudos")] });
    await ready();
    await screen.findByRole("heading", { name: "Hoje" });
    await userEvent.setup().keyboard("{Control>},{/Control}");
    expect(await screen.findByRole("heading", { name: "Configurações" })).toBeVisible();
  });

  it("switches workspaces from the switcher", async () => {
    installFakeMind({ workspaces: [ws(1, "Alfa"), ws(2, "Beta")] });
    await ready();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Workspace: Alfa/ }));
    await user.click(screen.getByRole("menuitem", { name: "Beta" }));
    expect(await screen.findByRole("button", { name: /Workspace: Beta/ })).toBeVisible();
  });

  it("renames a workspace and shows validation errors", async () => {
    const { state } = installFakeMind({ workspaces: [ws(1, "Alfa"), ws(2, "Beta")] });
    await ready();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Workspace: Alfa/ }));
    await user.click(screen.getByRole("menuitem", { name: "Renomear" }));
    const input = screen.getByLabelText("Nome do workspace");
    await user.clear(input);
    await user.type(input, "beta");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nome já em uso.");
    await user.clear(input);
    await user.type(input, "Gama");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(state.workspaces.map((w) => w.name)).toEqual(["Gama", "Beta"]));
    expect(await screen.findByRole("button", { name: /Workspace: Gama/ })).toBeVisible();
  });

  it("asks for confirmation before deleting and then goes to another workspace", async () => {
    const { state } = installFakeMind({ workspaces: [ws(1, "Alfa"), ws(2, "Beta")] });
    await ready();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Workspace: Alfa/ }));
    await user.click(screen.getByRole("menuitem", { name: "Excluir" }));
    const dialog = screen.getByRole("dialog", { name: "Excluir workspace" });
    expect(dialog).toHaveTextContent("Alfa");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(state.workspaces).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /Workspace: Alfa/ }));
    await user.click(screen.getByRole("menuitem", { name: "Excluir" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(state.workspaces.map((w) => w.name)).toEqual(["Beta"]));
    expect(await screen.findByRole("button", { name: /Workspace: Beta/ })).toBeVisible();
  });

  it("goes back to the welcome page when the last workspace is deleted", async () => {
    installFakeMind({ workspaces: [ws(1, "Alfa")] });
    await ready();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Workspace: Alfa/ }));
    await user.click(screen.getByRole("menuitem", { name: "Excluir" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Excluir" }));
    expect(await screen.findByRole("heading", { name: "Bem-vindo ao MIND" })).toBeVisible();
  });

  it("shows an error when the first load fails", async () => {
    const { invoke } = installFakeMind();
    invoke.mockRejectedValue(new Error("down"));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Algo deu errado.");
  });
});

describe("Today page", () => {
  it("invites to import material when the library is empty", async () => {
    installFakeMind({ workspaces: [ws(1, "Estudos")] });
    await ready();
    expect(await screen.findByText("Nenhum material ainda")).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Ir para a Biblioteca" }));
    expect(await screen.findByRole("heading", { name: "Biblioteca" })).toBeVisible();
  });

  it("shows the real counts", async () => {
    installFakeMind({
      workspaces: [ws(1, "Estudos")],
      summary: { materials: 3, cards: 42, questions: 7 },
    });
    await ready();
    expect(await screen.findByText("42")).toBeVisible();
    expect(screen.getByText("Cards aprovados")).toBeVisible();
    expect(screen.getByText("7")).toBeVisible();
  });

  it("shows an error with a retry that works", async () => {
    const fake = installFakeMind({
      workspaces: [ws(1, "Estudos")],
      summary: { code: "INTERNAL_ERROR", message: "Erro interno." },
    });
    await ready();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os dados.",
    );
    fake.state.summary = { materials: 1, cards: 0, questions: 0 };
    await userEvent.setup().click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Materiais")).toBeVisible();
  });
});
