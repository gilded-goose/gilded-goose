// The ping with the tab closed (Joshua, Nov 5 6:40 PM, Level 2: Web Push, behind its switch). The push carries no words:
// it only wakes the page's service worker, which asks this server for her ping with her own cookie and shows it, so the
// push service never reads a price and a stranger's browser could only ever show its own. VAPID's signature is made here
// with node:crypto (no dependency). Off unless PING_PUSH=on and its three keys are set; the private key is read from the
// environment only, never logged or printed. Design: side-session note track-p-ping-level-2.md.
import { createPrivateKey, sign, type KeyObject } from "node:crypto";

export interface PushEnv { PING_PUSH?: string | undefined; VAPID_PUBLIC_KEY?: string | undefined; VAPID_PRIVATE_KEY?: string | undefined; VAPID_SUBJECT?: string | undefined }

/** The push services a browser hands out (Chrome and Android, Firefox, Safari, Edge). The server POSTs to no other host. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];

/** True only with the switch on and all three keys present and well formed. */
export function pushOn(env: PushEnv): boolean {
  return env.PING_PUSH === "on" && /^[A-Za-z0-9_-]{87}$/.test(env.VAPID_PUBLIC_KEY ?? "") && /^[A-Za-z0-9_-]{43}$/.test(env.VAPID_PRIVATE_KEY ?? "") && /^(mailto:|https:\/\/)\S+$/.test(env.VAPID_SUBJECT ?? "");
}

/** A browser's push address Goose will send to: https, a known push service, the default port, no user or password, at most 1 KB. */
export function pushAddress(endpoint: unknown): string | null {
  if (typeof endpoint !== "string" || endpoint.length > 1024) return null;
  let u: URL;
  try { u = new URL(endpoint); } catch { return null; }
  if (u.protocol !== "https:" || u.port !== "" || u.username || u.password) return null;
  return PUSH_HOSTS.some((h) => h.test(u.hostname)) ? u.href : null;
}

const b64u = (b: Buffer) => b.toString("base64url");

/** The VAPID key pair as a signing key: the public key is the 65-byte uncompressed point, the private key its 32-byte d. */
export function vapidKey(publicKey: string, privateKey: string): KeyObject {
  const p = Buffer.from(publicKey, "base64url");
  if (p.length !== 65 || p[0] !== 4) throw new Error("VAPID_PUBLIC_KEY isn't an uncompressed P-256 point");
  return createPrivateKey({ key: { kty: "EC", crv: "P-256", d: privateKey, x: b64u(p.subarray(1, 33)), y: b64u(p.subarray(33)) }, format: "jwk" });
}

/** The Authorization header for one push service: an ES256 JWT for its origin, good for twelve hours (RFC 8292). */
export function vapidAuth(endpoint: string, publicKey: string, key: KeyObject, subject: string, nowMs: number): string {
  const head = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: subject })));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey}`;
}

export type Sent = "sent" | "gone" | "failed";

/** One empty push: no body, so nothing to encrypt and nothing for the push service to read. "gone": the address no
 *  longer works (404 or 410) and is to be deleted. Redirects are never followed. */
export async function sendPush(endpoint: string, auth: string, fetcher: typeof fetch = fetch): Promise<Sent> {
  if (!pushAddress(endpoint)) return "failed";
  try {
    const r = await fetcher(endpoint, { method: "POST", redirect: "manual", headers: { Authorization: auth, TTL: "600", Urgency: "high", "Content-Length": "0" } });
    if (r.status === 404 || r.status === 410) return "gone";
    return r.status >= 200 && r.status < 300 ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

/** The last day a push address is kept (Joshua: "expiring Dec 22"), midnight Pacific. */
export const PUSH_UNTIL = Date.UTC(2026, 11, 22, 8);
/** At most this many pushes a browser an hour, however often she presses. */
export const PUSHES_PER_HOUR = 6;
/** At most this many browsers kept at once, so a flood can't grow the server's memory. It's above the shoppers' own
 *  in-memory cap (SESSIONS_MAX, pinned in push.test), and when it's full the addresses whose sessions have left memory
 *  make the room (`DemoShoppers.inMemory`, which never reads the store): a shopper in memory now is never pushed out, and
 *  none is locked out (security review, Nov 5, all three findings). One who left memory and comes back taps again. */
export const PUSH_ADDRESSES_MAX = 2000;

interface Kept { endpoint: string; until: number; sent: number[]; due: string | null }

/** Her browser's push address, the only thing Level 2 keeps: in this server's memory only (a restart forgets it), keyed by
 *  her anonymous session, holding no name, email or phone, never logged, counted or written to the ledger. Gone when she
 *  taps Stop, when the push service says it's gone, or on Dec 22. `due` is the want whose ping the next push shows. */
export class PushAddresses {
  private readonly kept = new Map<string, Kept>();
  private readonly now: () => number;
  private readonly alive: (session: string) => boolean;
  /** `alive`: whether her session is in memory now (bounded, no store read); only others are ever dropped to make room. */
  constructor(now: () => number, alive: (session: string) => boolean = () => true) { this.now = now; this.alive = alive; }

  /** Keeps her address; refused when it isn't a push service's, the date is past Dec 22, or every kept session is live. */
  keep(session: string, endpoint: unknown): "kept" | "refused" {
    const a = pushAddress(endpoint);
    if (!a || this.now() >= PUSH_UNTIL) return "refused";
    const was = this.kept.get(session);
    if (!was && this.kept.size >= PUSH_ADDRESSES_MAX) for (const s of [...this.kept.keys()]) if (!this.alive(s)) this.kept.delete(s);
    if (!was && this.kept.size >= PUSH_ADDRESSES_MAX) return "refused";
    this.kept.set(session, { endpoint: a, until: PUSH_UNTIL, sent: was?.sent ?? [], due: was?.due ?? null });
    return "kept";
  }

  forget(session: string): void { this.kept.delete(session); }

  has(session: string): boolean { return this.at(session) !== null; }

  /** Her address, if still kept; past Dec 22 it's forgotten here. */
  at(session: string): Kept | null {
    const k = this.kept.get(session);
    if (k && this.now() >= k.until) { this.kept.delete(session); return null; }
    return k ?? null;
  }

  /** Takes one push from this hour's six and marks which want it shows; false: none left this hour, or no address. */
  take(session: string, catalogId: string): boolean {
    const k = this.at(session);
    if (!k) return false;
    const t = this.now();
    k.sent = k.sent.filter((s) => t - s < 3600_000);
    if (k.sent.length >= PUSHES_PER_HOUR) return false;
    k.sent.push(t);
    k.due = catalogId;
    return true;
  }

  /** The want the woken page shows, once: read clears it, so an old push can't show a new price. */
  due(session: string): string | null {
    const k = this.at(session);
    const d = k?.due ?? null;
    if (k) k.due = null;
    return d;
  }

  get size(): number { return this.kept.size; }
}
