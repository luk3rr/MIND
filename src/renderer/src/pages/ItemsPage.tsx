/*
 * Filename: pages/ItemsPage.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useMemo, useState } from "react";
import type { OutputOf } from "../../../core/contracts/index.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { EditItemDialog } from "../components/EditItemDialog.js";
import { usePersistedFilter } from "../components/FilterSelect.js";
import { ListSearch, Pager, usePagedList } from "../components/ListControls.js";
import { SearchCombobox } from "../components/SearchCombobox.js";
import { useInvoke } from "../hooks.js";
import { clozePlain } from "../math.js";
import { T } from "../strings.js";

type Entry = OutputOf<"items:list">["items"][number];
type Full = OutputOf<"review:get">["item"];
type Status = "active" | "draft" | "approved" | "discarded" | "all";
type Bulk = "topic" | "discard" | "restore" | "approve";

/** How many items one page of the table shows. */
const ITEMS_PER_PAGE = 20;
const NO_TOPIC = "none";

const matchesStatus = (entry: Entry, status: Status): boolean =>
  status === "all" ||
  (status === "active" ? entry.status !== "discarded" : entry.status === status);

/** Every item of the workspace in one place: find them, fix their topic and act on many at once. */
export function ItemsPage({ workspaceId }: { workspaceId: number }) {
  const items = useInvoke("items:list", { workspaceId });
  const topics = useInvoke("topics:list", { workspaceId });
  const [status, setStatus] = useState<Status>("active");
  const [kind, setKind] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [topicFilter, setTopicFilter] = usePersistedFilter(
    `mind.filter.${workspaceId}.items-topic`,
  );
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [bulkTopic, setBulkTopic] = useState("");
  const [editing, setEditing] = useState<Full | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = items.state.status === "ready" ? items.state.data.items : [];
  const filtered = useMemo(
    () =>
      all.filter(
        (entry) =>
          matchesStatus(entry, status) &&
          (kind === "" || entry.kind === kind) &&
          (materialId === "" || String(entry.materialId) === materialId) &&
          (topicFilter === ""
            ? true
            : topicFilter === NO_TOPIC
              ? entry.topicId === null
              : String(entry.topicId) === topicFilter),
      ),
    [all, status, kind, materialId, topicFilter],
  );
  const filterKey = `${status}|${kind}|${materialId}|${topicFilter}`;
  const list = usePagedList(
    filtered,
    ITEMS_PER_PAGE,
    (entry) => [entry.front, entry.back, entry.topic ?? "", entry.material ?? ""].join(" "),
    filterKey,
  );
  useEffect(() => setSelected(new Set()), [filterKey]);

  const materials = useMemo(() => {
    const seen = new Map<number, string>();
    for (const entry of all) {
      if (entry.materialId !== null) seen.set(entry.materialId, entry.material ?? "");
    }
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const withoutTopic = all.filter(
    (entry) => entry.topicId === null && entry.status !== "discarded",
  ).length;
  const topicOptions = [
    { key: NO_TOPIC, label: T.itemsNoTopic, count: withoutTopic },
    ...(topics.state.status === "ready"
      ? topics.state.data.topics.map((t) => ({
          key: String(t.id),
          label: t.name,
          count: t.cards + t.questions,
        }))
      : []),
  ];
  const chosenNames = topics.state.status === "ready" ? topics.state.data.topics : [];

  const reloadAll = (): void => {
    items.reload();
    topics.reload();
  };
  const run = (action: Bulk, topic?: string | null): void => {
    setError(null);
    void window.mind
      .invoke("items:bulk", { workspaceId, ids: [...selected], action, topic: topic ?? null })
      .then((result) => {
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setMessage(T.itemsDone(result.data.changed, result.data.skipped));
        setSelected(new Set());
        reloadAll();
      });
  };
  const edit = (id: number): void => {
    void window.mind.invoke("review:get", { workspaceId, itemId: id }).then((result) => {
      if (result.ok) setEditing(result.data.item);
      else setError(result.error.message);
    });
  };
  const toggle = (id: number): void =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const pageIds = list.pageItems.map((entry) => entry.id);
  const pageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const filtersActive =
    status !== "active" || kind !== "" || materialId !== "" || topicFilter !== "";

  return (
    <section aria-labelledby="items-title">
      <h1 id="items-title">{T.itemsTitle}</h1>
      <p className="muted">{T.itemsHint}</p>
      {items.state.status === "loading" && <p role="status">{T.loading}</p>}
      {items.state.status === "error" && (
        <div className="alert" role="alert">
          {items.state.error.message}
        </div>
      )}
      {items.state.status === "ready" && (
        <>
          <div className="filters">
            <select
              aria-label={T.itemsStatus}
              value={status}
              onChange={(event) => setStatus(event.target.value as Status)}
            >
              <option value="active">{T.itemsStatusActive}</option>
              <option value="draft">{T.tabDraft}</option>
              <option value="approved">{T.tabApproved}</option>
              <option value="discarded">{T.tabDiscarded}</option>
              <option value="all">{T.itemsStatusAll}</option>
            </select>
            <select
              aria-label={T.itemsKind}
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="">{T.itemsKindAll}</option>
              <option value="card">{T.kindCards}</option>
              <option value="question">{T.kindQuestions}</option>
            </select>
            <select
              aria-label={T.itemsMaterial}
              value={materialId}
              onChange={(event) => setMaterialId(event.target.value)}
            >
              <option value="">{T.itemsMaterialAll}</option>
              {materials.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
            <SearchCombobox
              inputId="items-topic-filter"
              label={T.itemsTopicPlaceholder}
              placeholder={T.itemsTopicPlaceholder}
              options={topicOptions}
              selectedKey={topicFilter === "" ? undefined : topicFilter}
              onSelect={(key) => setTopicFilter(key === undefined ? "" : String(key))}
            />
            {filtersActive && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setStatus("active");
                  setKind("");
                  setMaterialId("");
                  setTopicFilter("");
                }}
              >
                {T.filterClear}
              </button>
            )}
          </div>
          <p className="muted">
            {T.itemsCount(filtered.length, all.length)}
            {withoutTopic > 0 && ` · ${T.itemsWithoutTopic(withoutTopic)}`}
          </p>
          <ListSearch list={list} label={T.itemsSearch} />

          {selected.size > 0 && (
            <div
              className="card bulk-bar"
              role="region"
              aria-label={T.itemsSelected(selected.size)}
            >
              <strong>{T.itemsSelected(selected.size)}</strong>
              <div className="row">
                <SearchCombobox
                  inputId="items-bulk-topic"
                  label={T.itemsTopicInput}
                  placeholder={T.itemsTopicPlaceholderBulk}
                  options={chosenNames.map((t) => ({
                    key: t.id,
                    label: t.name,
                    count: t.cards + t.questions,
                  }))}
                  text={bulkTopic}
                  onText={setBulkTopic}
                />
                <button
                  type="button"
                  className="btn"
                  disabled={bulkTopic.trim() === ""}
                  onClick={() => run("topic", bulkTopic)}
                >
                  {T.itemsAssignTopic}
                </button>
                <button type="button" className="btn ghost" onClick={() => run("topic", null)}>
                  {T.itemsRemoveTopic}
                </button>
              </div>
              <div className="row">
                <button type="button" className="btn ghost" onClick={() => run("approve")}>
                  {T.itemsApprove}
                </button>
                <button type="button" className="btn ghost" onClick={() => run("restore")}>
                  {T.restore}
                </button>
                <button type="button" className="btn ghost" onClick={() => setConfirming(true)}>
                  {T.discard}
                </button>
                <button type="button" className="btn ghost" onClick={() => setSelected(new Set())}>
                  {T.itemsClearSelection}
                </button>
              </div>
            </div>
          )}
          {message && (
            <p role="status" className="muted">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}

          {filtered.length === 0 ? (
            <p className="muted">{T.itemsEmpty}</p>
          ) : (
            <>
              <table aria-label={T.itemsTitle}>
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        aria-label={T.itemsSelectPage}
                        checked={pageSelected}
                        onChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            for (const id of pageIds) {
                              if (pageSelected) next.delete(id);
                              else next.add(id);
                            }
                            return next;
                          })
                        }
                      />
                    </th>
                    <th scope="col">{T.itemsColumnItem}</th>
                    <th scope="col">{T.itemsKind}</th>
                    <th scope="col">{T.studyTopic}</th>
                    <th scope="col">{T.itemsMaterial}</th>
                    <th scope="col">{T.itemsColumnStatus}</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {list.pageItems.map((entry) => {
                    const text = clozePlain(entry.front);
                    return (
                      <tr key={entry.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={T.itemsSelectRow(text.slice(0, 60))}
                            checked={selected.has(entry.id)}
                            onChange={() => toggle(entry.id)}
                          />
                        </td>
                        <td>{text.length > 140 ? `${text.slice(0, 140)}…` : text}</td>
                        <td>
                          {entry.kind === "question"
                            ? T.kindQuestions
                            : (T.cardTypes[entry.subtype] ?? entry.subtype)}
                        </td>
                        <td>{entry.topic ?? <span className="muted">{T.itemsNoTopic}</span>}</td>
                        <td>{entry.material ?? "—"}</td>
                        <td>{T.itemsStatusLabels[entry.status] ?? entry.status}</td>
                        <td>
                          {entry.status !== "discarded" && (
                            <button
                              type="button"
                              className="btn ghost"
                              aria-label={`${T.edit} ${text.slice(0, 60)}`}
                              onClick={() => edit(entry.id)}
                            >
                              {T.edit}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {list.matches > pageIds.length && selected.size < list.matches && (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => setSelected(new Set(list.matched.map((entry) => entry.id)))}
                >
                  {T.itemsSelectAll(list.matches)}
                </button>
              )}
              <Pager list={list} />
            </>
          )}
        </>
      )}
      {editing && (
        <EditItemDialog
          item={editing}
          workspaceId={workspaceId}
          onClose={() => setEditing(null)}
          onSaved={reloadAll}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={T.itemsDiscardTitle}
          body={T.itemsDiscardBody}
          confirmLabel={T.discard}
          onConfirm={() => run("discard")}
          onClose={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
