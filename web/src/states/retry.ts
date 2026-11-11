// Track R: a 429's wait (brand.md §10.9: "Try again" is enabled once the server's Retry-After has passed). Pure, so
// core/test/r-deploy.test.ts tests it without a browser.

/** The milliseconds a Retry-After header asks for: delay-seconds, or an HTTP date. 0 when absent or unreadable. */
export function retryAfterMs(header: string | null | undefined, now = Date.now()): number {
  if (!header) return 0;
  const s = header.trim();
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  const at = Date.parse(s);
  return Number.isNaN(at) ? 0 : Math.max(0, at - now);
}

/** Past this wait a 429 draws no Try again (DD, stack 79): a pill disabled for minutes or hours helps no one, and one
 *  enabled early only retries into the cap. Decided by default: one minute, the "needs a minute" of §10.9's words. */
export const LONG_WAIT_MS = 60_000;

/** What a 429's action is. "none": a daily cap, a long wait, or no way to ask again; "wait": Try again, disabled until
 *  Retry-After has passed; "now": Try again, enabled. */
export function limitedAction(o: { daily?: boolean | undefined; retryAfterMs?: number | undefined; canRetry: boolean }): "none" | "wait" | "now" {
  const wait = o.retryAfterMs ?? 0;
  if (o.daily || !o.canRetry || wait > LONG_WAIT_MS) return "none";
  return wait > 0 ? "wait" : "now";
}
