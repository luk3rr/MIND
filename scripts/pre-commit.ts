/*
 * Filename: pre-commit.ts
 * Created on: November 17, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

/**
 * Pre-commit checks, run by `.githooks/pre-commit`. They are the fast subset of the CI `verify`
 * job (formatting, lint, file headers), limited to the files being committed, so a formatting
 * mistake is caught before it reaches the pipeline. Types and tests stay in `make check`.
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface Check {
  name: string;
  command: string;
  args: string[];
  /** Printed when the check fails. */
  hint: string;
}

export type Runner = (check: Check) => number;

const LINTABLE = /\.(?:[cm]?[jt]sx?)$/;
const HEADER_ROOTS = /^(?:src|scripts|tests)\//;

/** Splits the NUL-separated output of `git diff --cached --name-only -z`. */
export function parseStagedFiles(raw: string): string[] {
  return raw.split("\0").filter((file) => file.length > 0);
}

export function isLintable(file: string): boolean {
  return LINTABLE.test(file);
}

/** Builds the checks for a set of staged files; nothing is checked when nothing is staged. */
export function buildChecks(files: string[], binDir: string): Check[] {
  if (files.length === 0) return [];

  const checks: Check[] = [
    {
      name: "Prettier",
      command: join(binDir, "prettier"),
      args: ["--check", "--ignore-unknown", "--no-error-on-unmatched-pattern", ...files],
      hint: "Run `make fmt`, then stage the result again.",
    },
  ];

  const lintable = files.filter(isLintable);
  if (lintable.length > 0) {
    checks.push({
      name: "ESLint",
      command: join(binDir, "eslint"),
      args: ["--no-warn-ignored", ...lintable],
      hint: "Fix the reported problems and stage the result again.",
    });
  }

  if (lintable.some((file) => HEADER_ROOTS.test(file))) {
    checks.push({
      name: "File headers",
      command: process.execPath,
      args: ["scripts/check-headers.mjs"],
      hint: "Add the Filename / Created on / Author header to the listed files.",
    });
  }

  return checks;
}

/** Runs every check (it does not stop at the first failure) and returns the exit code. */
export function runChecks(
  checks: Check[],
  run: Runner,
  log: (message: string) => void = console.error,
): number {
  const failed: Check[] = [];
  for (const check of checks) {
    log(`[pre-commit] ${check.name}`);
    if (run(check) !== 0) failed.push(check);
  }

  if (failed.length === 0) return 0;

  log("");
  log(`[pre-commit] ${failed.length} check(s) failed, the commit was not made:`);
  for (const check of failed) log(`  - ${check.name}: ${check.hint}`);
  log("[pre-commit] To commit anyway (not recommended): git commit --no-verify");
  return 1;
}

function spawnRunner(cwd: string): Runner {
  return (check) => spawnSync(check.command, check.args, { cwd, stdio: "inherit" }).status ?? 1;
}

/** Files added, copied, modified or renamed in the index (deleted files are not checked). */
export function stagedFiles(cwd: string): string[] {
  const result = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`git diff --cached failed: ${result.stderr}`);
  return parseStagedFiles(result.stdout);
}

export interface MainOptions {
  cwd?: string;
  binDir?: string;
  run?: Runner;
  log?: (message: string) => void;
}

export function main(options: MainOptions = {}): number {
  const cwd = options.cwd ?? process.cwd();
  const binDir = options.binDir ?? join(cwd, "node_modules", ".bin");
  const checks = buildChecks(stagedFiles(cwd), binDir);
  return runChecks(checks, options.run ?? spawnRunner(cwd), options.log);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
