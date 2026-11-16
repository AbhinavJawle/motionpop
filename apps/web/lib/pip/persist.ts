import { ChatMessageSchema, type ChatMessage } from '@motionpop/schemas';
import { z } from 'zod';

/**
 * Pip's thread per project in this browser (spec 10, a per-viewer convenience): the last
 * `KEEP` messages under `mp:pip:{projectId}`. Undo handles never persist, so a plan applied
 * before a reload shows as applied without Undo (the editor's own history still covers it).
 * Every read is zod-parsed and every access is guarded: storage may be missing or full.
 */
export const KEEP = 40;
const key = (projectId: string) => `mp:pip:${projectId}`;
const ThreadSchema = z.array(ChatMessageSchema).max(KEEP);

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
const local = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** A plan interrupted mid-apply by the reload is shown as stopped, never as running. */
function settle(m: ChatMessage): ChatMessage {
  return m.planState === 'applying' ? { ...m, planState: 'stopped' } : m;
}

export function loadThread(projectId: string, store: Storage | null = local()): ChatMessage[] {
  try {
    const raw = store?.getItem(key(projectId));
    if (!raw) return [];
    const parsed = ThreadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.map(settle) : [];
  } catch {
    return [];
  }
}

export function saveThread(
  projectId: string,
  messages: readonly ChatMessage[],
  store: Storage | null = local(),
): void {
  try {
    if (messages.length === 0) {
      store?.removeItem(key(projectId));
      return;
    }
    // Only schema fields: extra in-memory fields (undo handles) are dropped by the parse.
    const keep = messages
      .slice(-KEEP)
      .map((m) => ChatMessageSchema.safeParse(m))
      .flatMap((r) => (r.success ? [r.data] : []));
    store?.setItem(key(projectId), JSON.stringify(keep));
  } catch {
    // Full or blocked storage: the thread just won't survive a reload.
  }
}
