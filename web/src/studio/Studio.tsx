// Behind the scenes as an AG Studio dashboard (Track AS, slices 2 and 3; notebook docs/guild/044-ag-studio.md). Its own
// lazy chunk, mounted only through web/src/studio/pick.ts (the licence gate, with `?studio=force` for building), so no
// other page's first paint fetches it and an unlicensed Studio never reaches a visitor. Fed with the same rows as the
// Community ledger: this browser's session rows streamed from the server, the demo week replayed from the bundled tape,
// both through core's `sessionRows` and `weekRows`, so this file types no number. Six custom widgets wrap D's, H's and
// L's components unchanged (widgets/index.tsx); Midnight comes from one theme (theme.ts) on the back room's tokens.
//
// Visitors open the dashboard in view mode; "Edit this view" switches Studio to edit mode, where they can move, resize,
// add or remove widgets (their own browser only; nothing is saved to the server). "Ask for a view" (slice 3, ai.ts) is
// plain English to a widget: Studio's agent, through the server's `/api/view`, which allow-lists view tools only; a
// view already on the page is scrolled to and lit, never added twice (session 5).
// Nothing on this page can pay, approve, change a limit or write the ledger: it only reads. Licence:
// `VITE_AG_STUDIO_LICENSE` at build time, from .env, never committed; the facts about it, never the key, reach the
// browser (web/studio-licence.ts).

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AgStudio, AgStudioProvider, createWidgets } from "ag-studio-react";
import { AgStudioAiModule, type AgAiChatSession, type AgAiHarness, type AgPanelConfig, type AgStudioApi, type AgWidgetsConfig } from "ag-studio";
import { isShoppers, seededRows, type LedgerEvent } from "@goose/core";
import { sessionRows, streamed, weekRows, weekStory, type LedgerRow } from "@goose/core/session";
import type { FoldWeek } from "../charts/spend.ts";
import { RowSheet } from "../ledger/RowSheet.tsx";
import { paypalInVisit } from "./audit.ts";
import { VIEW_AGENT, VIEW_FAILED, viewHarness, viewNote, viewSaid } from "./ai.ts";
import { PAGE_BOUNDARY, pageAsksToAct } from "./rule.ts";
import { StudioFrame, StudioHero, cardOwnPx } from "./Shell.tsx";
import { ASK_RUNNING, CARD_KEYS, CARD_KEYS_SR, CARD_UNNAMED, FOOT, MAX_ASK, PHONE, pinSentences } from "./words.ts";
import { StudioDataContext, studioData, studioSources } from "./data.ts";
import { midnightStudio } from "./theme.ts";
import { OpenRowContext, TRACK_PX, WIDGET_MENU, gooseWidgets, initialView, tracksOf } from "./widgets/index.tsx";
import { COLUMNS, fitColumn, fitRows, placeAt, tracksFor, type Place } from "./layout.ts";
import { useBoard } from "./threat-state.tsx";
import { boardTakes, shown, viewLine } from "./threat-model.ts";
import { plainTabs } from "./plain-tabs.ts";
import { THREAT_WIDGETS, threatPivots, threatWidgets } from "./widgets/threat.tsx";
import MerchantOrders from "../ledger/MerchantOrders.tsx";

const CARD_KEYS_ID = "st-card-keys";
/**
 * AG Studio gives each card one keyboard stop: an empty 0 x 0 focus container (Tab moves card to card, Enter goes in,
 * Escape comes back; ag-studio 3.0.0 activateFocusManagement). It ships with no role and no name, so a screen reader said
 * nothing there and Round 6's keyboard walk saw 12 stops it couldn't name (accessibility seat, Nov 5). Each one is named
 * here by its card's own heading, with the Enter and Escape sentence as its description, and the card carries the chip's
 * words for studio.css. Runs again whenever Studio adds or redraws a card.
 */
export function nameCards(root: ParentNode): void {
  for (const stop of root.querySelectorAll<HTMLElement>(".ag-studio-layout-widget-focus-container")) {
    const card = stop.closest<HTMLElement>(".ag-studio-layout-widget");
    if (!card) continue;
    const heading = (card.querySelector("h2, h3")?.textContent || card.querySelector(".ag-studio-layout-widget-title")?.textContent || "").trim();
    const name = heading || CARD_UNNAMED;
    if (stop.getAttribute("aria-label") !== name) stop.setAttribute("aria-label", name);
    if (stop.getAttribute("role") !== "group") stop.setAttribute("role", "group");
    if (stop.getAttribute("aria-describedby") !== CARD_KEYS_ID) stop.setAttribute("aria-describedby", CARD_KEYS_ID);
    if (card.dataset.keys !== CARD_KEYS) card.dataset.keys = CARD_KEYS;
  }
}

/** The recorded demo week, replayed in the browser from the bundled tape, the way the ledger page reads it. */
function useWeek() {
  const [week, setWeek] = useState<{ rows: LedgerRow[]; events: LedgerEvent[] } | null>(null);
  useEffect(() => {
    let gone = false;
    void import("../offline.ts").then((o) => o.storyWeek()).then(
      (w) => { if (!gone) setWeek({ rows: weekRows(w.events), events: w.events as LedgerEvent[] }); },
      () => { if (!gone) setWeek({ rows: [], events: [] }); },
    );
    return () => { gone = true; };
  }, []);
  return week;
}

/**
 * This browser's session rows, streamed from the server (the same stream the Community ledger reads); with no session
 * yet (404) the demo week's seeded row stands in locally, as the ledger does. The newest run's fold gives the week's
 * count for spending against limits; without a session there is none, and D's widget says so.
 */
function useSession() {
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [has, setHas] = useState<boolean | null>(null);
  const [fold, setFold] = useState<FoldWeek | null>(null);
  const buf = useRef<LedgerEvent[]>([]);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    let closed = false;
    const flush = () => { timer.current = null; setEvents([...buf.current]); };
    const s = new EventSource("/api/runs/session/events");
    s.addEventListener("row", (e) => {
      if (closed) return;
      buf.current.push(JSON.parse((e as MessageEvent).data) as LedgerEvent);
      setHas(true);
      if (timer.current === null) timer.current = window.setTimeout(flush, 80);
    });
    s.onerror = () => {
      // A 404 (no session yet), a 429 or a server that is down: no rows of this browser's own; the demo week stands alone.
      if (closed) return;
      s.close();
      if (buf.current.length === 0) setHas(false);
    };
    return () => { closed = true; s.close(); if (timer.current !== null) clearTimeout(timer.current); };
  }, []);
  // The newest run the server holds for this browser, the way the Community ledger picks it (SessionLedger.tsx): a
  // shopper's own row written by the guard (every run the server holds writes one). Round 2 judges: one 404 per load
  // after an ask: a Desk ask's market read writes sellers' and the Watcher's rows under a run id /api/runs never knew,
  // and a "Try to trick Goose" round's `attack` rows sit under a `trick-…` id; neither is asked for now. The week is
  // the run view's shopper fold (`shopper.week`, owner only); `week` at the top of the view is the run's week number,
  // which this page used to read as the fold (and with a real run as the newest, the card's money threw).
  const runId = [...events].reverse().find((e) => isShoppers(e) && e.runId && e.actor === "guard")?.runId ?? null;
  useEffect(() => {
    if (!runId) return;
    let gone = false;
    void fetch(`/api/runs/${encodeURIComponent(runId)}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { shopper?: { week?: FoldWeek } | null } | null) => { const wk = v?.shopper?.week; if (!gone && wk) setFold({ from: wk.from, to: wk.to, spent: wk.spent, limit: wk.limit }); }, () => {});
    return () => { gone = true; };
  }, [runId]);
  return { events, has, fold };
}

/** What the ask box shows under the input: the agent's last words, or where it is. */
type AskState = { kind: "idle" } | { kind: "running" } | { kind: "said"; text: string; quiet: string } | { kind: "failed"; asked: string; quiet: string };

/** How long the ring stays on a card an ask pointed at (the Design Director's gate: show the existing card, don't add a copy). */
const LIT_MS = 2400;
/** Room under the sticky bar before the sentence, and between a pinned sentence and the card it points at. */
const LAND_GAP = 16;

/**
 * An ask for a view that is already on the page points at its card. Nothing is added or changed; the card is only
 * remembered here, and shown by `landOn` once the agent's sentence is on the page (Round 2's cold consumer: the page
 * jumped to the card while the words were still coming, and left them above the viewport).
 */
let pointedAt: string | null = null;
/** Studio's built-in words where they read like a spreadsheet: a pivot's heads say "Tries", not "Tries (sum)". */
const STUDIO_WORDS = { aggregationSumFieldName: "${name}", aggregationAvgFieldName: "${name}" };

function showCard(widgetId: string) {
  pointedAt = widgetId; // Only its id: a card the ask just added isn't drawn yet, and is by the time the sentence lands.
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The pinned line's height for these words at this width, measured off screen in its own classes before it shows. */
function pinHeight(sentences: string[]): number {
  const band = document.createElement("div");
  band.className = "st-said";
  band.style.visibility = "hidden";
  band.style.top = "-1000px";
  const p = band.appendChild(document.createElement("p"));
  p.className = "st-said-in";
  // The same shape `PinWords` renders (one span per sentence, a space between), so the band measures what it will draw.
  const words = p.appendChild(document.createElement("span"));
  sentences.forEach((t, i) => { if (i) words.append(" "); words.appendChild(document.createElement("span")).textContent = t; });
  (document.querySelector(".st-page") ?? document.body).appendChild(band);
  const h = band.getBoundingClientRect().height;
  band.remove();
  return h;
}

/**
 * Landing after the reply: the sentence first, then the card it points at. Both in view when the page allows (1440:
 * the sentence under the bar, the card's top below it); when the card is further down than a screen (the phone), the
 * sentence is pinned under the bar (`pinned`, the `.st-said` line, until the ask box is back in view) and the card's
 * top is brought up under it. The card is rung for a moment and takes focus itself (`tabindex="-1"`, its own ring as
 * the focus ring), never AG's 0 × 0 focus container, whose keyboard focus ring was the stray bracket at the corner.
 * Returns the bar's height when the sentence had to be pinned (where the pinned line sits), else null.
 */
function landOn(card: HTMLElement, note: HTMLElement, pin: string[]): number | null {
  const frame = card.closest<HTMLElement>(".ag-studio-layout-widget") ?? card;
  // The bar that stays at the top: index.html ships a hidden static copy before the live one, so only a sticky or fixed
  // `header.gn` counts. No bottom rail (S1-13: one top bar at every width); the tour's strip is its own (TourPill).
  const bar = Math.max(0, ...[...document.querySelectorAll<HTMLElement>("header.gn")].filter((e) => /sticky|fixed/.test(getComputedStyle(e).position)).map((e) => e.getBoundingClientRect().height));
  const n = note.getBoundingClientRect(), f = frame.getBoundingClientRect();
  const behavior: ScrollBehavior = reduced() ? "auto" : "smooth";
  // With the sentence under the bar, is the card's top still on screen (with a little of the card to see)?
  const sentenceTop = window.scrollY + n.top - bar - LAND_GAP;
  const cardTopThen = f.top - (n.top - bar - LAND_GAP);
  let pinnedAt: number | null = null;
  if (cardTopThen + 120 <= window.innerHeight) window.scrollTo({ top: Math.max(0, sentenceTop), behavior });
  else {
    // The lit card's frame lands one --s-2 (16 px, LAND_GAP) under the band, so the band's bottom falls on the gap
    // above the lit row and the card above is wholly under the band (AS-11, the DD's nit (b); it was two gaps, which
    // left the tail of the card above sliced under the band's hairline at 1440).
    pinnedAt = bar;
    window.scrollTo({ top: Math.max(0, window.scrollY + f.top - bar - pinHeight(pin) - LAND_GAP), behavior });
  }
  card.classList.add("st-lit");
  window.setTimeout(() => card.classList.remove("st-lit"), LIT_MS);
  card.tabIndex = -1;
  card.focus({ preventScroll: true });
  return pinnedAt;
}

/**
 * The tracks a Goose card needs: its own height at `height: auto` (its tallest wrap at this width, with the rows it has
 * now), measured in place and put back in the same task, so nothing redraws; plus whatever AG's frame draws around it.
 */
function cardTracks(card: HTMLElement): number | null {
  const frame = card.closest<HTMLElement>(".ag-studio-layout-widget");
  const box = card.closest<HTMLElement>(".ag-studio-layout-widget-content");
  if (!frame || !box) return null;
  const chrome = frame.getBoundingClientRect().height - box.getBoundingClientRect().height;
  const own = cardOwnPx(card);
  return own > 0 ? tracksFor(own + Math.max(0, chrome)) : null;
}

/**
 * The tracks one of Studio's own pivot grids needs (`threatPivots`; a built-in widget, with no Goose card inside): its
 * header, every row it has open and its total row, read off AG Grid's row container (as tall as all its rows, drawn or
 * not), plus whatever sits around the grid in its box and what Studio's frame draws around that. Round 6b's AG seat: on
 * four real tries a frame had ~170 px of bare card under its rows, and on the seeded week a group's rows were behind a
 * scroll inside the card. Null while the grid has no rows drawn (loading, or no tries), so the frame stays as it is.
 */
function pivotTracks(grid: HTMLElement): number | null {
  const frame = grid.closest<HTMLElement>(".ag-studio-layout-widget");
  const box = grid.closest<HTMLElement>(".ag-studio-layout-widget-content");
  const view = grid.querySelector<HTMLElement>(".ag-grid-viewport");
  const rows = grid.querySelector<HTMLElement>(".ag-grid-scrolling-container");
  if (!frame || !box || !view || !rows || rows.offsetHeight === 0) return null;
  // What sits outside the viewport (a scrollbar) is already in `box - view`. Inside it, each band is added once as it stands
  // (the pinned top rows, which hold the header in AG Grid 36; the pinned total row), and the rows' band, which stretches to
  // fill the frame, as all its rows.
  const area = view.querySelector<HTMLElement>(".ag-grid-scrollable-area") ?? view;
  let held = rows.offsetHeight;
  for (const band of area.children) if (!band.contains(rows)) held += (band as HTMLElement).offsetHeight;
  const own = box.offsetHeight - view.offsetHeight + held;
  return tracksFor(own + Math.max(0, frame.offsetHeight - box.offsetHeight));
}

/**
 * What each frame on the page needs: every Goose card's tracks (`cardTracks`; "Every row" only when `every`), and every
 * Studio pivot's (`pivotTracks`), found by where its frame stands (`placeAt`). Each pivot's rows are watched by `sizes`.
 */
function frameNeeds(layout: Record<string, Place>, every: boolean, sizes?: ResizeObserver, watched?: WeakSet<Element>): Record<string, number> {
  const need: Record<string, number> = {};
  for (const c of document.querySelectorAll<HTMLElement>(".st-studio .st-card[data-widget-id]")) { if (!every && c.classList.contains("st-every")) continue; const t = cardTracks(c); if (t !== null) need[c.dataset.widgetId!] = t; }
  const root = document.querySelector<HTMLElement>(".st-studio:not(.st-shell)");
  if (!root) return need;
  const r = root.getBoundingClientRect();
  for (const grid of root.querySelectorAll<HTMLElement>(".ag-studio-pivot-grid-widget")) {
    const rows = grid.querySelector(".ag-grid-scrolling-container");
    if (rows && sizes && watched && !watched.has(rows)) { watched.add(rows); sizes.observe(rows); }
    const f = grid.closest<HTMLElement>(".ag-studio-layout-widget")?.getBoundingClientRect();
    const id = f ? placeAt(layout, f.top - r.top, f.left - r.left, r.width / COLUMNS) : null;
    const t = id === null ? null : pivotTracks(grid);
    if (id !== null && t !== null) need[id] = t;
  }
  return need;
}

/**
 * The phone's frames fit their cards (AS-12; `fitColumn` in layout.ts says why no fixed set of tracks can). In view mode
 * on a phone, whenever a card's content changes size (a width, a font arriving, rows streaming in), each Goose card is
 * measured and the column is restacked so every frame is its card's own tracks. A frame that already fits is left as is,
 * so the pass settles after one change. On the desktop (AS-15 slice 2) each row fits its tallest card the same way, within
 * one track, so the first paint holds still; "Every row" is left out there, since its grid fills whatever frame it has.
 */
function useFit(api: React.RefObject<AgStudioApi | null>, on: boolean, phone: boolean, onPlaced?: () => void) {
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
    const sizes = new ResizeObserver(schedule);
    const watched = new WeakSet<Element>();
    const fit = () => {
      const a = api.current;
      const cards = [...document.querySelectorAll<HTMLElement>(".st-studio .st-card[data-widget-id]")];
      // Observed once each (a first observe reports at once, so re-observing every pass would never settle).
      for (const c of cards) for (const child of c.children) if (!watched.has(child)) { watched.add(child); sizes.observe(child); }
      if (!a || cards.length === 0) return;
      const s = a.getState();
      const page = s.pages.find((p) => p.id === s.selectedPageId) ?? s.pages[0];
      const need = page?.widgetLayout ? frameNeeds(page.widgetLayout as Record<string, Place>, phone, sizes, watched) : {};
      const next = page?.widgetLayout ? (phone ? fitColumn(page.widgetLayout, need) : fitRows(page.widgetLayout, need, 1)) : null;
      // A move changes only where the frames stand, which nothing below hears, so the pass that finds it settled has to be asked for.
      if (page && next) { a.setState({ ...s, pages: s.pages.map((p) => (p === page ? { ...p, widgetLayout: next } : p)) }); schedule(); }
      // Every card drawn and every frame already its card's: the shell can hand over with nothing left to move.
      else if (page?.widgetLayout && cards.length >= Object.keys(page.widgetLayout).filter((k) => !k.startsWith("threat-") || THREAT_WIDGETS[k as keyof typeof THREAT_WIDGETS]).length) onPlaced?.();
    };
    // New cards (Studio places them a frame or two after mount, or after an ask adds one) are picked up here.
    // The dashboard's own: the shell above it has the same class while it waits (pick.ts), and watching that hears nothing.
    const root = document.querySelector(".st-studio:not(.st-shell)");
    const added = new MutationObserver(schedule);
    if (root) added.observe(root, { childList: true, subtree: true });
    addEventListener("resize", schedule);
    void document.fonts?.ready.then(schedule);
    schedule();
    return () => { cancelAnimationFrame(raf); sizes.disconnect(); added.disconnect(); removeEventListener("resize", schedule); };
  }, [api, on, phone, onPlaced]);
}

/**
 * The ask box drives Studio's harness directly (one thread per ask, the agent's words read back from the session), so
 * the page's own input, on the page's tokens, is the way in; AG's chat panel stays for edit mode. The agent lists view
 * tools only and the server refuses every other name, so nothing typed here can pay, approve or change a limit.
 */
function useAsk(harness: React.RefObject<AgAiHarness | null>) {
  const [state, setState] = useState<AskState>({ kind: "idle" });
  const live = useRef<AgAiChatSession | null>(null);
  useEffect(() => () => { live.current?.close(); }, []);
  const ask = useCallback((words: string) => {
    const h = harness.current;
    const text = words.trim().slice(0, MAX_ASK);
    if (!h || !text) return;
    live.current?.close();
    setState({ kind: "running" });
    void h.createThread({ agentId: VIEW_AGENT, title: text }).then((s) => {
      live.current = s;
      // What the box shows: "Building the view…" while the thread runs (never the model's interim notes; Round 1 judges
      // saw one settle as the answer), then the LAST assistant message's words only; a last message with no words is a
      // failure in fixed words, never silence and never an earlier note.
      const read = () => {
        if (live.current !== s) return;
        if (s.status === "error" && !viewSaid.text) { setState({ kind: "failed", asked: text, quiet: viewNote.text }); return; }
        if (s.status === "running" || s.status === "awaiting_input") { setState({ kind: "running" }); return; }
        const last = [...s.messages].reverse().find((m) => m.role === "assistant");
        const words = viewSaid.text || (last ? last.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ").trim() : "");
        setState(words ? { kind: "said", text: words, quiet: viewNote.text } : { kind: "failed", asked: text, quiet: viewNote.text });
      };
      s.addEventListener("changed", read);
      viewSaid.text = "";
      s.sendMessage(text);
    }, () => setState({ kind: "failed", asked: text, quiet: viewNote.text }));
  }, [harness]);
  return { state, ask };
}

/** `onPlaced`: the dashboard is drawn and fitted, under the shell's cards (pick.ts), and ready to take their place. */
const NO_EVENTS: readonly LedgerEvent[] = [];

export default function StudioPage({ onPlaced }: { onPlaced?: () => void }) {
  const board = useBoard();
  const week = useWeek();
  const { events, has, fold } = useSession();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [open, setOpen] = useState<LedgerRow | null>(null);
  const phone = useMemo(() => matchMedia(PHONE).matches, []);
  useEffect(() => { document.body.dataset.agThemeMode = "dark"; return () => { delete document.body.dataset.agThemeMode; }; }, []);

  const story = useMemo(() => weekStory(), []);
  const ready = week !== null && has !== null;
  const data = useMemo(() => {
    if (!ready) return null;
    const own = has ? sessionRows(events).map(streamed) : sessionRows(seededRows(Date.now())).map(streamed);
    return studioData([...own, ...week.rows], !!has, story, week.events, has ? events : [], has ? fold : null);
  }, [ready, has, events, week, story, fold]);
  const sources = useMemo(() => (data ? studioSources(data.rows, board.sources) : null), [data, board.sources]);
  const onOpen = useCallback((r: LedgerRow) => setOpen(r), []);

  // The view a visitor opens, chosen once the rows are known: with no session the empty "against your limits" card goes
  // last (the Design Director's gate, item 1), and the chart cards share a row height.
  const initialState = useMemo(() => (data ? initialView(phone, data.hasSession, board.source) : null), [phone, data === null, data?.hasSession]); // eslint-disable-line react-hooks/exhaustive-deps
  // The canvas is as tall as its widgets, live: a widget the agent adds, or a visitor drags lower, grows the page, never a scroll inside a scroll.
  const [tracks, setTracks] = useState(0);
  useEffect(() => { if (initialState) setTracks(tracksOf(initialState)); }, [initialState]);
  // Every card's keyboard stop gets its card's name (nameCards), now and whenever Studio adds or redraws a card.
  const canvas = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = canvas.current;
    if (!root) return;
    nameCards(root);
    const watch = new MutationObserver(() => nameCards(root));
    watch.observe(root, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, []);
  // Studio's props stay the same objects across this page's renders (an ask, a sheet), so Studio never rebuilds its
  // widget registry mid-run; the canvas height follows a state change one frame later, once Studio has placed the widget.
  // Edit mode shows AG's Compose, Data and Filters panels and not its AI Assistant: "Ask for a view" above is the one way
  // to ask, and a second assistant with its own Send would muddle "only your tap pays" (the Design Director, slice 3).
  const panels = useMemo(() => ({ view: { left: [], right: [] }, edit: { right: ["edit", "data", "filters"] } }) satisfies AgPanelConfig, []);
  const widgets = useCallback((w: AgWidgetsConfig) => createWidgets({ ...w, additionalTypes: [...gooseWidgets, ...threatWidgets], menu: [{ ...WIDGET_MENU, widgetIds: [...threatWidgets.map((t) => t.id), ...WIDGET_MENU.widgetIds] }, ...(w.menu ?? [])] } as never), []);
  const onStateUpdated = useCallback((e: { state: Parameters<typeof tracksOf>[0] }) => { const t = tracksOf(e.state); requestAnimationFrame(() => setTracks(t)); }, []);

  // One harness for the ask box, built as soon as Studio's API is ready, so the box works in view mode (no AI panel opens it).
  const api = useRef<AgStudioApi | null>(null);
  const harness = useRef<AgAiHarness | null>(null);
  const onApiReady = useCallback(({ api: a }: { api: AgStudioApi }) => { api.current = a; harness.current ??= viewHarness(a, showCard); }, []);
  // The frames fit their cards (AS-12 on a phone, AS-15 on the desktop), once the dashboard is on the page, in view mode.
  useFit(api, mode === "view" && !!initialState, phone, onPlaced);
  // Editing leaves the frames to the visitor, so nothing refits them while they arrange. But opening a panel narrows the canvas and a
  // frame fitted for the wide page cuts its words off, so a row grows when the canvas's width changes, and only grows. A layout they've
  // moved out of rows is theirs: `fitRows` declines it.
  useEffect(() => {
    const root = document.querySelector(".st-studio:not(.st-shell)");
    if (mode !== "edit" || phone || !root) return;
    let was = -1, raf = 0;
    const grow = () => {
      const a = api.current;
      if (!a) return;
      const s = a.getState();
      const page = s.pages.find((p) => p.id === s.selectedPageId) ?? s.pages[0];
      const next = page?.widgetLayout ? fitRows(page.widgetLayout, frameNeeds(page.widgetLayout as Record<string, Place>, false), Infinity) : null;
      if (page && next) a.setState({ ...s, pages: s.pages.map((p) => (p === page ? { ...p, widgetLayout: next } : p)) });
    };
    const sizes = new ResizeObserver(([e]) => { const w = Math.round(e!.contentRect.width); if (w !== was) { was = w; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { raf = requestAnimationFrame(grow); }); } });
    sizes.observe(root);
    return () => { sizes.disconnect(); cancelAnimationFrame(raf); };
  }, [mode, phone]);
  // In view mode, Tab goes through what the cards hold, not over AG's invisible stops (plain-tabs.ts, Track T). Edit mode
  // gives AG's stops back, each named with a ring and an Enter that lands (nameCards above; the same canvas).
  useEffect(() => { const root = canvas.current; return mode === "view" && root ? plainTabs(root) : undefined; }, [mode]);
  // Entering edit mode: Data and Filters start collapsed to their rails, so Compose and the canvas share the page
  // (the canvas keeps at least half of it; measured in 044). `panels` in the initial state can't do this in 3.0.0.
  useEffect(() => {
    const a = api.current;
    if (mode !== "edit" || !a) return;
    const s = a.getState();
    a.setState({ ...s, panels: { ...s.panels, data: { ...s.panels?.data, collapsed: true }, filters: { ...s.panels?.filters, collapsed: true } } });
  }, [mode]);

  // The board's switch moves AG Studio's own pivots too: they read the one source the switch names, and their titles say which.
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const s = a.getState();
    const page = s.pages.find((p) => p.id === s.selectedPageId) ?? s.pages[0];
    if (!page?.widgets?.["threat-pivot"]) return;
    a.setState({ ...s, pages: s.pages.map((p) => (p === page ? { ...p, widgets: { ...p.widgets, ...threatPivots(board.source, phone) } as never } : p)) });
  }, [board.source, phone]);

  const { state: askState, ask } = useAsk(harness);
  const [words, setWords] = useState("");
  // Words that filter the threat board are read by the fixed rule, at once, with no AI call and no server; a request to act goes
  // on to the path that refuses it, and everything else, a chart of the tries included, to the agent or its rule, which draw it.
  const [boardAsked, setBoardAsked] = useState(false);
  const askAny = (text: string) => {
    const mine = boardTakes(text) && !pageAsksToAct(text) && board.ask(text);
    setBoardAsked(mine);
    if (!mine) ask(text);
  };
  const onAsk = (e: FormEvent) => { e.preventDefault(); askAny(words); };
  // A failed ask whose words asked the box to act still refuses first, from the page's own rule (Round 4 judges, fix 2:
  // the refusal never waits on a server). The quiet note says why a rule answered, when one did.
  const askNote = boardAsked ? viewLine(board.view, board.source, shown(board.rows, board.view, board.source, board.now).length) : askState.kind === "running" ? ASK_RUNNING : askState.kind === "said" ? askState.text : askState.kind === "failed" ? (pageAsksToAct(askState.asked) ? `${PAGE_BOUNDARY} ${VIEW_FAILED}` : VIEW_FAILED) : "";
  const askQuiet = boardAsked ? board.said : askState.kind === "said" || askState.kind === "failed" ? askState.quiet : "";
  // The landing (see `landOn`): once the agent's sentence is on the page, show the card it pointed at, with the sentence
  // pinned under the bar while the ask box is above the viewport. A new ask, or the ask box scrolling back in, unpins it.
  const noteRef = useRef<HTMLParagraphElement>(null);
  // Where the pinned line sits (under the bar) and the heading of the card it points at (the words on the card's face).
  const [pinned, setPinned] = useState<{ top: number; heading: string | null } | null>(null);
  useEffect(() => {
    if (askState.kind === "running" || askState.kind === "idle") { setPinned(null); return; }
    const card = pointedAt === null ? null : document.querySelector<HTMLElement>(`.st-card[data-widget-id="${CSS.escape(pointedAt)}"]`), note = noteRef.current;
    pointedAt = null;
    if (!card || !note) return;
    const heading = card.querySelector("h2, h3")?.textContent ?? null;
    const top = landOn(card, note, pinSentences(askState.kind === "said" ? askState.text : "", heading));
    setPinned(top === null ? null : { top, heading });
  }, [askState]);
  useEffect(() => {
    const note = noteRef.current;
    if (pinned === null || !note) return;
    // Armed only once the box has left the viewport (the smooth scroll is still under way when this starts).
    let armed = false;
    const io = new IntersectionObserver((es) => { for (const e of es) { if (!e.isIntersecting) armed = true; else if (armed) setPinned(null); } }, { threshold: 0.5 });
    io.observe(note);
    return () => io.disconnect();
  }, [pinned]);

  return (
    <StudioFrame>
        <StudioHero ask={{ words, setWords, onAsk, onChip: (p) => { setWords(p); askAny(p); }, note: askNote, quiet: askQuiet, state: boardAsked ? "said" : askState.kind, busy: !boardAsked && askState.kind === "running", ready: !!data, mode, setMode, noteRef }} />
        {pinned !== null && askNote && <div className="st-said" aria-hidden="true" style={{ top: pinned.top }}><p className="st-said-in"><span>{pinSentences(askNote, pinned.heading).map((t, i) => <Fragment key={i}>{i > 0 && " "}<span>{t}</span></Fragment>)}</span></p></div>}

        {/* The canvas is as tall as its widgets (plus room to drag one lower in edit mode), so the page scrolls, not the canvas. */}
        <div ref={canvas} className="st-studio" data-mode={mode} data-ready={data ? "1" : "0"} style={{ height: (tracks + (mode === "edit" ? 24 : 2)) * TRACK_PX }}>
          <span id={CARD_KEYS_ID} className="st-sr-only">{CARD_KEYS_SR}</span>
          {data && sources && initialState && (
            <StudioDataContext.Provider value={data}>
              <OpenRowContext.Provider value={onOpen}>
                <AgStudioProvider licenseKey={import.meta.env.VITE_AG_STUDIO_LICENSE || undefined} modules={[AgStudioAiModule]}>
                  <AgStudio
                    data={sources}
                    initialState={initialState}
                    mode={mode}
                    panels={panels}
                    theme={midnightStudio}
                    localeText={STUDIO_WORDS}
                    widgets={widgets}
                    onApiReady={onApiReady}
                    onStateUpdated={onStateUpdated}
                    style={{ height: "100%", width: "100%" }}
                  />
                </AgStudioProvider>
              </OpenRowContext.Provider>
            </StudioDataContext.Provider>
          )}
        </div>
        {/* For merchants (scorecard row 20): the recorded sandbox order, then this browser's own, as an AG Grid table. */}
        <MerchantOrders events={has ? events : NO_EVENTS} />
        <p className="st-foot">{FOOT}</p>
      <RowSheet row={open} onClose={() => setOpen(null)} paypal={open && data ? paypalInVisit(data.rows, open) : []} onRow={setOpen} />
    </StudioFrame>
  );
}
