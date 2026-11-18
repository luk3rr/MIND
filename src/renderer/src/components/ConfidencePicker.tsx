/*
 * Filename: components/ConfidencePicker.tsx
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect } from "react";
import { T } from "../strings.js";

export type Confidence = 1 | 2 | 3;

const LEVELS: readonly Confidence[] = [1, 2, 3];

/**
 * How sure the student is before answering: a guess, thinks so, certain. Operable by keyboard
 * (the radio group, or Alt+1 to Alt+3 from anywhere on the screen).
 */
export function ConfidencePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Confidence | null;
  onChange: (level: Confidence) => void;
  disabled?: boolean;
}) {
  useEffect(() => {
    if (disabled) return;
    const handle = (event: KeyboardEvent): void => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const level = LEVELS.find((candidate) => event.code === `Digit${candidate}`);
      if (!level) return;
      event.preventDefault();
      onChange(level);
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [disabled, onChange]);

  return (
    <div className="row" style={{ alignItems: "center" }}>
      <span id="confidence-label">{T.confidenceQuestion}</span>
      <div className="row" role="radiogroup" aria-labelledby="confidence-label">
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={value === level}
            disabled={disabled}
            className={`btn ${value === level ? "" : "ghost"}`}
            onClick={() => onChange(level)}
          >
            {T.confidenceLevels[String(level)]}
          </button>
        ))}
      </div>
    </div>
  );
}
