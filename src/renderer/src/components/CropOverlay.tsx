/*
 * Filename: components/CropOverlay.tsx
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import { T } from "../strings.js";

/** A rectangle in fractions of a page (0 to 1), from its top left corner. */
export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The smallest side of a selection, as a fraction of the page; smaller ones are taken as a click. */
export const MIN_CROP = 0.01;

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

/** The rectangle between two corners, in fractions of the page, or null when it is too small. */
export function rectBetween(
  from: { x: number; y: number },
  to: { x: number; y: number },
): PageRect | null {
  const x = clamp(Math.min(from.x, to.x));
  const y = clamp(Math.min(from.y, to.y));
  const width = clamp(Math.max(from.x, to.x)) - x;
  const height = clamp(Math.max(from.y, to.y)) - y;
  return width < MIN_CROP || height < MIN_CROP ? null : { x, y, width, height };
}

/** A layer over a page that draws a rectangle while the pointer drags and reports it on release. */
export function CropOverlay({ onSelect }: { onSelect: (rect: PageRect) => void }): ReactNode {
  const layer = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<PageRect | null>(null);

  const point = (event: PointerEvent): { x: number; y: number } => {
    const box = layer.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return { x: 0, y: 0 };
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  };

  return (
    <div
      ref={layer}
      className="reader-crop-layer"
      role="application"
      aria-label={T.cropLayer}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        if (typeof event.currentTarget.setPointerCapture === "function") {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        setStart(point(event));
        setRect(null);
      }}
      onPointerMove={(event) => {
        if (start) setRect(rectBetween(start, point(event)));
      }}
      onPointerUp={(event) => {
        if (!start) return;
        const chosen = rectBetween(start, point(event));
        setStart(null);
        setRect(null);
        if (chosen) onSelect(chosen);
      }}
      onPointerCancel={() => {
        setStart(null);
        setRect(null);
      }}
    >
      {rect && (
        <div
          className="reader-crop-box"
          style={{
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.width * 100}%`,
            height: `${rect.height * 100}%`,
          }}
        />
      )}
    </div>
  );
}
