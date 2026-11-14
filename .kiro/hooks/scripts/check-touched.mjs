#!/usr/bin/env node
// Kiro PostToolUse hook (matcher: write): typechecks and tests the workspace package that owns
// the file the agent just wrote. Output goes back to the agent so it can fix failures.
// Reads the hook event JSON from stdin; the exact shape varies by Kiro version, so we look for
// any string value that resolves to a file inside a workspace package.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = process.cwd();
let event = {};
try {
  event = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0); // no usable payload: nothing to check
}

/** Collect every string in the payload that looks like a path. */
function collectPaths(value, out = new Set()) {
  if (typeof value === "string") {
    if (/\.(ts|tsx|mts|js|mjs|json|css|md)$/.test(value) && !value.includes("\n")) out.add(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectPaths(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectPaths(v, out);
  }
  return out;
}

/** Walk up from a file to the nearest package.json below the repo root. */
function owningPackage(file) {
  let dir = dirname(resolve(root, file));
  while (dir.startsWith(root) && dir !== root) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      const name = JSON.parse(readFileSync(pkg, "utf8")).name;
      return typeof name === "string" ? name : null;
    }
    dir = dirname(dir);
  }
  return null;
}

const packages = new Set();
for (const p of collectPaths(event.tool_input ?? event.toolInput ?? event)) {
  const rel = relative(root, resolve(root, p));
  if (rel.startsWith("..") || rel.split(sep)[0] === "node_modules") continue;
  const name = owningPackage(rel);
  if (name) packages.add(name);
}

if (packages.size === 0) process.exit(0);

let failed = false;
const report = [];
for (const name of packages) {
  for (const script of ["typecheck", "test"]) {
    try {
      execSync(`pnpm --filter ${name} --if-present ${script}`, { stdio: "pipe", encoding: "utf8", timeout: 240_000 });
      report.push(`✓ ${name} ${script}`);
    } catch (err) {
      failed = true;
      const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.split("\n").slice(-40).join("\n");
      report.push(`✗ ${name} ${script}\n${out}`);
    }
  }
}

const text = `[check-touched hook]\n${report.join("\n")}\n`;
if (failed) {
  process.stderr.write(text);
  process.exit(1);
}
process.stdout.write(text);
