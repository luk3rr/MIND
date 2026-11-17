/*
 * Filename: components/SidePanel.test.tsx
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SidePanel } from "./SidePanel.js";

describe("SidePanel", () => {
  it("is labelled, moves focus inside, closes with Esc and gives focus back", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const view = render(
      <SidePanel title="Novo cartão" onClose={onClose}>
        <input aria-label="Campo" />
      </SidePanel>,
    );
    const panel = screen.getByRole("dialog", { name: "Novo cartão" });
    expect(panel).toHaveAttribute("aria-modal", "false");
    expect(panel.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
