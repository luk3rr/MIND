/*
 * Filename: version.ts
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

export interface Version {
  major: number;
  minor: number;
  patch: number;
}

/** `v1.2.3`, `1.2.3` or `1.2.3-rc.1` (the suffix is ignored); null for anything else. */
export function parseVersion(text: string): Version | null {
  let core = text.trim();
  if (core.startsWith("v")) core = core.slice(1);
  const cut = core.search(/[-+]/);
  if (cut >= 0) core = core.slice(0, cut);
  const parts = core.split(".");
  const [major, minor, patch] = parts;
  const valid = (part: string | undefined): part is string =>
    part !== undefined &&
    part.length >= 1 &&
    part.length <= 6 &&
    [...part].every((c) => c >= "0" && c <= "9");
  if (parts.length !== 3 || !valid(major) || !valid(minor) || !valid(patch)) return null;
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

/** Negative when `a` is older than `b`, zero when equal, positive when newer. */
export function compareVersions(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export function formatVersion(version: Version): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}
