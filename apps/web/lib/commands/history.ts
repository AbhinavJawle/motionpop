import type { EditorProject } from '@motionpop/schemas';
import type { Command } from './command';

export const HISTORY_CAP = 200;

export type History = { past: Command[]; future: Command[] };
export type HistoryResult = { history: History; project: EditorProject };

export const emptyHistory: History = { past: [], future: [] };

/** Run a command. Throws CommandRejected (history untouched) if it breaks an invariant. */
export function exec(history: History, project: EditorProject, cmd: Command): HistoryResult {
  const next = cmd.do(project);
  const past = [...history.past, cmd];
  if (past.length > HISTORY_CAP) past.splice(0, past.length - HISTORY_CAP);
  return { history: { past, future: [] }, project: next };
}

export function undo(history: History, project: EditorProject): HistoryResult {
  const cmd = history.past[history.past.length - 1];
  if (!cmd) return { history, project };
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, cmd] },
    project: cmd.undo(project),
  };
}

export function redo(history: History, project: EditorProject): HistoryResult {
  const cmd = history.future[history.future.length - 1];
  if (!cmd) return { history, project };
  return {
    history: { past: [...history.past, cmd], future: history.future.slice(0, -1) },
    project: cmd.do(project),
  };
}
