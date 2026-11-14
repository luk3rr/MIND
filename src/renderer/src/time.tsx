/*
 * Filename: time.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { OutputOf } from "../../core/contracts/index.js";

export type TimeState = OutputOf<"time:state">;

/** `1:02:03` for a number of seconds. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${hours}:${pad(minutes)}:${pad(rest)}`;
}

export interface TimeApi {
  state: TimeState | null;
  /** Seconds of the current session, including the time since the last refresh. */
  activeSeconds: number;
  /** Seconds studied today, including the time since the last refresh. */
  todaySeconds: number;
  start(topicId?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

const TimeContext = createContext<TimeApi | null>(null);

/** The study timer of the open workspace, or null outside a workspace. */
export function useTime(): TimeApi | null {
  return useContext(TimeContext);
}

/** Keeps the timer state in sync with the core and ticks the live seconds once per second. */
export function TimeProvider({
  workspaceId,
  children,
}: {
  workspaceId: number;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<{ state: TimeState; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const apply = useCallback((result: { ok: boolean; data?: TimeState }) => {
    if (result.ok && result.data) setSnapshot({ state: result.data, at: Date.now() });
  }, []);

  useEffect(() => {
    setSnapshot(null);
    let active = true;
    const refresh = (): void => {
      void window.mind.invoke("time:state", { workspaceId }).then((result) => {
        if (active) apply(result.ok ? { ok: true, data: result.data } : { ok: false });
      });
    };
    refresh();
    const off = window.mind.on("time:changed", (payload) => {
      if ((payload as { workspaceId?: number } | null)?.workspaceId === workspaceId) refresh();
    });
    return () => {
      active = false;
      off();
      // Leaving a workspace closes its open interval (FR-6); the session can be resumed.
      void window.mind.invoke("time:pause", { workspaceId });
    };
  }, [workspaceId, apply]);

  const running = snapshot?.state.status === "running";
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const send = useCallback(
    (channel: "time:start" | "time:pause" | "time:resume" | "time:stop", topicId?: number) => {
      const payload =
        channel === "time:start" && topicId !== undefined
          ? { workspaceId, topicId }
          : { workspaceId };
      void window.mind.invoke(channel, payload).then((result) => {
        apply(result.ok ? { ok: true, data: result.data } : { ok: false });
      });
    },
    [workspaceId, apply],
  );

  const api = useMemo<TimeApi>(() => {
    const extra = snapshot && running ? Math.max(0, Math.floor((now - snapshot.at) / 1000)) : 0;
    return {
      state: snapshot?.state ?? null,
      activeSeconds: (snapshot?.state.activeSeconds ?? 0) + extra,
      todaySeconds: (snapshot?.state.todaySeconds ?? 0) + extra,
      start: (topicId) => send("time:start", topicId),
      pause: () => send("time:pause"),
      resume: () => send("time:resume"),
      stop: () => send("time:stop"),
    };
  }, [snapshot, running, now, send]);

  return <TimeContext.Provider value={api}>{children}</TimeContext.Provider>;
}
