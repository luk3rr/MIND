/*
 * Filename: pre-commit.test.ts
 * Created on: November 17, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Check } from "../scripts/pre-commit";
import { buildChecks, isLintable, main, parseStagedFiles, runChecks } from "../scripts/pre-commit";

const ROOT = join(import.meta.dirname, "..");
const BIN = join(ROOT, "node_modules", ".bin");

const names = (checks: Check[]): string[] => checks.map((check) => check.name);

describe("parseStagedFiles", () => {
  it("splits the NUL-separated git output and keeps names with spaces", () => {
    expect(parseStagedFiles("src/a.ts\0docs/my file.md\0")).toEqual([
      "src/a.ts",
      "docs/my file.md",
    ]);
  });

  it("returns nothing for empty output", () => {
    expect(parseStagedFiles("")).toEqual([]);
  });
});

describe("isLintable", () => {
  it.each(["a.ts", "a.tsx", "a.js", "a.mjs", "a.cjs"])("lints %s", (file) => {
    expect(isLintable(file)).toBe(true);
  });

  it.each(["README.md", "a.json", "a.css", "a.yml"])("does not lint %s", (file) => {
    expect(isLintable(file)).toBe(false);
  });
});

describe("buildChecks", () => {
  it("checks nothing when nothing is staged", () => {
    expect(buildChecks([], BIN)).toEqual([]);
  });

  it("only checks formatting for files that are not code", () => {
    const checks = buildChecks(["README.md", "package.json"], BIN);
    expect(names(checks)).toEqual(["Prettier"]);
    expect(checks[0]?.args).toEqual(
      expect.arrayContaining(["--check", "README.md", "package.json"]),
    );
  });

  it("adds lint and headers for code under src, scripts and tests", () => {
    const checks = buildChecks(["src/core/a.ts", "README.md"], BIN);
    expect(names(checks)).toEqual(["Prettier", "ESLint", "File headers"]);
    const eslint = checks.find((check) => check.name === "ESLint");
    expect(eslint?.args).toContain("src/core/a.ts");
    expect(eslint?.args).not.toContain("README.md");
  });

  it("skips the header check for code outside the checked roots", () => {
    expect(names(buildChecks(["drizzle.app.config.ts"], BIN))).toEqual(["Prettier", "ESLint"]);
  });
});

describe("runChecks", () => {
  const check = (name: string): Check => ({ name, command: name, args: [], hint: `fix ${name}` });

  it("succeeds when every check passes", () => {
    const log: string[] = [];
    expect(
      runChecks(
        [check("a"), check("b")],
        () => 0,
        (m) => log.push(m),
      ),
    ).toBe(0);
    expect(log.join("\n")).not.toContain("failed");
  });

  it("runs every check even after a failure and reports the hints", () => {
    const ran: string[] = [];
    const log: string[] = [];
    const code = runChecks(
      [check("a"), check("b"), check("c")],
      (c) => {
        ran.push(c.name);
        return c.name === "a" ? 1 : 0;
      },
      (m) => log.push(m),
    );
    expect(code).toBe(1);
    expect(ran).toEqual(["a", "b", "c"]);
    expect(log.join("\n")).toContain("fix a");
    expect(log.join("\n")).not.toContain("fix b");
  });
});

describe("pre-commit hook", () => {
  it("is executable and delegates to the script", () => {
    const hook = join(ROOT, ".githooks", "pre-commit");
    expect(statSync(hook).mode & 0o111).not.toBe(0);
  });
});

describe("main against a real git index", () => {
  const dirs: string[] = [];

  function repo(): string {
    const dir = mkdtempSync(join(tmpdir(), "mind-hook-"));
    dirs.push(dir);
    execFileSync("git", ["init", "-q"], { cwd: dir });
    copyFileSync(join(ROOT, ".prettierrc.json"), join(dir, ".prettierrc.json"));
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const run = (dir: string): number => main({ cwd: dir, binDir: BIN, log: () => {} });

  it("blocks a staged file that is not formatted", () => {
    const dir = repo();
    writeFileSync(join(dir, "notes.md"), "#   Title\n\n\n\ntext   \n");
    execFileSync("git", ["add", "notes.md"], { cwd: dir });
    expect(run(dir)).toBe(1);
  });

  it("allows a staged file that is formatted", () => {
    const dir = repo();
    writeFileSync(join(dir, "notes.md"), "# Title\n\ntext\n");
    execFileSync("git", ["add", "notes.md"], { cwd: dir });
    expect(run(dir)).toBe(0);
  });

  it("ignores a badly formatted file that is not staged", () => {
    const dir = repo();
    writeFileSync(join(dir, "good.md"), "# Title\n");
    writeFileSync(join(dir, "bad.md"), "#   Title\n\n\n\n");
    execFileSync("git", ["add", "good.md"], { cwd: dir });
    expect(run(dir)).toBe(0);
  });
});
