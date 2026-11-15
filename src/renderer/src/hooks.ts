/*
 * Filename: hooks.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChannelName, ErrorInfo, InputOf, OutputOf } from "../../core/contracts/index.js";

export type InvokeState<T> =
  { status: "loading" } | { status: "ready"; data: T } | { status: "error"; error: ErrorInfo };

/** Calls a channel when `payload` is set and again when it changes or `reload` runs. */
export function useInvoke<C extends ChannelName>(
  channel: C,
  payload: InputOf<C>,
): { state: InvokeState<OutputOf<C>>; reload(): void } {
  const [state, setState] = useState<InvokeState<OutputOf<C>>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(payload);
  const latest = useRef(0);

  // The channel and payload the current data belongs to: reloading the same call in the background
  // (a poller, a "retry") keeps what is on screen instead of flashing a skeleton and losing the
  // scroll position.
  const shown = useRef<string | null>(null);

  useEffect(() => {
    const request = ++latest.current;
    const identity = `${channel}:${key}`;
    if (shown.current !== identity) setState({ status: "loading" });
    window.mind
      .invoke(channel, JSON.parse(key) as InputOf<C>)
      .then((result) => {
        if (request !== latest.current) return;
        shown.current = result.ok ? identity : null;
        setState(
          result.ok
            ? { status: "ready", data: result.data }
            : { status: "error", error: result.error },
        );
      })
      .catch(() => {
        if (request !== latest.current) return;
        shown.current = null;
        setState({ status: "error", error: { code: "INTERNAL_ERROR", message: "Erro interno." } });
      });
  }, [channel, key, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { state, reload };
}

function normalize(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("mod");
  if (event.altKey) parts.push("alt");
  const key = event.key === " " ? "space" : event.key.toLowerCase();
  parts.push(key);
  return parts.join("+");
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Global keyboard shortcuts such as `mod+k`, `mod+,`, `space` or `1`. A binding without `mod`
 * is ignored while the user types in a field.
 */
export function useHotkeys(bindings: Record<string, () => void>, enabled = true): void {
  const ref = useRef(bindings);
  ref.current = bindings;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      const combo = normalize(event);
      const action = ref.current[combo];
      if (!action) return;
      if (!combo.startsWith("mod+") && isTyping(event.target)) return;
      event.preventDefault();
      action();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
