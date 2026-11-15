/*
 * Filename: hooks-reload.test.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import { useInvoke } from "./hooks.js";

function Probe({ workspaceId }: { workspaceId: number }) {
  const { state, reload } = useInvoke("material:list", { workspaceId });
  return (
    <div>
      <p data-testid="status">{state.status}</p>
      <p data-testid="count">{state.status === "ready" ? state.data.materials.length : "-"}</p>
      <button type="button" onClick={reload}>
        reload
      </button>
    </div>
  );
}

describe("useInvoke reloading (no flashing while a background job runs)", () => {
  it("keeps the data on screen while the same call is reloaded and then updates it", async () => {
    const { state } = installFakeMind({ workspaces: [] });
    const view = render(<Probe workspaceId={1} />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    const seen: string[] = [];
    const observer = new MutationObserver(() =>
      seen.push(screen.getByTestId("status").textContent ?? ""),
    );
    observer.observe(screen.getByTestId("status"), {
      childList: true,
      characterData: true,
      subtree: true,
    });
    state.materials = [
      {
        id: 1,
        title: "novo",
        kind: "md",
        filename: "n.md",
        status: "indexed",
        pageCount: null,
        charCount: 1,
        ocrConfidence: null,
        jobId: null,
        errorCode: null,
        errorDetail: null,
        createdAt: "x",
        sourceUrl: null,
        progress: null,
        chunkCount: 1,
      },
    ];
    await act(async () => {
      screen.getByRole("button", { name: "reload" }).click();
    });
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("1"));
    observer.disconnect();
    expect(seen).not.toContain("loading");
    view.unmount();
  });

  it("shows loading again when the payload changes", async () => {
    installFakeMind({ workspaces: [] });
    const view = render(<Probe workspaceId={1} />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    view.rerender(<Probe workspaceId={2} />);
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
  });
});
