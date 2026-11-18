/*
 * Filename: components/ActionMenu.tsx
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { MoreHorizontal } from "lucide-react";

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  /** A destructive action: shown apart, at the end, in the danger color. */
  danger?: boolean;
}

/**
 * A "more actions" button that opens a small menu. Esc and a click outside close it and focus
 * goes back to the button; the arrow keys move between the items.
 */
export function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  const close = (): void => {
    setOpen(false);
    trigger.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const entries = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const at = entries.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    entries[(at + step + entries.length) % entries.length]?.focus();
  };

  const safe = items.filter((item) => !item.danger);
  const danger = items.filter((item) => item.danger);
  const renderItem = (item: ActionMenuItem) => (
    <button
      key={item.label}
      type="button"
      role="menuitem"
      className={item.danger ? "danger" : undefined}
      onClick={() => {
        setOpen(false);
        item.onSelect();
      }}
    >
      {item.label}
    </button>
  );

  return (
    <span className="action-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="btn ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu" role="menu" onKeyDown={onKeyDown}>
          {safe.map(renderItem)}
          {safe.length > 0 && danger.length > 0 && <hr />}
          {danger.map(renderItem)}
        </div>
      )}
    </span>
  );
}
