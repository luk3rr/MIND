/*
 * Filename: update.test.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };
const release = { version: "0.3.0", url: "https://github.com/luk3rr/MIND/releases/tag/v0.3.0" };

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route, ...initial });
  render(<App />);
  return fake;
}

describe("new version notice (banner)", () => {
  it("tells that a newer version exists, opens it and can be dismissed", async () => {
    const { state, invoke } = open("/w/1/today", {
      update: { enabled: true, current: "0.2.0", available: release, checkedAt: null },
    });
    const user = userEvent.setup();
    const banner = await screen.findByText("Nova versão 0.3.0 disponível (você usa a 0.2.0).");
    expect(banner).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Ver a nova versão" }));
    expect(invoke).toHaveBeenCalledWith("update:openRelease", {});
    expect(state.opened).toEqual([{ kind: "release", materialId: 0 }]);
    await user.click(screen.getByRole("button", { name: "Agora não" }));
    await waitFor(() => expect(banner).not.toBeInTheDocument());
    expect(invoke).toHaveBeenCalledWith("update:dismiss", { version: "0.3.0" });
  });

  it("shows nothing when the app is up to date", async () => {
    open("/w/1/today");
    await screen.findByRole("heading", { name: "Hoje" });
    expect(screen.queryByText(/Nova versão/)).not.toBeInTheDocument();
  });

  it("appears when the main process announces a release while the app is open", async () => {
    const { state } = open("/w/1/today");
    await screen.findByRole("heading", { name: "Hoje" });
    const subscribe = (
      window.mind.on as unknown as { mock: { calls: [string, (p: unknown) => void][] } }
    ).mock.calls.filter(([event]) => event === "update:available");
    expect(subscribe.length).toBeGreaterThan(0);
    state.update = { ...state.update, available: release };
    await act(async () => {
      for (const [, handler] of subscribe) handler(release);
    });
    expect(await screen.findByText(/Nova versão 0.3.0 disponível/)).toBeVisible();
  });
});

describe("update settings", () => {
  it("shows the installed version and turns the automatic notice off and on", async () => {
    const { state } = open("/w/1/settings");
    const user = userEvent.setup();
    const section = await screen.findByRole("region", { name: "Atualizações" });
    expect(within(section).getByText("Versão instalada: 0.2.0")).toBeVisible();
    const box = within(section).getByRole("checkbox", {
      name: "Avisar quando houver uma nova versão",
    });
    expect(box).toBeChecked();
    await user.click(box);
    await waitFor(() => expect(state.update.enabled).toBe(false));
    expect(box).not.toBeChecked();
    await user.click(box);
    await waitFor(() => expect(state.update.enabled).toBe(true));
  });

  it("checks on demand and says what it found", async () => {
    const { state } = open("/w/1/settings");
    const user = userEvent.setup();
    const section = await screen.findByRole("region", { name: "Atualizações" });
    await user.click(within(section).getByRole("button", { name: "Verificar agora" }));
    expect(await within(section).findByText("Você está na versão mais recente.")).toBeVisible();
    state.updateFound = release;
    await user.click(within(section).getByRole("button", { name: "Verificar agora" }));
    expect(await within(section).findByText("Há uma nova versão: 0.3.0.")).toBeVisible();
    state.updateFails = true;
    await user.click(within(section).getByRole("button", { name: "Verificar agora" }));
    expect(await within(section).findByText(/Não foi possível verificar agora/)).toBeVisible();
  });
});
