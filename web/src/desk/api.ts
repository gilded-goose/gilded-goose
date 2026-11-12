// The Desk's one way to talk to the server: same-origin JSON, so the runs cookie (this browser's session) rides along.
import { troubleOf, troubleLine, type Trouble } from "@goose/core/desk";

/** DK: no JSON came back, so the Desk says why from what did (`troubleOf`): nothing at all (status 0), or a page that
 *  isn't the server's own (a free host waking answers its own 503). */
export class Away extends Error {
  readonly status: number;
  readonly isJson: boolean;
  constructor(status: number, isJson: boolean) { super(`away ${status}`); this.status = status; this.isJson = isJson; }
}

export async function json<T>(path: string, body?: unknown): Promise<{ status: number; data: T }> {
  let r: Response;
  try { r = await fetch(path, body === undefined ? { credentials: "same-origin" } : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch { throw new Away(0, false); }
  const isJson = (r.headers.get("content-type") ?? "").includes("json");
  if (!isJson) {
    // The server's plain 403 for a page it doesn't recognise: the Shop names the cause (site/live/api.ts REFUSED).
    if (r.status === 403 && (await r.clone().text().catch(() => "")) === "not our page") (globalThis as { dispatchEvent?: (e: Event) => boolean }).dispatchEvent?.(new Event("gg-origin-refused"));
    throw new Away(r.status, false);
  }
  try { return { status: r.status, data: (await r.json()) as T }; }
  catch { throw new Away(r.status, true); }
}

/** DK part 7 (Lead-10): on a cold start a first market ask got the host proxy's 502 although /api/health had answered
 *  (q/round1/consumer.md). The Desk asks again by itself, quietly, but only these two reads: they find and price
 *  made-up sellers and spend nothing. A cart, Approve, PayPal or a saved want is never asked again by the page. */
export const QUIET_READS: readonly string[] = ["/api/runs/market/understand", "/api/runs/market/ask"];
/** The waits before each quiet retry: about 1 s, then 3 s. Past them, the failure shows as it always did. */
export const QUIET_WAITS_MS: readonly number[] = [1_000, 3_000];

/** Whether a failed call may be asked again quietly: one of QUIET_READS, online, and no answer from the server itself
 *  (nothing at all, or a non-JSON 5xx: the host's own page). A JSON answer is the server's own (a 500, a 429) and may
 *  have used one of the Ask's tries, so it is never asked again by itself. */
export const quietRetry = (path: string, e: unknown): boolean => {
  const online = typeof navigator === "undefined" || (navigator as { onLine?: boolean }).onLine !== false;
  return QUIET_READS.includes(path) && online && e instanceof Away && !e.isJson && (e.status === 0 || e.status >= 500);
};

/** `json` for a quiet read: on a failure `quietRetry` allows, `onQuiet(true)` (the Desk shows the waking state, never
 *  the error), waits, and asks again; after the last wait, or on any other failure, it throws as `json` does.
 *  `onQuiet(false)` once it settles either way. `wait` is injected for tests. */
export async function readJson<T>(path: string, body: unknown, onQuiet: (on: boolean) => void = () => {}, wait: (ms: number) => Promise<void> = (ms) => new Promise((ok) => setTimeout(ok, ms))): Promise<{ status: number; data: T }> {
  if (!QUIET_READS.includes(path)) throw new Error(`readJson: ${path} is not a quiet read`);
  let quiet = false;
  try {
    for (let n = 0; ; n++) {
      try { return await json<T>(path, body); }
      catch (e) {
        if (n >= QUIET_WAITS_MS.length || !quietRetry(path, e)) throw e;
        if (!quiet) { quiet = true; onQuiet(true); }
        await wait(QUIET_WAITS_MS[n]!);
      }
    }
  } finally { if (quiet) onQuiet(false); }
}

/** What a failed `json` call means, for the state block or a note. */
export const troubleFrom = (e: unknown): Trouble => {
  const online = typeof navigator === "undefined" || (navigator as { onLine?: boolean }).onLine !== false;
  return e instanceof Away ? troubleOf(e.status, e.isJson, online) : troubleOf(0, false, online);
};
export const troubleNote = (e: unknown): string => troubleLine(troubleFrom(e));
