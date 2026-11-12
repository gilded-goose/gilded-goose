// Track R: "the server is waking up". Render's free instance sleeps after a quiet spell, and the first request wakes it;
// Render's own waiting page for a document can't be styled, but an /api call made from an open page can be watched.
// The rule: an /api request still unanswered WAKE_AFTER_MS after it started, when no /api answer has come since the page
// loaded or since QUIET_MS ago, means the server is waking. A slow answer from an awake server (an AI ask can take
// seconds) is not waking: an answer came recently, so nothing shows. Pure state with an injected clock and timer, so the
// rule is tested without a browser.
//
// Two states (the DD, ~07:20: the words follow the request). "pending": a request is still out, so the page really will
// fill in when it answers. "failed": the wake's requests ended with no real answer (a host's own non-JSON 503, a network
// error, a call the page timed out), so nothing will fill in by itself and the page offers Try again. Any real answer
// ends both; a new request after a failure is pending again.

export const WAKE_AFTER_MS = 2_000;
/** A free Render instance sleeps after ~15 minutes idle; past 14 quiet minutes a slow answer may be a wake. */
export const QUIET_MS = 14 * 60_000;

/** The kit's and DK's prop: `state: "pending" | "failed"`. */
export type WakeState = "pending" | "failed";

export interface Clock { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(t: unknown): void }

export class WakeWatch {
  private lastAnswer = 0;
  private pending = new Map<number, unknown>();
  private next = 1;
  private current: WakeState | null = null;
  private listeners = new Set<(state: WakeState | null) => void>();
  private readonly clock: Clock;
  constructor(clock: Clock) { this.clock = clock; }

  /** Null while the server is awake (or not known to be waking). */
  get state(): WakeState | null { return this.current; }
  get isWaking(): boolean { return this.current !== null; }
  subscribe(fn: (state: WakeState | null) => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  /** An /api request starts. Returns the id to pass to `answered` or `failed`. */
  started(): number {
    const id = this.next++;
    const quiet = this.lastAnswer === 0 || this.clock.now() - this.lastAnswer >= QUIET_MS;
    this.pending.set(id, quiet ? this.clock.setTimeout(() => { if (this.pending.has(id)) this.set("pending"); }, WAKE_AFTER_MS) : null);
    // After a failure, a new request (Try again, or the page's own) is out: it is the one that will fill the page in.
    if (this.current === "failed") this.set("pending");
    return id;
  }
  /** The request got a response. A host's own (non-JSON) 503 is the waking host answering in the server's place: that
   *  request has ended with nothing to fill in, so the wake is "failed" once no other request is out. */
  answered(id: number, status: number, json: boolean): void {
    this.clear(id);
    if (status === 503 && !json) { this.lastAnswer = 0; this.settle(true); return; }
    this.lastAnswer = this.clock.now();
    // Any answer means the server is awake: every call still waiting is merely slow now, so its wake timer goes too
    // (the reviewer's case: the health ask answers in 100 ms while a 3 s ask started with it; that's no wake).
    for (const [other, t] of this.pending) { if (t != null) this.clock.clearTimeout(t); this.pending.set(other, null); }
    this.set(null);
  }
  /** The request failed at the network (offline, aborted, timed out by the page): no answer. Before a wake shows it
   *  starts nothing; during one, it ends that request, so the wake is "failed" once no other request is out. */
  failed(id: number): void {
    this.clear(id);
    this.settle(this.current !== null);
  }

  /** A request ended with no real answer: with others still out the wake stays pending; with none, it has failed. */
  private settle(waking: boolean) {
    if (!waking) return;
    this.set(this.pending.size > 0 ? "pending" : "failed");
  }
  private clear(id: number) { const t = this.pending.get(id); if (t != null) this.clock.clearTimeout(t); this.pending.delete(id); }
  private set(v: WakeState | null) { if (this.current === v) return; this.current = v; for (const fn of this.listeners) fn(v); }
}
