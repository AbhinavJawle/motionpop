import type { EditorProject } from '@motionpop/schemas';

/**
 * A reversible, pure project mutation. `do` and `undo` never mutate their input.
 * Commands capture what they need to undo while `do` runs, so call `do` before `undo`.
 */
export interface Command {
  label: string;
  do(p: EditorProject): EditorProject;
  undo(p: EditorProject): EditorProject;
}

/** Thrown by `do` when a command would break an invariant. The project is left unchanged. */
export class CommandRejected extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = 'CommandRejected';
    this.reason = reason;
  }
}

/**
 * Several commands as one undo step. `do` applies them in order and is all-or-nothing
 * (a rejected child throws and nothing is returned); `undo` applies the child undos in reverse.
 */
export function composite(label: string, commands: ReadonlyArray<Command>): Command {
  const list = [...commands];
  return {
    label,
    do: (p) => list.reduce((acc, c) => c.do(acc), p),
    undo: (p) => list.reduceRight((acc, c) => c.undo(acc), p),
  };
}
