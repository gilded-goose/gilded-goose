// Is live mode answering? (H1, 018 N13.) The static site never sleeps and replays the recorded demo by itself; only
// live mode (live AI haggles, the judge box's AI read, approving in PayPal) needs the API, which on Render's free tier
// sleeps and takes about a minute to wake. The page asks /api/health, and says so in plain words while it waits,
// instead of breaking. Tiny on purpose: it rides in the first screen's chunk. Fetch and timers are injected or standard.

/** One health check gives up after this long: a sleeping Render service holds the request open while it boots. */
export const PROBE_TIMEOUT_MS = 4000;
/** While live mode isn't answering, the page asks again this often... */
export const PROBE_EVERY_MS = 15_000;
/** ...this many times (3 minutes), then stops and says live mode is off for now. */
export const PROBE_TRIES = 12;

/** R-12: "offline" is navigator.onLine false (the page doesn't probe then, and a probe that failed offline isn't "away"):
 *  the code saw no network, not a server that didn't answer, so every reader words it as offline, never the server. */
export type LiveState = "checking" | "up" | "away" | "gone" | "offline";

// A no-break space, so "15 s" never splits across two lines.
const secs = (ms: number) => `${Math.round(ms / 1000)}\u00a0s`;
const mins = (ms: number) => `${Math.round(ms / 60_000)} minutes`;

/** What the screen says for each state but "up". Every number in it is the constant the loop runs on. */
export const LIVE_WORDS = {
  checking: "Checking whether live mode is awake…",
  // "Isn't answering yet", never "is waking": on a static-only host no server will ever wake (H1 review).
  away: `Live mode isn't answering yet, and this page checks again every ${secs(PROBE_EVERY_MS)}. The recorded demo works now, in your browser.`,
  gone: `Live mode didn't answer in ${mins(PROBE_EVERY_MS * PROBE_TRIES)}, so live AI and approving in PayPal are off for now. The recorded demo works, in your browser. Reload to check again.`,
} as const;

/** The slice of `fetch` the probe uses, so a test can hand in a server that hangs, refuses or answers HTML. */
export type Get = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; headers: { get(name: string): string | null }; json(): Promise<unknown> }>;

/**
 * "up" only when /api/health answers our JSON `{ ok: true }` in time. A static host answers a missing path with a 404
 * or with index.html (status 200), and a sleeping one holds the request: all three are "away", never "up".
 */
export async function probeLive(get: Get, timeoutMs = PROBE_TIMEOUT_MS): Promise<"up" | "away"> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await get("/api/health", { signal: ctl.signal });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("application/json")) return "away";
    const body = (await r.json()) as { ok?: unknown } | null;
    return body?.ok === true ? "up" : "away";
  } catch {
    return "away";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe now, then every `every` ms while live mode is away, `tries` times in all, then "gone". Stops for good on "up"
 * (a later failure is said by the call that hit it). Returns a stop function.
 */
export function followLive(probe: () => Promise<"up" | "away">, onState: (s: LiveState) => void, opts: { every?: number; tries?: number } = {}): () => void {
  const every = opts.every ?? PROBE_EVERY_MS;
  const tries = opts.tries ?? PROBE_TRIES;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let n = 0;
  const once = async () => {
    n++;
    const s = await probe();
    if (stopped) return;
    if (s === "up") { onState("up"); return; }
    if (n >= tries) { onState("gone"); return; }
    onState("away");
    timer = setTimeout(() => void once(), every);
  };
  onState("checking");
  void once();
  return () => { stopped = true; clearTimeout(timer); };
}

/** The slice of a `fetch` Response one API call reads. */
export type Reply = { ok: boolean; status: number; headers: { get(name: string): string | null }; json(): Promise<unknown> };

/**
 * What one API call came back as (H1 review). Only a fetch that never reached a server is "unreached"; a server that
 * answered, even with an error page, is not asleep, and the screen says it errored instead.
 */
export type ApiResult =
  | { kind: "ok"; body: Record<string, unknown> }
  | { kind: "refused"; status: number; error: string | null; cap?: string; minute?: boolean }
  | { kind: "failed"; status: number }
  | { kind: "unreached" };

export async function callApi(send: () => Promise<Reply>): Promise<ApiResult> {
  let r: Reply;
  try { r = await send(); } catch { return { kind: "unreached" }; }
  const json = (r.headers.get("content-type") ?? "").includes("application/json");
  const body = json ? await r.json().catch(() => null) : null;
  const obj = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (r.status >= 500) return { kind: "failed", status: r.status };
  if (r.ok) return obj ? { kind: "ok", body: obj } : { kind: "failed", status: r.status };
  return { kind: "refused", status: r.status, error: typeof obj?.error === "string" ? obj.error : null, ...(typeof obj?.cap === "string" ? { cap: obj.cap } : {}), ...(typeof obj?.waitMs === "number" ? { minute: true } : {}) };
}

/** The right card's sentence when it falls back to the order made earlier. */
export const PAIR_WORDS = {
  away: "Live mode isn't answering, so this is the one we made earlier.",
  // R-12: she was offline when the round ran, so the network is the cause the code saw (web's OFFLINE.title, word for word).
  offline: "You're offline, so this is the one we made earlier.",
  unreached: "This order's call didn't reach the server, so this is the one we made earlier.",
  failedOrder: (status: number) => `The server hit an error making this order (HTTP ${status}), so this is the one we made earlier.`,
  failedNote: (status: number) => `The server hit an error reading this note (HTTP ${status}). Nothing was bought; try again.`,
  refusedNote: "The server refused this note.",
} as const;

export type LeftCard = { kind: "card"; body: Record<string, unknown> } | { kind: "error"; error: string } | { kind: "browser" };
export type RightCard = { kind: "order"; body: Record<string, unknown> } | { kind: "none" } | { kind: "saved"; why: string };

/** The judge call alone decides the left card: only an unreached server sends the round to the browser. */
export function leftOf(j: ApiResult): LeftCard {
  switch (j.kind) {
    case "ok": return { kind: "card", body: j.body };
    case "refused": return { kind: "error", error: j.error ?? PAIR_WORDS.refusedNote };
    case "failed": return { kind: "error", error: PAIR_WORDS.failedNote(j.status) };
    case "unreached": return { kind: "browser" };
  }
}

/**
 * The control call alone decides the right card, whatever the judge call did: an order that landed is never replaced
 * by the one made earlier. A refused price stays empty (the judge's reply says why, once).
 */
/** R-12: `online` is navigator.onLine when the call failed: a call that never left because she is offline names her network. */
export function rightOf(c: ApiResult, online = true): RightCard {
  switch (c.kind) {
    case "ok": return { kind: "order", body: c.body };
    case "refused": return { kind: "none" };
    case "failed": return { kind: "saved", why: PAIR_WORDS.failedOrder(c.status) };
    case "unreached": return { kind: "saved", why: online ? PAIR_WORDS.unreached : PAIR_WORDS.offline };
  }
}

/** Both cards from both calls; `away` (live mode isn't answering) only when the judge call never reached a server. */
export function pairOutcome(j: ApiResult, c: ApiResult, online = true): { left: LeftCard; right: RightCard; away: boolean } {
  return { left: leftOf(j), right: rightOf(c, online), away: j.kind === "unreached" };
}

/**
 * W66, the three additions' rule (a): on a server with live AI inside its caps, "Try to break it" opens with the AI
 * reading the note, so a judge who tests the real thing meets it. The plain rule while the server hasn't answered, is
 * away, has no AI, or has spent today's tries; a visitor's own pick always wins over this default (JudgeBox).
 */
export function judgeMode(ai: "on" | "capped" | "off" | null, triesLeft: number, live: LiveState, down: boolean): "ai" | "rule" {
  return ai === "on" && triesLeft > 0 && live === "up" && !down ? "ai" : "rule";
}
