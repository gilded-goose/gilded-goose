// What must survive a Render restart (N13, H1, W18; Joshua, Thu Oct 29): the caps' global counts, the run library and the
// shopper's week. With TURSO_DATABASE_URL set they live in Turso (libSQL); without it, on this process's disk as before,
// which on Render is wiped by a restart, and `/api/health` says which ("turso" or "disk").
//
// One table of keys and JSON values, read whole at boot and kept in memory, so every read stays synchronous (the caps'
// `CapStore` is). A write lands in memory at once and in Turso soon after: one writer drains the keys waiting, each with
// its latest value, so a burst of writes to one key is one write. A failed write is logged by key kind only, never thrown
// into a request, and kept to try again (1 s, doubling to a minute) unless a newer value replaced it; while any is
// waiting to be tried again, `/api/health` says store "turso-retrying", not "turso", and live mode is paused. `openTurso`
// throws when it can't read the store; main.ts then starts with live mode paused (nothing spends without saved caps).

import { createClient } from "@libsql/client";

export interface Kv {
  readonly kind: "turso";
  get(key: string): string | undefined;
  /** Keys starting with `prefix`, sorted. */
  keys(prefix: string): string[];
  set(key: string, value: string): void;
  /** Removes a key (an expired week, a run past the library's size). */
  drop(key: string): void;
  /** True while a failed write waits to be tried again. */
  retrying(): boolean;
  /** Tries every waiting write now (once, even one waiting to be retried); resolves when each has landed or failed. */
  flush(): Promise<void>;
  /** One read that changes nothing, `SELECT 1`: health's keep-alive (keepAwake below). Never writes; leaves retrying() alone. */
  ping(): Promise<void>;
}

/** True while nothing may spend: the store was unreachable at boot, or a write to it is waiting to be tried again. The
 * keep-alive's read is not in it: a failed read only says so (keepAwake). */
export const livePaused = (storeDown: boolean, kv: Kv | null): boolean => storeDown || (kv?.retrying() ?? false);

/** What health says of the last keep-alive read: "checking" until the first one answers. */
export type DbCheck = "ok" | "failed" | "checking";

/**
 * Health's keep-alive (Lead-12, Thu Nov 5). Turso's free plan archives a database after 10 days of inactivity, and an
 * archived one pauses live mode until Joshua unarchives it by hand. A visit reads the store only at boot, so the uptime
 * monitor's ping to `/api/health` did nothing for Turso. Now each health check may start one read.
 * Not claimed: that a read resets Turso's 10-day timer. Turso's docs don't define "activity" (checked Nov 5); see
 * docs/launch/alive-through-judging.md.
 * The returned check answers at once with the last read's result, so health never waits on the database. That matters
 * because Render restarts an instance whose health check takes over 5 s for 60 s in a row. At most once every `everyMs` it
 * starts one more read in the background, so Render's checks every few seconds are about one read a minute. A read slower
 * than `timeoutMs`, or one that throws, is "failed". That is reported, nothing more: it never writes, and it never
 * pauses or un-pauses live mode.
 */
export function keepAwake(ping: () => Promise<unknown>, opts: { everyMs: number; timeoutMs: number; now?: () => number }): () => DbCheck {
  const now = opts.now ?? Date.now;
  let last: DbCheck = "checking";
  let startedAt = -Infinity;
  let busy = false;
  return () => {
    const t = now();
    if (!busy && t - startedAt >= opts.everyMs) {
      busy = true;
      startedAt = t;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error("late")), opts.timeoutMs); timer.unref?.(); });
      // .then(ping): a ping that throws before it returns a promise is a failed read too, never a thrown health check.
      const read = Promise.resolve().then(ping);
      Promise.race([read, late]).then(() => { last = "ok"; }, () => { last = "failed"; });
      // A late read says "failed" at the timeout, but the next one waits for this one to end (Q, Nov 5): libsql sets no
      // timeout of its own, and Node's fetch gives up after 300 s, so hung reads started each minute would pile up and
      // take the client's 20 request slots from the writes. One read in flight, at most, ever.
      read.then(() => {}, () => {}).finally(() => { clearTimeout(timer); busy = false; });
    }
    return last;
  };
}

const RETRY_FIRST_MS = 1000;
const RETRY_MAX_MS = 60_000;

/** Opens the store and reads it whole. `url` may be a local `file:` URL (the tests: no key, no network). */
export async function openTurso(url: string, authToken: string | undefined): Promise<Kv> {
  const db = createClient(authToken ? { url, authToken } : { url });
  await db.execute("CREATE TABLE IF NOT EXISTS goose_kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
  const all = await db.execute("SELECT k, v FROM goose_kv");
  const held = new Map(all.rows.map((r) => [String(r.k), String(r.v)]));
  // Each key's latest value not yet in Turso; null removes the key.
  const waiting = new Map<string, string | null>();
  let draining: Promise<void> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let wait = RETRY_FIRST_MS;
  let failed = false;
  async function drain(): Promise<void> {
    for (let next = waiting.entries().next(); !next.done; next = waiting.entries().next()) {
      const [key, value] = next.value;
      waiting.delete(key);
      try {
        await db.execute(value === null
          ? { sql: "DELETE FROM goose_kv WHERE k = ?", args: [key] }
          : { sql: "INSERT INTO goose_kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", args: [key, value] });
      } catch (e) {
        console.warn(`turso: a ${key.split(":")[0]} write failed, trying again in ${wait / 1000} s: ${e instanceof Error ? e.message : String(e)}`);
        if (!waiting.has(key)) waiting.set(key, value);
        failed = true;
        retry = setTimeout(() => { retry = null; draining ??= drain(); }, wait);
        retry.unref?.();
        wait = Math.min(wait * 2, RETRY_MAX_MS);
        draining = null;
        return;
      }
    }
    failed = false;
    wait = RETRY_FIRST_MS;
    draining = null;
  }
  const put = (key: string, value: string | null) => {
    waiting.set(key, value);
    if (!retry) draining ??= drain();
  };
  return {
    kind: "turso",
    get: (key) => held.get(key),
    keys: (prefix) => [...held.keys()].filter((k) => k.startsWith(prefix)).sort(),
    set(key, value) { held.set(key, value); put(key, value); },
    drop(key) { if (held.delete(key)) put(key, null); },
    retrying: () => failed && waiting.size > 0,
    async ping() { await db.execute("SELECT 1"); },
    flush() {
      if (retry) { clearTimeout(retry); retry = null; }
      // Not drain() on an empty queue: it would finish before `??=` assigns it and leave `draining` set for good.
      if (!draining && waiting.size === 0) return Promise.resolve();
      return draining ??= drain();
    },
  };
}
