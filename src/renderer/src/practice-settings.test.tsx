/*
 * Filename: practice-settings.test.tsx
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

function open(initial: Parameters<typeof installFakeMind>[0] = {}) {
  const fake = installFakeMind({ workspaces: [ws], route: "/w/1/settings", ...initial });
  render(<App />);
  return fake;
}

async function section() {
  return within(
    await screen.findByRole("region", { name: "Práticas de estudo" }, { timeout: 5000 }),
  );
}

describe("practice settings (FR-21, US-7)", () => {
  it("starts from the defaults that keep the earlier behaviour", async () => {
    open();
    const form = await section();
    expect(form.getByRole("radio", { name: /Imediato/ })).toBeChecked();
    expect(form.getByRole("checkbox", { name: /Perguntar a confiança/ })).not.toBeChecked();
    expect(form.getByRole("checkbox", { name: /Misturar tópicos por padrão/ })).not.toBeChecked();
  });

  it("saves the three options and keeps them after the settings are opened again", async () => {
    const { state, invoke } = open();
    const user = userEvent.setup();
    const form = await section();
    await user.click(form.getByRole("radio", { name: /Ao fim do bloco/ }));
    await user.click(form.getByRole("checkbox", { name: /Perguntar a confiança/ }));
    await user.click(form.getByRole("checkbox", { name: /Misturar tópicos por padrão/ }));
    await user.click(form.getByRole("button", { name: "Salvar práticas" }));
    expect(await screen.findByText("Configurações das práticas salvas.")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("practice:saveSettings", {
      workspaceId: 1,
      feedback: "block",
      confidence: true,
      interleave: true,
    });
    expect(state.practiceSettings).toEqual({
      feedback: "block",
      confidence: true,
      interleave: true,
    });
  });

  it("shows the saved values when the screen opens", async () => {
    open({ practiceSettings: { feedback: "next_day", confidence: true, interleave: false } });
    const form = await section();
    expect(form.getByRole("radio", { name: /No dia seguinte/ })).toBeChecked();
    expect(form.getByRole("checkbox", { name: /Perguntar a confiança/ })).toBeChecked();
  });

  it("restores the defaults in the form without saving them", async () => {
    const { invoke, state } = open({
      practiceSettings: { feedback: "block", confidence: true, interleave: true },
    });
    const user = userEvent.setup();
    const form = await section();
    await user.click(form.getByRole("button", { name: "Restaurar padrões das práticas" }));
    expect(form.getByRole("radio", { name: /Imediato/ })).toBeChecked();
    expect(form.getByRole("checkbox", { name: /Misturar tópicos por padrão/ })).not.toBeChecked();
    expect(invoke).not.toHaveBeenCalledWith("practice:saveSettings", expect.anything());
    expect(state.practiceSettings).toMatchObject({ feedback: "block" });
    await user.click(form.getByRole("button", { name: "Salvar práticas" }));
    expect(await screen.findByText("Configurações das práticas salvas.")).toBeInTheDocument();
    expect(state.practiceSettings).toEqual({
      feedback: "immediate",
      confidence: false,
      interleave: false,
    });
  });
});
