/*
 * Filename: images-storage.test.tsx
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";
import { formatBytes } from "./components/ImageStorage.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

function open(stats?: Partial<FakeState["images"]["stats"]>) {
  const fake = installFakeMind({ workspaces: [ws], route: "/w/1/settings" });
  if (stats) fake.state.images.stats = { ...fake.state.images.stats, ...stats };
  render(<App />);
  return fake;
}

beforeEach(() => window.localStorage.clear());

describe("formatBytes", () => {
  it("writes sizes the way a person reads them", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
  });
});

describe("Image storage in the settings (FR-17)", () => {
  it("shows how much room the pictures take and that none is unused", async () => {
    open({ count: 148, bytes: 312 * 1024 * 1024 });
    const section = await screen.findByRole("region", { name: "Armazenamento de imagens" });
    expect(within(section).getByText("312 MB")).toBeVisible();
    expect(within(section).getByText("em 148 imagens")).toBeVisible();
    expect(within(section).getByText("Nenhuma imagem sem uso.")).toBeVisible();
    expect(within(section).queryByRole("button", { name: "Limpar agora" })).toBeNull();
  });

  it("clears the unused pictures only after a confirmation", async () => {
    const fake = open({
      count: 10,
      bytes: 50 * 1024 * 1024,
      unusedCount: 9,
      unusedBytes: 12 * 1024 * 1024,
    });
    const user = userEvent.setup();
    const section = await screen.findByRole("region", { name: "Armazenamento de imagens" });
    expect(
      within(section).getByText(/9 imagens não são usadas por nenhum item \(12 MB\)/),
    ).toBeVisible();
    await user.click(within(section).getByRole("button", { name: "Limpar agora" }));
    const dialog = await screen.findByRole("dialog", { name: "Limpar agora" });
    expect(fake.state.images.sweeps).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Limpar agora" }));
    await waitFor(() => expect(fake.state.images.sweeps).toEqual([{ workspaceId: 1, now: true }]));
    expect(await within(section).findByText("9 imagens removidas (12 MB).")).toBeVisible();
    expect(await within(section).findByText("Nenhuma imagem sem uso.")).toBeVisible();
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const fake = open({ unusedCount: 1, unusedBytes: 1024 });
    const user = userEvent.setup();
    const section = await screen.findByRole("region", { name: "Armazenamento de imagens" });
    await user.click(within(section).getByRole("button", { name: "Limpar agora" }));
    const dialog = await screen.findByRole("dialog", { name: "Limpar agora" });
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(fake.state.images.sweeps).toHaveLength(0);
  });
});
