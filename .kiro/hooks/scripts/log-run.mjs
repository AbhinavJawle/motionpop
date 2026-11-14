#!/usr/bin/env node
// Kiro Stop hook: appends (or refreshes) an automatic entry for this Kiro session in KIRO_LOG.md,
// built only from facts the run leaves behind (time, agent, session id, commits, changed files).
// A human-written summary is added under it afterwards. Usage: node log-run.mjs <agent-name>
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const agent = process.argv[2] ?? 'unknown-agent';
const root = process.cwd();
const logPath = join(root, 'KIRO_LOG.md');

let event = {};
try {
  event = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  // keep empty
}
const sessionId = String(event.session_id ?? event.sessionId ?? 'no-session-id');

const sh = (cmd) => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

const now = new Date();
const marker = `<!-- kiro-session:${sessionId} -->`;
let log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '# Kiro log\n';

// Start time: written by the SessionStart hook; else kept from an earlier stop; else 1 h ago.
const startFile = join(
  tmpdir(),
  'motionpop-kiro-sessions',
  `${sessionId.replace(/[^\w-]/g, '_')}.start`,
);
const prev = log.match(new RegExp(`${marker}\\n[^]*?started: (\\S+)`));
const started = existsSync(startFile)
  ? readFileSync(startFile, 'utf8').trim()
  : (prev?.[1] ?? new Date(now.getTime() - 3_600_000).toISOString());
const commits = sh(`git log --since="${started}" --pretty=format:"%h %s" --author-date-order`)
  .split('\n')
  .filter(Boolean)
  .slice(0, 15);
const changed = sh('git status --porcelain').split('\n').filter(Boolean).slice(0, 25);

const block = [
  marker,
  `### ${started.slice(0, 10)} · Kiro CLI · agent: ${agent} (auto-logged by Stop hook)`,
  `- started: ${started} · last stop: ${now.toISOString()} · session: ${sessionId}`,
  `- commits since start: ${commits.length ? '\n' + commits.map((c) => `  - ${c}`).join('\n') : 'none'}`,
  `- uncommitted changes: ${changed.length ? '\n' + changed.map((c) => `  - \`${c}\``).join('\n') : 'none'}`,
  `<!-- /kiro-session:${sessionId} -->`,
].join('\n');

const existing = new RegExp(
  `${marker}[^]*?<!-- /kiro-session:${sessionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} -->`,
);
log = existing.test(log) ? log.replace(existing, block) : `${log.trimEnd()}\n\n${block}\n`;
writeFileSync(logPath, log);
