/*
 * Filename: hooks.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import { useHotkeys, useInvoke } from "./hooks.js";

function Probe({ onKey }: { onKey: (key: string) => void }) {
  useHotkeys({
    "mod+k": () => onKey("mod+k"),
    "mod+,": () => onKey("mod+,"),
    space: () => onKey("space"),
    "3": () => onKey("3"),
  });
  return <input aria-label="campo" />;
}

describe("useHotkeys", () => {
  it("fires bindings with the modifier and plain keys", async () => {
    const onKey = vi.fn();
    render(<Probe onKey={onKey} />);
    const user = userEvent.setup();
    await user.keyboard("{Control>}k{/Control}");
    await user.keyboard("{Control>},{/Control}");
    await user.keyboard(" ");
    await user.keyboard("3");
    expect(onKey.mock.calls.map((call) => call[0])).toEqual(["mod+k", "mod+,", "space", "3"]);
  });

  it("ignores plain keys while typing in a field but keeps modifier shortcuts", async () => {
    const onKey = vi.fn();
    render(<Probe onKey={onKey} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("campo"));
    await user.keyboard("3 ");
    expect(onKey).not.toHaveBeenCalled();
    await user.keyboard("{Control>}k{/Control}");
    expect(onKey).toHaveBeenCalledWith("mod+k");
  });

  it("does nothing when disabled", async () => {
    const onKey = vi.fn();
    function Disabled() {
      useHotkeys({ space: () => onKey("space") }, false);
      return null;
    }
    render(<Disabled />);
    await userEvent.setup().keyboard(" ");
    expect(onKey).not.toHaveBeenCalled();
  });
});

function Summary({ workspaceId }: { workspaceId: number }) {
  const { state, reload } = useInvoke("today:summary", { workspaceId });
  const [label] = useState("estado");
  return (
    <div>
      <span aria-label={label}>{state.status}</span>
      <button onClick={reload}>recarregar</button>
    </div>
  );
}

describe("useInvoke", () => {
  it("goes from loading to ready and reloads on demand", async () => {
    const { invoke } = installFakeMind();
    render(<Summary workspaceId={1} />);
    expect(screen.getByLabelText("estado")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByLabelText("estado")).toHaveTextContent("ready"));
    await userEvent.setup().click(screen.getByText("recarregar"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  });

  it("reports an error result", async () => {
    installFakeMind({ summary: { code: "WORKSPACE_NOT_FOUND", message: "x" } });
    render(<Summary workspaceId={1} />);
    await waitFor(() => expect(screen.getByLabelText("estado")).toHaveTextContent("error"));
  });

  it("reports an error when the call itself fails", async () => {
    const { invoke } = installFakeMind();
    invoke.mockRejectedValueOnce(new Error("ipc down"));
    render(<Summary workspaceId={1} />);
    await waitFor(() => expect(screen.getByLabelText("estado")).toHaveTextContent("error"));
  });
});
