/*
 * Filename: components/ChartBlock.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { T } from "../strings.js";

export const TOOLTIP = {
  contentStyle: {
    background: "var(--panel-2)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    color: "var(--fg)",
  },
  labelStyle: { color: "var(--fg)" },
  cursor: { fill: "rgba(189, 147, 249, 0.15)", stroke: "var(--line)" },
};

export const shortDay = (day: string): string => day.slice(5).replace("-", "/");

/** A chart plus the same numbers as a table, for screen readers and keyboard users. */
export function ChartBlock({
  title,
  hint,
  label,
  children,
  columns,
  rows,
}: {
  title: string;
  hint?: string;
  label: string;
  children: React.ReactNode;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {hint && <p className="muted">{hint}</p>}
      <div role="img" aria-label={label} style={{ width: "100%", height: 220 }}>
        {children}
      </div>
      <details>
        <summary>{T.chartTable}</summary>
        <table aria-label={`${title}: ${T.chartTable}`}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[0])}>
                {row.map((cell, index) => (
                  <td key={index}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
