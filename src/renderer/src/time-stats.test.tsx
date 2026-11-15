/*
 * Filename: time-stats.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { idleTime, installFakeMind } from "../test/fake-mind.js";
import type { FakeMaterial } from "../test/fake-mind.js";
import { App } from "./App.js";
import { formatDuration } from "./time.js";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };
const pdf: FakeMaterial = {
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

describe("formatDuration", () => {
  it("formats seconds, minutes and hours", () => {
    expect(formatDuration(30)).toBe("30 s");
    expect(formatDuration(42 * 60 + 10)).toBe("42 min");
    expect(formatDuration(3600 + 5 * 60)).toBe("1 h 05 min");
  });
});

describe("daily time goal on Today (FR-9, US-4)", () => {
  const base = {
    workspaces: [ws],
    route: "/w/1/today",
    summary: { materials: 1, cards: 0, questions: 0 },
    materials: [pdf],
  };

  it("shows the progress toward the goal", async () => {
    installFakeMind({
      ...base,
      time: idleTime({ todaySeconds: 36 * 60, goalMinutes: 60 }),
    });
    render(<App />);
    const card = await screen.findByRole("region", { name: "Tempo de estudo" });
    expect(within(card).getByText("0:36:00")).toBeInTheDocument();
    expect(within(card).getByText(/Meta: 60 min · 60%/)).toBeInTheDocument();
    expect(within(card).getByRole("progressbar", { name: "Meta: 60 min" })).toHaveAttribute(
      "value",
      String(36 * 60),
    );
  });

  it("says the goal was reached", async () => {
    installFakeMind({ ...base, time: idleTime({ todaySeconds: 3700, goalMinutes: 60 }) });
    render(<App />);
    expect(await screen.findByText(/Meta do dia cumprida/)).toBeInTheDocument();
  });

  it("offers to set a goal when there is none", async () => {
    installFakeMind({ ...base, time: idleTime({ goalMinutes: 0 }) });
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Definir meta" }));
    expect(await screen.findByRole("heading", { name: "Configurações" })).toBeInTheDocument();
  });
});

describe("time settings (FR-9, FR-4)", () => {
  it("saves the goal, the idle limit and the automatic switch", async () => {
    const { state, invoke } = installFakeMind({
      workspaces: [ws],
      route: "/w/1/settings",
      materials: [pdf],
    });
    render(<App />);
    const user = userEvent.setup();
    const goal = await screen.findByLabelText(/Meta diária \(minutos/, {}, { timeout: 5000 });
    fireEvent.change(goal, { target: { value: "90" } });
    await user.click(screen.getByRole("checkbox", { name: "Contar o tempo automaticamente" }));
    await user.click(
      within(screen.getByRole("region", { name: "Tempo de estudo" })).getByRole("button", {
        name: "Salvar tempo",
      }),
    );
    expect(
      await screen.findByText("Configurações de tempo salvas.", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(state.timeSettings).toEqual({ dailyGoalMin: 90, idleSeconds: 120, autoEnabled: false });
    expect(invoke).toHaveBeenCalledWith("time:saveSettings", {
      workspaceId: 1,
      dailyGoalMin: 90,
      idleSeconds: 120,
      autoEnabled: false,
    });
  }, 15_000);

  it("shows the validation message returned by the core", async () => {
    installFakeMind({ workspaces: [ws], route: "/w/1/settings", materials: [pdf] });
    render(<App />);
    const user = userEvent.setup();
    const goal = await screen.findByLabelText(/Meta diária \(minutos/, {}, { timeout: 5000 });
    await user.clear(goal);
    await user.type(goal, "700");
    await user.click(
      within(screen.getByRole("region", { name: "Tempo de estudo" })).getByRole("button", {
        name: "Salvar tempo",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Configuração de tempo inválida.");
  });
});

describe("Statistics > time (FR-10, FR-14, US-6)", () => {
  const stats = {
    totalSeconds: 5400,
    avgPerDaySeconds: 771,
    bestDay: { day: "2026-03-09", seconds: 3600 },
    byDay: [
      { day: "2026-03-09", cards: 1800, practice: 0, reading: 1800, manual: 0 },
      { day: "2026-03-10", cards: 900, practice: 900, reading: 0, manual: 0 },
    ],
    byTopic: [
      { topicId: 1, name: "Álgebra", seconds: 2700 },
      { topicId: null, name: null, seconds: 1800 },
    ],
    byMaterial: [{ materialId: 1, title: "apostila", seconds: 1800 }],
  };

  it("shows totals, per topic and per material, and an empty state", async () => {
    const empty = installFakeMind({ workspaces: [ws], route: "/w/1/stats", materials: [pdf] });
    const view = render(<App />);
    expect(
      await screen.findByText("Ainda não há tempo registrado neste período"),
    ).toBeInTheDocument();
    view.unmount();
    empty.state.timeStats = stats;
    installFakeMind({ workspaces: [ws], route: "/w/1/stats", materials: [pdf], timeStats: stats });
    render(<App />);
    expect(await screen.findByText("1 h 30 min")).toBeInTheDocument();
    expect(screen.getByText("12 min")).toBeInTheDocument();
    const byTopic = screen.getByRole("table", { name: "Por tópico" });
    expect(within(byTopic).getByText("Álgebra")).toBeInTheDocument();
    expect(within(byTopic).getByText("Sem tópico")).toBeInTheDocument();
    expect(within(byTopic).getByText("50%")).toBeInTheDocument();
    expect(
      within(screen.getByRole("table", { name: "Por material" })).getByText("apostila"),
    ).toBeInTheDocument();
  });

  it("changes the period and deletes a recent interval after confirming", async () => {
    const { state, invoke } = installFakeMind({
      workspaces: [ws],
      route: "/w/1/stats",
      materials: [pdf],
      timeStats: stats,
      timeSessions: [
        {
          id: 5,
          startedAt: "2026-03-10T10:00:00.000Z",
          endedAt: "2026-03-10T10:10:00.000Z",
          seconds: 600,
          source: "cards",
          day: "2026-03-10",
          topicName: "Álgebra",
          materialTitle: null,
        },
      ],
    });
    render(<App />);
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByRole("combobox", { name: "Período" }), "30");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("time:stats", { workspaceId: 1, days: 30 }),
    );
    await user.click(await screen.findByRole("button", { name: "Excluir intervalo 5" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(state.timeSessions).toEqual([]));
  });
});
