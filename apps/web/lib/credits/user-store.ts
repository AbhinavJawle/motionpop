import { UserDocSchema, type Plan, type UserSettings } from '@motionpop/schemas';

/**
 * The live `users/{uid}` doc, shared by every consumer (spec 13 R5.1): one Firestore listener per
 * uid, reference-counted. Values are `null` until the doc exists and parses (R5.4): a signed-in
 * user whose doc is not bootstrapped yet, or a doc that fails `UserDocSchema`, shows no balance
 * and cloud actions wait.
 */
export interface UserSnapshot {
  balance: number | null;
  plan: Plan | null;
  settings: UserSettings | null;
}

export const EMPTY_USER: UserSnapshot = { balance: null, plan: null, settings: null };

/** Starts a listener on `users/{uid}`; `onData(undefined)` means "no doc yet". Returns a stop. */
export type UserDocListen = (
  uid: string,
  onData: (data: unknown) => void,
  onError: (err: unknown) => void,
) => () => void;

export function parseUserSnapshot(data: unknown): UserSnapshot {
  if (data === undefined) return EMPTY_USER;
  const parsed = UserDocSchema.safeParse(data);
  if (!parsed.success) {
    console.warn('users/{uid} did not parse; balance is unknown', parsed.error.issues[0]);
    return EMPTY_USER;
  }
  const { credits, plan, settings } = parsed.data;
  return { balance: credits, plan, settings };
}

export interface UserStore {
  get(uid: string): UserSnapshot;
  subscribe(uid: string, fn: () => void): () => void;
  /** The balance a spend answered, shown until the snapshot catches up. */
  setBalance(uid: string, balance: number): void;
}

interface Entry {
  snapshot: UserSnapshot;
  listeners: Set<() => void>;
  stop: (() => void) | null;
}

export function createUserStore(listen: UserDocListen): UserStore {
  const entries = new Map<string, Entry>();
  const entry = (uid: string): Entry => {
    let e = entries.get(uid);
    if (!e) {
      e = { snapshot: EMPTY_USER, listeners: new Set(), stop: null };
      entries.set(uid, e);
    }
    return e;
  };
  const publish = (e: Entry, next: UserSnapshot) => {
    const prev = e.snapshot;
    if (
      prev.balance === next.balance &&
      prev.plan === next.plan &&
      JSON.stringify(prev.settings) === JSON.stringify(next.settings)
    )
      return;
    e.snapshot = next;
    for (const l of e.listeners) l();
  };
  return {
    get: (uid) => entries.get(uid)?.snapshot ?? EMPTY_USER,
    subscribe(uid, fn) {
      const e = entry(uid);
      e.listeners.add(fn);
      e.stop ??= listen(
        uid,
        (data) => publish(e, parseUserSnapshot(data)),
        (err) => {
          // Never silent (architecture.md): a denied read (for example rules not deployed) used to
          // leave the credits chip loading forever with nothing in the console.
          console.warn('users/{uid} listener failed; balance is unknown', err);
          publish(e, EMPTY_USER);
        },
      );
      return () => {
        e.listeners.delete(fn);
        if (e.listeners.size === 0) {
          e.stop?.();
          e.stop = null;
        }
      };
    },
    setBalance(uid, balance) {
      const e = entry(uid);
      publish(e, { ...e.snapshot, balance });
    },
  };
}
