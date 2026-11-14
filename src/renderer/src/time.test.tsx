/*
 * Filename: time.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { idleTime, installFakeMind } from "../test/fake-mind.js";
import { App } from "./App.js";
import { formatClock } from "./time.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };
const material = {
  id: 1,
  title: "apostila",
  kind: "pdf",
  filename: "a.pdf",
  status: "indexed",
  pageCount: 3,
  charCount: 10,
  ocrConfidence: null,
  jobId: 1,
  errorCode: null,
  errorDetail: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  sourceUrl: null,
  progress: null,
  chunkCount: 3,
};

describe("formatClock", () => {
  it("formats seconds as h:mm:ss", () => {
    expect(formatClock(0)).toBe("0:00:00");
    expect(formatClock(65)).toBe("0:01:05");
    expect(formatClock(3 * 3600 + 7 * 60 + 9)).toBe("3:07:09");
    expect(formatClock(-4)).toBe("0:00:00");
  });
});

describe("study timer on Today and in the status bar (FR-7, FR-8, US-1, US-5)", () => {
  it("shows the time of today with a breakdown and starts, pauses, resumes and stops", async () => {
    const { state } = installFakeMind({
      workspaces: [ws],
      route: "/w/1/today",
      summary: { materials: 1, cards: 0, questions: 0 },
      materials: [material],
      time: idleTime({
        todaySeconds: 600,
        bySource: { cards: 300, practice: 0, reading: 0, manual: 300 },
      }),
    });
    render(<App />);
    const card = await screen.findByRole("region", { name: "Tempo de estudo" });
    expect(within(card).getByText("0:10:00")).toBeInTheDocument();
    expect(within(card).getByText(/cartões 5 min · manual 5 min/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(card).getByRole("button", { name: "Iniciar cronômetro" }));
    await waitFor(() => expect(state.time.status).toBe("running"));
    const bar = await screen.findByRole("group", { name: "Cronômetro de estudo" });
    await user.click(within(bar).getByRole("button", { name: "Pausar" }));
    await waitFor(() => expect(state.time.status).toBe("paused"));
    expect(await within(bar).findByText("pausado")).toBeInTheDocument();
    await user.click(within(bar).getByRole("button", { name: "Retomar" }));
    await waitFor(() => expect(state.time.status).toBe("running"));
    await user.click(within(bar).getByRole("button", { name: "Encerrar" }));
    await waitFor(() => expect(state.time.status).toBe("idle"));
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Cronômetro de estudo" })).not.toBeInTheDocument(),
    );
  });

  it("says no time was recorded today and pauses the open interval when leaving the workspace", async () => {
    const { invoke } = installFakeMind({
      workspaces: [ws],
      route: "/w/1/today",
      summary: { materials: 1, cards: 0, questions: 0 },
      materials: [material],
    });
    const view = render(<App />);
    expect(await screen.findByText("Nenhum tempo registrado hoje")).toBeInTheDocument();
    view.unmount();
    expect(invoke).toHaveBeenCalledWith("time:pause", { workspaceId: 1 });
  });
});
