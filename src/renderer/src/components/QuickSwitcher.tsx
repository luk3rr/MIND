/*
 * Filename: components/QuickSwitcher.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useId, useMemo, useState } from "react";
import { sectionPath, useRouter } from "../router.js";
import { SECTIONS } from "../sections.js";
import { T } from "../strings.js";
import { Dialog } from "./Dialog.js";

/** Ctrl+S: type to filter the sections and press Enter to go there. */
export function QuickSwitcher({
  workspaceId,
  onClose,
}: {
  workspaceId: number;
  onClose: () => void;
}) {
  const { navigate } = useRouter();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const matches = useMemo(
    () =>
      SECTIONS.filter((section) =>
        section.label.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")),
      ),
    [query],
  );
  const go = (slug: (typeof SECTIONS)[number]["slug"]): void => {
    navigate(sectionPath(workspaceId, slug));
    onClose();
  };

  return (
    <Dialog title={T.quickGo} onClose={onClose}>
      <label htmlFor={inputId} className="muted">
        {T.quickPlaceholder}
      </label>
      <input
        id={inputId}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIndex((value) => Math.min(value + 1, matches.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setIndex((value) => Math.max(value - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const target = matches[index];
            if (target) go(target.slug);
          }
        }}
        autoComplete="off"
      />
      <ul className="quick-list">
        {matches.map((section, position) => (
          <li key={section.slug}>
            <button type="button" data-active={position === index} onClick={() => go(section.slug)}>
              {section.label}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
