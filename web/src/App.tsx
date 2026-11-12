// The screen (v3 design built for real, M2 step 4). Top: the judge box and its two cards. Below: the agent shopping,
// drawn from the ledger only: lanes from `laneModel`, the AI's proposals with code's answer under each, the cart
// card, the strip, the dial preview, and the ledger itself (folded for the eye by `fold`). Nothing is drawn that the
// ledger lacks; every mark carries its row's `seq` (project Lesson 21).

import { appHref } from "./menu/href.ts";
import { Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import type { LedgerEvent } from "@goose/core";
import { belowOpening, buyerLabel, laneModel, watchCounts, type Lane, type LaneModel, type ShopperFold } from "@goose/core/view";
import { cartCardShown, momentAt } from "@goose/core/grid";
import { ledgerRow } from "@goose/core/wallet-flag";
import type { StopSaid } from "@goose/core/return";
import { JudgeBox } from "./JudgeBox.tsx";
import { AskGoose, type VoiceLine } from "./AskGoose.tsx";
import { VOICE_ASIDE_SOON, VOICE_DECLINED, VOICE_NO_CART, VOICE_NO_DEAL, VOICE_PAID, VOICE_SHOPPING, VOICE_STILL, cartSaid, type VoiceIntent } from "@goose/core/voice";
import { liveAway, liveKnown } from "./live.ts";
import { RUN_CATEGORY, RUN_ENTRIES, RUN_ENTRY, notShoppedYet, runEntry } from "@goose/core/shops";
import { say } from "./speech.ts";
import { FAKE_RAIL } from "./rail.ts";
import "./run.css";
import "./run-cv.css"; // only this page draws .cv (and Ledger's portal, loaded only from here): not in main.css, so no other route pays for it
import { wireSkip } from "./skip.ts";
import { OFFLINE, OFFLINE_SAYS, SANDBOX_NEXT } from "./states/words.ts";
import { useBackFromPayPal, useOnline, lazyOr } from "./states/online.ts";
import { usd, usdOf } from "@goose/core/money";

wireSkip();

// "Every decision" (Track C): its own chunk, fetched once the first row lands (or `?ledger=full` asks), never in the first paint.
const Ledger = lazyOr(() => import("./Ledger.tsx"));

interface RunView {
  id: string; done: boolean; buyer: string;
  /** The market number: the same number rebuilds the same sellers and replays the run if it was recorded. */
  seed: number;
  /** 1–3 for the fixture weeks, else null (a fresh market). */
  week: number | null;
  /** Why this run isn't live (a cap, no key, a replay asked for), or null. */
  note: string | null;
  /** True when the number replays a recording; otherwise it runs that market again with a new haggle. */
  replayable: boolean;
  /** "fake" only in CI: then nothing on screen may say PayPal took the money. */
  payment?: "fake" | "sandbox" | "off";
  worstCase: { cap: string; why: string };
  /** The catalog's category for the run's item: the dial preview shows that category's record from `shopper`. */
  category: string | null;
  /** The limit this Policy holds every cart to, as the guard reads it (N18). */
  limit: string;
  want: { item: string; maxPrice: string; qty: number };
  bound: { item: string; merchant: string; total: string; currency: string; hash: string; expiresAt: number; orderId: string | null; spent: boolean } | null;
  approveUrl: string | null;
  /** H2: this browser may press Approve, which is what makes PayPal's order (none exists before it). */
  canApprove?: boolean;
  /** This browser already paid this week's cart on another run: `card` says so, and there's nothing to press. */
  paidHere?: boolean;
  /** Money may have moved on this browser's other cart for the week: `card` says it can't tell, and there's nothing to press. */
  unsureHere?: boolean;
  /** Either stop (paid, or unsure): the server's words for the lane and strip, and nothing to press. Null when neither. */
  stop?: StopSaid | null;
  /** §17: the one honest line beside this browser's cart (its own wants and week), or null. Never a block. */
  tradeoff?: string | null;
  outcome: string | null;
  settled: { ok: boolean; reason?: string; captureId?: string } | null;
  /** The server's word on whether this browser owns the run, and what its return means when it isn't simply paid (core/src/view/return.ts). */
  mine?: boolean;
  card?: { head: string; line: string | null } | null;
  events: LedgerEvent[];
  /** The one shopper fold (N19), from the server: the dial, the week and the receipt across this browser's runs. No grid rows; null for any browser but the run's own. */
  shopper: Omit<ShopperFold, "grid"> | null;
  /** H1: this run ran in the browser (live mode wasn't answering), on the bundled recorded weeks: no order can exist. */
  browser?: true;
  /** The server holds this cart set aside ("Not this one", 025): Approve refuses and PayPal's return captures nothing. */
  aside?: boolean;
}

/** A browser run's view, shaped like the server's (H1); `done` is null while it plays. */
type Local = ReturnType<typeof import("./offline.ts").startRun>;
function browserView(head: Exclude<Local, { error: string }>["head"], done: Awaited<Exclude<Local, { error: string }>["done"]> | null): RunView {
  return {
    id: head.id, done: done !== null, buyer: head.buyer, seed: head.seed, week: head.week, note: head.note, replayable: head.replayable,
    worstCase: head.worstCase, category: head.category, limit: head.limit, want: head.want,
    bound: done?.bound ?? null, approveUrl: null, outcome: done?.outcome ?? null, settled: null, events: done?.events ?? [], shopper: null, browser: true,
  };
}

const plain = (m: string) => m.replace(" (fictional)", "");
/** Typed dollars as cents, or null while the field isn't a plain amount yet (the server's `toCents` takes the same shape). */
const typedCents = (s: string) => (/^\d+(\.\d{1,2})?$/.test(s.trim()) ? Math.round(Number(s.trim()) * 100) : null);

export function App() {
  const [maxPrice, setMaxPrice] = useState("60.00");
  // The limit before any run: what the next run's Policy holds (GET /api/limit). Once a run is on screen, that run's own.
  const [next, setNext] = useState<{ category: string | null; limit: string } | null>(null);
  const [run, setRun] = useState<RunView | null>(null);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lost, setLost] = useState(false);
  // A ledger row picked in "Every decision": the lanes redraw the ledger as it stood at that row (null: now).
  // W74: `?ledger=full&row=N` opens on that row's moment (the refusal card's link); read once, like `full`.
  // Only on the recorded week (not with `?run=`, whose rows differ); a row the week doesn't have is dropped once it loads.
  const [at, setAt] = useState<number | null>(() => { const q = new URLSearchParams(location.search); return q.get("ledger") === "full" && !q.get("run") ? ledgerRow(location.search) : null; });
  // `?ledger=full` opens the ledger full screen (the film's take, ADR 0007's URL flag); read once, before Go clears the address.
  const [full, setFull] = useState(() => new URLSearchParams(location.search).get("ledger") === "full");
  const [openFlag] = useState(() => new URLSearchParams(location.search).get("ledger") === "open");
  const es = useRef<EventSource | null>(null);
  // The run on screen: a late answer about an earlier run (a snapshot, a reload) never lands on the next one.
  const current = useRef<string | null>(null);
  // Item 10: the run "buy this right now" started (its id, or PENDING until the server names it), said back once code
  // binds its cart (or binds none). Tied to the run, so a run started any other way is never said as this one.
  const voiced = useRef<string | null>(null);
  // A "no" said while Goose haggles: the cart it binds is set aside as it lands (shared Lesson 35: a no is never lost).
  const asideNext = useRef(false);
  // An ordinary Ask while a voiced run shops takes over the line under the Ask box (code review of item 10): its answer
  // shows; the run's cart is still said back when it lands.
  const [askedOver, setAskedOver] = useState(false);
  // W49c: the chips Ask Goose last showed, which steer the next run: sent with it, and checked again where it runs.
  const chips = useRef<readonly unknown[] | undefined>(undefined);
  // The entry the chips shop (§15B part 2): the typed max is the kettle's, so its over-limit line is only said for a kettle.
  const [entry, setEntry] = useState(RUN_ENTRY);
  const setChips = (c: readonly unknown[] | undefined) => { chips.current = c; setEntry(runEntry(c)); };
  // The run whose cart the shopper set aside ("not this one"): its card says so, and "Bring it back" undoes it. Shown at
  // once; the server then keeps it as a ledger row (025), so the strip shows it and a reload keeps it. A browser run has
  // no server, so its stays on this page.
  const [declined, setDeclined] = useState<string | null>(null);
  // The page's line under the Ask box for the last command, kept current as the run goes (`shown` below).
  const [line, setLine] = useState<VoiceLine | null>(null);
  // W63: whether a press has started a run, so the recorded week loaded for full screen never lands on top of one.
  const went = useRef(false);
  const [recorded, setRecorded] = useState(false);

  // Coming back from PayPal: ?run=<id> → load the finished run.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("run");
    if (id && /^[0-9a-f]{12}$/.test(id)) void load(id);
    // W63: full screen with no run of its own opens on recorded week 1 (the rows "See how it keeps you safe" reads), so
    // the first view has rows, the red refusal and a moment to click before any press. Go replaces them with a run.
    else if (full) void import("./offline.ts").then((m) => m.storyWeek()).then((week) => { if (!went.current) { setEvents(week.events); setRecorded(true); setAt((a) => (a !== null && !week.events.some((e) => e.seq === a) ? null : a)); } }).catch(() => {});
    // With no server the limit comes from the same Policy, bundled (H1): the guard in the browser holds the same one.
    const bundled = () => import("./offline.ts").then((m) => setNext(m.entryLimit())).catch(() => setNext(null));
    // Asked of the server only once live mode answers, so a page with no server makes one request, the health check.
    void liveKnown().then((s) => (s !== "up" ? bundled() : fetch("/api/limit").then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? r.json() as Promise<{ category: string | null; limit: string }> : null)).then((l) => (l ? setNext(l) : bundled())).catch(bundled)));
    return () => es.current?.close();
  }, []);

  // The static banner says "PayPal sandbox"; in CI's fake mode it must not (nothing reaches PayPal).
  useEffect(() => {
    const rail = document.getElementById("rail");
    if (rail && run?.payment === "fake") rail.textContent = FAKE_RAIL;
  }, [run?.payment]);

  async function load(id: string) {
    current.current = id;
    const r = await fetch(`/api/runs/${id}`).catch(() => null);
    if (current.current !== id) return;
    // R-12: offline then is the cause the code saw (the network dropped with the read out), never the server.
    if (!r) { setError(navigator.onLine ? "The server isn't answering, so this run can't be shown right now. Try again shortly." : `${OFFLINE.title} ${OFFLINE_SAYS.run}`); return; }
    if (!r.ok) { setError("That run is gone: the server restarted or made room for newer runs. Start a new one."); return; }
    const v = (await r.json()) as RunView;
    if (current.current !== id) return;
    setRun(v); setEvents(v.events);
    if (v.aside) setDeclined(v.id);
  }

  /** "Not this one": the card goes aside now (the safer state), and the server writes the row that makes Approve refuse. */
  function setAsideOn(r: RunView) {
    setDeclined(r.id);
    if (!r.browser) void keepAside(r.id, false).then((status) => { if (status === 200) void refresh(r.id); else setLine({ text: ASIDE_PAGE_ONLY }); });
  }
  /** "Bring it back": the card comes back only once the server has taken the "no" back too; until then it stays aside. */
  async function bringBack(r: RunView) {
    setLine(null);
    const status = r.browser ? 200 : await keepAside(r.id, true);
    // No answer: the cart stays aside, the safer state. An answer that isn't yes (the cart closed meanwhile): the server's state.
    if (status === 0) { setLine({ text: navigator.onLine ? BACK_FAILED : `${OFFLINE.title} ${OFFLINE_SAYS.aside}` }); return; }
    if (status !== 200) { void refresh(r.id); return; }
    setDeclined((d) => (d === r.id ? null : d));
    if (!r.browser) void refresh(r.id);
  }
  /** The run's rows and state again (the new row on the strip), only while it is still the run on screen. */
  async function refresh(id: string) {
    const r = await fetch(`/api/runs/${id}`).catch(() => null);
    const v = r?.ok ? ((await r.json()) as RunView) : null;
    if (v && current.current === id) { setRun(v); setEvents(v.events); setDeclined((d) => (v.aside ? v.id : d === v.id ? null : d)); }
  }

  function subscribe(id: string) {
    es.current?.close();
    const s = new EventSource(`/api/runs/${id}/events`);
    s.addEventListener("ledger", (m) => setEvents((prev) => { const e = JSON.parse((m as MessageEvent).data) as LedgerEvent; return prev.some((p) => p.seq === e.seq) ? prev : [...prev, e]; }));
    s.addEventListener("state", (m) => { setRun(JSON.parse((m as MessageEvent).data) as RunView); setBusy(false); s.close(); });
    // A dropped connection reconnects by itself (the server replays every row; seq dedupes them). Only when the
    // browser gives up is it said, not silent (010 gap): the run goes on on the server, and reloading it shows where it got to.
    s.onerror = () => { if (s.readyState !== EventSource.CLOSED) return; setBusy(false); setLost(true); void load(id); };
    es.current = s;
  }

  async function start(byVoice = false) {
    // §15B: a run shops the kettle or a moving item (part 2); chips it would have to guess from ("any travel deals?"),
    // or an entry no run shops, start none (the server checks again).
    const notYet = notShoppedYet(chips.current);
    // The chips are cleared, so the next tap shops the kettle instead of being refused again.
    if (notYet) { setChips(undefined); setError(notYet); return; }
    voiced.current = byVoice ? PENDING : null; asideNext.current = false;
    went.current = true; setRecorded(false);
    setBusy(true); setError(null); setLost(false); setEvents([]); setRun(null); setAt(null);
    // No seed: the server makes a fresh market, so two presses are two runs (Lesson 18). `?seed=N` replays market N once;
    // read before the address is cleared (clearing first threw the number away), so the next press is fresh again.
    const fromUrl = Number(new URLSearchParams(location.search).get("seed"));
    const seed = Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : undefined;
    // W64: a wallet build keeps `?wallet=0`, so a reload stays on this page.
    history.replaceState(null, "", location.pathname + (new URLSearchParams(location.search).get("wallet") === "0" ? "?wallet=0" : ""));
    // H1: live mode needs the server; while it isn't answering, the recorded demo runs here, in the browser. R-13: offline,
    // the run's note names her network ("You're offline, so …"), never live mode: the cause the code saw.
    const known = await liveKnown();
    if (known !== "up") return startInBrowser(seed, known === "offline" || !navigator.onLine ? "offline" : undefined);
    const r = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxPrice, seed, ...(chips.current ? { chips: chips.current } : {}) }) }).catch(() => null);
    if (!r) { liveAway(); return startInBrowser(seed, navigator.onLine ? undefined : "offline"); }
    // H2: the server's run budget for this browser, network or day is used up: a recorded run here, naming the cap.
    if (r.status === 429) { const cap = ((await r.json().catch(() => ({}))) as { cap?: string }).cap; if (cap === "token" || cap === "ip" || cap === "global") return startInBrowser(seed, `runs-${cap}`); }
    if (!r.ok) { const e = ((await r.json().catch(() => ({}))) as { error?: unknown }).error; if (r.status === 409) setChips(undefined); setError(r.status === 409 && typeof e === "string" ? e : "The server refused to start a run."); setBusy(false); return; }
    const { runId } = (await r.json()) as { runId: string };
    current.current = runId;
    if (voiced.current === PENDING) voiced.current = runId;
    subscribe(runId);
    const v = await fetch(`/api/runs/${runId}`).then((x) => x.json() as Promise<RunView>).catch(() => null);
    // The stream's final "state" may already have landed (never let this older snapshot replace it), and a fast
    // second press may have started another run (never let it land there).
    if (v && current.current === runId) setRun((prev) => (prev?.done ? prev : v));
  }

  /** The recorded demo with no server (H1): the bundled weeks through the same engine and guard, rows as they're written. */
  async function startInBrowser(seed: number | undefined, notLive?: "offline" | "runs-token" | "runs-ip" | "runs-global") {
    current.current = null;
    const off = await import("./offline.ts").catch(() => null);
    if (!off) { setError(navigator.onLine ? "The recorded demo couldn't load. Reload the page to try again." : `${OFFLINE.title} ${OFFLINE.line}`); setBusy(false); return; }
    const r = off.startRun({ asked: seed ?? null, maxPrice, ...(notLive ? { notLive } : {}), ...(chips.current ? { chips: chips.current } : {}), onRow: (e) => { if (current.current === null || current.current === e.runId) setEvents((prev) => (prev.some((p) => p.seq === e.seq) ? prev : [...prev, e])); } });
    if ("error" in r) { setError(r.error); setBusy(false); return; }
    current.current = r.head.id;
    if (voiced.current === PENDING) voiced.current = r.head.id;
    setRun(browserView(r.head, null));
    const done = await r.done.catch(() => null);
    if (current.current !== r.head.id) return;
    if (!done) { setError("The recorded run stopped before it finished. Nothing was bought."); setBusy(false); return; }
    setRun(browserView(r.head, done)); setEvents(done.events); setBusy(false);
  }

  // A run that couldn't start or finish is never said later as another's.
  useEffect(() => { if (error) { voiced.current = null; asideNext.current = false; } }, [error]);

  // The run started by voice, once it ends: its cart said back and brought forward, or that it bound none. A "no" said
  // while it ran sets its cart aside instead, never said as one to approve.
  useEffect(() => {
    if (!run?.done) return;
    if (asideNext.current) {
      asideNext.current = false;
      if (run.bound && !run.settled) { setAsideOn(run); setLine({ text: VOICE_DECLINED }); say(VOICE_DECLINED); }
      else { setLine({ text: VOICE_NO_DEAL }); say(VOICE_NO_DEAL); }
      return;
    }
    if (voiced.current !== run.id) return;
    voiced.current = null;
    if (run.bound && !run.settled) {
      // The shopper asked for this cart: it shows now, not a past moment ("Approve is off while you look back").
      setAt(null);
      say(cartSaid(run.bound, canPay(run)));
      setLine(ready(run.bound, run.stop ? run.card?.head : undefined));
      toCart(true);
    } else if (!run.bound) { setLine({ text: VOICE_NO_DEAL }); say(VOICE_NO_DEAL); }
  }, [run?.done, run?.bound, run?.settled]);

  /**
   * Item 10 (restart notes §24A, 018 N27): a command from the Ask box (null: an ordinary ask, so the last line goes).
   * "Buy this right now" prepares: it starts the run, or says the waiting cart and brings its card forward. "Not this
   * one" sets the waiting cart aside, or the one being haggled for as it lands. Neither presses Approve: only the
   * shopper's tap does (H2), so a TV or a coached "yes" can't spend.
   */
  function voice(intent: VoiceIntent | null): void {
    if (intent === null) { setLine(null); setAskedOver(true); return; }
    setAskedOver(false);
    const said = (l: VoiceLine) => { setLine(l); say(l.text); };
    const waiting = run?.bound && !run.settled && !run.bound.spent && declined !== run.id ? run.bound : null;
    if (intent === "decline") {
      if (waiting) { setAsideOn(run!); return said({ text: VOICE_DECLINED }); }
      if (busy) { asideNext.current = true; voiced.current = null; return said({ text: VOICE_ASIDE_SOON }); }
      return said({ text: run?.settled?.ok ? VOICE_PAID : VOICE_NO_CART });
    }
    asideNext.current = false;
    if (waiting) { setAt(null); toCart(); setLine(ready(waiting, run!.stop ? run!.card?.head : undefined)); say(cartSaid(waiting, canPay(run!))); return; }
    // Already haggling: this run is the one said back.
    if (busy) { voiced.current = current.current ?? PENDING; return said({ text: VOICE_STILL }); }
    if (run?.settled?.ok) setDeclined(null);
    setLine(null); say(VOICE_SHOPPING);
    void start(true);
  }

  const moment = at === null ? null : momentAt(events, at);
  const model = moment ? moment.model : laneModel(events);
  function pick(seq: number | null) {
    setAt(seq);
    // Out of full screen, the moment is drawn in the lanes above: go there.
    if (seq !== null && !full) requestAnimationFrame(() => document.getElementById("moment")?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  }
  const fake = run?.payment === "fake";
  const who = buyerLabel(events);
  // Said before Go (N18): the max is the shopper's, but no max widens the limit; the guard holds every cart to it.
  const limit = run ? { category: run.category, limit: run.limit } : next;
  // What the next press shops, by the name Goose says: a ticket, night or seat run goes by its category's limit, so the
  // typed max (the kettle's) is only offered beside the kettle.
  const shopping = entry === RUN_ENTRY ? "Goldfeather Kettle" : RUN_ENTRIES[entry]?.said ?? "Goldfeather Kettle";
  // The limit beside it is that entry's category's (before a run, the page knows the kitchen's): never the kitchen's $60
  // beside a ticket, nor the last ticket run's events limit beside the kettle's max.
  const rowLimit = limit && (limit.category === null || limit.category === (RUN_ENTRIES[entry]?.category ?? RUN_CATEGORY)) ? limit : null;
  const limitCents = rowLimit ? typedCents(rowLimit.limit) : null;
  const typed = typedCents(maxPrice);
  const over = entry === RUN_ENTRY && limitCents !== null && typed !== null && typed > limitCents;
  // While the run "buy this right now" started is haggling, the line under the Ask box says what it does, live.
  const shown: VoiceLine | null = voiced.current !== null && busy && !askedOver
    ? { busy: true, lead: `Shopping for the ${shopping}`, text: "", note: `${rowLimit ? `Up to your ${usdOf(rowLimit.limit)} limit${model.rounds > 0 ? `, round ${model.rounds}` : ""}. ` : ""}You approve before anything is paid.` }
    : line;

  // Desk-J: the classic page wears the Desk's plum velvet. `dk` + `data-palette="v"` give everything below the Desk's
  // tokens (desk/tokens.css, read only); `cv` scopes run-cv.css's velvet skin to this page, so the wallet is untouched.
  return (
    <main id="main" className="dk cv" data-palette="v">
      <JudgeBox />

      {/* The ladder compares the market shown below, with Goose's own deal in it; before any run, the recorded beat. */}
      <AskGoose limit={limit?.limit ?? null} market={run ? { seed: run.seed, deal: run.bound ? { merchant: run.bound.merchant, total: run.bound.total } : null } : null} onVoice={voice} voiceLine={shown} onChips={setChips} />

      <section className="run" aria-label="The agent shopping">
        {/* Design B: the haggle on the guard's desk; the ledger below it stays on the page's light paper (slice 3). */}
        <div className="rdesk">
        <h2>Watch it shop{run && <small><span data-seed={run.seed}>{run.week ? `simulated week ${run.week} · ` : ""}market #{run.seed}</span>{who ? <span className="by"> · buyer: {nobreak(who)}</span> : ""}</small>}</h2>
        <p className="muted small intro">Simulated sellers, a fictional kettle, a new market each press.</p>
        <div className="go">
          <span>{shopping.charAt(0).toUpperCase()}{shopping.slice(1)} ×1</span>
          {entry === RUN_ENTRY && <label className="max">Max $<input aria-label="Your max price" aria-describedby={rowLimit ? "limit" : undefined} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} inputMode="decimal" /></label>}
          {rowLimit && <span id="limit" className="limit muted small">Your {rowLimit.category ?? "strictest"} limit: <b>{usdOf(rowLimit.limit)}</b></span>}
          <button className="btn" onClick={() => void start()} disabled={busy} aria-busy={busy || undefined}>{busy ? "Haggling…" : "Go find it"}</button>
        </div>
        {rowLimit && over && <p className="asked small" role="status">Your {usd(typed!)} max is over your {rowLimit.category ?? "strictest"} limit, so the guard holds this run to {usdOf(rowLimit.limit)} and refuses any cart above it.</p>}
        {error && <p className="refused" role="alert">{error}</p>}
        {lost && !run?.done && <p className="asked">Lost the live feed. The run carries on on the server; this shows what it had done when the feed dropped.</p>}
        {run && (run.note || run.done) && <p className="muted small">{run.note ? `${run.note} ` : ""}{/* A market number reruns the kettle, so a ticket, night or seat run (§15B part 2) offers none. */}
          {run.done && (run.category ?? RUN_ENTRIES[RUN_ENTRY]!.category) === RUN_ENTRIES[RUN_ENTRY]!.category && <a href={appHref(`?seed=${run.seed}&wallet=0`)}>{run.replayable ? "Replay" : "Run"} market #{run.seed}{run.replayable ? "" : " again"}</a>}</p>}
        {model.edge && <p className="cap" data-seq={model.edge.seq}>The most any cart can cost right now: <b>{usd(model.edge.price)}</b> · set by code, not by the AI</p>}

        {events.length === 0 ? (
          // T-4: before a run, the four parts it will fill in, as empty slots: their names only, never a made-up number.
          <div className="empty-run">
            <p>Press <b>Go find it</b> to watch the agent haggle. It fills in here:</p>
            <ol className="er-steps">
              <li><b>Each seller’s price</b><span>one lane per seller, your limit the rail</span></li>
              <li><b>Round by round</b><span>what the AI proposed, and what code did</span></li>
              <li><b>The cart, or a walk-away</b><span>held to your limit by code</span></li>
              <li><b>Every decision</b><span>the ledger, one row per move</span></li>
            </ol>
          </div>
        ) : (
          <>
            <div id="moment">{moment && <p className="lg-moment-line" role="status" data-seq={moment.seq}>Showing the moment at row {moment.seq}{moment.round > 0 ? `, round ${moment.round}` : ""}. Later steps are hidden. <button type="button" className="back-now" onClick={() => setAt(null)}>Back to now</button></p>}</div>
            <Lanes model={model} said={run?.stop?.lane} />
            {/* Two trays on a wide screen: the haggle log, and the deal it ended in beside it. */}
            <div className="trays">
            <div className="hlog"><Steps model={model} merchant={(id) => model.lanes.find((l) => l.id === id)?.name ?? "a seller"} /></div>
            {/* The cart card (and its Approve) is the run's end state: approving from a past moment would approve a view
                that's out of date, so it waits until "Back to now" (Joshua, Wed Oct 28; `cartCardShown`). */}
            {cartCardShown(moment?.seq ?? null) ? (
                <Receipt run={run} model={model} events={events} fake={fake} declined={run !== null && declined === run.id} onDecline={() => { setAsideOn(run!); setLine(null); }} onBack={() => void bringBack(run!)} />
            ) : (run?.done || run?.bound) && (
              <div className="rcard past" data-outcome="past" role="status">
                {run?.bound ? (
                  <>
                    {/* A browser run has no Approve to switch off (H1), so it never says "Approve is off". */}
                    <p><b>{run.browser ? "The cart is hidden while you look back." : "Approve is off while you look back."}</b></p>
                    <p>{run.browser ? "" : "Approving only makes sense for the latest cart. "}Waiting in now: {plain(run.bound.merchant)}, {usdOf(run.bound.total)}.</p>
                  </>
                ) : (
                  <p><b>The result waits for now.</b></p>
                )}
                <p><button type="button" className="btn" onClick={() => setAt(null)}>Back to now</button></p>
              </div>
            )}
            {/* T-4: the run's one-line summary sits under the moves, so on a desktop it fills the cell beside the cart card. */}
            {cartCardShown(moment?.seq ?? null) && <Strip run={run} model={model} events={events} fake={fake} />}
            </div>
          </>
        )}
        </div>
        {(events.length > 0 || full) && (
          <Suspense fallback={null}>
            <Ledger events={events} at={at} onPick={pick} open={openFlag} full={full} onFull={setFull} busy={busy} onGo={() => void start()} run={run}
              sub={run ? `${run.week ? `simulated week ${run.week} · ` : ""}market #${run.seed}${who ? ` · buyer: ${who}` : ""}` : recorded ? "recorded week 1 · press Go find it for a run of your own" : ""}>
              {run && <Dial run={run} />}
            </Ledger>
          </Suspense>
        )}
      </section>
    </main>
  );
}

/** One lane per seller and one for the agent's bid, $0-ish on the left and your max at the edge. */
function Lanes({ model, said }: { model: LaneModel; said: string | undefined }) {
  if (!model.edge || model.lanes.length === 0) return null;
  const max = model.edge.price;
  const prices = model.lanes.flatMap((l) => l.marks.map((m) => m.price));
  // From a round $10 under the lowest price to 25% past your max, so the prices spread and an ask over the max sits past
  // the edge, with room there for its pill on a phone.
  const lo = Math.max(0, Math.floor((Math.min(...prices, max) * 0.9) / 1000) * 1000);
  const hi = max * 1.25;
  const x = (p: number) => Math.max(0, Math.min(100, ((p - lo) / (hi - lo)) * 100));
  const edge = x(max);
  const sellers = model.lanes.filter((l) => l.kind === "seller").length;
  return (
    <div className="lanes" style={{ "--e": edge / 100 } as CSSProperties}>
      <h2>Where the prices stand <small>{model.rounds} round{model.rounds === 1 ? "" : "s"} · {sellers} sellers</small></h2>
      <div className="edge"><span /><span><em style={{ left: `${edge}%` }}>the most any cart can cost {usd(max)} →</em></span></div>
      {model.lanes.map((l) => <LaneRow key={l.id} lane={l} x={x} edge={edge} max={max} deal={model.deal} said={said} />)}
      {model.lanes.filter((l) => l.flag).map((l) => <p key={l.id} className="flagline" data-seq={l.flag!.seq} data-rule={l.flag!.rule}>{l.flag!.why}</p>)}
      {model.lanes.filter((l) => l.hold).map((l) => <p key={l.id} className="holdline" data-seq={l.hold!.seq} data-rule={l.hold!.rule}>{l.hold!.why}</p>)}
      <p className="legend">Faint dots: earlier rounds. Solid bar: the agent's bid. Gold line: the most any cart can cost.</p>
    </div>
  );
}

function LaneRow({ lane, x, edge, max, deal, said }: { lane: Lane; x: (p: number) => number; edge: number; max: number; deal: LaneModel["deal"]; said: string | undefined }) {
  const last = lane.marks[lane.marks.length - 1]!;
  const isDeal = deal !== null && lane.id === deal.sellerId;
  const cls = lane.kind === "agent" ? "agent" : isDeal ? "deal" : lane.flag ? "flag" : last.price > max ? "over" : "";
  // The pill hangs off its point toward the middle near either end, so it never runs off a 390 px screen; a dot
  // (10 px, centred) is kept its radius inside either end for the same reason (scripts/overflow.ts).
  const pos = x(last.price);
  const side = pos > 70 ? "r" : pos < 20 ? "l" : "";
  // Within 12 points of the limit, a centred pill would reach the line on a phone; there it hangs left of its point.
  const near = side === "" && edge - pos < 12 ? " near" : "";
  return (
    <div className="lane" data-lane={lane.id}>
      <div className="name"><b>{lane.name}</b>{nobreak(lane.sub)}</div>
      <div className="bar">
        <span className="line" />
        <span className="max" style={{ left: `${edge}%` }} data-seq-edge />
        {lane.kind === "agent" && <span className="fill" style={{ width: `${x(last.price)}%` }} data-seq={last.seq} />}
        {lane.marks.slice(0, -1).map((m) => <span key={m.seq} className={m.price > max ? "dot past" : "dot"} style={{ left: `clamp(5px, ${x(m.price)}%, calc(100% - 5px))` }} data-seq={m.seq} title={`round ${m.round}: ${usd(m.price)}`} />)}
        <span className={`pill ${cls} ${side}${near}`} style={{ left: `${pos}%`, "--edge": `${edge}%` } as CSSProperties} data-seq={isDeal ? deal.seq : last.seq}>
          <span className="pv">{usd(isDeal ? deal.price : last.price)}</span>{" "}
          {lane.flag && !isDeal ? <small data-seq={lane.flag.seq}>refused</small>
            : <small>{isDeal ? said ?? "deal, needs your yes" : lane.kind === "agent" ? `round ${last.round}` : last.price > max ? "over the limit" : ""}</small>}
        </span>
      </div>
    </div>
  );
}

/** What the AI proposed, round by round, and what code did when it changed the move (the AI proposes, code decides). */
function Steps({ model, merchant }: { model: LaneModel; merchant: (id: string) => string }) {
  const [open, setOpen] = useState<number | null>(null);
  // On a phone only the moves code changed, and the last one, show until asked (Joshua: the phone page was ~7 screens).
  const [all, setAll] = useState(false);
  if (model.steps.length === 0) return null;
  const verb: Record<string, string> = { counter: "counter", accept: "accept", walk: "walk away", wait: "wait", "propose-counter": "counter", "propose-accept": "accept", "price-swap": "changed the price" };
  return (
    <>
      <h2 className="stepsh">What the agent proposed, and what code did</h2>
      <ol className={all ? "steps" : "steps short"}>
        {model.steps.map((s, i) => {
          const p = s.proposal;
          const by = p.source === "rule" ? "Plain rule" : p.source === "rule-fallback" ? "Plain rule (the AI fell back)" : p.source === "recorded" ? "AI (recorded)" : "AI";
                    return (
            <li key={p.seq} data-seq={p.seq} className={s.code || i === model.steps.length - 1 ? undefined : "plain"}>
              <div className="r">Round {s.round}</div>
              <div>{by}: <b>{verb[p.action] ?? p.action}{p.sellerId ? ` ${merchant(p.sellerId)}` : ""}{p.price !== null ? ` · ${usd(p.price)}` : ""}</b>{" "}<span className="nw">{s.code ? <><span className="tag">not sent</span> </> : null}<button type="button" className="linkish" aria-expanded={open === p.seq} onClick={() => setOpen(open === p.seq ? null : p.seq)}>{open === p.seq ? "hide" : "why"}</button></span></div>
              {/* The agent's own words wait behind "why" (half the captions, Joshua); code's answer is always shown. */}
              {open === p.seq ? <div className="muted">{p.source === "rule" ? p.why : <q>{p.why}</q>}</div> : null}
              {s.code && <div className="code" data-seq={s.code.seq}><b className="ok">Code: counter {usd(s.code.price)} instead.</b>{open === p.seq ? <> {s.code.why}</> : null}</div>}
            </li>
          );
        })}
      </ol>
      {!all && model.steps.some((s, i) => !s.code && i < model.steps.length - 1) && <button type="button" className="linkish more" onClick={() => setAll(true)}>All {model.steps.length} moves ›</button>}
    </>
  );
}

function Receipt({ run, model, events, fake, declined, onDecline, onBack }: { run: RunView | null; model: LaneModel; events: LedgerEvent[]; fake: boolean; declined: boolean; onDecline: () => void; onBack: () => void }) {
  if (!run?.done && !run?.bound) return null;
  if (run.outcome === "walked" || (!run.bound && model.walked)) {
    return (
      <div className="rcard" data-outcome="walked">
        <p><b>No deal: the agent walked away.</b></p>
        {model.walked && <p data-seq={model.walked.seq}>{model.walked.why}</p>}
        <p>Nothing was bought and nothing was charged.</p>
      </div>
    );
  }
  if (model.deal && !run.bound) {
    // Code said yes; PayPal never took the order (keys not set, or creating it failed). Not a refusal by code.
    return (
      <div className="rcard" data-outcome="no-order">
        <p><b>Code approved this cart; PayPal didn't take the order.</b></p>
        <div className="amt" data-seq={model.deal.seq}>{usd(model.deal.price)}</div>
        {model.closed && <p data-seq={model.closed.seq}>{model.closed.why}</p>}
        <p className="asked">There's nothing to approve, so nothing can be charged.</p>
      </div>
    );
  }
  if (run.outcome === "refused" || !run.bound) {
    const row = [...events].reverse().find((e) => e.verdict === "refused" && (e.actor === "guard" || e.actor === "fence"));
    return (
      <div className="rcard" data-outcome="refused">
        <p><b className="refused">Refused by code.</b></p>
        {row && <p data-seq={row.seq}>{row.why}</p>}
        <p>Nothing was bought and nothing was charged.</p>
      </div>
    );
  }
  const b = run.bound;
  const paid = run.settled?.ok === true;
  const closed = run.settled != null && !run.settled.ok;
  // Against the same seller's opening ask, so the price reads as a bargain or not (Joshua, 2026-10-23).
  const vs = belowOpening(model);
  // Set aside (item 10, by "not this one" or its button). Once the server holds it (`run.aside`, 025) the card says what
  // its code does; until then, or on a browser run, only what is true of every cart (nothing is paid without the
  // shopper's tap), never "nothing was charged". One tap brings it back: a misheard "no" costs a tap.
  if (declined && !run.settled && run.mine !== false) {
    return (
      <div id="cart" tabIndex={-1} className="rcard" data-outcome="declined" role="status">
        <p><b>You set this cart aside.</b></p>
        <div className="amt">{usdOf(b.total)}</div>
        <p>{plain(b.item)} from {plain(b.merchant)}. {run.aside ? "Approve is off and nothing is captured until you bring it back." : "Set aside on this page: nothing is paid without your tap on Approve."}</p>
        <p><button type="button" className="quiet" onClick={onBack}>Bring it back</button></p>
      </div>
    );
  }
  return (
    <div id="cart" tabIndex={-1} className="rcard" data-outcome={paid ? "paid" : closed ? "closed" : "cart"}>
      <p><b>{run.card?.head ?? (paid ? (fake ? `Paid (${FAKE_RAIL})` : "Paid in the PayPal sandbox") : closed ? "This cart is closed" : run.browser ? "Goose's cart, checked by code" : run.mine === false ? "Waiting for a yes in PayPal" : "Needs your yes in PayPal")}</b>{!paid && !closed && run.browser && <> <span className="tag">nothing to pay here</span></>}</p>
      <div className="amt" data-seq={model.deal?.seq}>{usdOf(b.total)}</div>
      {vs && <p className="saved" data-seq={vs.seq}>{vs.below > 0 ? `${usd(vs.below)} below their opening ask of ${usd(vs.opening)}` : `Their opening ask: ${usd(vs.opening)}`}</p>}
      <p>{plain(b.item)} from {plain(b.merchant)}, under {run.mine === false ? "a" : "your"} {usdOf(run.want.maxPrice)} max.</p>
      {/* Once the cart is paid or closed, the approval terms are history: showing "expires at…" next to "Paid" was the stale state Joshua saw (M1 critique, note 9). */}
      {/* H1 review: a browser run has no payment port, so its approval terms would be a claim nothing enforces. */}
      {!run.settled && !run.browser && !run.stop && <p className="small">One use only · expires {new Date(b.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}<span className="fp"> · fingerprint <code>{b.hash.slice(0, 12)}</code> re-checked before paying</span></p>}
      {!run.settled && run.tradeoff && <p className="asked tradeoff" role="status">{run.tradeoff}</p>}
      {!run.settled && run.card?.line && <p className="asked" role="status">{run.card.line}</p>}
      {run.settled ? (
        <p className={run.settled.ok && !run.card ? "ok" : "refused"}>{run.card?.line ?? (run.settled.ok ? fake ? `Captured (${FAKE_RAIL})${run.settled.captureId ? ` (capture ${run.settled.captureId})` : ""}.` : `Captured in the PayPal sandbox${run.settled.captureId ? ` (capture ${run.settled.captureId})` : " (PayPal's reply was lost; the order shows as paid)"}; the cart's fingerprint matched the order before paying. No real money moved.` : model.closed ? <span data-seq={model.closed.seq}>{model.closed.why}</span> : "Not captured.")}</p>
      ) : run.browser ? (
        // H1: a browser run has no payment port, so no order exists; approving in PayPal is live mode.
        <p className="asked">This ran in your browser, so no order exists and nothing can be paid. Approving in PayPal is live mode, which needs the server.</p>
      ) : run.approveUrl ? (
        <p><a id="approve" className="btn" href={run.approveUrl} aria-describedby={run.payment === "sandbox" ? "approve-next" : undefined}><span>Approve<span className="long"> this exact cart</span> in PayPal · {usdOf(b.total)}</span></a> <span className="small muted">sandbox test buyer</span>{run.payment === "sandbox" && <span className="small" id="approve-next"> {SANDBOX_NEXT}</span>}</p>
      ) : run.canApprove ? (
        <Approve id={run.id} total={b.total} sandbox={run.payment === "sandbox"} />
      ) : run.stop ? null : run.payment === "off" ? (
        <p className="asked">PayPal isn't connected on this server, so this cart can't be approved here. Nothing was charged.</p>
      ) : (
        <p className="asked">Only the browser that started this run can press Approve.{run.card ? "" : " Nothing was charged."}</p>
      )}
      {/* The no beside the yes (visual review: a decline only by voice is one judges never find), quieter than Approve. */}
      {!run.settled && run.mine !== false && !run.stop && <p><button type="button" className="quiet" onClick={onDecline}>Not this one</button></p>}
    </div>
  );
}

/** Whether this page shows an Approve for the run's cart: a server run this browser may approve (H2), never a browser one. */
const canPay = (r: RunView) => !r.browser && (r.approveUrl !== null || r.canApprove === true);

/** A run's binding id before the server names it: `voiced` holds it while the POST is out. */
const PENDING = "pending";

/** The line once the cart is ready: where it is, one tap away (it may be below the fold on a phone). */
const ready = (b: { merchant: string; total: string }, closed?: string): VoiceLine => ({ text: closed ? `${closed}.` : `Cart ready: ${usdOf(b.total)} at ${plain(b.merchant)}.`, href: "#cart", link: "See it ↓", onLink: () => toCart() });

/**
 * The cart brought forward for the shopper's own tap (item 10): its card scrolled to and focused, never its Approve, so
 * a key pressed next presses nothing (review: focus on a pay control is a press waiting for a stray Space). After a
 * wait (`late`), never out of a field the shopper is typing in: the line under the Ask box points to it instead.
 */
function toCart(late = false): void {
  requestAnimationFrame(() => {
    const el = document.activeElement;
    if (late && el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    const c = document.getElementById("cart");
    c?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    c?.focus({ preventScroll: true });
  });
}

/**
 * H2 (018 N11): pressing Approve is what makes PayPal's order, for exactly this bound cart; until then no order exists.
 * Then PayPal opens, where only the shopper's tap pays.
 */
/** The words when "Bring it back" couldn't reach the server: the cart stays aside, the safer state, until it can. */
const BACK_FAILED = "The server isn't answering, so the cart stays set aside. Try Bring it back again.";
/** The words when the server didn't take the "no": the card stays aside, and says only what the page does. */
const ASIDE_PAGE_ONLY = "The server didn't take the no, so this cart is set aside on this page only.";

/** Tell the server the shopper's "no" (or that it's taken back): its status, or 0 when it didn't answer. */
async function keepAside(id: string, back: boolean): Promise<number> {
  const r = await fetch(`/api/runs/${id}/aside`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ back }) }).catch(() => null);
  return r?.status ?? 0;
}

function Approve({ id, total, sandbox }: { id: string; total: string; sandbox: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = useOnline(); // "You're offline." and a live Approve can't both be true (Round 5's shopper seat, nit 4)
  useBackFromPayPal(() => setBusy(false));
  async function press() {
    setBusy(true); setError(null);
    const r = await fetch(`/api/runs/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    const body = r ? ((await r.json().catch(() => ({}))) as { approveUrl?: string; error?: string }) : {};
    if (r?.ok && body.approveUrl) { location.assign(body.approveUrl); return; }
    // R-12: no reply offline names her network; a reply with no sentence was the server answering, so it isn't "not answering".
    setError(body.error ?? (r ? "PayPal can't open right now. Nothing was charged." : navigator.onLine ? "The server isn't answering, so PayPal can't open right now. Nothing was charged." : `${OFFLINE.title} ${OFFLINE_SAYS.pay}`));
    setBusy(false);
  }
  return (
    <>
      <p><button id="approve" type="button" className="btn" aria-describedby={sandbox ? "approve-next" : undefined} onClick={press} disabled={busy || !online}><span>Approve<span className="long"> this exact cart</span> in PayPal · {usdOf(total)}</span></button> <span className="small muted">sandbox test buyer</span></p>
      {sandbox && <p className="small" id="approve-next">{SANDBOX_NEXT}</p>}
      {error && <p className="refused" role="alert">{error}</p>}
    </>
  );
}

function Strip({ run, model, events, fake }: { run: RunView | null; model: LaneModel; events: LedgerEvent[]; fake: boolean }) {
  if (!model.edge) return null;
  const notes = events.filter((e) => e.actor === "seller" && e.quoted).length;
  const held = model.steps.filter((s) => s.code).length;
  // The Watcher's line, with its denominator: every seller that offered (Lesson 22: counted from rows, never typed).
  const w = watchCounts(events);
  const watcher = w.refused + w.held > 0 ? `Watcher: ${w.refused} of ${w.sellers} sellers set aside on evidence${w.held ? `, ${w.held} held for your yes` : ""}` : "";
  // From rows only (Lesson 21): "paid" is the captured row, "closed" the row that closed the cart.
  const paid = events.some((e) => e.actor === "paypal" && e.action === "captured");
  const after = paid ? ", paid" : model.closed ? ", closed without paying" : run?.browser ? ", no order (ran in your browser)" : run?.stop?.strip ?? ", waiting for your yes";
  const result = model.deal ? <><b>cart {usd(model.deal.price)}</b> of the {usd(model.edge.price)} limit{after}</> : model.walked ? <b>no deal</b> : run?.done ? <b>refused by code</b> : <b>haggling…</b>;
  return (
    <p className="strip"><span>{result}</span><span>{model.steps.length} moves, {held} changed by code</span><span>{notes} seller notes never shown to the agent</span>{watcher && <span>{watcher}</span>}{fake && <span>{FAKE_RAIL}</span>}</p>
  );
}

// A date never breaks across lines ("2026-10-/23" on a phone): its hyphens become non-breaking ones.
const nobreak = (s: string) => s.replace(/(\d{4})-(\d{2})-(\d{2})/g, "$1\u2011$2\u2011$3");

// The dial preview is the shopper fold's (N19): setting, limit and record across this browser's runs, seeded rows never
// counted; the demo shopper's starts at "ask me first" (011 §7). It names only resets the code can write: the server
// writes "Not this one" (025; taken back, it doesn't count), nothing writes a veto yet, and a PayPal cancel is no bad pick.
// W70: labeled a demo record until the dial proper (M3) earns it: only this browser's live carts count, never a real history.
function Dial({ run }: { run: RunView }) {
  const d = run.category === null ? undefined : run.shopper?.counts[run.category];
  if (!d) return null;
  return (
    <p className="dial"><span className="tag teal">coming next</span> <span className="tag">demo record</span> <b>{d.category}</b>: <b>{d.clean} of {d.needed}</b> clean carts toward “buy within {usd(d.limit)} without asking” (you still tap once). “Not this one” resets it; an Auditor veto will once the Auditor ships.</p>
  );
}
