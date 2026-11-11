// The Desk, slice 1 (`?desk=1`): "Ask for anything". The words go to the made-up market (one AI call, or the fixed
// sellers on a practice server); code plants one scam seller, the Watcher reads every note, and the cart goes to the guard
// with the strictest limit in code. Approve opens PayPal for the exact cart the guard bound; only the shopper's tap there
// pays. Every claim on screen comes from the server's answer or core's constants, never retyped here.
import { createElement, Fragment, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { StoreResult } from "@goose/core/storesync";
import type { GooseRead } from "@goose/core/read";
import { A_QUESTION, DIDNT_SHOP, NOT_AN_ASK_LINE, NO_ITEM } from "@goose/core/ask-copy";
import { ASK_MAX, CART_GONE, UNDERSTOOD, VOICE_LINE, boundLine, marketLine, asideTag, asksToReword, causeOnly, ASKING, priceNotLimit, PRICE_WHY, CAP_WHY, cheapestSafe, BEST_DEAL, dealSoFar, deskAside, deskPile, deskDeal, deskOpen, noDealUnder, underWords, heldByCap, OFFLINE_STAYS, safeWords, keepUnderWords, watchingLine, heard, paymentMode, paymentsWords, sellerName, noteWords, sentence, skipReason, TROUBLE, WEEK_WAY, type PaymentMode, type Trouble } from "@goose/core/desk";
import { HoldToTalk } from "../voice/HoldToTalk.tsx";
import { micWords } from "../voice/mic.ts";
import { pageCommand } from "../commands.ts";
import { Greeting } from "../voice/Greeting.tsx";
import { skipIfLate } from "./opening.ts";
import { TAP_TO_BUY, VOICE_DECLINED, VOICE_NO_DEAL, VOICE_SHOPPING } from "@goose/core/voice";
import { primeSpeech } from "../speech.ts";
import { hushLines, sayInTurn } from "./lines.ts";
import { entryNow, followPlace, keepDesk, keptDesk, type Place } from "./desk-history.ts";
import { currentItem } from "./current.ts";
import { json, readJson, troubleFrom, troubleNote } from "./api.ts";
// DK-13: the kit's own words and network flag, from their small files (not the kit's index, whose blocks load lazily).
import { PAID_ELSEWHERE, LOADING, LOST, NOT_FOUND, ROOM_LOST, SANDBOX_NEXT, WAS_OFFLINE } from "../states/words.ts";
import { PartLost, lazyOr, useBackFromPayPal, useOnline } from "../states/online.ts";
import { Kept } from "../kept.ts";
import { TRAIL_WORDS, sealsAtTap, stepsGloss } from "@goose/core/trail";
import { SPRITE } from "./sprite.ts";
import { toCents, type Cents, usdOf } from "@goose/core/money";
import { peerWhy } from "@goose/core/peer-why";
import { Landing } from "./story/index.tsx";
import { wholeInView } from "../menu/in-view.ts";
import { subjectLanding } from "../tour/edges.ts";
import { SiteNav } from "../nav/SiteNav.tsx";
import { appHref } from "../menu/href.ts";
import { MENU_INDEX_ITEMS, MIXER_ASK, MIXER_HASH, WATCH_CUE, menuActionOf, type MenuAction } from "@goose/core/menu-hash";
import { keepRun, lastRunHere } from "../after/keep.ts";
import { keepApproveInView, landDeal } from "./keep-approve.ts";
import { roomArrived } from "./room-first.ts";
import eggStill from "./egg.webp";
import "./desk.css";

/** The hero's examples: each one asks Goose at a tap (the first is the recorded week's ticket; the second is the same
 *  ticket with a spoken cap under the $90.00 events limit, so a judge sees the cap bite: "Over your $85.00 cap", Round 4
 *  data fix 5). */
const CHIPS = ["A Marsh Lights ticket under $90", "A kettle under $60", "A used Fernway mixer"] as const;

// The hero egg: its own chunk, so the first paint is the page and the words, then the egg.
const Egg = lazyOr(() => import("./Egg.tsx"));
/** SM-5 (Round 3 design judge): a chunk the run fetches ahead draws in the same commit as its beat. React.lazy suspends
 *  once on its first render even when the chunk is in, and React reveals a suspended boundary up to 300 ms later: the
 *  case rose 160 ms after its verdict and "What happens after your tap" landed 300 ms after done, pushing Approve down.
 *  `preload` fetches it; once it is in, `Now` draws it at once; until then it is lazy, with `fallback` in its place. A
 *  lost chunk names its loss in the page strip (PartLost), never a blank Desk, and so does one that throws, or `threw` where the part is a whole room. */
function early<P extends object>(load: () => Promise<{ default: ComponentType<P> }>, lost: ComponentType<P> = PartLost as ComponentType<P>, threw: ComponentType<P> = lost) {
  let ready: ComponentType<P> | null = null;
  const get = () => load().then((m) => { ready = m.default; return m; });
  const Lazy = lazy(() => get().catch(() => ({ default: lost })));
  // Chosen once per mount, inside a Suspense that's always there. Choosing on each render swapped Lazy for `ready` once the
  // chunk landed: a different element type, so React threw the room away a few seconds in, with the shopper's pick and focus (Round 5).
  const Once = (p: P) => { const [C] = useState<ComponentType<P>>(() => ready ?? (Lazy as unknown as ComponentType<P>)); return createElement(C, p); };
  const Now = ({ fallback = null, ...p }: P & { fallback?: ReactNode }) =>
    <Kept or={createElement(threw, p as unknown as P)}><Suspense fallback={fallback}>{createElement(Once, p as unknown as P)}</Suspense></Kept>;
  return { preload: (): Promise<void> => get().then(() => undefined, () => undefined), Now };
}
// The rooms, and the deal's Keep watching: their own chunk, fetched once the page is idle (below), so a shopper who goes offline
// after that still has them, and nobody who never opens one pays for it at first load (Round 5: about 8 KB off the Desk).
// A room gone before it came is drawn, never left blank: offline she goes back to Goose, online she reloads. The import doesn't come
// back by itself, as a browser can keep a failed module for the page's life, so the way forward is Reload, not a wait.
// A room that threw (`threw`): the way forward is Back to Goose at any time, as a reload would cost the conversation she's kept, and it
// opens afresh the next time she comes in. The offline line isn't said, as it isn't why.
function RoomGone({ threw }: { threw: boolean }) {
  const online = useOnline();
  return (
    <section className="dk-pane dk-room-lost">
      <h1 className="dk-pane-h" tabIndex={-1}>{ROOM_LOST.title}</h1>
      {!online && !threw && <p className="dk-pane-sub">{ROOM_LOST.offline}</p>}
      {online && !threw
        ? <button type="button" className="dk-approve" onClick={() => location.reload()}>{LOST.action}</button>
        : <button type="button" className="dk-approve" onClick={() => void dispatchEvent(new CustomEvent("goose:room", { detail: "ask", cancelable: true }))}>{NOT_FOUND.action}</button>}
    </section>
  );
}
const RoomLost = () => <RoomGone threw={false} />;
const RoomThrew = () => <RoomGone threw />;
/** On a slow line a room isn't blank either. It appears only after 400 ms (desk.css), so a chunk that's in never flashes it. */
const RoomWait = () => <section className="dk-pane dk-room-wait" aria-busy="true"><p className="dk-pane-sub">{LOADING.other}</p></section>;
type Panes = typeof import("./Panes.tsx");
const panes = () => import("./Panes.tsx");
const WeekPane = early<Parameters<Panes["WeekPane"]>[0]>(() => panes().then((m) => ({ default: m.WeekPane })), RoomLost, RoomThrew);
const WantsPane = early<Parameters<Panes["WantsPane"]>[0]>(() => panes().then((m) => ({ default: m.WantsPane })), RoomLost, RoomThrew);
const SettingsPane = early<object>(() => panes().then((m) => ({ default: m.SettingsPane })), RoomLost, RoomThrew);
const Watch = early<Parameters<Panes["Watch"]>[0]>(() => panes().then((m) => ({ default: m.Watch })));
// "After you pay" (S1): its own chunk, loaded when the paid card or its room shows.
const AfterPay = lazyOr(() => import("../after/AfterPay.tsx"), ({ room }: { room?: boolean }) => (room ? <RoomLost /> : <PartLost />));
/** Goose's Read on the deal (Track X): its own chunk, fetched with the market so it draws in done's own frame. */
const ReadChip = early(() => import("../list/Read.tsx"));
/** S1-4: what PayPal and code did with the cart (order id, held → re-checked → captured, PayPal's signed word, the
 *  cart's mark), from the run's own rows; its own chunk, loaded by the deal card after Approve and PayPal's return. */
const Trail = early(() => import("./Trail.tsx"));
/** The app's glass (S1, Joshua's item 4): its own stylesheet, fetched once the Desk is an app or the page scrolls. */
// DK-12: a fetch that fails offline is forgotten (no unhandled error), and asked for again once she is back online.
let glass: Promise<unknown> | null = null;
const loadGlass = () => (glass ??= import("./glass.css").catch(() => { glass = null; }));
/** Track C3: reference prices from Channel3 (real stores), its own chunk; it gets her words and gives nothing back. */
const RealPrices = lazyOr(() => import("./RealPrices.tsx"));
/** Track R's states kit (web/src/states, brand.md §10.9): its own chunk and stylesheet, so the Desk's first paint keeps
 *  its two sheets (web/prerender.ts). Fetched once the page is idle, so a shopper who goes offline before she asks still
 *  has it; a chunk lost anyway draws the plain line or button, never a blank Desk. */
const loadKit = () => import("./DeskState.tsx");
/** A failed ask's one way forward: a button (Try again, Change my words) or a link (a cap's recorded week). */
type WayForward = { label: string; onClick: () => void } | { label: string; href: string };
const BEHIND = "See it behind the scenes";
const LinkBtn = ({ to, children }: { to: string; children: string }) => <a className="dk-linkbtn" href={appHref(to)}>{children} <span className="dk-arr" aria-hidden="true">›</span></a>;
const PlainAction = (a: WayForward) => "href" in a
  ? <a className="st-note-action" href={appHref(a.href)}>{a.label} <span aria-hidden="true">›</span></a>
  : <button type="button" className="st-note-action" onClick={a.onClick}>{a.label}</button>;
const AskingLine = () => <p className="dk-fiction">{ASKING}</p>;
const StateAction = lazy(() => loadKit().then((m) => ({ default: m.StateAction }), () => ({ default: PlainAction })));
const Asking = lazy(() => loadKit().then((m) => ({ default: m.Asking }), () => ({ default: AskingLine })));
/** Track SM: the signature moment, a set-aside seller's words sealed under its row (desk/moment); its own chunk, loaded with the first set-aside. */
const Case = early(() => import("./moment/Case.tsx")); // a lost chunk draws no case, never a blank Desk
/** Track C's line (Round 1 judges: the escalate-only AI reader never appeared on the run page), in the Why sheet since
 *  SM-3 (Round 2: in the case it made the case 181 px and diluted the image; the case is the quote and the engraving).
 *  True on every run: code set the seller aside. DD (Nov 4) cut the AI reader's half: it isn't what happened on the Desk,
 *  whose sellers only code reads, and it pushed the gold box under the sticky foot at 390. */
const READER_NOTE = "Code set this seller aside.";

/** `recorded`: the Ask named an item of the recorded week, so the market is that week's day and each listing may carry
 *  what its seller first asked (server: recordedMarket). */
type Recorded = { catalogId: string; day: number; unit: string; was: Record<string, { total: string; day: number; whose: string; line: string }> };
/** `cap`: the cap code read in her words (Track H-3), sent back with the cart as its `maxPrice`; it only ever lowers. */
type Market = { marketId: string; item: string; claim: string; plantedSays: string; madeBy: string; readerSays?: string; limitWhy?: string; recorded?: Recorded; cap?: string | null; capSays?: string | null; heldBy?: string; read?: GooseRead | null; results: StoreResult[] };
type Cart =
  | { kind: "cart"; runId: string; total: string; reason: string; holds: string[]; canPay: boolean; undoKey?: string; hash?: string }
  | { kind: "refused"; reason: string }
  | { kind: "missing"; reason: string };
/** What code read in the words before Goose shops (server: understand); each detail carries the words without it. */
type Read = { item: string; details: { kind: string; label: string; without: string }[]; said: string | null; limit: string; category: string; because: string; cap: string | null; held: string; heldBy: string; line: string; title?: string };
/** `gone`: the server has no such run (404), so the page can't say whether it was paid. */
/** One seller's line, in the same words on the row, its final card and its sheet. `over` is the shopper's limit, ahead of a hold. */
const watcherSays = (r: { watcher: string; said: string[] }, best?: boolean, over?: string | null) =>
  r.watcher === "refuse" ? `Set aside: ${asideTag(r.said)}` : over || (r.watcher === "hold" ? `Waits for your yes: ${r.said[0] ?? "held"}` : best ? BEST_DEAL : "Nothing set aside");

type Back = { total: string | null; merchant: string | null; item: string | null; orderId: string | null; ok: boolean | null; reason: string | null; gone?: true; card?: { head: string; line: string | null } | null; mine?: boolean };
/** What the stage shows. `f` below is the layout the CSS draws it with. */
/** The Desk's rooms (Joshua, Oct 30: the Desk as an app once she asks). The menu in the bar lists every feature (core's
 *  `MENU_ITEMS`; DK: no left rail, Joshua Sat Oct 31); the rooms open here, the rest are their own pages. */
type Pane = "ask" | "week" | "wants" | "settings" | "after";
/** The room a menu action opens (Ask and Talk share the Ask room; the Watcher runs an ask there). */
const PANE_OF: Record<MenuAction, Pane> = { ask: "ask", talk: "ask", watcher: "ask", challenge: "ask", wants: "wants", week: "week", settings: "settings", after: "after" };
type View = "rest" | "understood" | "asking" | "failed" | "run" | "sheet" | "back";

/** The ask the menu's "The Watcher" puts in the box: the first chip, a recorded week's item (its sellers are a replay, no
 *  AI call), so the run is one any visitor could start. S1-4 (Round 1's cold consumer test): it is only put in the box;
 *  nothing is sent until the visitor taps Ask. */
const WATCH_ASK = CHIPS[0];
/** S1-12 (the DD at S1-11, system.md §4: a stop lands on what its line names): on a phone the Watcher stop's subject
 *  ("Watch its note get read and the seller set aside") is the recorded week's paragraph that ends "… asked for a gift
 *  card. Goose set it aside." (the story chunk's Moment), under the box. */
/** The tour strip's fade above its top edge (tour-pill.css `.tp::before`, 24 px): a landed subject clears it too. */
const FOOT_FADE = 24;
/** How many landings the Desk has started (one Desk a page): only the newest one goes on correcting itself. */
let landings = 0;
/** A landing at scrollY `y` whose top edge would cut a line of `root`'s text (the greeting's "Tell Goose your name")
 *  lands just past that line instead, so the window never opens mid-letter. */
function pastLines(y: number, root: Element | null): number {
  if (!root) return y;
  const lines: DOMRect[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    if (!(t.textContent ?? "").trim()) continue;
    const range = document.createRange(); range.selectNodeContents(t);
    lines.push(...range.getClientRects());
  }
  let at = y;
  for (let i = 0; i < 8; i++) {
    const cut = lines.find((r) => r.top + scrollY < at && r.bottom + scrollY > at);
    if (!cut) break;
    at = Math.ceil(cut.bottom + scrollY);
  }
  return at;
}
/** The Ask box's placeholder turns through these (reduced motion: the first one stays). None repeats a chip (Joshua,
 *  Oct 30): the box shows asks the chips don't, the first two recorded items with a week behind them. */
const HINTS = ["“A Gullwing Air seat”", "“A night at Mossbell Inn”", "“A night by the sea”", "“Noise-cancelling headphones”"] as const;
const HINT_MS = 3200;
const LAYOUT: Record<View, string> = { rest: "rest", understood: "rest", asking: "rest", failed: "rest", run: "run", sheet: "sheet", back: "deal" };
/** The live run (Joshua, Oct 30: "Show Goose shopping"): one beat per seller. The first seller is there from the run's
 *  first frame; on each beat Goose finishes reading one note and the next seller lands, so one note is read at a time
 *  (the reading line draws over the beat). SM-7 (DD): the deal card's price is drawn in the frame its seller's row says
 *  "Nothing set aside", never while that row is still reading. Only the pacing is staged; every name, price and verdict is the
 *  server's answer. */
const BEAT_MS = 500;
/** SM-5: the longest the run waits for its two small chunks (the case, the trail) once the market is in. */
const PIECES_MS = 1500;

const recordWords = (h: number | null) => (h === null ? "No sales record shown" : h === 0 ? "New seller, no sales yet" : `${h.toLocaleString("en-US")} sales on record`);
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A price that counts to its new value instead of jumping (reduced motion: it jumps). */
function useTicker(target: number | null): number | null {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (target === null || from.current === null || still()) { from.current = target; setShown(target); return; }
    const a = from.current, t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700), v = a + (target - a) * (1 - (1 - k) ** 3);
      from.current = v; setShown(v);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  // SM-3: the first number paints in the same render that brings it (the effect above runs a frame later), so a label
  // that changes with it never stands over "…".
  return target === null ? null : shown ?? target;
}

const Use = ({ id, className }: { id: string; className?: string }) => <svg className={className} aria-hidden="true"><use href={`#dk-${id}`} /></svg>;

export default function Desk() {
  const backRun = new URLSearchParams(location.search).get("run");
  const [view, setView] = useState<View>(backRun ? "back" : "rest");
  const isFailed = view === "failed";
  const [words, setWords] = useState("");
  const [asked, setAsked] = useState("");
  const [read, setRead] = useState<Read | null>(null);
  const [reading, setReading] = useState(false);
  /** DK part 7: a read is asked again quietly after the server gave no answer (api.ts readJson): the waking state shows, never the error. */
  const [quiet, setQuiet] = useState(false);
  const [market, setMarket] = useState<Market | null>(null);
  const [arrived, setArrived] = useState(0);
  const [checked, setChecked] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  /** DK: why the server gave no market (offline, waking, a cap, its error), or null when it answered "no market". */
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [busy, setBusy] = useState<"cart" | "pay" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [back, setBack] = useState<Back | null>(null);
  const [mode, setMode] = useState<PaymentMode | null>(null);
  /** The server's payment intent (AUTHORIZE holds first), so the deal card names the steps ahead as the code takes them. */
  const [intent, setIntent] = useState<unknown>(null);
  const [micLine, setMicLine] = useState("");
  const [sheetKind, setSheetKind] = useState<"why" | "deal" | "row">("why");
  /** S1-11: the seller row whose details sheet is open (a row that is neither the set-aside nor the deal). */
  const [sheetRow, setSheetRow] = useState<string | null>(null);
  const [hint, setHint] = useState(0);
  const [pane, setPane] = useState<Pane>("ask");
  const [opener, setOpener] = useState<MenuAction | null>(null); // the menu item that last opened a pane (part 6 g)
  /** Track SM: "Show its words again" in the Why sheet remounts the set-aside's case, so its one motion plays once more. */
  const [replay, setReplay] = useState(0);
  /** S1-9 (Round 3's consumer: the Watcher stop "only pre-fills the Ask box, with no cue"): the line under the box that
   *  says what to press, while the Watcher's ask waits there untouched. */
  const [cue, setCue] = useState(false);
  /** Once she asks (or opens a room), the Desk is an app: the workspace under the bar, no hero and no story. */
  const app = view !== "rest" || pane !== "ask";
  /** An ask the menu or the tour has put in the box: the cue stays while its words do. */
  const cueOn = cue && (words === WATCH_ASK || words === MIXER_ASK);
  const stageRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const gotItRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const whyRef = useRef<HTMLButtonElement | null>(null);
  const fromSheet = useRef(false);
  const rightRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(skipIfLate, []); // before the first paint: a late Desk shows its hero at once

  // Depth: one passive scroll listener, written straight to styles in a frame (no re-render). Reduced motion: still.
  // The hero's two layers only (system.md section 7); the grain no longer drifts (S1-3, B's motion gate: a style write
  // every scroll frame for a texture nobody follows): it is still, on its own compositor layer (desk.css).
  // (The landing's own reveals live with the story, under ./story.)
  useEffect(() => {
    if (still()) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const y = scrollY;
      document.querySelectorAll<HTMLElement>(".dk [data-depth]").forEach((e) => { e.style.transform = `translate3d(0, ${(y * Number(e.dataset.depth)).toFixed(1)}px, 0)`; });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    addEventListener("scroll", onScroll, { passive: true });
    paint();
    return () => { removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, [app]); // the landing remounts when she comes back to it

  // Glass (S1, Joshua's item 4): the app's panels are glass (the nav turns to glass on scroll in SiteNav itself).
  // Their stylesheet waits for the first scroll or the app, so the landing's first screen loads nothing new.
  useEffect(() => {
    if (app) void loadGlass();
    const on = () => { if (app || scrollY > 8) void loadGlass(); };
    addEventListener("scroll", on, { passive: true });
    addEventListener("online", on);
    on();
    return () => { removeEventListener("scroll", on); removeEventListener("online", on); };
  }, [app]);

  // The placeholder turns through a few asks while the box is empty and unfocused (reduced motion: it stays put).
  useEffect(() => {
    if (still() || words !== "") return;
    const t = setInterval(() => { if (document.activeElement?.tagName !== "INPUT") setHint((h) => (h + 1) % HINTS.length); }, HINT_MS);
    return () => clearInterval(t);
  }, [words]);

  // The payments line: one value from /api/health, and the neutral line until it answers (or if it can't).
  useEffect(() => { json<unknown>("/api/health").then(({ data }) => { setMode(paymentMode(data)); setIntent((data as { intent?: unknown } | null)?.intent ?? null); }, () => setMode(null)); }, []);

  /** A run brought back by a reload or Forward is already read: it shows finished, says nothing (voiced is false) and plays nothing. */
  const whole = useRef(false);
  // The live run: sellers arrive one by one and each note is read in turn; reduced motion shows the finished run.
  // SM-7 (reviewer): a layout effect, so a new market's first paint never shows the last run's beat (a whole card for a frame).
  useLayoutEffect(() => {
    if (!market) return;
    const n = market.results.length;
    if (still() || whole.current) { whole.current = false; setArrived(n); setChecked(n); return; }
    setArrived(Math.min(n, 1)); setChecked(0);
    // One timer per beat sets both, so a verdict and the next row's arrival always land in the same frame.
    const ts = market.results.map((_, i) => setTimeout(() => { setChecked(i + 1); setArrived(Math.min(n, i + 2)); }, (i + 1) * BEAT_MS));
    return () => ts.forEach(clearTimeout);
  }, [market]);

  // On a phone the deal and the protection card sit under the sellers: once every note is read, bring the sellers and
  // the deal up together (Desk-S6: the proof sits right above the price), under the run's status line (Desk-S7).
  const finished = market !== null && checked >= market.results.length && market.results.length > 0;
  // The app's header height where it is pinned to the top (every width since S1-13, brand.md §10.4); 0 where it scrolls away.
  const pinnedBar = () => {
    const nav = document.querySelector<HTMLElement>(".dk[data-app] .dk-nav");
    return nav && /sticky|fixed/.test(getComputedStyle(nav).position) ? nav.getBoundingClientRect().height : 0;
  };
  // A phone's scroll target lands just under a pinned header, or 12 px under the screen's top where none is pinned
  // (S1-4: it was sized for a header that no longer sticks, so the line above showed its tail).
  const phoneTop = () => pinnedBar() + 12;
  /** Track SM (phone): where the pinned money line's slot starts on the page (its stuck place is the screen's top), or
   *  null when no pin is drawn. Read from its parent, since a stuck pin's own rect says 0 wherever the page is. */
  const pinSlot = (): number | null => {
    const pin = pinRef.current;
    if (!pin || getComputedStyle(pin).display === "none") return null;
    return Math.round(pin.parentElement!.getBoundingClientRect().top + scrollY);
  };
  /** A scroll target that never lands with the Ask box cut in half at the screen's top edge (Round 1, the DD at 390):
   *  the box is either whole above what scrolls up, or scrolled away whole. */
  const clearAsk = (top: number): number => {
    const box = inputRef.current?.closest(".dk-ask")?.getBoundingClientRect();
    if (!box) return top;
    const bar = pinnedBar(), from = box.top + scrollY, to = box.bottom + scrollY;
    return top + bar > from && top + bar < to ? to - bar : top;
  };
  // Her own scroll, tap or key during the run wins: the finish never pulls her back from somewhere she went.
  const hersRun = useRef(false);
  useEffect(() => {
    if (view !== "run") return;
    hersRun.current = false;
    const HERS = ["wheel", "pointerdown", "keydown"] as const;
    const stop = () => { hersRun.current = true; };
    for (const e of HERS) addEventListener(e, stop, { passive: true });
    return () => { for (const e of HERS) removeEventListener(e, stop); };
  }, [view]);
  useEffect(() => {
    if (!finished || view !== "run" || innerWidth >= 720 || hersRun.current) return;
    // Round 5, B1: the deal landed, so its card comes up with Approve in the frame. Not for a keyboard on a narrow window:
    // its focus is on the heading, and that stays in view (below).
    if (!headRef.current?.matches(":focus-visible") && landDeal(still() ? "auto" : "smooth", () => hersRun.current)) return;
    // S1-4 (Round 1's accessibility review): the run's heading has the keyboard's focus, so it stays in view, at the top
    // with the status line and sellers under it; the status line leads only when focus has moved on.
    const head = headRef.current && document.activeElement === headRef.current ? headRef.current : null;
    // SM-3: with the pin's slot held, the run's first scroll already put it at the top (its stuck place) with the heading
    // under it; the finish keeps that place (one scroll for the whole run, the heading never under the pin).
    const slot = pinSlot();
    if (slot !== null) { const to = slot - pinnedBar(); if (Math.abs(to - scrollY) > 1) scrollTo({ top: to, behavior: still() ? "auto" : "smooth" }); return; }
    const el = head ?? document.querySelector(".dk[data-app] .dk-live-head > .dk-runhead") ?? document.querySelector(".dk[data-app] .dk-live-grid > .dk-feed") ?? rightRef.current;
    if (el) scrollTo({ top: clearAsk(el.getBoundingClientRect().top + scrollY - phoneTop()), behavior: still() ? "auto" : "smooth" });
  }, [finished]);

  // A new stage brings itself into view and its heading to the keyboard and screen reader (not when the sheet closes).
  useEffect(() => {
    if (view === "rest" || view === "sheet") return;
    if (fromSheet.current) { fromSheet.current = false; return; }
    const el = stageRef.current;
    // In the app on a wide screen the workspace starts at the top, Ask box and all; elsewhere the stage comes up. On a
    // phone the understood card opens with her words at the top (the Ask box now follows the card), so its one action
    // is in view above the bar.
    const asked = view === "understood" && innerWidth < 720 ? document.querySelector(".dk-asked") : null;
    const slot = view === "run" ? pinSlot() : null;
    const top = slot !== null ? slot - pinnedBar() : asked ? Math.max(0, asked.getBoundingClientRect().top + scrollY - phoneTop()) : el?.closest(".dk-app") && innerWidth >= 720 ? 0 : el ? el.getBoundingClientRect().top + scrollY - (innerWidth < 720 ? phoneTop() : 100) : null;
    if (top !== null) scrollTo({ top: innerWidth < 720 ? clearAsk(top) : top, behavior: still() ? "auto" : "smooth" });
    headRef.current?.focus({ preventScroll: true });
  }, [view]);

  // DK part 7 (the DD's glass check): behind an open sheet everything is inert, the site bar included (its wrapper, set
  // from here; SiteNav's own files are S1-13's), so a tap can't open the menu over the sheet and VoiceOver, which
  // doesn't reliably honour aria-modal alone, can't reach the page. A layout effect, so the page is live again in the
  // commit that closes the sheet, before closeSheet's next frame focuses "Why?".
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (view !== "sheet") return;
    const behind = [...(rootRef.current?.children ?? [])].filter((el) => !el.matches(".dk-scrim, .dk-sheet"));
    for (const el of behind) el.setAttribute("inert", "");
    return () => { for (const el of behind) el.removeAttribute("inert"); };
  }, [view]);

  // The sheet: it opens with focus on its heading (read first, then Tab reaches its first control), Tab and Shift+Tab
  // cycle through its own controls only (the page behind is out of reach, as aria-modal says; S1-4, Round 1's
  // accessibility review), Escape closes it, and focus goes back to "Why?" after.
  useEffect(() => {
    if (view !== "sheet") return;
    const sheet = sheetRef.current;
    (sheet?.querySelector<HTMLElement>("#dk-sh-t") ?? gotItRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { closeSheet(); return; }
      if (e.key !== "Tab" || !sheet) return;
      const all = [...sheet.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      if (all.length === 0) return;
      const i = all.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? all.length - 1 : i - 1) : (i + 1) % all.length;
      e.preventDefault(); all[next]!.focus();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [view]);

  // PayPal's return lands here with the run: say what the server's settle says, never more.
  useEffect(() => {
    if (!backRun || !/^[0-9a-f]{12}$/.test(backRun)) { if (backRun) setView("rest"); return; }
    json<{ bound: { total: string; merchant: string; item: string; orderId: string | null } | null; settled: { ok: boolean; reason?: string } | null; card?: { head: string; line: string | null } | null; mine?: boolean }>(`/api/runs/${backRun}`)
      .then(({ status, data }) => setBack(status === 404 ? { total: null, merchant: null, item: null, orderId: null, ok: null, reason: null, gone: true } : { total: data.bound?.total ?? null, merchant: data.bound?.merchant ?? null, item: data.bound?.item ?? null, orderId: data.bound?.orderId ?? null, ok: data.settled?.ok ?? null, reason: data.settled?.reason ?? null, card: data.card ?? null, mine: !!data.mine }))
      .catch(() => setBack({ total: null, merchant: null, item: null, orderId: null, ok: null, reason: null }));
  }, [backRun]);

  // Ask: code reads the words into the card first (no model, no cap); Goose shops only when the shopper says so.
  async function ask(raw: string) {
    const w = raw.trim();
    if (w.length < 2 || reading) return;
    // 034: a go-to or the name, answered by the page before anything is sent. A name never wipes a run or a cart on
    // screen: the box empties, Goose says its line, and the hero's greeting shows it on the landing.
    if (pageCommand(w)) { setWords(""); return; }
    setWords(w); setAsked(w); setFailed(null); setTrouble(null); setCart(null); setNote(null); setReading(true);
    keepDesk({ asked: w, read: null, market: null }); // a reload from here starts over, never on the last run's deal
    void loadKit().catch(() => undefined); // a failure's pill is drawn from it (DK part 8)
    const ask = asks.current;
    try {
      const r = await readJson<Read & { error?: string }>("/api/runs/market/understand", { words: w }, (on) => { setQuiet(on); if (on && ask === asks.current) setView("asking"); });
      if (ask !== asks.current) { setReading(false); return; }
      if (r.data.error) { setRead(null); setFailed(r.data.error); setTrouble(r.status === 429 ? "capped" : r.status >= 500 ? "error" : null); setView("failed"); }
      // Sent: her words move to the bubble and the box empties for the next ask ("Change my words" puts them back).
      else { setRead(r.data); setMarket(null); setWords(""); setView("understood"); keepDesk({ asked: w, read: r.data, market: null }); }
    } catch (e) { if (ask === asks.current) { setRead(null); setFailed(null); setTrouble(troubleFrom(e)); setView("failed"); } }
    setReading(false);
  }

  // One market ask at a time: a second tap (Try again twice, or Ask while the first is out) sends nothing (the DD, part 2
  // nit 2). The failed block's Try again also leaves the screen with the first tap, since the view turns to "asking".
  const shopping = useRef(false);
  // Which ask is current: Start over, or the menu leaving a run, moves it on.
  const asks = useRef(0);
  // The states kit once the page is idle (see loadKit): a failure's words never wait on the network that just failed.
  useEffect(() => {
    const go = () => { void loadKit().catch(() => undefined); void panes().catch(() => undefined); };
    const id = "requestIdleCallback" in window ? requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 2000);
    return () => { if ("cancelIdleCallback" in window) cancelIdleCallback(id as number); clearTimeout(id as ReturnType<typeof setTimeout>); };
  }, []);
  // Goose says the run's lines (Joshua, Nov 4: "the page must never say Goose speaks if it doesn't"): only on a run her own tap
  // started, and that tap is what unlocks the sound on an iPhone. Mute and captions are speech.ts's.
  const voiced = useRef(false);
  function shopTap(w: string) {
    if (shopping.current) return;
    primeSpeech();
    voiced.current = true;
    hushLines();
    sayInTurn(VOICE_SHOPPING);
    void shop(w);
  }
  async function shop(w: string) {
    if (shopping.current) return;
    shopping.current = true;
    try { await shopOnce(w); } finally { shopping.current = false; }
  }
  async function shopOnce(w: string) {
    const ask = asks.current;
    setFailed(null); setTrouble(null); setView("asking");
    void loadKit().catch(() => undefined); // a failure's pill is drawn from it (DK part 8)
    // Track SM: the case's chunk is fetched while the market is asked for, so the case rises at the Watcher's pace (the
    // first set-aside is read half a second after its row lands), not the network's.
    // SM-5: and the deal card's "What happens after your tap", so it is on the card in the frame Approve is (done). The
    // run starts once both are in (1.5 kB together, fetched beside the market; reduced motion finishes the run in its
    // first frame) or after PIECES_MS, whichever is first; a chunk still on the way then has its place held.
    const pieces = Promise.race([Promise.all([Case.preload(), Trail.preload(), ReadChip.preload()]), new Promise((ok) => setTimeout(ok, PIECES_MS))]);
    try {
      const r = await readJson<({ kind: "market" } & Market) | { kind: "failed"; reason: string }>("/api/runs/market/ask", { words: w }, setQuiet);
      await pieces;
      if (ask !== asks.current) return;
      if (r.data.kind === "market") { setMarket(r.data); setView("run"); keepDesk({ asked: w, read, market: r.data }); }
      // A 429 is a cap (its reason is the server's own words); a 500 the server's error; a 200 "failed" is no market.
      else {
        const t = r.status === 429 ? "capped" : r.status >= 500 ? "error" : null;
        setFailed(r.data.reason); setTrouble(t); if (t) keepWords(w); setView("failed");
        if (voiced.current) { voiced.current = false; sayInTurn(VOICE_NO_DEAL); }
      }
    } catch (e) {
      if (ask === asks.current) {
        const t = troubleFrom(e);
        setFailed(null); setTrouble(t); keepWords(w); setView("failed");
        // Offline, voiced stays: the ask comes back by itself once she does, and that run still says its lines.
        if (voiced.current && t !== "offline") { voiced.current = false; sayInTurn(VOICE_NO_DEAL); }
      }
    }
  }

  // DK part 8 (the DD: a failed shop was a dead end with an empty box): when the server failed her, her words go back in
  // the box, unless she has typed something else since.
  const askHere = (w: string) => { setPane("ask"); setOpener(null); void ask(w); };
  function keepWords(w: string) { setWords((now) => now || w); }

  // §10.9 Offline: no button; the failed ask is asked again once the browser is back online, and only while the box
  // still holds the words that failed (DK-12, the DD's ruling and lesson 47): words she typed since are hers to send
  // with her own Enter or arrow, never overwritten by the old ones. `wordsNow` is read when the event fires, not from a
  // stale render; `backOnce` makes it one request per return online (a flapping network fires `online` twice before
  // React re-renders), cleared when that request settles.
  const wordsNow = useRef(words);
  wordsNow.current = words;
  const backOnce = useRef(false);
  const sameWords = words.trim() === asked.trim();
  // DK-13 (the DD, seat 2, Oct 31: one way forward per terminal Desk state): back online with the block still up (her
  // words changed, so nothing was asked by itself), it says what happened while she was offline, never "You're offline.";
  // a failed Shop gets the kit's one Try again (failAction), a failed ask none: her box and its lit arrow are the way.
  const online = useOnline();
  const wasOffline = isFailed && trouble === "offline" && online;
  useEffect(() => {
    if (!isFailed || trouble !== "offline") return;
    const back = () => {
      if (backOnce.current || wordsNow.current.trim() !== asked.trim()) return;
      backOnce.current = true;
      void (read ? shop(asked) : ask(asked)).finally(() => { backOnce.current = false; });
    };
    addEventListener("online", back);
    return () => removeEventListener("online", back);
  });

  // Approve: the guard decides the cart (the Watcher, the strictest limit in code); only a bound cart opens PayPal.
  async function approve(listing: StoreResult) {
    if (!market) return;
    hushLines(); // she has tapped: "Tap Approve to buy." would only be late
    setBusy("cart"); setNote(null);
    try {
      const r = await json<Cart & { error?: string }>("/api/runs/store/cart", { market: market.marketId, listingId: listing.id, from: "desk", ...(market.cap ? { maxPrice: market.cap } : {}) });
      if (r.data.error) { setNote(r.data.error); setBusy(null); return; }
      setCart(r.data);
      // "After you pay": this tab keeps the run and its undo key (sessionStorage only), so Undo works after PayPal's return.
      if (r.data.kind === "cart") keepRun(r.data.runId, r.data.undoKey);
      if (r.data.kind !== "cart" || !r.data.canPay || r.data.holds.length > 0) { setBusy(null); return; }
      await pay(r.data.runId);
    } catch (e) { setNote(troubleNote(e)); setBusy(null); }
  }

  useBackFromPayPal(() => setBusy(null));
  async function pay(runId: string) {
    setBusy("pay");
    try {
      const r = await json<{ approveUrl?: string; error?: string }>("/api/runs/store/complete_payment", { runId });
      if (r.data.approveUrl) { location.assign(r.data.approveUrl); return; }
      setNote(r.data.error ?? "PayPal didn't open. Nothing was charged.");
    } catch (e) { setNote(troubleNote(e)); }
    setBusy(null);
  }


  function openSheet(el: HTMLButtonElement, kind: "why" | "deal" | "row" = "why", row: string | null = null) { whyRef.current = el; setSheetKind(kind); setSheetRow(row); setView("sheet"); }
  function closeSheet() { fromSheet.current = true; setView("run"); requestAnimationFrame(() => whyRef.current?.focus()); }
  /** Track SM: the Why sheet's "Show its words again": close the sheet, bring the set-aside's case into view and focus, play it once more. */
  function replayCase() {
    fromSheet.current = true; setView("run"); setReplay((n) => n + 1);
    // Focus lands on the case itself (named by its label), where the button said it would go; "Why?" only if there is none.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(".dk-fr.dk-aside .sm-case");
      if (!el) { whyRef.current?.focus(); return; }
      el.focus({ preventScroll: true });
      const behavior: ScrollBehavior = still() ? "auto" : "smooth";
      const slot = pinSlot();
      if (slot === null) { el.scrollIntoView({ block: "center", behavior }); return; }
      // SM-4 (DD, Sat Nov 1, nit 1): on a phone the pin holds the top, so "center" could leave the heading's first line
      // under the stuck pin (390×667). Back to the run's own landing (the pin's slot at the top, the heading clear under
      // it) when the whole case fits between the pin and the rail from there; otherwise the case's top sits the pin's
      // band + --s-3 under the screen's top, never higher. The case is remounted mid-`arrive` (translateY), so its
      // layout top drops the transform.
      const lift = new DOMMatrixReadOnly(getComputedStyle(el).transform === "none" ? undefined : getComputedStyle(el).transform).m42;
      const r = el.getBoundingClientRect(), top = r.top - lift + scrollY, bottom = r.bottom - lift + scrollY;
      const band = pinRef.current?.offsetHeight ?? 0;
      // The floor is the screen's foot: no bottom rail is drawn any more (S1-13, brand.md §10.4).
      const floor = innerHeight;
      const gap = parseFloat(getComputedStyle(el).getPropertyValue("--s-3")) || 24;
      // The pin sticks under the bar (S1-13), so its slot lands the bar's height below the screen's top.
      const bar = pinnedBar(), fits = top - slot >= band && bottom - slot + bar <= floor;
      scrollTo({ top: fits ? slot - bar : Math.max(0, Math.round(top - band - gap - bar)), behavior });
    });
  }
  /** Back to the Ask box with her words in it, selected, to change them. */
  function changeWords() {
    const el = inputRef.current;
    if (!el) return;
    setWords(asked);
    scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + scrollY - 160), behavior: still() ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
    requestAnimationFrame(() => el.select());
  }
  /** S1-8 (DD, Sat Nov 1, nit a): a landing on the hero's Ask box never starts mid-sentence. Where the scroll target
   *  would cut the hero's sub line at the screen's top (390, the tour's stop 1), it lands with the sub line just scrolled
   *  away instead, so the greeting block below leads, the sub line's own bottom margin (--s-3 on a phone) above it: the
   *  greeting's scroll-margin-top. Landing on the sub line's first line would cut the headline's last line instead. */
  const clearSub = (top: number): number => {
    const drawn = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.getClientRects().length > 0 && e.getBoundingClientRect().height > 0);
    const sub = drawn(".dk .dk-sub");
    if (!sub) return top;
    // The landing's own bar (sticky on a wide screen, scrolling away on a phone), not only the app's.
    const nav = drawn(".dk .dk-nav");
    const bar = nav && /sticky|fixed/.test(getComputedStyle(nav).position) ? nav.getBoundingClientRect().height : 0;
    const r = sub.getBoundingClientRect(), from = r.top + scrollY, to = r.bottom + scrollY;
    return top + bar > from && top + bar < to ? Math.max(0, Math.ceil(to - bar)) : top;
  };
  /** The Ask box (or its mic) 160 px under the top, never cutting the sub line (clearSub). The hero's layers move with
   *  the scroll (its parallax: the column sits ~18 px lower at 390 once scrolled to the box), so where the sub line ends
   *  up is only known once the scroll has landed: then it is measured again and the landing corrected (twice at most). */
  const landAbove = (el: HTMLElement) => {
    // S1-9 (the DD, system.md §5): a landing scrolls only when its target isn't wholly in view: the Ask box, the line
    // under it and (for Ask and Talk) the chips; at 1440x900 they are at scrollY 0, so the hero and the egg stay whole.
    const hero = el.closest(".dk-ask")?.parentElement;
    // S1-12: a newer landing takes over, even one that needn't scroll (the tour's Next from Ask to the Watcher, pressed
    // while Ask's landing still corrects itself: the same page, so two landings would pull the window between them).
    const me = ++landings;
    if (wholeInView([el.closest(".dk-ask") ?? el, hero?.querySelector(".dk-cue"), hero?.querySelector(".dk-chips")])) return;
    // S1-13 (the DD at S1-12): the focused box and its ready line stay wholly in view; on the tour on a phone no edge cuts
    // a line or a control (tour/edges.ts subjectLanding). Nov 4: the Watcher stop no longer reaches for the week's
    // paragraph on a phone; the trick slot and the promises sit between the hero and the week now.
    const at = () => subjectLanding(clearSub(Math.max(0, el.getBoundingClientRect().top + scrollY - 160)), null,
      [el.closest(".dk-ask") ?? el, hero?.querySelector(".dk-cue")], (y) => pastLines(y, el.closest("section")), FOOT_FADE);
    let left = 2, t = 0;
    const go = (top: number) => {
      scrollTo({ top, behavior: still() ? "auto" : "smooth" });
      const check = () => { removeEventListener("scrollend", check); clearTimeout(t); if (me !== landings) return; requestAnimationFrame(() => { const again = at(); if (left-- > 0 && Math.abs(again - scrollY) > 1) go(again); }); };
      addEventListener("scrollend", check, { once: true });
      t = window.setTimeout(check, 1200); // where scrollend isn't sent (or the page was already there)
    };
    go(at());
  };
  // The hash and voice listeners keep the first render's menuAct, whose `view` never changes: what they read of it is this.
  const viewNow = useRef(view);
  viewNow.current = view;
  /** An ask waits in the box with Ask Goose focused, the cue under it. Nothing runs until the visitor's tap. */
  function ready(w: string) {
    setOpener("watcher"); setPane("ask"); setWords(w); setCue(true);
    requestAnimationFrame(() => {
      const box = inputRef.current, go = box?.parentElement?.querySelector<HTMLElement>(".dk-go");
      if (!box) return;
      landAbove(box); // its ask in the box, the cue under it, and the chips whole: at scroll 0 on a phone the tour strip cuts them
      (go ?? box).focus({ preventScroll: true });
      // On a 390 phone the ask is 10 px wider than its box, and a box shows its start, so "under $90" read "under $9". Show
      // its end, as typing would: the price stays in view, and the chip under the box says the ask whole (tour-pill.ts).
      box.scrollLeft = box.scrollWidth;
    });
  }
  /** "Everything Goose does" opens these in place (and a menu link from another page, by its hash, on arrival). */
  function menuAct(a: MenuAction) {
    setOpener(a);
    // A room: its heading takes focus once it's open, so the keyboard isn't left on the page's body or the menu (DK:
    // the left rail and its marker are gone; the menu lists every room).
    // "After you pay" is its own lazy chunk (#ap-room-h), so the heading is looked for each frame until it mounts
    // (about a second at most), not only on the next frame.
    const room = (p: Pane) => {
      setPane(p); scrollTo({ top: 0 });
      const focusHead = (n: number) => {
        const h = document.querySelector<HTMLElement>(p === "after" ? "#ap-room-h, #root .dk-room-lost .dk-pane-h" : "#root .dk-work .dk-pane-h");
        // A cover drawing Your wants' empty list (early-wants.ts) lifts once the room draws all of it: its empty note is
        // the states kit's own chunk, and lifting before it came blinked the note out and moved the scene under it up.
        const whole = !document.querySelector("#dk-room-first[data-empty]") || !!document.querySelector("#root .dk-work .st-note ~ .dk-watch-first ~ .dk-watch-said");
        if (h && (whole || n >= 180)) { h.focus({ preventScroll: true }); roomArrived(); } else if (n < 180) requestAnimationFrame(() => focusHead(n + 1)); else roomArrived();
      };
      requestAnimationFrame(() => focusHead(0));
    };
    switch (a) {
      case "wants": room("wants"); break;
      case "week": room("week"); break;
      case "settings": room("settings"); break;
      case "after": room("after"); break;
      // The Watcher: the recorded week's ask waits in the box with Ask Goose focused; the visitor's tap runs it, and its
      // sellers (one planted scam seller among them) are read and the scammer set aside. No ask runs without a tap.
      case "watcher":
        ready(WATCH_ASK);
        break;
      // Try to trick Goose: right under the hero, so it opens in place. The block is its own lazy chunk, so it's looked
      // for each frame (about three seconds at most), and its heading takes focus. If its chunk never comes, the slot's
      // link to the box that works stands in its place, and that is where this lands. Her own scroll, tap or key while
      // it's looking wins: it never pulls her back from somewhere she went.
      case "challenge":
        if (viewNow.current !== "rest") startOver();
        setPane("ask");
        {
          const HERS = ["wheel", "pointerdown", "keydown"] as const;
          let hers = false;
          const stop = () => { hers = true; };
          const done = () => { for (const e of HERS) removeEventListener(e, stop); };
          for (const e of HERS) addEventListener(e, stop, { once: true, passive: true });
          const land = (n: number) => {
            if (hers) { done(); roomArrived(); return; }
            const el = document.getElementById("challenge") ?? (n >= 180 ? document.getElementById("try") : null);
            if (!el) { if (n < 180) requestAnimationFrame(() => land(n + 1)); else { done(); roomArrived(); } return; }
            // Under a room cover, the Challenge itself, not its lines-only start (ChallengeStart): the cover draws the counter
            // too (early-challenge.ts), and lifting it for the start took the counter away until the Challenge's chunk came.
            if (n < 180 && document.documentElement.hasAttribute("data-first-room") && !el.querySelector(".ds-ch-count")) { requestAnimationFrame(() => land(n + 1)); return; }
            done();
            // In place (it was already drawn) it glides; arriving from another page it's simply there, as an anchor is. Its
            // box stays whole above the tour's strip, and no edge cuts a line (tour/edges.ts subjectLanding).
            const top = subjectLanding(Math.max(0, Math.round(el.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop || "0"))), null,
              [el.querySelector("#ds-ch-note")], (y) => y, FOOT_FADE);
            // The room cover says she arrived: the Challenge's start is drawn from the first frame now (Joshua's 3d), so a found-at-once head no longer means in place.
            const arrived = document.documentElement.hasAttribute("data-first-room");
            scrollTo({ top, behavior: n === 0 && !arrived && !still() ? "smooth" : "instant" });
            const h = el.querySelector<HTMLElement>("h2");
            if (h) { if (!h.hasAttribute("tabindex")) h.tabIndex = -1; h.focus({ preventScroll: true }); }
            roomArrived();
          };
          requestAnimationFrame(() => land(0));
        }
        break;
      case "ask":
      case "talk":
        setPane("ask");
        // The Ask box (or, for Talk, its mic; where the browser can't record there is no mic, so the box) takes focus.
        requestAnimationFrame(() => {
          const box = inputRef.current, mic = box?.parentElement?.querySelector<HTMLElement>(".dk-ic");
          const el = a === "talk" && mic ? mic : box;
          if (!el) return;
          landAbove(el);
          el.focus({ preventScroll: true });
        });
        break;
    }
  }
  // A menu link from another page lands here with its hash (`?desk=1#wants`): open it, then drop the hash.
  // A link to the same page with only a new hash doesn't reload it, so a hash change opens its item too. menuAct only
  // calls setters and refs, so the first render's copy is safe to keep.
  useEffect(() => {
    const open = () => {
      if (!backRun && location.hash === `#${MIXER_HASH}`) { // the tour's chip on the Watcher stop
        history.replaceState(null, "", location.pathname + location.search);
        if (viewNow.current !== "rest") startOver(); // mid-run the box isn't on screen: the words would wait where nobody sees them
        ready(MIXER_ASK);
        return;
      }
      const a = backRun ? null : menuActionOf(location.hash);
      if (!a) return;
      // A room reached by its address is this entry (B1): Back goes to where she came from, not to a landing she never saw.
      history.replaceState(["wants", "week", "settings", "after"].includes(a) ? { dk: a, below: [] } : history.state, "", location.pathname + location.search);
      menuAct(a);
    };
    open();
    addEventListener("hashchange", open);
    return () => removeEventListener("hashchange", open);
  }, []);
  // Voice opens a room of this page in place (Track V's go-to, "show me my priorities list": `goose:room` on window, its
  // detail the room's name, e.g. "wants"). Opening it here cancels the event, so the page doesn't reload to get there.
  useEffect(() => {
    const room = (e: Event) => {
      const a = backRun ? null : menuActionOf(`#${String((e as CustomEvent<unknown>).detail ?? "")}`);
      if (!a) return;
      e.preventDefault();
      menuAct(a);
    };
    addEventListener("goose:room", room);
    return () => removeEventListener("goose:room", room);
  }, []);

  function startOver() {
    asks.current++; // an answer still on its way belongs to what she left
    voiced.current = false; hushLines();
    setView("rest"); setPane("ask"); setOpener(null); setRead(null); setMarket(null); setCart(null); setNote(null); setBack(null); setWords("");
    if (backRun) history.replaceState(null, "", "?desk=1");
  }

  // Back and reload (Round 5's shopper seat, B1; desk-history.ts). The page says where it is; history follows it, and Back makes the
  // page match the entry it landed on.
  const place: Place = backRun ? null : view === "sheet" ? "sheet" : pane !== "ask" ? pane : view === "rest" ? null : "run";
  const placed = useRef(false);
  useEffect(() => { if (placed.current) followPlace(place); placed.current = true; }, [place]);
  /** The kept run on screen, finished. False when there's nothing to bring back. */
  const restore = () => {
    const k = keptDesk<Read, Market>();
    if (!k?.read) return false;
    setAsked(k.asked); setRead(k.read);
    if (k.market) { whole.current = true; setMarket(k.market); setView("run"); } else setView("understood");
    return true;
  };
  const onPop = useRef(() => {});
  onPop.current = () => {
    if (location.hash) return; // a hash link's own entry: the hash listener above answers it
    const to = entryNow().dk;
    if (to === null) history.scrollRestoration = "auto";
    if (to === place) return; // a button already moved the page, and this is history catching up
    if (to === null) {
      startOver(); scrollTo({ top: 0 });
      requestAnimationFrame(() => {
        const to = document.querySelector<HTMLElement>("#main, main");
        if (to && !to.hasAttribute("tabindex")) to.tabIndex = -1;
        to?.focus({ preventScroll: true });
      });
    } else if (to === "sheet") { if (market) setView("sheet"); else history.back(); }
    else if (to === "run") {
      if (view === "sheet") closeSheet();
      else {
        setPane("ask"); setOpener(null); scrollTo({ top: 0 });
        if (view === "rest" && !restore()) { history.replaceState(null, ""); return; }
        requestAnimationFrame(() => headRef.current?.focus({ preventScroll: true }));
      }
    } else menuAct(to as MenuAction);
  };
  useEffect(() => {
    const pop = () => onPop.current();
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  // A reload lands on an entry that names a place the page hasn't drawn yet. Before the first paint, so the landing doesn't show first.
  useLayoutEffect(() => {
    if (backRun || location.hash) return;
    const to = entryNow().dk;
    if (to === "sheet") history.back(); // the sheet's own "Why?" isn't there to go back to: the run under it comes back instead
    else if (to === "run") { if (!restore()) history.replaceState(null, ""); }
    else if (to !== null) menuAct(to as MenuAction);
  }, []);

  const results = market?.results ?? [];
  const done = market !== null && checked >= results.length;
  const deal = market ? deskDeal(results) : null;
  const best = dealSoFar(results, checked);
  const skipped = market ? (deskAside(results)[0] ?? null) : null;
  const peer = skipped ? peerWhy(skipped.said) : null;
  // Track SM: the instant a seller is set aside, the deal card's eyebrow says the payoff (not at done, 1–2 s later);
  // on a phone the same eyebrow and price are pinned at the top of the stage, so the money is in view as the case rises.
  const asideSeen = results.slice(0, checked).some((r) => r.watcher === "refuse");
  useEffect(() => { if (asideSeen && voiced.current) sayInTurn(VOICE_DECLINED); }, [asideSeen]);
  useEffect(() => { if (done && voiced.current) { voiced.current = false; sayInTurn(deal ? TAP_TO_BUY : VOICE_NO_DEAL); } }, [done]);
  // SM-7 (DD's SM-6 ruling 2, replacing SM-3's seed and SM-6's: the card said "Best so far $84.00" while Lantern Hall's
  // row still said "Reading its note…"): the price is only a seller's whose note has read clean, `best`, so it is drawn
  // in the frame its row says "Nothing set aside" (system.md §3). At a set-aside read first, the card draws its shield line alone
  // and grows down by the price one beat later. The number is never "…": its block is simply not drawn until then.
  const ticking = useTicker(best ? Number(best.price) : null);
  const f = view === "run" && done && skipped ? "protected" : LAYOUT[view];
  const payLine = paymentsWords(mode);
  const next = mode === "sandbox" ? "dk-next" : undefined;
  const live = view === "run" || view === "sheet";

  // DD H-4: the Watcher alone counts a seller unsafe; a seller over her cap is counted separately, as narrowing the choice.
  const checkedOpen = results.slice(0, checked).filter((r) => r.watcher !== "refuse").length;
  const narrowed = market?.heldBy && results.some((r) => r.over) ? market.heldBy : null;
  const underOpen = results.slice(0, checked).filter(deskOpen).length;
  // Track H-3 (DD H-4 nit): the run is titled by her words without the cap's words; the cap is on the deal card and the rows.
  const title = sentence(read?.title ?? asked).replace(/\.$/, "");
  // SM-5: the payoff is the protection line's (drawn from the verdict, above the price), so the eyebrow names the price.
  const dealEyebrow = done ? "Your deal" : "Best so far";
  // SM-5 (Round 3 design judge, "BEST SO FAR · …" for 0.5 s): the eyebrow and the price are drawn from the first row read
  // (its price, or at a set-aside the next open seller's); before that their place is held, empty: never "…".
  const priced = ticking !== null;
  const price = priced ? `${usdOf(ticking.toFixed(2))}` : "\u00a0";
  // SM-5: with a seller to set aside (code already knows), the protection line and the deal are one card from the run's
  // first frame, the line's place held (empty) until the verdict, when it is drawn in place: nothing on the card moves
  // at the verdict or at done, and the column never fades again (Round 3: it blinked to 0 and came back 94 px lower).
  const one = skipped !== null && deal !== null;
  // SM-7: the one card's two parts are each drawn from their own first content. The shield line alone from the verdict
  // until the price (the price's block is not drawn and holds no place: the card grows down when it comes); the price
  // alone if a clean row is read before the set-aside (the shield line's place held above it, undrawn, outside the frame).
  const part = !one || done ? undefined : asideSeen && !priced ? "shield" : priced && !asideSeen ? "price" : undefined;
  // SM-3: the pin's slot is held from the run's first frame when a seller will be set aside (code already knows), so its
  // line fades in at the verdict without pushing the heading and the sellers down; it is empty (opacity 0) until then.
  const pinned = live && skipped !== null && deal !== null;
  const pinRef = useRef<HTMLParagraphElement>(null);
  // The pin is solid only once it is stuck at the top (in flow it is a hairline on the page), and it steps aside
  // (opacity, --d-1) while the deal card or the protection card's own "Your money stays put." is in view, so the
  // sentence and the money are said once on any one screen (SM-3: the card's head too, Round 2's "twice at done").
  // SM-5: the card's sentence is drawn from the verdict now, often in view while its price is under the rail (390×844):
  // then the pin shows the price alone (data-short), so the money is in view and the sentence is still said once.
  useLayoutEffect(() => {
    const pin = pinRef.current, card = document.querySelector(".dk-live-grid .dk-deal2"), stay = document.querySelector(".dk-live-grid .dk-stay"), big = document.querySelector(".dk-live-grid .dk-deal2 .dk-big");
    if (!pinned || !pin || !card || innerWidth > 720) return;
    // It sticks under the bar (S1-13: the bar is sticky on a phone too), so "stuck" and "in view" start at the bar's foot.
    const bar = pinnedBar();
    const stuck = new IntersectionObserver(([e]) => { pin.toggleAttribute("data-stuck", e!.intersectionRatio < 1 && e!.boundingClientRect.top <= bar); }, { threshold: [1], rootMargin: `-${bar + 1}px 0px 0px 0px` });
    // "In view" means nearly whole between the pin and the screen's foot (no bottom rail since S1-13); a card cut by the
    // fold still needs the pin.
    const inView = new Map<Element, boolean>();
    const apply = () => {
      const cardIn = !!inView.get(card), stayIn = !!(stay && inView.get(stay)), bigIn = !!(big && inView.get(big));
      pin.toggleAttribute("data-hidden", cardIn || (stayIn && bigIn) || (stayIn && !big));
      pin.toggleAttribute("data-short", stayIn);
    };
    // The observer's first answer comes a frame late, so the first painted frame is measured here (reduced motion
    // reaches done in one frame: without this the pin and the card said the sentence together for that frame).
    const top = bar + pin.offsetHeight, bottom = innerHeight;
    for (const e of [card, stay, big]) {
      if (!e) continue;
      const r = e.getBoundingClientRect();
      inView.set(e, r.height > 0 && (Math.min(r.bottom, bottom) - Math.max(r.top, top)) / r.height >= 0.89);
    }
    apply();
    const seen = new IntersectionObserver((es) => { for (const e of es) inView.set(e.target, e.intersectionRatio >= 0.89); apply(); },
      { rootMargin: `-${top}px 0px 0px 0px`, threshold: [0, 0.9] });
    stuck.observe(pin); seen.observe(card); if (stay) seen.observe(stay); if (big) seen.observe(big);
    return () => { stuck.disconnect(); seen.disconnect(); };
  }, [pinned, done]);
  // SM-6 (Round 4 design judge: one row over ~140 px of empty bordered list for ~1 s): every row (and the set-aside's
  // case) holds its place from the run's first frame, so nothing moves; the list's frame (its ::before, desk.css) hugs
  // only what is drawn: the rows that have landed, a held case left out. The held places sit below the frame, unframed.
  const feedRef = useRef<HTMLOListElement>(null);
  const hug = () => {
    const ol = feedRef.current;
    if (!ol) return;
    let bottom = 0;
    for (const li of ol.children as HTMLCollectionOf<HTMLElement>) {
      if (li.hasAttribute("data-wait")) break;
      // A row with its case held ends where a row without one would: its first line plus its own bottom padding.
      const held = li.querySelector<HTMLElement>(".sm-case[data-wait]"), s = getComputedStyle(li);
      const drawn = held ? held.offsetTop - parseFloat(s.rowGap) + parseFloat(s.paddingBottom) : li.offsetHeight;
      bottom = li.offsetTop + drawn;
      // The row's reading line sits under its drawn part, not under the held case (desk.css reads --held).
      if (held) li.style.setProperty("--held", `${Math.round(li.offsetHeight - drawn)}px`); else li.style.removeProperty("--held");
    }
    ol.style.setProperty("--drawn", `${Math.round(bottom)}px`);
    ol.toggleAttribute("data-drawn", bottom > 0);
  };
  useLayoutEffect(hug); // every render, before its paint: a row lands, a case is drawn
  useEffect(() => {
    const ol = feedRef.current;
    if (!ol) return;
    const ro = new ResizeObserver(hug); // a new width rewraps the case
    ro.observe(ol);
    return () => ro.disconnect();
  }, [market, view]);
  const was = done && deal ? market?.recorded?.was[deal.id] : undefined;
  /** The cart can still be paid: the steps ahead and what the tap seals are drawn (not on a refused cart or one that can't pay). */
  const payable = cart?.kind !== "refused" && !(cart?.kind === "cart" && !cart.canPay);
  // While Egg's chunk loads. A still that fails to load steps aside (no broken-image box), as Egg's own still does.
  const eggFallback = <div className="dk-egg"><div className="dk-egg-body"><img className="dk-egg-still" src={eggStill} alt="" width={600} height={720} onError={(e) => { e.currentTarget.style.display = "none"; }} /></div><div className="dk-egg-shadow" /></div>;

  // The Ask box: in the hero on the landing, at the top of the workspace once she has asked.
  // A failed ask's one action: no market (or words to change) puts her words back; a server trouble that can help
  // asks the same read again with the same words (understand, or the market ask); a cap, where any fresh ask fails today,
  // goes to the recorded week, which needs no market (the DD, DK part 9); offline has none while offline (DK-13: back
  // online with changed words, a failed Shop gets Try again, below), as it asks again by itself
  // once she is back (its line says so), and a link would need the network it lacks.
  // Words that name nothing to buy (`notAnAsk`): not "no market yet", since none is coming for them.
  // A question or a sentence about her day (B1) gets the same, and a way to what she was after.
  const talk = failed === A_QUESTION || failed === NO_ITEM;
  const notAsk = talk || NOT_AN_ASK_LINE.test(failed ?? "");
  const failAction: WayForward | null = !isFailed ? null
    : !trouble || asksToReword(failed) ? { label: "Change my words", onClick: changeWords }
    : TROUBLE[trouble].retry ? { label: "Try again", onClick: () => { if (read) shopTap(asked); else void ask(asked); } }
    // DK-13: back online, a Shop that failed offline is asked again only by her press, with the bubble's words (the
    // read she shopped for); the box keeps whatever she typed (shopOnce never writes it unless it is empty).
    : wasOffline && read ? { label: WAS_OFFLINE.action, onClick: () => shopTap(asked) }
    : trouble === "capped" ? WEEK_WAY : null;
  // While the cap is on screen the send arrow dims for the words that hit it: those can't go today, so it doesn't
  // invite the same refusal again (the block above says why; its link is the way forward). The DD (part 10): once she
  // edits them it lights, since words that name a recorded item still shop under the cap (main.ts runs them uncapped).
  const capped = isFailed && trouble === "capped" && words.trim() === asked.trim();

  const askBox = (
    <>
      <form className="dk-ask" onSubmit={(e) => { e.preventDefault(); if (!capped) void ask(words); }} onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`); e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`); }}>
        <input ref={inputRef} aria-label="Ask for anything" placeholder={app ? "Ask for something else" : HINTS[hint]} value={words} maxLength={ASK_MAX} autoComplete="off" enterKeyHint="go" onChange={(e) => setWords(e.target.value)} />
        {/* The mic only fills the box (Joshua, Oct 30): the words land here, editable, and the shopper taps Ask. */}
        <Kept><HoldToTalk className="dk-ic" onText={(said) => setWords((w) => heard(w, said))} onState={(m) => setMicLine(m.kind === "off" ? "" : micWords(m))}><Use id="mic" /></HoldToTalk></Kept>
        <button className="dk-go" aria-label="Ask Goose" aria-describedby={cueOn && view === "rest" ? "dk-cue" : undefined} disabled={view === "asking" || reading || capped} data-off={capped ? "cap" : undefined}><Use id="arrow" /></button>
      </form>
      {micLine && <p className="dk-mic-line" aria-hidden="true">{micLine}<br /><span>{VOICE_LINE}</span></p>}
      {cueOn && !micLine && view === "rest" && <p className="dk-cue" id="dk-cue">{WATCH_CUE}</p>}
    </>
  );

  return (
    <div ref={rootRef} className="dk" data-palette="v" data-f={f} data-layer="shopper" data-app={app || undefined}>
      {/* Zero-size, not display:none: Chrome paints no gradient from a hidden sprite. */}
      <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute"><defs>${SPRITE}</defs></svg>` }} />
      <div className="dk-grain" aria-hidden="true" />
      {/* The one nav, on every route (Joshua, Fri 3:40 PM; S1): web/src/nav. Its brand and Shopper start over in place. */}
      {/* The open room is the menu's current item (its dot, aria-current="page"); the landing has none. */}
      <Kept><SiteNav here="shop" onHome={startOver} onAction={menuAct} current={app || opener ? currentItem(MENU_INDEX_ITEMS, pane, opener) : undefined} /></Kept>

      <main id="main" className="dk-wrap">
        {app ? (
          <div className="dk-app">
            {/* DK (Joshua, Sat Oct 31 3:30 AM: "No left sidebar"): no rail here at any width. Every room and feature is on
                the "Everything Goose does" menu in the bar, at every width. */}
            <div className="dk-work">
              {pane === "week" ? <WeekPane.Now fallback={<RoomWait />} onAsk={askHere} />
                : pane === "wants" ? <WantsPane.Now fallback={<RoomWait />} onWeek={() => { setPane("week"); setOpener(null); }} onAsk={() => menuAct("ask")} onDeal={askHere} />
                : pane === "settings" ? <SettingsPane.Now fallback={<RoomWait />} />
                : pane === "after" ? <Suspense fallback={<RoomWait />}><Kept or={<RoomThrew />}><AfterPay room runId={lastRunHere()} onAsk={() => menuAct("ask")} /></Kept></Suspense>
                : <>
                  {/* While the card waits for her yes it leads; the Ask box follows it, quiet (Desk-S6). */}
                  {view !== "understood" && <div className="dk-work-ask">{askBox}</div>}
                <section ref={stageRef} className="dk-stage" aria-label="Goose at work" aria-busy={view === "asking" || (live && !done) || busy !== null || undefined}>
                  {view === "understood" && read && (
                    <div className="dk-s-ut">
                      <p className="dk-asked"><span className="dk-sr">You asked: </span>{asked}</p>
                      <h1 ref={headRef} tabIndex={-1}>{UNDERSTOOD}</h1>
                      <div className="dk-ut">
                        <dl>
                          <div><dt>Item</dt><dd className="dk-ut-item">{read.item}</dd></div>
                          {read.details.length > 0 && (
                            <div><dt>Details</dt><dd><ul className="dk-tags" aria-label="Color and size">
                              {read.details.map((d) => (
                                <li key={d.kind}>{d.label}<button type="button" aria-label={`Take off ${d.label}`} disabled={reading} onClick={() => void ask(d.without)}><span aria-hidden="true">×</span></button></li>
                              ))}
                            </ul></dd></div>
                          )}
                          {/* The limit once, set large; her price (if she named one) is said back in one line; the why waits behind a tap. */}
                          <div><dt>Up to</dt><dd>
                            <p className="dk-ut-held"><span className="dk-ut-lim">{usdOf(read.held)}</span> <span className="dk-ut-cat">{read.heldBy}</span></p>
                            {/* Track H-3: a cap she said is held under the limit; the line says both when they differ. */}
                            <p>{read.cap ? read.line : read.said ? priceNotLimit(read.said) : "Your cart is held to it."}</p>
                            <details className="dk-ut-why"><summary>Why this limit?<svg viewBox="0 0 12 8" aria-hidden="true"><path d="m1 1.5 5 5 5-5" /></svg></summary>{/* H-6 (Round 4 data, F8): when her cap holds, the big number is hers, so its reason comes first. */}{capHolds(read) && <p>{CAP_WHY}</p>}<p>{read.because}</p>{read.cap ? !capHolds(read) && <p>{CAP_WHY}</p> : read.said && <p>{PRICE_WHY}</p>}</details>
                          </dd></div>
                        </dl>
                        <div className="dk-ut-act">
                          <button type="button" className="dk-approve" onClick={() => shopTap(asked)}>Shop for this <Use id="arrow" /></button>
                          <button type="button" className="dk-why-btn" onClick={changeWords}>Change my words</button>
                        </div>
                      </div>
                      {/* The Ask box follows the card in reading order; on a wide screen it sits under the heading (Desk-S7). */}
                      <div className="dk-work-ask dk-work-after">{askBox}</div>
                    </div>
                  )}

                  {(view === "asking" || isFailed) && (
                    <div className="dk-s-wait" role="status" data-trouble={isFailed && trouble ? trouble : undefined}>
                      <div className="dk-runhead">
                        <span className={`dk-live${isFailed ? " dk-done" : ""}`}><i />{isFailed ? (trouble ? "Nothing changed" : notAsk ? "No market" : "No market yet") : "Asking around"}</span>
                      </div>
                      {/* DK (item 5): each failure says what it is, as the DD's state block (§10.9): offline, the server
                          waking or not answering, today's cap (the server's own words), its error, or no market. The
                          status line above says "Nothing changed"; the line under the head gives only the cause. A cap
                          offers no Try again (asking again can't help today); offline asks again by itself; no market
                          (her words need changing) puts her words back in the Ask box (the DD, check 2 f). */}
                      {/* DK part 8 (the DD on quiet-failed-390): when the server failed her, the title stays her ask, the
                          failure is said under it, and the action is drawn even before the kit's chunk (a plain pill of
                          the same class), so a failure is never a dead end. Try again asks the same read again. */}
                      <h1 ref={headRef} tabIndex={-1}>{isFailed && notAsk ? DIDNT_SHOP : isFailed && !trouble ? "No market for that yet." : sentence(asked).replace(/\.$/, "")}</h1>
                      {isFailed ? (
                        <>
                          {trouble && <p className="dk-s-why">{wasOffline ? WAS_OFFLINE.title : TROUBLE[trouble].title}</p>}
                          <p className="dk-fiction">{failed ? (trouble ? causeOnly(failed, trouble) : failed) : trouble === "offline" && (!sameWords || online) ? OFFLINE_STAYS : (trouble ? TROUBLE[trouble].line : TROUBLE.error.line)}{talk && <> <LinkBtn to="?desk=how">How it works</LinkBtn></>}</p>
                          {failAction && <Suspense fallback={<PlainAction {...failAction} />}><Kept or={<PlainAction {...failAction} />}><StateAction {...failAction} /></Kept></Suspense>}
                        </>
                      ) : (
                        // SM-6: the line alone, no dashed empty rows (a skeleton, system.md §3); the sellers come with the run.
                        <Suspense fallback={<AskingLine />}><Kept or={<AskingLine />}><Asking quiet={quiet} /></Kept></Suspense>
                      )}
                    </div>
                  )}

                  {live && market && (
                    <div className={`dk-s-live${pinned ? " sm-held" : ""}`}>
                      {/* Track SM, phone only (moment.css): the deal card's eyebrow and price pinned under the nav from the first
                          set-aside on, so the money stays in view while the case rises in the row below. The card itself says it (aria-live). */}
                      {pinned && (
                        <p ref={pinRef} className="sm-pin" aria-hidden="true" data-wait={!asideSeen || undefined}>
                          <span className="sm-pin-stay">Your money stays put.</span>
                          <span className="sm-pin-deal" data-wait={!priced || undefined}><span className="dk-eyebrow">{done ? "Your deal" : "Best so far"}</span><b>{price}</b></span>
                        </p>
                      )}
                      {/* On a wide screen the deal stands level with the heading, on the right, from the top (Desk-S6). */}
                      {/* Round 6b B1: once the deal has landed, Goose's caption bar steps aside rather than sit over the run (captions.ts). */}
                      <div className="dk-live-grid" data-landed={done || undefined}>
                      <div className="dk-live-head">
                      <div className="dk-runhead">
                        {/* The set-aside pile's count (Joshua, Nov 5, §1a): each set-aside row below says why; the deal card is the pick. */}
                        <span className={`dk-live${done ? " dk-done" : ""}`}><i />{done ? deskPile(results) : "Goose is shopping"}</span>
                        <div className="dk-steps" aria-label={done ? "Step 2 of 3: your cart" : "Step 1 of 3: search"}><span>Search</span><span className={`dk-dot${done ? " dk-on" : ""}`} /><span className={done ? "dk-now" : ""}>Cart</span><span className="dk-dot" /><span>Pay</span></div>
                      </div>
                      <h1 ref={headRef} tabIndex={-1}>{title}</h1>
                      {/* "Fictional" is said once, here, with who made the sellers and the planted scam: the demo's one
                          honesty line (the DD, check 2: the two lines and the footnote are one); seller names below drop it. */}
                      <p className="dk-fiction">{marketLine(market.madeBy)}</p>
                      </div>
                        <ol ref={feedRef} className="dk-feed" aria-label="Sellers Goose found" style={{ "--n": results.length } as React.CSSProperties}>
                          {/* SM-5: every seller's row is in the list from the run's first frame, its place held (hidden) until it
                              arrives, so the rows still to come never push the deal card down (on a phone, $84.00 moved 91 px). */}
                          {results.map((r, i) => {
                            const read = i < checked;
                            const v = !read ? "dk-reading" : r.watcher === "refuse" ? "dk-aside" : r.over ? "dk-over" : r.watcher === "hold" ? "dk-held" : "dk-clear";
                            return (
                              <li key={r.id} className={`dk-fr ${v}${read && r.id === best?.id ? " dk-best" : ""}`} data-wait={i >= arrived || undefined}>
                                <span className="dk-pic" aria-hidden="true">{sellerName(r.merchant).charAt(0)}</span>
                                {/* SM-6: the status line's last words (data-final, an invisible twin in desk.css) hold its height from the start. */}
                                <span className="dk-who" data-final={read ? undefined : watcherSays(r, r.id === deal?.id, r.over)}>
                                  {/* S1-9 (Round 3's consumer: tapping a seller "does nothing"): once the run is done, the set-aside's row
                                      opens its Why sheet and the deal's row its details, the sheets "Why?" and "View details" open. S1-11
                                      (Round 4's consumer: Pondside, Larkspur and Juniper still did nothing): every other row opens the same
                                      sheet with the row's own facts. The name is the button; its hit area is the row. */}
                                  {done && read
                                    ? <button type="button" className="dk-name dk-row-go" aria-label={r.id === skipped?.id ? `${sellerName(r.merchant)}: why Goose set it aside` : r.id === deal?.id ? `${sellerName(r.merchant)}: deal details` : `${sellerName(r.merchant)}: details`} onClick={(e) => openSheet(e.currentTarget, r.id === skipped?.id ? "why" : r.id === deal?.id ? "deal" : "row", r.id)}>{sellerName(r.merchant)}</button>
                                    : <span className="dk-name">{sellerName(r.merchant)}</span>}
                                  <span className="dk-st"><i />{!read ? "Reading its note…" : watcherSays(r, r.id === deal?.id && done, r.over)}</span>
                                </span>
                                <span className="dk-price">{usdOf(r.price)}</span>
                                {/* Track SM: the moment the Watcher sets a seller aside, its words rise into a sealed case under the row (the deal card, another column, stays put). */}
                                {/* SM-6 (Round 4, the 390 snap): the case is in the row from the run's first frame, its place held (empty,
                                    below the list's drawn frame) until the verdict, so nothing under it moves when it rises. */}
                                {r.watcher === "refuse" && <Case.Now key={r.id === skipped?.id ? `${r.id}-${replay}` : r.id} quoted={r.quoted} held={!read} />}
                              </li>
                            );
                          })}
                        </ol>

                        {/* SM-6 (Round 4 design judge: an empty glass panel for ~0.5 s): the column holds its place undrawn, no
                            frame and no words, until its first content (the price, with the verdict's line), then draws whole. */}
                        <div className={`dk-right${one ? " dk-one" : ""}`} ref={rightRef} data-wait={(!priced && part !== "shield" && !done) || undefined} data-part={part}>
                          {/* On a phone the deal is brought up past the heading, so it carries her ask in small type (aria-hidden: the heading says it). */}
                          {done && <p className="dk-right-ask" aria-hidden="true">{title}</p>}
                          {one && skipped && (
                            <div className="dk-protect" role="status" data-wait={!asideSeen || undefined}>
                              <svg className="dk-protect-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75 4.5 5.5v5.8c0 4.6 3.1 8.6 7.5 9.95 4.4-1.35 7.5-5.35 7.5-9.95V5.5L12 2.75Z" /><path d="m8.6 12.1 2.4 2.4 4.4-4.9" /></svg>
                              <div>
                                <h3 aria-level={2}>Goose set {sellerName(skipped.merchant)} aside.</h3>
                                <p className="dk-stay">Your money stays put. <button type="button" className="dk-why-btn" onClick={(e) => openSheet(e.currentTarget)}>Why?</button></p>
                              </div>
                            </div>
                          )}
                          {best || deal ? (
                            <>
                            {/* The one material card (Joshua, Oct 30): the deal, lit like an object in a case. */}
                            <article className={`dk-deal2 dk-mat${done ? " dk-final" : ""}`} aria-live="polite" onClick={keepApproveInView}>
                              <div className="dk-eyebrow" data-wait={!priced || undefined}>{dealEyebrow}{best && (done || !asideSeen) ? ` · ${sellerName(best.merchant)}` : ""}</div>
                              <div className="dk-pr">
                                <div className="dk-big" aria-hidden={!done || undefined} data-wait={!priced || undefined}>{price}</div>
                              </div>
                              {done && deal ? (
                                <>
                                  {/* The same words, in phrases that each wrap whole (Desk-S7). */}
                                  <p className="dk-lim"><i />{deal.watcher === "hold" ? `Held for your yes: ${deal.said.join("; ")}`
                                    : narrowed && heldByCap(narrowed) ? <><span className="dk-sent">{underWords(underOpen, narrowed)} ·</span> <span className="dk-sent">no scam wording</span></>
                                    : skipped ? <span className="dk-sent">{safeWords(checkedOpen)}</span> : <span className="dk-sent">No scam wording · lowest of {checkedOpen} sellers</span>}</p>
                                  {market.read && <ReadChip.Now read={market.read} brief words={asked} fallback={<div style={{ minHeight: 44 }} aria-hidden="true" />} />}
                                  {/* What code checked, folded: every line is the run's (the Watcher, the limit, the bound amount). */}
                                  <details className="dk-before">
                                    <summary><span>Before you approve</span><i aria-hidden="true" /></summary>
                                    <ul>
                                      {/* The DD (check 2): the day-1 price is here with its reason, never struck alone on the
                                          face, where a struck price reads as a made-up markdown. */}
                                      {was && <li className="dk-was-li">Was <s className="dk-was">{usdOf(was.total)}</s> {was.whose}. {was.line}</li>}
                                      {skipped && <li>The Watcher set {sellerName(skipped.merchant)} aside: {skipReason(skipped.said)}.</li>}
                                      {market.limitWhy && <li>{market.limitWhy}</li>}
                                      {market.capSays && <li>{market.capSays}</li>}
                                      <li>{boundLine(deal.price)}</li>
                                      {/* What the steps below mean and what the tap seals (DK: "How this works" went). */}
                                      {payable && stepsGloss(intent) && <li>{stepsGloss(intent)}</li>}
                                      {payable && (cart?.kind === "cart" ? TRAIL_WORDS.sealed : sealsAtTap(intent)) && <li>{cart?.kind === "cart" ? TRAIL_WORDS.sealed : sealsAtTap(intent)}</li>}
                                      {/* The DD's condition: the practice-site line takes the who-pays line's place, so that promise stays one tap away. */}
                                      {next && payable && <li>{payLine}</li>}
                                    </ul>
                                  </details>
                                  <CartSays cart={cart} note={note} />
                                  {/* S1-6 (Round 2 judges' top fix): what happens after the tap is on the card from the start, open; the
                                      cart's mark joins once the guard binds the cart at the tap. Not on a refused cart or one that can't pay. */}
                                  {/* SM-5: fetched with the market (shop), so it is drawn in done's own frame; if its chunk is still on the way, its
                                      place is held at its height (.tl-hold), so Approve never moves when it lands. */}
                                  {payable && <Trail.Now fallback={<div className="tl-hold dk-before" aria-hidden="true" />} hash={cart?.kind === "cart" ? cart.hash : undefined} intent={intent} practice={mode === "fake"} />}
                                  {!(cart?.kind === "refused") && (
                                    cart?.kind === "cart" && cart.holds.length > 0 && cart.canPay
                                      ? <button type="button" className="dk-approve" disabled={busy !== null || !online} aria-describedby={next} onClick={() => void pay(cart.runId)}><Use id="lock" />{busy === "pay" ? "Opening PayPal…" : `Yes, approve ${usdOf(cart.total)}`}</button>
                                      : cart?.kind === "cart" && !cart.canPay ? null
                                      : <button type="button" className="dk-approve" disabled={busy !== null || !online} aria-busy={busy !== null || undefined} aria-describedby={next} onClick={() => void approve(deal)}><Use id="lock" />{busy === "cart" ? "Asking the guard…" : busy === "pay" ? "Opening PayPal…" : `Approve ${usdOf(deal.price)}`}</button>
                                  )}
                                  {/* Track C (surface words): one link under the card; the deal's details open from its row. */}
                                  {next && payable ? <p className="dk-practice" id={next}>{SANDBOX_NEXT}</p> : <div className="dk-deal-foot">
                                    <p className="dk-onlytap">{payLine.split(/(?<=\.) /).map((t, i) => <Fragment key={i}>{i > 0 && " "}<span className="dk-sent">{t}</span></Fragment>)}</p>
                                  </div>}
                                  {/* Track H: how Goose bargains, as a ladder and a conversation (`?desk=haggle`). This market compared listed prices, so the page says so and shows the recorded week's haggle. */}
                                  {done && <LinkBtn to="?desk=haggle&from=desk">Watch the haggle</LinkBtn>}
                                </>
                              ) : <p className="dk-waited">Comparing as Goose reads each note.</p>}
                            </article>
                            </>
                          ) : done ? (
                            <article className="dk-deal2 dk-nodeal">
                              {/* H-7 (DD at H-6): the deal card's eyebrow, so a deal card and a no-deal card open the same way. */}
                              <div className="dk-eyebrow">No deal</div>
                              {/* Track H-3 (DD H-4): when no seller left is under her cap, say so and name the cheapest price left. */}
                              <p className="dk-waited">{narrowed && cheapestSafe(results) ? noDealUnder(narrowed, cheapestSafe(results)!.price) : results[0] ? "Goose set aside every seller here, so nothing can be bought." : deskPile(results)}</p>
                              {/* H-6 (Round 4 judges, fix 5): the Watcher's verdict stays on the card, not only on its row. */}
                              {narrowed && skipped && cheapestSafe(results) && (
                                <p className="dk-nodeal-aside"><i aria-hidden="true" />Goose set {sellerName(skipped.merchant)} aside. <button type="button" className="dk-why-btn" onClick={(e) => openSheet(e.currentTarget)}>Why?</button></p>
                              )}
                              {/* H-6: the second choice is to wait for a price under what she's held to: the same want the deal card's
                                  Keep watching saves, its max her cap. Only for a recorded item, the one the price watch can watch. */}
                              <div className="dk-nodeal-act">
                                {narrowed && market.recorded && read && cheapestSafe(results) && <Kept><KeepUnder catalogId={market.recorded.catalogId} held={toCents(read.held)} /></Kept>}
                                <button type="button" className={narrowed && market.recorded && read && cheapestSafe(results) ? "dk-pill" : "dk-approve"} onClick={startOver}>Ask for something else</button>
                              </div>
                            </article>
                          ) : null}
                          {/* The shopping-run AI reader (Joshua, Nov 6: "on timeout or cap it falls back to code-only and says so on
                              the run"): whether it read, and if not, that code's read stands alone. On the run, open, under the deal
                              card or the no-deal card alike, so a run where every seller was held or set aside still says it (Q). The status
                              region is drawn before the words, so a screen reader hears them when they come. */}
                          <div role="status">{done && market.readerSays && <p className="dk-reader">{market.readerSays}</p>}</div>
                        </div>
                        {/* The quiet second choice: under the sellers on a wide screen (the deal card stands alone), after the deal on a phone. */}
                        {done && deal && market.recorded && cart?.kind !== "refused" && <Watch.Now catalogId={market.recorded.catalogId} offer max={read ? toCents(read.held) : undefined} />}
                        {done && <Suspense fallback={null}><Kept><RealPrices words={asked} /></Kept></Suspense>}
                      </div>
                    </div>
                  )}

                  {view === "back" && (
                    <div className="dk-s-deal">
                      <article className="dk-paid" aria-busy={back === null || undefined}>
                        {back?.ok && !back.card ? <svg className="dk-check" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" /><path d="M14 24.5l6.5 6.5L34 17.5" /></svg> : <span className="dk-pic"><Use id="parcel" /></span>}
                        <div className="dk-k">{[back?.item, back?.merchant && sellerName(back.merchant)].filter(Boolean).join(" · ") || "Your cart"}</div>
                        <h1 ref={headRef} tabIndex={-1} className="dk-big">{back === null ? "Checking…" : back.gone ? CART_GONE.title : back.card?.head ?? (back.ok ? `Paid ${usdOf(back.total)}` : "Waiting on PayPal")}</h1>
                        <p className="dk-waited">{back === null ? "Asking the server what PayPal said." : back.gone ? CART_GONE.line : back.card?.line ?? (back.ok ? !back.mine ? PAID_ELSEWHERE : "You approved this exact cart in PayPal, and code checked it again before taking payment." : back.reason ? sentence(back.reason) : "No answer from PayPal yet on this cart.")}</p>
                        {back?.ok && !back.card && <p className="dk-receipt">{payLine}</p>}
                        {/* S1-4: the engineering on the card, from the run's rows (until its chunk lands: the order id alone). */}
                        {back !== null && !back.gone && backRun && <Trail.Now fallback={back.orderId && <span className="dk-mono">{back.orderId}</span>} runId={backRun} orderId={back.orderId} intent={intent} practice={mode === "fake"} />}
                        {/* S1: tracking, Undo and "if it never arrives", on the receipt itself. */}
                        {back?.ok && back.mine && backRun && <Suspense fallback={null}><Kept><AfterPay runId={backRun} /></Kept></Suspense>}
                        <button type="button" className="dk-btn2" onClick={startOver}>Ask for something else</button>
                        {/* Track J: the judge path's next step (Paid → Behind the scenes) on the card itself, as the sheets have it. */}
                        {back !== null && <LinkBtn to="?desk=ledger">{BEHIND}</LinkBtn>}
                      </article>
                    </div>
                  )}
                </section>
                </>}
            </div>
          </div>
        ) : (
          <Landing ask={<>
            {/* Track V: "Good evening, Sam. Where would you like to begin?", the name from this browser only. */}
            <Kept><Greeting /></Kept>
            {askBox}
          </>} egg={<Suspense fallback={eggFallback}><Kept or={eggFallback}><Egg glow={f === "protected"} /></Kept></Suspense>} chips={CHIPS} onAsk={(w) => void ask(w)} sub={
            <p className="dk-sub">Goose shops for you. Nothing is paid until you tap.</p>
          } />
        )}
      </main>
      <footer className="dk-wrap"><p className="dk-footer">Fictional sellers. Practice only: no real money. {payLine}</p></footer>

      {view === "sheet" && (sheetKind === "why" ? skipped : sheetKind === "deal" ? deal : results.find((x) => x.id === sheetRow)) && (
        <>
          <div className="dk-scrim" aria-hidden="true" onClick={closeSheet} />
          <div ref={sheetRef} className="dk-sheet" role="dialog" aria-modal="true" aria-labelledby="dk-sh-t">
            <div className="dk-handle" />
            {sheetKind === "why" && skipped ? (
              <>
                                <h3 id="dk-sh-t" tabIndex={-1}>Why Goose set {sellerName(skipped.merchant)} aside</h3>
                <ul className="dk-reasons">
                  {/* SM-4 (DD nit): each reason ends with its full stop, as the two sentences under it do. */}
                  {skipped.said.map((s) => <li key={s}><i />{sentence(s)}</li>)}
                  {/* Track S (Tier 2c): a peer scam's plain why. PayPal's sentence is copied whole, with its page (docs/claims.md). */}
                  {peer && <li className="dk-calm"><i /><span>{peer.line}{peer.quote && <> {peer.lead} “{peer.quote}” <a className="dk-why-btn" href={peer.source} target="_blank" rel="noopener noreferrer">Read PayPal's page</a></>}</span></li>}
                  <li className="dk-calm"><i /><span>{READER_NOTE}</span></li>
                  <li className="dk-calm"><i /><span>Its note is data. Goose never follows it. {skipped.quoted.trim() !== "" && <button type="button" className="dk-why-btn sm-again" onClick={replayCase}>Show its words again</button>}</span></li>
                </ul>
                <div className="dk-safe"><svg className="dk-protect-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75 4.5 5.5v5.8c0 4.6 3.1 8.6 7.5 9.95 4.4-1.35 7.5-5.35 7.5-9.95V5.5L12 2.75Z" /><path d="m8.6 12.1 2.4 2.4 4.4-4.9" /></svg><span>Your limit lives in code. A seller's words can't change it.</span></div>
              </>
            ) : sheetKind === "deal" ? deal && (
              <>
                                <h3 id="dk-sh-t" tabIndex={-1}>How Goose reached {usdOf(deal.price)}</h3>
                <dl className="dk-facts">
                  <div><dt>Seller</dt><dd>{sellerName(deal.merchant)}</dd></div>
                  <div><dt>Price</dt><dd>Not set aside · lowest of {checkedOpen} sellers</dd></div>
                  <div><dt>Record</dt><dd>{recordWords(deal.history)}</dd></div>
                  {noteWords(deal.quoted) !== null && <div><dt>Its note</dt><dd>“{noteWords(deal.quoted)}” <span className="dk-small">Read as data, never followed.</span></dd></div>}
                  <div><dt>Watcher</dt><dd>{deal.watcher === "hold" ? `Held for your yes: ${deal.said.join("; ")}` : "No scam wording found"}</dd></div>
                  <div><dt>Paying</dt><dd>{payLine}</dd></div>
                </dl>
              </>
            ) : (() => {
              // S1-11: any other seller's row, in the row's own words: its price (and the cap it is over), its note read as
              // data, and the Watcher's line the row shows. Nothing here is new: the row says each of these.
              const r = results.find((x) => x.id === sheetRow);
              if (!r) return null;
              return (
                <>
                  <h3 id="dk-sh-t" tabIndex={-1}>{sellerName(r.merchant)}</h3>
                  <dl className="dk-facts">
                    <div><dt>Price</dt><dd>{usdOf(r.price)}{r.over ? ` · ${r.over}` : ""}</dd></div>
                    {noteWords(r.quoted) !== null && <div><dt>Its note</dt><dd>“{noteWords(r.quoted)}” <span className="dk-small">Read as data, never followed.</span></dd></div>}
                    <div><dt>Watcher</dt><dd>{watcherSays(r)}</dd></div>
                  </dl>
                </>
              );
            })()}
            <div className="dk-acts">
              <LinkBtn to="?desk=ledger">{BEHIND}</LinkBtn>
              <button ref={gotItRef} type="button" className="dk-btn2" onClick={closeSheet}>Got it</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** The guard's answer on the deal card: its reason, word for word, and what it means for paying. */
function CartSays({ cart, note }: { cart: Cart | null; note: string | null }) {
  if (note) return <p className="dk-said" role="alert">{note}</p>;
  if (!cart) return null;
  if (cart.kind === "refused") return <p className="dk-said" role="status"><b>The guard said no. Nothing was bought.</b> {sentence(cart.reason)}</p>;
  if (cart.kind === "missing") return <p className="dk-said" role="status">{sentence(cart.reason)}</p>;
  if (!cart.canPay) return <p className="dk-said" role="status">{cart.reason} PayPal isn't connected on this server, so this cart can't be paid here.</p>;
  if (cart.holds.length > 0) return <p className="dk-said" role="status"><b>Goose wants your yes first:</b> {cart.holds.join("; ")}.</p>;
  return null;
}

/** Her cap holds this ask (it is under the limit): the understood card's big number is hers. */
const capHolds = (read: { cap: string | null; heldBy: string }): boolean => read.cap !== null && read.heldBy === "your cap";

/** H-6 (Round 4 judges, fix 5): the No deal card's "Keep watching for $80.00 or less" (DD at merge: the watch fires at or below the cap, so "under" claimed more than the code). The same want the deal card's Keep
 *  watching saves (`/api/runs/wants`, "really want"), sent with `max` = what she's held to, so the price watch waits for her
 *  cap, not the category's limit. A want only waits: nothing here binds a cart or pays. */
function KeepUnder({ catalogId, held }: { catalogId: string; held: Cents }) {
  const [st, setSt] = useState<{ kind: "idle" | "busy" } | { kind: "saved" | "error"; line: string }>({ kind: "idle" });
  async function keep() {
    setSt({ kind: "busy" });
    try {
      const r = await json<{ error?: string; wants?: { catalogId: string; max: string }[] }>("/api/runs/wants", { catalogId, priority: "really", max: held });
      const want = r.data.wants?.find((w) => w.catalogId === catalogId);
      setSt(r.data.error || !want ? { kind: "error", line: r.data.error ?? "That didn't save. Nothing changed." } : { kind: "saved", line: watchingLine(want.max) });
    } catch (e) { setSt({ kind: "error", line: troubleNote(e) }); }
  }
  return (
    <>
      <button type="button" className="dk-approve" disabled={st.kind === "busy" || st.kind === "saved"} onClick={() => void keep()}>
        {st.kind === "saved" ? <><svg className="dk-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9" /></svg>Watching</> : st.kind === "busy" ? "Saving…" : keepUnderWords(held)}
      </button>
      {(st.kind === "saved" || st.kind === "error") && <p className="dk-nodeal-saved" role="status">{st.line}</p>}
    </>
  );
}
