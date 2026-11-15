/*
 * Filename: components/HelpTip.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useId, useState } from "react";
import { T } from "../strings.js";

/**
 * A "? Como funciona" button that opens a short help bubble on hover, focus or click. Escape
 * closes it. `title` heads the bubble and `lines` are its short tips.
 */
export function HelpTip({ title, lines }: { title: string; lines: readonly string[] }) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const id = useId();
  const open = pinned || hover || focus;
  return (
    <span
      className="help-tip"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      // Focus inside keeps the bubble open; moving it out closes it.
      onFocus={() => setFocus(true)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setFocus(false);
        setPinned(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setPinned(false);
          setHover(false);
          setFocus(false);
        }
      }}
    >
      <button
        type="button"
        className="help-tip-button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setPinned((value) => !value)}
      >
        <span className="help-tip-mark" aria-hidden="true">
          ?
        </span>
        {T.helpLabel}
      </button>
      <div id={id} role="tooltip" className="help-tip-bubble" hidden={!open}>
        <strong>{title}</strong>
        <ul>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </span>
  );
}
