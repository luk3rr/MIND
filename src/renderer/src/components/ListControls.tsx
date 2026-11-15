/*
 * Filename: components/ListControls.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useMemo, useState } from "react";
import { T } from "../strings.js";

/** The search box only shows up when a list has at least this many items. */
export const SEARCH_MIN = 6;

function plain(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface PagedList<T> {
  /** The items of the current page, after the search. */
  pageItems: T[];
  /** How many items the list has before the search. */
  total: number;
  /** How many match the search. */
  matches: number;
  query: string;
  setQuery: (query: string) => void;
  page: number;
  pageCount: number;
  setPage: (page: number) => void;
  pageSize: number;
}

/**
 * Pages and searches a list that is already in memory (everything here is local data). The search
 * finds every word typed, ignoring case and accents, in the text `text(item)` gives. A change of
 * `resetKey` (a tab or a filter of the screen) goes back to the first page and clears the search.
 */
export function usePagedList<T>(
  items: readonly T[],
  pageSize: number,
  text: (item: T) => string,
  resetKey: unknown = null,
): PagedList<T> {
  const [query, setQueryState] = useState("");
  const [page, setPageState] = useState(1);
  useEffect(() => {
    setQueryState("");
    setPageState(1);
  }, [resetKey]);

  const words = plain(query).split(/\s+/).filter(Boolean);
  const found = useMemo(
    () =>
      words.length === 0
        ? [...items]
        : items.filter((item) => {
            const haystack = plain(text(item));
            return words.every((word) => haystack.includes(word));
          }),
    // `text` is a plain function of the item; the query and the items are what change the result.
    [items, query],
  );
  const pageCount = Math.max(Math.ceil(found.length / pageSize), 1);
  // A list that shrinks (an item discarded) never leaves the person on a page that is gone.
  const current = Math.min(page, pageCount);
  return {
    pageItems: found.slice((current - 1) * pageSize, current * pageSize),
    total: items.length,
    matches: found.length,
    query,
    setQuery: (next) => {
      setQueryState(next);
      setPageState(1);
    },
    page: current,
    pageCount,
    setPage: setPageState,
    pageSize,
  };
}

/** The search box above a list; hidden while the list is short. */
export function ListSearch<T>({ list, label }: { list: PagedList<T>; label: string }) {
  if (list.total < SEARCH_MIN && list.query === "") return null;
  return (
    <div className="list-search" role="search">
      <input
        type="search"
        aria-label={label}
        placeholder={label}
        value={list.query}
        onChange={(event) => list.setQuery(event.target.value)}
      />
    </div>
  );
}

/** "11–20 de 57" with previous and next, below a list; says so when the search finds nothing. */
export function Pager<T>({ list }: { list: PagedList<T> }) {
  if (list.matches === 0 && list.query !== "") {
    return <p className="muted">{T.listNoMatches(list.query)}</p>;
  }
  if (list.pageCount <= 1) return null;
  const from = (list.page - 1) * list.pageSize + 1;
  const to = Math.min(list.page * list.pageSize, list.matches);
  return (
    <nav className="pager" aria-label={T.listPagination}>
      <span className="muted" role="status">
        {T.listRange(from, to, list.matches)}
      </span>
      <div className="actions">
        <button
          type="button"
          className="btn ghost sm"
          disabled={list.page <= 1}
          onClick={() => list.setPage(list.page - 1)}
        >
          {T.listPrevious}
        </button>
        <span className="muted">{T.listPage(list.page, list.pageCount)}</span>
        <button
          type="button"
          className="btn ghost sm"
          disabled={list.page >= list.pageCount}
          onClick={() => list.setPage(list.page + 1)}
        >
          {T.listNext}
        </button>
      </div>
    </nav>
  );
}
