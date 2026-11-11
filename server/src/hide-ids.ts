// PayPal's ids out of a run's trail for anyone but its owner (AS-9; Round 3 red team, O1; Round 4 red team, fix 5),
// on its own so a test can read it without booting the server. main.ts's `trailFor` decides who is the owner; this
// only takes ids out. Pure: no I/O, no payment port.

/**
 * The data fields that name one of PayPal's ids for a run's money, or a request's or event's id around it: each is the
 * owner's only. Round 4 red team (fix 5): a refund's `requestId` (the PayPal-Request-Id) and a webhook's `eventId`
 * joined the list, and they are found at any depth of a row's data, not only at its top.
 */
export const PAYPAL_IDS = ["orderId", "captureId", "authorizationId", "refundId", "resourceId", "requestId", "eventId"] as const;
const PAYPAL_ID_SET: ReadonlySet<string> = new Set(PAYPAL_IDS);
const DEPTH = 8;

/** Every id under one of PAYPAL_IDS's names, at any depth of a row's data. */
export function idsIn(v: unknown, into: Set<string>, depth = 0): Set<string> {
  if (depth > DEPTH || typeof v !== "object" || v === null) return into;
  for (const [k, x] of Object.entries(v)) {
    if (PAYPAL_ID_SET.has(k) && typeof x === "string" && x) into.add(x);
    else idsIn(x, into, depth + 1);
  }
  return into;
}

/** The same value with every id taken out of every string in it, at any depth; numbers, flags and the shape unchanged. */
function hideIn(v: unknown, hide: (s: string) => string, depth = 0): unknown {
  if (typeof v === "string") return hide(v);
  if (depth > DEPTH || typeof v !== "object" || v === null) return v;
  if (Array.isArray(v)) return v.map((x) => hideIn(x, hide, depth + 1));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, hideIn(x, hide, depth + 1)]));
}

interface Row { why: string; data?: Record<string, unknown> }

/**
 * `rows` with every id taken out: the ids already `known` (the bound order, the settled capture) plus every id any row
 * of `ledger` names under PAYPAL_IDS, at any depth. Each one reads `hidden` wherever it stands, in `why` and in every
 * string of `data`, nested or not. Same rows, same order, same keys; each field that was a string stays a string.
 */
export function hidePayPalIds<T extends Row>(rows: readonly T[], ledger: readonly Row[], known: Iterable<string>, hidden: string): T[] {
  const ids = new Set<string>([...known].filter(Boolean));
  for (const e of ledger) idsIn(e.data, ids);
  if (ids.size === 0) return [...rows];
  const hide = (v: string) => { let out = v; for (const id of ids) out = out.split(id).join(hidden); return out; };
  return rows.map((e) => e.data || [...ids].some((id) => e.why.includes(id)) ? {
    ...e,
    why: hide(e.why),
    ...(e.data ? { data: hideIn(e.data, hide) as T["data"] } : {}),
  } : e);
}
