/*
 * Filename: check-headers.mjs
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const ROOTS = ["src", "scripts", "tests"];
const ROOT_FILES = ["eslint.config.js", "vitest.config.ts"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".py"]);
const REQUIRED = ["Filename:", "Created on:", "Author:"];

function* walk(directory) {
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "node_modules") yield* walk(path);
    } else if (EXTENSIONS.has(extname(path))) {
      yield path;
    }
  }
}

const files = [...ROOTS.flatMap((root) => [...walk(root)]), ...ROOT_FILES];
const missing = files.filter((file) => {
  const head = readFileSync(file, "utf8").split("\n").slice(0, 12).join("\n");
  return !REQUIRED.every((token) => head.includes(token));
});

if (missing.length > 0) {
  console.error("Files without the Filename/Created on/Author header:");
  for (const file of missing) console.error(`  ${file}`);
  process.exit(1);
}
console.log(`Header check passed for ${files.length} files.`);
