#!/usr/bin/env node
// Kiro SessionStart hook: prints a short orientation (stdout is added to the agent's context).
// Shows the next unchecked task of each spec and the git state. Read-only.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const specsDir = join(root, '.kiro', 'specs');
const lines = ['# Motionpop session context (from .kiro/hooks/scripts/session-start.mjs)'];

if (existsSync(specsDir)) {
  for (const spec of readdirSync(specsDir).sort()) {
    const tasksPath = join(specsDir, spec, 'tasks.md');
    if (!existsSync(tasksPath)) continue;
    const tasks = readFileSync(tasksPath, 'utf8').split('\n');
    const done = tasks.filter((l) => /^- \[x\]/i.test(l)).length;
    const open = tasks.filter((l) => /^- \[ \]/.test(l));
    if (open.length === 0) continue;
    lines.push(
      `- ${spec}: ${done}/${done + open.length} done · next: ${open[0].replace(/^- \[ \] /, '').slice(0, 140)}`,
    );
  }
}

try {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  const dirty = execSync('git status --porcelain', { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean).length;
  lines.push(`- git: branch ${branch}, ${dirty} uncommitted change(s)`);
} catch {
  // not a git checkout; skip
}

process.stdout.write(lines.join('\n') + '\n');
