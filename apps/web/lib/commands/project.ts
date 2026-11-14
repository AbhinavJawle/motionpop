import { produce } from 'immer';
import type { EditorProject } from '@motionpop/schemas';
import { CommandRejected, type Command } from './command';

type Format = EditorProject['format'];

export function setFormat(format: Format): Command {
  let before: Format | undefined;
  return {
    label: 'Change format',
    do(p) {
      before = p.format;
      return produce(p, (d) => {
        d.format = format;
      });
    },
    undo(p) {
      const prev = before;
      if (prev === undefined) return p;
      return produce(p, (d) => {
        d.format = prev;
      });
    },
  };
}

export function setStyle(styleId: string): Command {
  let before: string | undefined;
  return {
    label: 'Change style',
    do(p) {
      if (styleId.length === 0) throw new CommandRejected('styleId must not be empty');
      before = p.styleId;
      return produce(p, (d) => {
        d.styleId = styleId;
      });
    },
    undo(p) {
      const prev = before;
      if (prev === undefined) return p;
      return produce(p, (d) => {
        d.styleId = prev;
      });
    },
  };
}

export function renameProject(title: string): Command {
  let before: string | undefined;
  return {
    label: 'Rename project',
    do(p) {
      const next = title.trim();
      if (next.length < 1 || next.length > 80) {
        throw new CommandRejected('title must be 1-80 characters after trimming');
      }
      before = p.title;
      return produce(p, (d) => {
        d.title = next;
      });
    },
    undo(p) {
      const prev = before;
      if (prev === undefined) return p;
      return produce(p, (d) => {
        d.title = prev;
      });
    },
  };
}
