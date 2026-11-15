/*
 * Filename: components/SearchCombobox.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { T } from "../strings.js";

export interface ComboOption {
  key: string | number;
  label: string;
  count?: number;
}

function plain(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

type Props = {
  inputId: string;
  label: string;
  placeholder: string;
  options: readonly ComboOption[];
  /** Message shown in the list when nothing matches; the list stays out of the way when omitted. */
  emptyText?: string;
} & (
  | {
      /** Pick one option; the field shows its label and can be cleared. */
      selectedKey: string | number | undefined;
      onSelect: (key: string | number | undefined) => void;
      text?: undefined;
      onText?: undefined;
    }
  | {
      /** Free text with suggestions: any text is fine, an option just fills it in. */
      text: string;
      onText: (text: string) => void;
      selectedKey?: undefined;
      onSelect?: undefined;
    }
);

/**
 * A search box with a list that opens below it and scrolls: the topics grow into the dozens, so
 * a plain menu is not enough. Options with more items come first. Used to pick a topic to filter
 * by (`onSelect`) and to type the topic of a generation (`onText`).
 */
export function SearchCombobox(props: Props) {
  const { inputId, label, placeholder, options, emptyText } = props;
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const free = props.onText !== undefined;
  const selected = options.find((option) => option.key === props.selectedKey);
  const typed = free ? props.text : query;
  const matches = options
    .filter((option) => plain(option.label).includes(plain(typed.trim())))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label));

  const close = (): void => {
    setOpen(false);
    setQuery("");
  };
  const choose = (option: ComboOption | undefined): void => {
    if (free) props.onText(option?.label ?? "");
    else props.onSelect(option?.key);
    close();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setTouched(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((value) => Math.min(Math.max(value + step, 0), matches.length - 1));
    } else if (event.key === "Enter" && open) {
      const option = matches[active];
      // Typing a free topic: Enter keeps the text, it only takes a suggestion after an arrow key.
      if (!free || touched) {
        if (option) {
          event.preventDefault();
          choose(option);
        }
      } else {
        event.preventDefault();
        close();
      }
    } else if (event.key === "Escape") {
      close();
    }
  };

  return (
    <div
      className="combo"
      ref={root}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) close();
      }}
    >
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={free ? props.text : open ? query : (selected?.label ?? "")}
        onFocus={() => {
          setOpen(true);
          setActive(0);
          setTouched(false);
        }}
        onChange={(event) => {
          if (free) props.onText(event.target.value);
          else setQuery(event.target.value);
          setOpen(true);
          setActive(0);
          setTouched(false);
        }}
        onKeyDown={onKeyDown}
      />
      {!free && selected && (
        <button
          type="button"
          className="combo-clear"
          aria-label={T.filterRemoveTopic}
          onClick={() => choose(undefined)}
        >
          ×
        </button>
      )}
      {open && (matches.length > 0 || (emptyText !== undefined && !free)) && (
        <ul id={listId} role="listbox" aria-label={label} className="combo-list">
          {matches.length === 0 && <li className="muted combo-empty">{emptyText}</li>}
          {matches.map((option, index) => (
            <li
              key={option.key}
              role="option"
              aria-selected={option.key === props.selectedKey}
              className={index === active ? "active" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option.label}
              {option.count !== undefined && <span className="muted"> ({option.count})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
