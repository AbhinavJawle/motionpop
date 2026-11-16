import type { UsageEvent } from '@motionpop/ai';
import type { UsageEventIn } from '@motionpop/schemas';

/**
 * Buffers router usage events and sends them to `POST /api/usage` (spec 13 R7.2): every 15 s, at
 * 20 events, and when the page is hidden. The hidden flush runs with `keepalive` and the headers
 * (ID token + App Check token) of the last normal flush, because a hidden page can't await a new
 * token; with no cached headers yet the events stay buffered. A failed flush keeps its events;
 * above 200 buffered events the oldest are dropped (counted, logged once).
 */
export const FLUSH_INTERVAL_MS = 15_000;
export const FLUSH_AT_EVENTS = 20;
export const MAX_BUFFER = 200;
export const MAX_BATCH = 50;

export interface UsageReporterDeps {
  fetch: typeof fetch;
  /** Fresh auth headers. Not called on a hidden flush. */
  headers: () => Promise<HeadersInit>;
  newId?: () => string;
  now?: () => number;
  warn?: (message: string) => void;
}

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));

function randomId(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 24);
}

export class UsageReporter {
  private buffer: UsageEventIn[] = [];
  private lastHeaders: HeadersInit | null = null;
  private inFlight: Promise<void> | null = null;
  private again = false;
  private droppedTotal = 0;
  private warned = false;
  private readonly newId: () => string;
  private readonly now: () => number;

  constructor(private readonly deps: UsageReporterDeps) {
    this.newId = deps.newId ?? randomId;
    this.now = deps.now ?? (() => Date.now());
  }

  get pending(): number {
    return this.buffer.length;
  }
  get dropped(): number {
    return this.droppedTotal;
  }

  /** The wire form of a router event (values clamped to what the route accepts). */
  toEvent(e: UsageEvent): UsageEventIn {
    return {
      id: this.newId(),
      task: e.task.slice(0, 40) || 'unknown',
      ranOn: e.ranOn,
      model: e.model.slice(0, 60),
      credits: clamp(e.credits, 0, 50),
      cloudCost: clamp(e.cloudCost, 0, 50),
      latencyMs: clamp(e.latencyMs, 0, 600_000),
      ok: e.ok,
      ...(e.attempts === undefined ? {} : { attempts: clamp(e.attempts, 1, 5) }),
      ...(e.problems?.length
        ? { problems: e.problems.slice(0, 3).map((p) => p.slice(0, 200)) }
        : {}),
      clientAt: Math.max(0, Math.round(this.now())),
    };
  }

  /** Adds an event; flushes at 20 buffered. Returns the wire event (also for the session store). */
  add(e: UsageEvent): UsageEventIn {
    const event = this.toEvent(e);
    this.buffer.push(event);
    if (this.buffer.length > MAX_BUFFER) {
      const over = this.buffer.length - MAX_BUFFER;
      this.buffer.splice(0, over);
      this.droppedTotal += over;
      if (!this.warned) {
        this.warned = true;
        (this.deps.warn ?? console.warn)(
          `Usage buffer is full: dropping the oldest events (${over} so far)`,
        );
      }
    }
    if (this.buffer.length >= FLUSH_AT_EVENTS) void this.flush();
    return event;
  }

  /** Caches headers now, so a hidden flush before the first normal flush can still send. */
  async warm(): Promise<void> {
    try {
      this.lastHeaders = await this.deps.headers();
    } catch {
      // No token yet: the first normal flush will cache one.
    }
  }

  /** Sends everything buffered, 50 events per request. Never throws; failures keep the events. */
  flush(opts: { hidden?: boolean } = {}): Promise<void> {
    if (this.inFlight) {
      this.again = true;
      return this.inFlight;
    }
    this.inFlight = this.run(opts.hidden === true).finally(() => {
      this.inFlight = null;
      if (this.again) {
        this.again = false;
        if (this.buffer.length > 0) void this.flush(opts);
      }
    });
    return this.inFlight;
  }

  private async run(hidden: boolean): Promise<void> {
    while (this.buffer.length > 0) {
      let headers: HeadersInit;
      if (hidden) {
        // A hidden page can't await a token: use the last ones, or keep the events.
        if (!this.lastHeaders) return;
        headers = this.lastHeaders;
      } else {
        try {
          headers = await this.deps.headers();
        } catch {
          return;
        }
        this.lastHeaders = headers;
      }
      const sending = this.buffer.slice(0, MAX_BATCH);
      let ok = false;
      try {
        const res = await this.deps.fetch('/api/usage', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: sending }),
          ...(hidden ? { keepalive: true } : {}),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }
      if (!ok) return;
      // Remove exactly what was sent (new events may have arrived, old ones may have been dropped).
      const sent = new Set(sending.map((e) => e.id));
      this.buffer = this.buffer.filter((e) => !sent.has(e.id));
      if (hidden) return;
    }
  }

  /**
   * Starts the 15 s timer and the hidden-page flush (on `visibilitychange` and on `pagehide`, which
   * some closes fire alone); returns the stop function. `doc` is injectable for tests.
   */
  start(doc: Document = document): () => void {
    const timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    const onVisibility = () => {
      if (doc.visibilityState === 'hidden') void this.flush({ hidden: true });
    };
    const onPageHide = () => void this.flush({ hidden: true });
    doc.addEventListener('visibilitychange', onVisibility);
    doc.defaultView?.addEventListener('pagehide', onPageHide);
    return () => {
      clearInterval(timer);
      doc.removeEventListener('visibilitychange', onVisibility);
      doc.defaultView?.removeEventListener('pagehide', onPageHide);
    };
  }
}
