/*
 * Filename: components/SidePanel.tsx
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { X } from "lucide-react";
import { T } from "../strings.js";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * A panel on the right edge of the screen that leaves the page beside it visible (a list, a PDF).
 * Focus goes inside on open and returns on close; Esc closes it.
 */
export function SidePanel({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  /** For panels that put two columns side by side. */
  wide?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const container = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // A field that asked for the focus (autoFocus) keeps it; otherwise the first control gets it.
    if (!container.current?.contains(document.activeElement)) {
      container.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }
    return () => previous?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <aside
      ref={container}
      className={wide ? "side-panel wide" : "side-panel"}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
    >
      <header className="side-panel-head">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="btn ghost sm"
          aria-label={T.newItemClose}
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      {children}
    </aside>
  );
}
