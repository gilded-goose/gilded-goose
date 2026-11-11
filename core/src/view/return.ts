// What a run's return from PayPal means. One reader, on the server: `/api/runs/:id` sends its answer as `returned` and `card`, so the wallet,
// the Desk and the market can't disagree, and none of them carries the reading (1.3 KB each, Nov 5). Its own small file because
// core/src/view/wallet.ts brings the recorded weeks with it: importing this from there cost the Desk 148 KB.
import type { LedgerEvent } from "../ledger/events.ts";
import { usdOf } from "../money.ts";

export type ReturnKind = "paid" | "cancelled" | "refunded" | "not-charged" | "held" | "unknown" | "mismatch" | "swapped" | "elsewhere";

/** The run as a page reads it back from `/api/runs/:id`. */
export interface ReturnedRun {
  week: number | null;
  bound: { total: string; orderId: string | null } | null;
  settled: { ok: boolean; reason?: string } | null;
  events: readonly LedgerEvent[];
  /** The server's word on whether this browser owns the run. */
  mine?: boolean;
  /** PayPal's refund came back for this run's payment. */
  refunded?: boolean;
  /** This browser already paid this run's recorded week, on this run or another: its cart can't be approved here. */
  paidHere?: boolean;
  /** That payment was then undone (refunded): the same stop, its own words. */
  undoneHere?: boolean;
  /** Money may have moved on this browser's other run for the week, so this cart can't be approved here either. */
  unsureHere?: boolean;
}

export const RETURN_UNKNOWN = "Whether this was charged isn't clear, so there's no new cart to approve. Check your payment activity first.";
// Never "you": anyone who reached PayPal's page for this order can press Cancel (main.ts, Round 3 O1), and the cart stays open after it.
// That stays unsaid here: the Desk's return card draws no Approve, so "stays open" invited a tap that screen doesn't have (C's
// steps 4–5 walk, Nov 6). The wallet and the classic page draw their Approve under these words, so the button says it there.
// core/test/return-actions.test.ts fails any return words that name an action their screen doesn't draw.
export const RETURN_CANCELLED = "Cancel was pressed in PayPal. Nothing was paid.";
export const RETURN_CHECKING = "We can't tell yet";
export const RETURN_WRONG = "Captured the wrong amount";
/** A recorded week this browser already paid, on any page: the replay still plays, and there's nothing to press. */
export const RETURN_ALREADY_HEAD = "Nothing to approve";
export const RETURN_ALREADY = "This browser already paid for this week's cart, so Goose won't open a second one.";
/** The same stop after that payment's Undo (fresh Q, Nov 5): the money came back, so it never reads "already paid". */
export const RETURN_ALREADY_UNDONE = "This browser paid for this week's cart and then undid it, so Goose won't open a second one.";
/**
 * The week's stop in the classic page's lane and strip: paid, or money may have moved (fresh Q, Nov 5). Sent with the run, so
 * the page holds no words of its own for it (index.html and every route's bill, Nov 5), and never "needs your yes" under it.
 */
export const STOP_SAID = {
  paid: { lane: "deal, already paid here", strip: ", already paid in this browser" },
  unsure: { lane: "deal, can't tell yet if paid", strip: ", can't tell yet if it was paid" },
  undone: { lane: "deal, paid then undone here", strip: ", paid then undone in this browser" },
} as const;
export type StopSaid = (typeof STOP_SAID)[keyof typeof STOP_SAID];

/**
 * Back from PayPal (the reviewer's must-fix on answer 1): paid from the server's own run, so a browser whose cookie was
 * dropped still sees Paid, never a fresh Approve. Money may have moved, as `weekSpend` reads it (a capture PayPal never
 * confirmed, a hold no answer closed, or a capture for another amount): `unknown`. Every other closed cart moved
 * nothing. Null while nothing has settled.
 */
export function returnKind(run: ReturnedRun): ReturnKind | null {
  const s = run.settled;
  const ev = run.events ?? []; // a run read back over the wire: never trusted to have every field
  const paid = s?.ok === true;
  const answered = new Set(ev.map((e) => e.data?.hold).filter((h) => typeof h === "number"));
  // A Cancel answers nothing about a capture already under way, so these are read with or without a settle.
  const moved = ev.some((e) => (e.actor === "paypal" && (e.action === "captured" || e.action === "capture-mismatch" || (e.action === "capture-failed" && e.data?.code === "unknown")))
    || (e.actor === "guard" && e.action === "capturing" && !answered.has(e.seq)));
  // Cancel at PayPal settles nothing and leaves the cart open, but it's said. Nothing settled, no Cancel, no capture begun: still waiting.
  if (!s && !moved && !ev.some((e) => e.actor === "shopper" && e.action === "cancel")) return null;
  // Another browser's run link, which may be the owner on a second device: the words can't say "you" or offer Undo, but the rows are still
  // here with PayPal's ids masked, so when money may have moved it never reads "Nothing was charged".
  if (run.mine === false) return paid ? (run.refunded ? "refunded" : "elsewhere") : moved || unreleased(ev) ? "unknown" : s ? "not-charged" : "cancelled";
  if (paid && run.bound?.orderId && run.week !== null) return "paid";
  // Money moved, but not the amount you approved: its own words and its red row, never "can't tell" (Joshua, Wed Oct 28).
  if (ev.some((e) => e.actor === "paypal" && e.action === "capture-mismatch")) return "mismatch";
  if (paid || moved) return "unknown";
  // AUTHORIZE: no money moved, but a hold may still show on the shopper's account, so "closed before any money moved" isn't all.
  if (unreleased(ev)) return "held";
  if (!s) return "cancelled";
  if (ev.some((e) => e.actor === "seller" && e.action === "price-swap")) return "swapped";
  return "not-charged";
}

/**
 * The Desk's and the market's card for a run that isn't simply Paid, so no page says "Not paid" over a capture nobody confirmed
 * or one for another amount, or "Paid" over a refund. `line` null keeps the settle's own reason: a wrong-amount capture's says to check the order, where
 * the wallet's words would promise an Undo these cards don't have. Null: nothing has settled.
 */
export function returnCard(run: ReturnedRun): { head: string; line: string | null } | null {
  if (run.settled?.ok) return run.refunded ? { head: run.bound ? `Refunded ${usdOf(run.bound.total)}` : "Refunded", line: "This payment was refunded." } : null;
  const k = returnKind(run);
  if (k === "unknown") return { head: RETURN_CHECKING, line: RETURN_UNKNOWN };
  if (k === "mismatch") return { head: RETURN_WRONG, line: null };
  if (run.paidHere && !run.settled) return { head: RETURN_ALREADY_HEAD, line: run.undoneHere ? RETURN_ALREADY_UNDONE : RETURN_ALREADY };
  if (run.unsureHere && !run.settled) return { head: RETURN_CHECKING, line: RETURN_UNKNOWN };
  if (!k) return null;
  // A closed cart's reason can be an internal code ("set-aside", "already-paid"), never words for a person.
  if (k === "not-charged" && /^[a-z-]+$/.test(run.settled?.reason ?? "")) return { head: "Not paid", line: "This cart closed before any money moved. Nothing was charged." };
  return { head: "Not paid", line: k === "cancelled" ? RETURN_CANCELLED : null };
}

/**
 * The hold a run left standing: the last row whose release wasn't confirmed, with the authorization it named, unless a
 * later row says PayPal confirmed the release. Null when nothing is left held.
 */
export function unreleased(ev: readonly LedgerEvent[]): { authorizationId: string | null; hash: string | null } | null {
  const last = ev.filter((e) => e.data?.release === "unconfirmed").at(-1);
  if (!last || ev.some((e) => e.seq > last.seq && e.data?.release === "confirmed")) return null;
  const s = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  return { authorizationId: s(last.data?.authorizationId), hash: s(last.data?.hash) };
}
