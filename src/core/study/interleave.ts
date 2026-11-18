/*
 * Filename: interleave.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

/** What the study queues alternate by: the topic or the material of each item. */
export type MixBy = "topic" | "material";

/**
 * A request to mix a queue. `afterKey` is the key of the item shown before, so the rotation
 * continues from the next group; the server keeps no state between calls.
 */
export interface MixOptions {
  by: MixBy;
  afterKey: string | null;
}

/** The key of the group an item belongs to when it has none. */
export const NO_KEY = "none";

/** The group key of an item: `t:<topic id>`, `m:<material id>` or `none`. */
export function mixKeyOf(
  by: MixBy,
  item: { topicId: number | null; materialId?: number | null },
): string {
  const id = by === "topic" ? item.topicId : (item.materialId ?? null);
  return id === null ? NO_KEY : `${by === "topic" ? "t" : "m"}:${id}`;
}

/** Group order: by identifier, ascending, with the group that has no key last. */
function compareKeys(a: string, b: string): number {
  if (a === b) return 0;
  if (a === NO_KEY) return 1;
  if (b === NO_KEY) return -1;
  return Number(a.slice(2)) - Number(b.slice(2));
}

/**
 * The next item of a rotation over `items` (already in priority order): the first item of the
 * first group whose key follows `afterKey`, going back to the first group after the last one.
 * The same input always gives the same item.
 */
export function pick<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  afterKey: string | null,
): T | null {
  const firstOf = new Map<string, T>();
  for (const item of items) {
    const key = keyOf(item);
    if (!firstOf.has(key)) firstOf.set(key, item);
  }
  if (firstOf.size === 0) return null;
  const keys = [...firstOf.keys()].sort(compareKeys);
  const chosen =
    (afterKey === null ? undefined : keys.find((key) => compareKeys(key, afterKey) > 0)) ?? keys[0];
  return firstOf.get(chosen as string) ?? null;
}

/** The whole list in rotation order, starting after `afterKey`. */
export function interleave<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  afterKey: string | null = null,
): T[] {
  const left = [...items];
  const ordered: T[] = [];
  let last = afterKey;
  while (left.length > 0) {
    const next = pick(left, keyOf, last) as T;
    left.splice(left.indexOf(next), 1);
    ordered.push(next);
    last = keyOf(next);
  }
  return ordered;
}
