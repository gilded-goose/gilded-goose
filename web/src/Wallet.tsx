// A3 the wallet home (docs/design/a3-wallet.html, round 3), behind its flag (`?wallet=1`; core/src/view/wallet-flag.ts),
// so the current home stays the default. One idea per screen: the deal already waiting is the hero; with nothing
// waiting, Ask Goose is. Every number comes from code: the recorded week 1 (`walletWeek`, bundled, no request) for the
// deal, and the one shopper fold (F1) for "Your week" (`walletHome` in core/src/view/wallet.ts). The hero's Approve is a
// real button wherever a server can make PayPal's order (W53, `HeroApprove`); only where none can is it the labeled
// picture of one (5b, W38), since a recorded cart has no order behind it. After paying, PayPal's return lands back here
// (Joshua's answer 1): the server's paid cookie makes the hero "Paid $47.73" with PayPal's order, and that browser is
// never offered the cart again; another browser has no cookie and gets its own fresh cart. After a hold PayPal didn't
// confirm released, the server's held cookie keeps Approve waiting until PayPal confirms it; a capture for another amount
// than you approved is a red row in "Your week" with both amounts and Undo (Joshua, Wed Oct 28). A paid purchase has
// Undo too, from the tab that paid, while it's open (QUEUE M3 slot 2): PayPal's refund, the dial turned back, and the
// server's refunded cookie so the hero says "Undone" on every reload. "Take it back" said or typed in Ask Goose only
// brings that Undo forward with its amount: the tap is the refund (018 N28).

import { appHref } from "./menu/href.ts";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { lazyOr, useBackFromPayPal } from "./states/online.ts";
import { TryAgain } from "./held.tsx";
import { DISPUTE_URL, NEVER_ARRIVES } from "@goose/core/disputes";
import { SANDBOX_NEXT } from "./states/words.ts";
import { type ReturnKind, HELD_WAIT, RETURN_ALREADY, RETURN_CHECKING, RETURN_WORDS, RETURN_WRONG, heldRetryLabel, WALLET_HELD_COOKIE, WALLET_PAID_COOKIE, WALLET_REFUNDED_COOKIE, money, paidForDeal, parseUndoState, parseWalletHeld, parseWalletPaid, refundedFor, takeBack, UNDONE_DIAL, walletClosedHome, walletHeldHome, walletMismatchHome, walletFoldHome, walletPaidHome, walletRefundedHome, walletSaid, type ReturnedRun, type UndoState, type WalletDeal, type WalletHome, type WalletPaid, type WalletReturn, type WeekRow } from "@goose/core/wallet";
import type { WalletMode } from "@goose/core/wallet-flag";
import { AskGoose } from "./AskGoose.tsx";
import "./wants.css";
import { DeskHead, EGG, Egg, HeroTop, LockGlyph, Only, WALLET_CHIPS, WALLET_WEEK, WalletHero, WalletTop, WeekDesk, type WalletTab } from "./first-paint.tsx";
import { MenuButton } from "./menu/MenuButton.tsx";
import { PROBE_EVERY_MS, PROBE_TRIES, type LiveState } from "@goose/core/live";
import { liveAway, liveKnown, useLive } from "./live.ts";
import { PayLater } from "./PayLater.tsx";
import { MUTE_KEY, isMuted, onMuted, setMuted } from "./speech.ts";
import { FAKE_RAIL } from "./rail.ts";
import { syncTried } from "./tries.ts";
import { useName } from "./name.ts";
import { withName } from "@goose/core/name";
import { Loading, Offline, StateNote, WORDS, useOnline } from "./states/index.ts";
import "./wallet.css";
import { wireSkip } from "./skip.ts";
import { usdOf } from "@goose/core/money";

wireSkip();

/** The browser's own copy of a run's undo key (018 N12): this tab only, never in a URL, so Undo works after PayPal's return. */
// The wants list reads the server on its own and sits under the week, so its code needn't be on the first load either.
// The list's code didn't load: said, never a silent blank (Q, Nov 5). In Settings it stands where the limits would, and
// lets the voice card under it draw.
const WANTS_LOST = "Your limits and wants didn't load.";
function WantsLost({ onRead }: { onRead?: () => void }) {
  useEffect(() => { onRead?.(); }, [onRead]);
  return <section className="wants scard" data-state="lost"><p className="wnote" role="status">{WANTS_LOST} <TryAgain /></p></section>;
}
const Wants = lazyOr(() => import("./Wants.tsx").then((m) => ({ default: m.Wants })), WantsLost);

const undoSlot = (runId: string) => `goose_undo_${runId}`;
/** Settings' one line on the voice: true by speech.ts, whose mute is one key in this browser's storage. */
const VOICE_NOTE = "Mute keeps Goose quiet on every page in this browser until you unmute.";

/**
 * Track W (3b), from Track V's accessibility review: the wallet's "Mute Goose", the Desk's label pattern with
 * aria-pressed. It follows the captions' Mute and other tabs (onMuted, the storage event). Round 1 moved it from the
 * bar to Settings (the bar holds where you go; a switch is a setting), where it shows its words at every width.
 */
function MuteGoose() {
  const [muted, set] = useState(isMuted);
  useEffect(() => {
    const now = () => set(isMuted());
    const store = (e: StorageEvent) => { if (e.key === MUTE_KEY || e.key === null) now(); };
    const stop = onMuted(now);
    addEventListener("storage", store);
    return () => { stop(); removeEventListener("storage", store); };
  }, []);
  return (
    <button type="button" className="wmute" aria-pressed={muted} onClick={() => setMuted(!muted)}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />{muted ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />}</svg>
      <span className="tl">{muted ? "Unmute Goose" : "Mute Goose"}</span>
    </button>
  );
}

function undoKeyFor(runId: string): string | null {
  try { return sessionStorage.getItem(undoSlot(runId)); } catch { return null; }
}
/** The last wallet run this tab started: the purchase its Undo and "take it back" may name, this tab only. */
const LAST_RUN = "goose_last_run";
function lastRunHere(): string | null {
  try { const id = sessionStorage.getItem(LAST_RUN); return id && /^[0-9a-f]{12}$/.test(id) ? id : null; } catch { return null; }
}

/** Where this tab's paid run's Undo stands, read once from the server's run view (`undo`); none until it answers. */
function useUndoState(runId: string | null, paid: boolean, done: boolean): UndoState {
  const [u, setU] = useState<UndoState>({ state: "none" });
  useEffect(() => {
    if (!runId || !paid || !undoKeyFor(runId)) return;
    void fetch(`/api/runs/${runId}`).then((r) => (r.ok ? r.json() as Promise<{ undo?: unknown }> : null)).then((v) => setU(parseUndoState(v?.undo))).catch(() => {});
  }, [runId, paid, done]);
  return u;
}

/**
 * Undo on a wrong-amount capture (Joshua, Wed Oct 28): refunds what PayPal took, by the run's own undo key; the server
 * refunds the capture its guard recorded, never one a request names. One state for the page, so the hero's Undo and the
 * red row's never disagree.
 */
interface Undo { key: string | null; state: "idle" | "busy" | "done"; error: string | null; undo: () => void }
function useUndo(runId: string | null): Undo {
  const [state, setState] = useState<Undo["state"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const key = runId ? undoKeyFor(runId) : null;
  async function undo() {
    if (state !== "idle" || !key) return;
    setState("busy"); setError(null);
    const r = await fetch(`/api/runs/${runId}/undo`, { ...POST, body: JSON.stringify({ undoKey: key }) }).catch(() => null);
    const body = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : {};
    if (r?.ok && body.ok) { setState("done"); void syncTried(); return; } // Things to try: the refund row ticks "Undo it"
    setState("idle"); setError(body.error ?? "The refund didn't go through. Try Undo again.");
  }
  return { key, state, error, undo: () => void undo() };
}

/** Without the key (another tab) it says where Undo works. */
function UndoWrong({ u, amount, primary }: { u: Undo; amount: string; primary?: boolean }) {
  if (!u.key) return <span className="wundo-none">Undo works from the tab that approved this cart.</span>;
  if (u.state === "done") return <span className="wundo-done" role="status">Refunded: {amount} back.</span>;
  return (
    <>
      <button type="button" className={`wundo${primary ? " primary" : ""}`} onClick={u.undo} aria-disabled={u.state === "busy" || undefined} aria-busy={u.state === "busy" || undefined}>{u.state === "busy" ? "Refunding…" : `Undo: refund ${amount}`}</button>
      {u.error && <span className="wundo-err" role="alert">{u.error}</span>}
    </>
  );
}

/**
 * "Your week" as rows (W50b): each one a ledger row the counts come from. Open on every screen (W59: a phone too), so
 * what the counts count is never a tap away; the shopper may fold it.
 */
function WeekList({ rows, u }: { rows: WeekRow[]; u: Undo }) {
  if (!rows.length) return null;
  return (
    <details className="wrows" open>
      <summary>Every row this week <span aria-hidden="true">›</span></summary>
      <ul>
        {rows.map((r) => (
          <li key={`${r.kind}-${r.seq}`} className={`w-${r.kind}`} data-seq={r.seq}>
            <span><b>{r.item.replace(" (fictional)", "")}</b><span>{r.kind === "refused" ? r.note : `${r.note} · ${r.merchant.replace(" (fictional)", "")}`}</span>
              {r.kind === "mismatch" && <UndoWrong u={u} amount={money(r.price, r.currency)} />}</span>
            <b className="p">{money(r.price, r.currency)}</b>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** What the server can do with a cart: make PayPal's order ("sandbox", or CI's "fake"), or not; "checking" until it answers. */
type Payment = "checking" | "sandbox" | "fake" | "off" | "none";
/** The practice-site line stays up while the server hasn't answered: it's in the first paint, and live is the sandbox. Pages has no server and no line in its first paint (prerender.tsx), so it never draws one. */
const practiceNext = (payment: Payment) => payment === "sandbox" || (payment === "checking" && import.meta.env.BASE_URL === "/");

/** The recorded week the wallet shows (`walletWeek`), and the one its Approve replays on the server. */
const WEEK = WALLET_WEEK;
const NOTHING = "Nothing was charged.";
/** R-12: why PayPal can't open when no call got through. Offline, that is the cause the code sees, never the server. */
const cantOpen = () => (navigator.onLine ? `Goose's server isn't answering, so PayPal can't open right now. ${NOTHING}` : `${WORDS.OFFLINE.title} ${WORDS.OFFLINE_SAYS.pay}`);
/** approveWeek's answer when this browser turns out to have paid already: no error line, the hero turns to Paid. */
const PAID = "paid";
/** approveWeek's answer when the server says this browser's earlier hold isn't confirmed released yet: the hero waits. */
const HELD = "held";
const UNSURE = "unsure";
const POST = { method: "POST", headers: { "Content-Type": "application/json" } } as const;
/** The run as the server sends it back; `shopper` is the session's fold, only ever to the browser that started the run. */
interface ServerRun extends ReturnedRun { returned?: ReturnKind | null; done: boolean; seed: number; bound: { item: string; merchant: string; total: string; currency: string; orderId: string | null } | null; shopper?: { weekCounts?: unknown } | null }

/** This browser's payment for the wallet's week, from the cookie only the server writes (after a paid settle); else null. */
function paidHere(): WalletPaid | null {
  const v = document.cookie.split("; ").find((c) => c.startsWith(`${WALLET_PAID_COOKIE}=`))?.slice(WALLET_PAID_COOKIE.length + 1);
  const p = parseWalletPaid(v);
  return p?.week === WEEK ? p : null;
}

/** This browser's refund of the wallet's week (Undo), from the cookie only the server writes once PayPal refunded; else null. */
function refundedHere(): WalletPaid | null {
  const v = document.cookie.split("; ").find((c) => c.startsWith(`${WALLET_REFUNDED_COOKIE}=`))?.slice(WALLET_REFUNDED_COOKIE.length + 1);
  const p = parseWalletPaid(v);
  return p?.week === WEEK ? p : null;
}

/** Whether this browser's earlier hold for the wallet's week still waits on PayPal, from the cookie only the server writes. */
function heldHere(): boolean {
  const v = document.cookie.split("; ").find((c) => c.startsWith(`${WALLET_HELD_COOKIE}=`))?.slice(WALLET_HELD_COOKIE.length + 1);
  return parseWalletHeld(v)?.week === WEEK;
}

/**
 * Back from PayPal (`?run=`): what the server's run says happened, in the wallet's fixed words (`walletReturn`), never
 * the settle's own text. Paid comes from the run too, so a browser whose cookie was dropped still sees Paid. The run
 * comes back with it, for a wrong-amount capture's red row.
 */
async function returned(runId: string): Promise<{ ret: WalletReturn | null; run: ServerRun } | null> {
  if (!/^[0-9a-f]{12}$/.test(runId)) return null;
  const run = await fetch(`/api/runs/${runId}`).then((r) => (r.ok ? (r.json() as Promise<ServerRun>) : null)).catch(() => null);
  return run ? { ret: walletSaid(run.returned, run), run } : null;
}

/**
 * Asks the server to read PayPal again for the earlier hold (`/api/runs/held`): its state and the seconds before PayPal
 * can be asked again, a cap's words (PayPal wasn't asked), or null when the server couldn't answer.
 */
type HeldNow = { state?: string; retryIn?: number; error?: string };
async function heldNow(): Promise<HeldNow | null> {
  const r = await fetch("/api/runs/held", { ...POST, body: "{}" }).catch(() => null);
  if (!r || (!r.ok && r.status !== 429)) return null;
  return (await r.json().catch(() => null)) as HeldNow | null;
}

/**
 * The time now, re-rendering as each whole second of the wait to `until` passes (the re-check's wait on its button).
 * Read fresh on every render: a clock kept in state would be as old as the last tick when `until` moves.
 */
function useNowUntil(until: number): number {
  const [tick, setTick] = useState(0);
  const now = Date.now();
  useEffect(() => {
    if (now >= until) return;
    const t = setTimeout(() => setTick((n) => n + 1), (until - now) % 1000 || 1000);
    return () => clearTimeout(t);
  }, [tick, until]); // not `now`: it is new on every render
  return now;
}

/** The server's cart is this very deal, field by field. */
const sameDeal = (b: ServerRun["bound"] | undefined, deal: WalletDeal | null | undefined): boolean =>
  !!b && !!deal && b.item.replace(" (fictional)", "") === deal.item && b.merchant === deal.seller && b.total === deal.total && b.currency === "USD";

/**
 * W53: the tap that pays for the hero's cart. The browser never names a cart or a price: it asks the server to replay
 * week 1 from its recording (`replayOnly`: a server without that recording says so, and never haggles live or by rule
 * instead), so the guard binds the cart the way every run's is bound, then presses that run's Approve (H2), which makes
 * PayPal's order for exactly the bound cart. Unless the run is that recording and its cart is the one on screen, field
 * by field, nothing is approved. Resolves to why PayPal didn't open; on success the page has already left for PayPal.
 */
async function approveWeek(deal: WalletDeal, swap = false): Promise<string> {
  const said = async (r: Response) => ((await r.json().catch(() => ({}))) as { error?: string }).error;
  const start = await fetch("/api/runs", { ...POST, body: JSON.stringify({ seed: WEEK, pace: false, replayOnly: true, ...(swap ? { swap: true } : {}) }) }).catch(() => null);
  if (!start) { liveAway(); return cantOpen(); }
  // A free host that fell asleep after the page loaded answers its own "loading" page, not ours: say it's waking, and
  // look again. No wake time is promised: none is measured (Track W, Lead-9 via Track C). A cap or a full server says why in its own words, each ending in a full stop.
  if (start.status === 503 && !(start.headers.get("content-type") ?? "").includes("json")) { liveAway(); return `Goose's server is waking up. Press Approve again in a moment. ${NOTHING}`; }
  // Paid from another tab of this browser since this one loaded: the server refuses, and the wallet turns to Paid. A
  // cookie for another total isn't believed (`paidForDeal`), so that 409 says the server's words, never a silent button.
  if (start.status === 409 && paidHere() && !swap) return paidHere()?.total === deal.total ? PAID : RETURN_ALREADY;
  // The server read PayPal again and the earlier hold isn't confirmed released: the hero waits (its own words, no error).
  const refused = start.status === 409 ? ((await start.clone().json().catch(() => ({}))) as { held?: boolean; unsure?: boolean }) : null;
  if (refused?.held === true) return HELD;
  // Money may have moved on an earlier cart, so never "Nothing was charged", and no hold to wait on (main.ts `weekStop`).
  if (refused?.unsure === true) return UNSURE;
  if (!start.ok) return `${(await said(start)) ?? "The server couldn't start this cart."} ${NOTHING}`;
  const begun = (await start.json()) as { runId: string; source: string; seed: number; undoKey?: string };
  if (begun.source !== "recorded" || begun.seed !== WEEK) return `The server didn't replay this week's recording, so Goose won't open PayPal for it. ${NOTHING}`;
  const { runId } = begun;
  // Kept for this tab only, so Undo still works when PayPal sends it back here (a wrong-amount capture's row).
  if (begun.undoKey) try { sessionStorage.setItem(undoSlot(runId), begun.undoKey); sessionStorage.setItem(LAST_RUN, runId); } catch { /* no storage: Undo says where it works */ }
  let run: ServerRun | null = null;
  for (let i = 0; i < 100 && !run?.done; i++) {
    await new Promise((r) => setTimeout(r, 200));
    run = await fetch(`/api/runs/${runId}`).then((r) => (r.ok ? (r.json() as Promise<ServerRun>) : null)).catch(() => null);
  }
  if (!run?.done) return `The server didn't finish binding this cart, so PayPal can't open. ${NOTHING}`;
  const b = run.bound;
  if (run.seed !== WEEK || !sameDeal(b, deal)) return `The server didn't bind this exact cart, so Goose won't open PayPal for it. ${NOTHING}`;
  const r = await fetch(`/api/runs/${runId}/approve`, { ...POST, body: "{}" }).catch(() => null);
  const body = r ? ((await r.json().catch(() => ({}))) as { approveUrl?: string; error?: string }) : {};
  if (r?.ok && body.approveUrl) { location.assign(body.approveUrl); return ""; }
  return body.error ?? `PayPal can't open right now. ${NOTHING}`;
}

/**
 * The hero's Approve (W53, §24B): a real button named "Approve $47.73", keyboard-operable and at least 44 px, wherever a
 * server answers or may still (asleep on first load, the tap waits for the probe; asleep since, the tap says it's
 * waking). Where none can make PayPal's order, the labeled picture of one: a recorded cart has no order behind it (5b,
 * W38), so no clock either (guild-visual, 020: a clock that never moves). The terms describe the button.
 */
function HeroApprove({ deal, payment, away, onPaid, onHeld, onUnsure }: { deal: WalletDeal; payment: Payment; away: false | "server" | "offline"; onPaid: () => void; onHeld: () => void; onUnsure: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useBackFromPayPal(() => setBusy(false));
  const tick = <LockGlyph />;
  if (payment === "off" || payment === "none") {
    return (
      <div className="approve" id="approve" role="img" aria-label={`A picture of the approve button, ${deal.total} dollars: recorded, it can't be paid${away === "offline" ? " while you're offline" : away ? " while Goose's server isn't answering" : ""}. This exact cart only.`}>
        <span className="a1">{tick}Approve · {usdOf(deal.total)}</span>
        {/* T-4: away, the plate says why, in the phone's first screen too; the full tag is under it. */}
        <span className="a2">{away && <span className="lamp" />}recorded, can’t be paid</span>
        <span className="a3" aria-hidden="true">This exact cart only</span>
      </div>
    );
  }
  async function press() {
    if (busy) return;
    setBusy(true); setError(null);
    const why = (await liveKnown()) === "up" ? await approveWeek(deal) : cantOpen();
    if (why === PAID) { onPaid(); return; }
    if (why === HELD) { onHeld(); return; }
    if (why === UNSURE) { onUnsure(); return; }
    if (why) { setError(why); setBusy(false); }
  }
  return (
    <>
      {/* id: the menu's "Approve in PayPal" lands here (`?wallet=1#approve`, MENU_ANCHORS; S1-3). */}
      <button type="button" className="approve live" id="approve" onClick={press} aria-describedby={`approve-terms${practiceNext(payment) ? " approve-next" : ""}`} aria-disabled={busy || undefined} aria-busy={busy || undefined}>
        <span className="a1">{tick}Approve {usdOf(deal.total)}</span>
      </button>
      {/* No minutes here: until the tap binds it, this cart has no approval clock to state (H1 review). */}
      <p className="aterms" id="approve-terms">This exact cart only</p>
      {practiceNext(payment) && <p className="apractice" id="approve-next">{SANDBOX_NEXT}</p>}
      <p className="astatus" role="status">{busy ? "Opening PayPal…" : ""}</p>
      {error && <p className="aerr" role="alert">{error}</p>}
      <PayLater total={deal.total} />
    </>
  );
}

/**
 * Attack corpus 12, one click: the same cart, opened in PayPal the same way, but the server's seller adds one cent after
 * the tap, once PayPal holds the money. The words promise only what happens (the seller's change), never the outcome:
 * the return says what code did. Beside Approve, Paid or Undone, since a swapped cart is never charged.
 */
function SwapTry({ deal, sandbox }: { deal: WalletDeal; sandbox: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useBackFromPayPal(() => setBusy(false));
  async function press() {
    if (busy) return;
    setBusy(true); setError(null);
    const why = (await liveKnown()) === "up" ? await approveWeek(deal, true) : cantOpen();
    if (why === HELD) setError(HELD_WAIT);
    else if (why) setError(why === PAID ? "This browser already paid for this week's cart." : why);
    if (why) setBusy(false);
  }
  return (
    <div className="wswap">
      <button type="button" className="linkish" onClick={press} aria-describedby={`swap-terms${sandbox ? " swap-next" : ""}`} aria-disabled={busy || undefined} aria-busy={busy || undefined}>Try a price swap ›</button>
      <p className="muted small" id="swap-terms">The same cart opens in PayPal. After your tap, the seller adds one cent. See what code does.</p>
      {sandbox && <p className="apractice" id="swap-next">{SANDBOX_NEXT}</p>}
      <p className="astatus" role="status">{busy ? "Opening PayPal…" : ""}</p>
      {error && <p className="aerr" role="alert">{error}</p>}
    </div>
  );
}

/** Slice 7: true only the first time this tab shows this order (kept in sessionStorage, decided once per page load, so a
 * re-render or a reload never prints it again). No storage: false, so the receipt is simply there. */
const printed = new Map<string, boolean>();
function printedOnce(orderId: string): boolean {
  let fresh = printed.get(orderId);
  if (fresh === undefined) {
    const k = `goose-printed:${orderId}`;
    try { fresh = !sessionStorage.getItem(k); sessionStorage.setItem(k, "1"); } catch { fresh = false; }
    printed.set(orderId, fresh);
  }
  return fresh;
}

/**
 * The hero once this browser paid (Joshua's answer 1): "Paid $47.73" and PayPal's order, in place of the Approve. A
 * status, not a control, so nothing on the page offers the cart again.
 */
function HeroPaid({ paid, payment, u, open, asked, runId }: { paid: WalletPaid; payment: Payment; u: Undo; open: boolean; asked: string | null; runId: string | null }) {
  const fresh = printedOnce(paid.orderId);
  return (
    <>
      {/* Design B, slice 7: the receipt sits in a slot on the desk. The first time this tab shows this order it prints up
          out of the slot, the stamp lands and the gold check draws; on a reload it is simply there. */}
      <div className={fresh ? "pslot fresh" : "pslot"}>
        <div className="paid" role="status">
          <span className="p1"><svg viewBox="0 0 40 48" aria-hidden="true"><path className="pegg" d={EGG} /><path className="pk" d="M12.5 28.5l5.5 5.5 10-12" pathLength={1} fill="none" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" /></svg>Paid {usdOf(paid.total)}</span>
          {/* W50a, Lesson 13: "PayPal" only once the server says sandbox; fake says test, and until it answers, just "Order". */}
          <span className="p2">{payment === "fake" ? "Test order" : payment === "sandbox" ? "PayPal order" : "Order"} <span className="oid">{paid.orderId}</span></span>
        </div>
      </div>
      {/* Undo (QUEUE M3 slot 2): only from the tab that paid (it holds the run's undo key), only while the server says it's
          open. "Take it back" puts its words here and scrolls it into view, never focus: a held Enter would press it. The tap is the
          refund. */}
      {u.key && open && (
        <div className="wtake">
          {asked && <p className="wasked" role="status">{asked}</p>}
          <button type="button" id="wundo-paid" className="wundo" onClick={u.undo} aria-disabled={u.state === "busy" || undefined} aria-busy={u.state === "busy" || undefined}>{u.state === "busy" ? "Refunding…" : `Undo: refund ${usdOf(paid.total)}`}</button>
          {u.error && <span className="wundo-err" role="alert">{u.error}</span>}
        </div>
      )}
      {/* PayPal additions 3: PayPal's own report against this ledger, from the tab that paid. */}
      {u.key && runId && <AskPayPal runId={runId} path="reconcile" label="Does PayPal's record agree? ›" />}
      <NeverArrives runId={u.key ? runId : null} payment={payment} />
    </>
  );
}

/**
 * PayPal additions 2, "if it never arrives": PayPal's own disputes page, and what PayPal lists on this purchase (the
 * server asks list_disputes for this tab's paid run). Goose never opens or settles a dispute, and the words say so.
 */
function NeverArrives({ runId, payment }: { runId: string | null; payment: Payment }) {
  return (
    <details className="wnever">
      <summary>If it never arrives <span aria-hidden="true">›</span></summary>
      <p>{NEVER_ARRIVES}</p>
      {payment === "sandbox" && <p className="wnever-acts"><a href={DISPUTE_URL.sandbox} target="_blank" rel="noopener noreferrer">Open PayPal's disputes page ›<span className="vh"> (opens in a new tab)</span></a></p>}
      {runId && <AskPayPal runId={runId} path="disputes" label="What does PayPal list? ›" />}
    </details>
  );
}

/**
 * One read-only question to PayPal about this tab's paid run (PayPal additions 2 and 3), answered in fixed words by the
 * server. The live regions are always there, so a reader hears each answer; words and an error never show together, and
 * an answer from inside the server's 30-second window says it is from a moment ago.
 */
function AskPayPal({ runId, path, label }: { runId: string; path: "disputes" | "reconcile"; label: string }) {
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function ask() {
    if (busy) return;
    setBusy(true);
    setSaid(null);
    setError(null);
    const r = await fetch(`/api/runs/${runId}/${path}`, { ...POST, body: "{}" }).catch(() => null);
    const body = ((await r?.json().catch(() => null)) ?? {}) as { words?: unknown; cached?: unknown; error?: unknown };
    setBusy(false);
    if (r?.ok && typeof body.words === "string") setSaid(`${body.cached === true ? "Asked a moment ago: " : ""}${body.words}`);
    else setError(typeof body.error === "string" ? body.error : "PayPal couldn't be asked just now. Try again.");
  }
  return (
    <div className="wask">
      <button type="button" className="linkish" onClick={() => void ask()} aria-disabled={busy || undefined} aria-busy={busy || undefined}>{busy ? "Asking PayPal…" : label}</button>
      <p className={said ? "wask-said" : "wask-live"} role="status">{said ?? ""}</p>
      <p className="wundo-err" role="alert">{error ?? ""}</p>
    </div>
  );
}

/** The hero once this browser undid its payment: the refund, and what Undo changed, in fixed words. A status, no button. */
function HeroUndone({ paid }: { paid: WalletPaid }) {
  return (
    <div className="paid undone" role="status">
      <span className="p1">Undone · refunded {usdOf(paid.total)}</span>
      <span className="p2">{UNDONE_DIAL}</span>
    </div>
  );
}

/**
 * The hero while an earlier hold waits on PayPal (Joshua, Wed Oct 28): the reason in plain words in place of Approve, and
 * a way to ask PayPal again. Approve comes back only on the server's word that PayPal shows the hold released.
 */
function HeroHeld({ onReleased, asked }: { onReleased: () => void; asked: number }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  // Joshua (Wed Oct 28): PayPal is asked at most once per cart every 10 seconds; the button says the wait.
  const [until, setUntil] = useState(asked);
  useEffect(() => setUntil((u) => Math.max(u, asked)), [asked]);
  const wait = Math.ceil((until - useNowUntil(until)) / 1000);
  // The ring at the button's left empties as the wait runs out (its share of the longest wait this window has said).
  const span = useRef(0);
  span.current = wait > 0 ? Math.max(span.current, wait) : 0;
  async function check() {
    if (busy || wait > 0) return;
    setBusy(true); setSaid(null);
    const r = await heldNow();
    setBusy(false);
    const state = r?.state;
    if (state === "released" || state === "none") { onReleased(); return; }
    if (r?.retryIn) setUntil(Date.now() + r.retryIn * 1000);
    setSaid(r?.error ?? (state === "held" ? "PayPal still shows the hold. Nothing new will be charged." : state === "captured" ? RETURN_WORDS.unknown : "Goose couldn't ask PayPal right now. Try again in a moment."));
  }
  return (
    <div className="held">
      <p className="h1" role="status">{HELD_WAIT}</p>
      <button type="button" className="recheck" onClick={check} aria-disabled={busy || wait > 0 || undefined} aria-busy={busy || undefined} style={wait > 0 ? ({ "--left": wait / span.current } as CSSProperties) : undefined}>
        <i className="rring" aria-hidden="true" />{busy ? "Asking PayPal…" : wait > 0 ? heldRetryLabel(wait) : "Check with PayPal again"}
      </button>
      {said && <p className="aerr" role="alert">{said}</p>}
    </div>
  );
}

/**
 * The hero after a capture for another amount (visual review, Wed Oct 28): both amounts and the Undo where the shopper is
 * already looking, in red; the same red row stays under Your week.
 */
function HeroWrong({ row, u }: { row: WeekRow; u: Undo }) {
  return (
    <div className="wrong">
      <p className="w1">{row.note}</p>
      <UndoWrong u={u} amount={money(row.price, row.currency)} primary />
    </div>
  );
}

/** How Goose keeps you safe: a quiet card linking to the step-by-step story. */
const Safe = () => <a className="safe" href="safe.html"><Egg className="egg" /><div><b>How Goose keeps you safe ›</b><span>One week, step by step.</span></div></a>;
/** Track P's Store Sync-shaped market (`?market=1`): shown only while Goose's server answers, as the market needs it. */
const Market = () => <a className="mkt" href={appHref("?market=1")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg><div><b>Shop the market ›</b><span>Search → cart → complete_payment. Only your tap pays.</span></div></a>;

/**
 * Design B's replay of the recorded week on the desk (first-paint.tsx, wallet.css): about 6 s, CSS only. W4 (Round 2's
 * design judge and a11y): the page opens on the end, settled, with every word at full contrast; the replay is a choice
 * ("Watch the week"), and Skip shows the end at once. With reduced motion asked for, the end is all there is.
 */
const REPLAY_S = 6.4;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/**
 * W6 (S1-11's measure: the tour's stop 6, "Approve in PayPal", landed with the deal card's foot under the phone's pill):
 * anything that scrolls Approve into view (the menu's and the tour's landing, which centres it; a Tab) brings the whole
 * deal card with it. Approve's scroll margins reach the card's top and foot (`--am-t` / `--am-b` on the card, read by
 * wallet.css), cut to what fits between the page's scroll paddings (the pill's, while it shows), the foot first: the
 * name, the price and Approve itself are never pushed out. On the card, so a redrawn Approve keeps them.
 */
function useApproveFit(on: boolean): void {
  useLayoutEffect(() => {
    if (!on) return;
    const fit = () => {
      const a = document.getElementById("approve"), card = a?.closest<HTMLElement>("section.hero");
      if (!a || !card) return;
      const ar = a.getBoundingClientRect(), cr = card.getBoundingClientRect();
      const pad = getComputedStyle(document.documentElement);
      const room = Math.max(0, innerHeight - (parseFloat(pad.scrollPaddingTop) || 0) - (parseFloat(pad.scrollPaddingBottom) || 0) - ar.height - 8);
      const t = Math.min(Math.max(0, ar.top - cr.top), room);
      const b = Math.min(Math.max(0, cr.bottom - ar.bottom), room - t);
      for (const [k, v] of [["--am-t", t], ["--am-b", b]] as const) {
        const px = `${Math.round(v)}px`;
        if (card.style.getPropertyValue(k) !== px) card.style.setProperty(k, px);
      }
      // The tour's pill arrives after the landing (its own chunk), so a card landed on with "#approve" can end with its
      // foot under the strip. Until the visitor moves the page themselves, bring it back in view, the least scroll
      // that does ("nearest"), once the foot chrome has settled.
      if (location.hash === "#approve" && !moved && pad.scrollPaddingBottom !== spb) {
        spb = pad.scrollPaddingBottom;
        a.scrollIntoView({ block: "nearest", behavior: "auto" });
      }
    };
    let moved = false, spb = getComputedStyle(document.documentElement).scrollPaddingBottom;
    const mine = () => { moved = true; };
    const ways = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    for (const w of ways) addEventListener(w, mine, { once: true, passive: true });
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(document.body);
    const card = document.querySelector(".wallet section.hero");
    if (card) ro.observe(card);
    addEventListener("resize", fit);
    return () => { ro.disconnect(); removeEventListener("resize", fit); for (const w of ways) removeEventListener(w, mine); };
  }, [on]);
}
function useReplay() {
  const [done, setDone] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (done) return;
    const t = window.setTimeout(() => setDone(true), REPLAY_S * 1000);
    return () => window.clearTimeout(t);
  }, [done, n]);
  return {
    done,
    skip: () => setDone(true),
    // Done → play starts every CSS animation on the desk from its first moment.
    again: () => { if (reduced()) return; setN((k) => k + 1); setDone(false); },
  };
}
type Replay = ReturnType<typeof useReplay>;
/** One hairline pill (the Desk's "Keep watching"): watch the week, or skip to its end while it plays. */
const ReplayButton = ({ r }: { r: Replay }) => r.done
  ? <button type="button" className="skip" onClick={r.again}>Watch the week</button>
  : <button type="button" className="skip" onClick={r.skip}>Skip to the end</button>;

/**
 * The phone's "Deal waiting" bar (design B): while the deal waits for your tap below the fold, one bar says so and
 * scrolls to it. Only a link: the tap that pays is the deal card's Approve, never this.
 */
function DealBar({ d, show }: { d: WalletDeal; show: boolean }) {
  const [below, setBelow] = useState(false);
  useEffect(() => {
    const el = document.getElementById("hero-h")?.closest(".hero");
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setBelow(!e!.isIntersecting && e!.boundingClientRect.top > 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  if (!show || !below) return null;
  return <a className="dealbar" href="#hero-h">Deal waiting: {usdOf(d.total)}, needs your tap <span aria-hidden="true">↓</span></a>;
}

/** Desk or Settings, from the address (#settings), so a reload or a shared link opens the same view. */
function useTab(): WalletTab {
  const read = (): WalletTab => (location.hash === "#settings" ? "settings" : "desk");
  const [tab, setTab] = useState<WalletTab>(read);
  useEffect(() => {
    const on = () => { const t = read(); setTab(t); if (t === "settings") scrollTo({ top: 0 }); };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return tab;
}

/** brand.md 10.9's three parts for the wallet's load error: what happened (the kit's), the cause, then Try again. The
 *  week is built in the page from the bundle, never fetched, so the cause is the page, not the network (DD nit, ~07:50). */
export const WEEK_FAILED = "This page couldn't build your week.";

/**
 * T-4, the away state (online only; offline it says offline, R-11 part 2): Goose's server isn't answering (live mode away, or gone after the probe gave up). Said once,
 * calmly, as a slip under the Approve picture. Every number is the probe loop's own. W-8: the fact, then one short line
 * of what to do (the recorded week on screen already shows that it still works here).
 */
function AwayNote({ live }: { live: LiveState }) {
  const every = `${Math.round(PROBE_EVERY_MS / 1000)}\u00a0s`;
  // R-11 part 2: offline, the probe fails because she is, so the server isn't named and Reload (which can't work) isn't
  // offered; live.ts asks again the moment she's back, so a probe that failed offline never speaks for the server.
  // R-12: live mode's own "offline" (the page's loop) and the event-driven onLine agree; either one says offline.
  const online = useOnline();
  if (!online || live === "offline") return (
    <div className="away at-acts" data-live="offline" role="status">
      <p className="aw1"><span className="lamp" aria-hidden="true" />{WORDS.OFFLINE.title}</p>
      <p className="aw2">{WORDS.OFFLINE.line}</p>
    </div>
  );
  return (
    <div className="away at-acts" data-live={live} role="status">
      <p className="aw1"><span className="lamp" aria-hidden="true" />Goose’s server isn’t answering</p>
      <p className="aw2">{live === "gone"
        ? `It stopped checking after ${Math.round((PROBE_EVERY_MS * PROBE_TRIES) / 60_000)} minutes. Reload to check again.`
        : `Paying waits for it. Goose checks every ${every}.`}</p>
    </div>
  );
}

/** `first`: the week and the limit main.tsx already read, so the first render is the deal, not "Loading your week…" (W64b). */
export default function Wallet({ mode, first }: { mode: Exclude<WalletMode, "off">; first?: { home: WalletHome; limit: string } | undefined }) {
  const [home, setHome] = useState<WalletHome | null>(first?.home ?? null);
  const [down, setDown] = useState(false);
  // Try again (R's <ErrorState>) reads the week again in place: no page reload, the bar and the menu stay.
  const [reads, setReads] = useState(0);
  const reread = () => { setDown(false); setReads((n) => n + 1); };
  // R-11, offline wins: Try again can't read the week offline, so while offline the failure is the kit's Offline, no button.
  const online = useOnline();
  // 034: the name this browser keeps ("call me Sam"), in the Ask box's own question; never sent anywhere.
  const myName = useName();
  // How many wants the Ask box saved on this page: "Your wants" reads the server again on each.
  const [wantsSaved, setWantsSaved] = useState(0);
  const [settingsRead, setSettingsRead] = useState(false);
  const markSettingsRead = useCallback(() => setSettingsRead(true), []);
  // A2: a fact forgotten in Your wants, so the Ask answer on screen drops its chip too (review A2 #1).
  const [forgot, setForgot] = useState<{ key: string; n: number } | null>(null);
  const [limit, setLimit] = useState<string | null>(first?.limit ?? null);
  const [fake, setFake] = useState(false);
  const [payment, setPayment] = useState<Payment>("checking");
  const [paid, setPaid] = useState<WalletPaid | null>(paidHere);
  const [told, setTold] = useState<WalletReturn | null>(null);
  const [back, setBack] = useState<ServerRun | null>(null);
  const [held, setHeld] = useState(heldHere);
  const [heldAsked, setHeldAsked] = useState(0); // when PayPal may next be asked about the hold (ms), from the check on load
  const [runId] = useState(() => { const id = new URLSearchParams(location.search).get("run"); return id && /^[0-9a-f]{12}$/.test(id) ? id : null; });
  // Back with a run in the address: no Approve until the server says what that run did (fresh Q, Nov 5).
  const [asking, setAsking] = useState(runId !== null);
  // Undo names this tab's run: the one PayPal sent back here (`?run=`), else the last one this tab started.
  const undoId = runId ?? lastRunHere();
  const undo = useUndo(undoId);
  const [refunded, setRefunded] = useState<WalletPaid | null>(refundedHere);
  // What "take it back" said, shown beside the Undo it brought forward.
  const [asked, setAsked] = useState<string | null>(null);
  const undoState = useUndoState(undoId, paid !== null, undo.state === "done");
  // The refund came back: the server wrote its refunded cookie, so the hero reads it now (and on every reload).
  useEffect(() => { if (undo.state === "done") { setRefunded(refundedHere()); setAsked(null); } }, [undo.state]);
  const live = useLive();
  const tab = useTab();
  const replay = useReplay();
  useApproveFit(home !== null && !!home.deal);

  // Back from PayPal: paid (from the run, cookie or not), or what closed the cart, above the fresh Approve; when we can't
  // tell whether money moved, no Approve at all. A hold left unconfirmed makes the hero wait.
  useEffect(() => {
    if (runId) void returned(runId).then((r) => {
      // No answer about that run: it may have paid, so when unsure, hold.
      const got: WalletReturn | null = r ? r.ret : { kind: "unknown", words: RETURN_WORDS.unknown };
      setAsking(false);
      setTold(got);
      setBack(r?.run ?? null);
      if (got?.kind === "paid" && got.paid.week === WEEK) { const p0 = got.paid; setPaid((p) => p ?? p0); }
      if (got?.kind === "held") setHeld(true);
    });
  }, [runId]);

  // A held cookie from an earlier visit: ask PayPal once on load, so a hold released since doesn't keep Approve waiting.
  useEffect(() => {
    if (heldHere()) void heldNow().then((r) => {
      if (r?.state === "released" || r?.state === "none") setHeld(false);
      else if (r?.retryIn) setHeldAsked(Date.now() + r.retryIn * 1000);
    });
  }, []);

  // W50a: in CI's fake mode nothing on screen may say PayPal's sandbox (as Safe and the current home do). The banner
  // says practice in every mode (main.tsx), so only the footer names the payments.
  // T-4: asked again when live mode comes back, so a server that wakes after the page loaded brings back a live Approve.
  const up = live === "up";
  useEffect(() => {
    void fetch("/api/health").then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? r.json() as Promise<{ payment?: string }> : null)).then((h) => {
      setPayment(h?.payment === "sandbox" || h?.payment === "fake" || h?.payment === "off" ? h.payment : "none");
      if (h?.payment === "fake") setFake(true);
    }).catch(() => setPayment("none"));
  }, [up]);

  // The recorded week and the Policy's limit, both from the bundle (H1): a read, never a run, so a visit makes no order.
  useEffect(() => {
    if (first) return;
    void import("./wallet-week.ts").then(async (m) => {
      setLimit(m.entryLimit().limit);
      setHome(await m.walletWeek(mode === "empty"));
    }).catch(() => setDown(true));
  }, [mode, reads]);

  // W-8: loading and the load error keep the bar and the room's title, so neither is a bare line on an empty page.
  if (down || !home) return (
    <main id="main" className="wallet dk no-deal" data-palette="v">
      <WalletTop tab={tab} menu={<MenuButton className="dk-menu" />} />
      {/* brand.md 10.9 through Track R's kit (web/src/states): "Goose is loading this." / "Goose couldn't load this." + Try again. */}
      <div className="band"><h1 className="vh">Your week</h1>{down && !online ? <Offline /> : down ? <StateNote kind="error" title={WORDS.ERROR.title} line={WEEK_FAILED} action={{ label: WORDS.ERROR.action, onClick: reread }} /> : <Loading />}</div>
    </main>
  );
  // The payment is believed only for the deal on screen (same total): a bent cookie never puts two totals side by side.
  const real = paidForDeal(home, paid) ? paid : null;
  // Undone: the refunded cookie names this very payment, or the server's run view (or this tab's own Undo) says refunded,
  // so a cookie that didn't land never leaves "Paid" on screen. The cart stays closed here; the hero says what Undo did.
  const undone = real !== null && (refundedFor(real, refunded) || undoState.state === "refunded" || undo.state === "done");
  // Another browser's paid link: "Paid", and no second Approve, only when it's this very deal. Any other cart's says nothing about this one.
  const ret = (told?.kind === "elsewhere" || told?.kind === "refunded") && !(back?.week === WEEK && sameDeal(back.bound, home.deal)) ? null : told;
  const elsewhere = !real && (ret?.kind === "elsewhere" || ret?.kind === "refunded");
  const wrong = !real && ret?.kind === "mismatch" && back !== null;
  // Money moved or may have (paid from another browser, can't tell, or the wrong amount): no fresh Approve. That browser's cookie isn't here, so
  // the server's own one-payment check can't see it, and a second Approve here would capture twice.
  const unknown = !real && (asking || elsewhere || ret?.kind === "unknown" || ret?.kind === "mismatch");
  const waiting = !real && !unknown && held;
  const mine = undone ? walletRefundedHome(home, real!) : real ? walletPaidHome(home, real) : wrong ? walletMismatchHome(home, back) : waiting ? walletHeldHome(home) : elsewhere ? walletClosedHome(home, ret?.kind === "refunded" ? "paid from another browser, then refunded" : "paid from another browser, not counted here") : unknown && !asking ? walletClosedHome(home, "can't tell yet") : home;
  // W50c: back from PayPal paid, the counts are the server's fold for this browser. Held and wrong-amount returns keep
  // the hero's own counts: their cart has no row yet that closes its ask, so the fold would still count it "to approve".
  const shown = walletFoldHome(mine, real && !undone && ret?.kind === "paid" ? back?.shopper?.weekCounts : null);
  const d = shown.deal;
  const wrongRow = wrong ? shown.week.find((r) => r.kind === "mismatch") : undefined;
  const payable = payment !== "off" && payment !== "none" && !real && !unknown && !waiting;
  const desk = shown.desk ?? null;
  const tapping = !!d && !real && !unknown && !waiting && !wrongRow;
  // No server answering and none to pay with: the desk says so (the Ask and your wants say it in their own boxes too).
  // R-12: offline is its own cause (live.ts), worded as offline by every reader below, never as the server.
  const away = payment !== "none" ? false : live === "offline" ? "offline" : live === "away" || live === "gone" ? "server" : false;
  const hero = d && (
    <section className="hero" aria-labelledby="hero-h" data-seq={d.seq}>
      <HeroTop d={d} limit={limit} k={real || elsewhere ? "paid" : wrong ? "wrong" : waiting ? "held" : "tap"} kicker={undone || (!real && ret?.kind === "refunded") ? "Undone" : real || elsewhere ? "Paid" : ret?.kind === "mismatch" ? RETURN_WRONG : asking ? "Checking…" : unknown ? RETURN_CHECKING : waiting ? "Waiting for PayPal" : "Waiting for your tap"} />
      <div className="acts">
        {ret && ret.kind !== "paid" && (!real || ret.kind === "swapped") && <p className={ret.kind === "swapped" ? "aswap" : elsewhere ? "aterms" : "aerr"} role="alert">{ret.words}</p>}
        {undone ? <HeroUndone paid={real!} /> : real ? <HeroPaid paid={real} payment={payment} u={undo} open={undoState.state === "open"} asked={asked} runId={undoId} /> : wrongRow ? <HeroWrong row={wrongRow} u={undo} /> : asking ? <p className="astatus" role="status">Asking the server what PayPal said.</p> : unknown ? null : waiting ? <HeroHeld onReleased={() => setHeld(false)} asked={heldAsked} /> : <HeroApprove deal={d} payment={payment} away={away} onPaid={() => setPaid(paidHere())} onHeld={() => setHeld(true)} onUnsure={() => setTold({ kind: "unknown", words: RETURN_WORDS.unknown })} />}
        {away && <AwayNote live={live} />}
        <Only />
      </div>
    </section>
  );
  const wants = <Wants saved={wantsSaved} onForgot={(key) => setForgot((f) => ({ key, n: (f?.n ?? 0) + 1 }))} />;
  // W-8: Ask is the hero's box, under the headline (the first screen: headline, one line, Ask and its chips, the deal).
  const ask = (
    <div className="ask">
      {/* The ladder (Track T, item 9) compares against this week's market and the deal on screen. */}
      <AskGoose hero={WALLET_CHIPS} limit={limit} heading={withName(d ? "Want something else?" : "Ask in your own words.", myName)} market={{ seed: WEEK, deal: d ? { merchant: d.seller, total: d.total } : null }} onWant={(w) => { if (w.saved) setWantsSaved((n) => n + 1); }} onForgot={() => setWantsSaved((n) => n + 1)} forgot={forgot} onTakeBack={() => {
        // Voice undo (018 N28): only this tab's last purchase, only while its Undo is open; never a refund on its own.
        const t = takeBack(real && !undone && d ? { item: d.item.replace(" (fictional)", ""), amount: `${usdOf(real.total)}`, undo: undoState, hasKey: undo.key !== null } : undone && real ? { item: d?.item ?? "", amount: `${usdOf(real.total)}`, undo: { state: "refunded" }, hasKey: true } : null, Date.now());
        if (t.kind === "confirm") { setAsked(t.words); requestAnimationFrame(() => document.getElementById("wundo-paid")?.scrollIntoView({ block: "center", behavior: "smooth" })); }
        return t.words;
      }} />
      {!d && <Only />}
    </div>
  );
  return (
    <main id="main" className={`wallet dk ${d ? "has-deal" : "no-deal"}`} data-palette="v" data-tab={tab}>
      {/* The one nav (S1, Joshua Fri 3:40 PM); "Judge? Start here" in it opens the judge tour. A child of the page, not
          of the band, so from 721 px it sticks the whole page through, as every route's does (commit 5). */}
      <WalletTop tab={tab} menu={<MenuButton className="dk-menu" />} />
      <div className="band">
        {/* W-8, the calm hero: the headline, its line, Ask and its chips, and the deal waiting for your tap. */}
        {tab === "desk" && <WalletHero head={<DeskHead desk={desk} label={home.label} />} ask={ask} deal={hero || null} />}
        {/* The week's own section under it: how Goose got the deal (the refusal, the sellers, the rounds), the replay a
            choice, and the quiet tries. A week with no deal (one that ends in a walk) still shows it. */}
        {tab === "desk" && desk && (
          <WeekDesk desk={desk} refusal={shown.refusal ?? null} replay={<ReplayButton r={replay} />} play={replay.done ? "done" : "play"}
            run={<a className="replay quiet" href={appHref(`?seed=${WEEK}&wallet=0`)}>{payable || real || unknown || waiting ? "Watch it again on the run page" : "Watch it on the run page"}</a>}>
            {/* Never charged, so offered wherever a cart can open: not while a hold waits, or while we can't say what moved. */}
            {d && payment !== "off" && payment !== "none" && !unknown && !waiting && <SwapTry deal={d} sandbox={practiceNext(payment)} />}
          </WeekDesk>
        )}
        {tab === "settings" && <div className="shead"><a className="wset" href="#desk">‹ Your week</a><h1>Settings</h1><p>Your limits, in this browser. Only your taps change them.</p></div>}
      </div>
      {tab === "settings" ? (
        // Nov 5: the limits and what Goose remembers land about 1,100 px tall on a phone, and the voice card under them
        // moved off the screen when they did (shift 0.44 to 0.61). So the tab holds a screen's room until they're read,
        // and the voice card draws with them, never before them: what's on screen when they land stays where it is.
        <div className="settings" data-reading={settingsRead ? undefined : ""}>
          <Suspense fallback={null}>
          <Wants part="settings" saved={wantsSaved} onRead={markSettingsRead} onForgot={(key) => setForgot((f) => ({ key, n: (f?.n ?? 0) + 1 }))} />
          </Suspense>
          {/* Round 1: Mute is a setting, so it lives here, not in the bar. The one switch speech.ts keeps (setMuted). */}
          {settingsRead && (
            <section className="scard svoice" aria-labelledby="voice-h">
              <div className="whead"><h2 id="voice-h">Goose’s voice</h2></div>
              <p className="wnote">{VOICE_NOTE}</p>
              <MuteGoose />
            </section>
          )}
        </div>
      ) : (
        <div className="under">
          {/* W-8: Your week and your wants side by side, the two doors under them. Settings (your limits and Goose's voice)
              is one tap from Your week, its head's link. */}
          <div className="ucol">
            <section className="week" aria-labelledby="week-h">
              <div className="whead"><h2 id="week-h">Your week</h2><a className="wset" href="#settings">Settings and limits ›</a></div>
              <ul className="tiles" data-from={shown.fold ? "server" : "wallet"}>
                <li className="tile"><div className="n" data-count="paid">{shown.counts.paid}</div><div className="t">you paid</div></li>
                <li className="tile yes"><div className="n" data-count="waiting">{shown.counts.waiting}</div><div className="t">to approve</div></li>
                <li className="tile no"><div className="n" data-count="refused">{shown.counts.refused}</div><div className="t">set aside</div></li>
              </ul>
              {shown.others && <p className="wnote">These counts include this browser's other runs this week.</p>}
              {elsewhere && <p className="wnote">These counts are this browser's. That payment was made from another one.</p>}
              <WeekList rows={shown.week} u={undo} />
            </section>
          </div>
          {/* The wants list ("My wants" first, the shopper's top 3) reads the server on its own, so the recorded week never waits on it. */}
          <div className="ucol"><Suspense fallback={null}>{wants}</Suspense></div>
          <div className="doors">
            <Safe />
            {/* Track P's market needs Goose's server, so its door shows only while the server answers. */}
            {live === "up" && <Market />}
          </div>
        </div>
      )}
      {d && tab === "desk" && <DealBar d={d} show={tapping && replay.done} />}
      <p className="wfoot">Gilded Goose is an independent student project, not affiliated with PayPal. Fictional sellers and products; {fake ? FAKE_RAIL : "payments run in the PayPal sandbox"}.</p>
    </main>
  );
}
