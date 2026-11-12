// Behind the scenes (`?desk=ledger`; Joshua, Fri Oct 30): the AG Grid prize showcase and where "Judge? Start here" lands.
// AG Grid Community only, in its own lazy chunk, so no other page's first paint fetches it.
//
// It streams this session's rows in, live, above the recorded demo week: each row the server streams
// (/api/runs/session/events) becomes one grid row through `SessionRows` (core/src/view/session.ts) and is added as a
// transaction at the end of the session's rows, sliding the week down (Community row animation) with one soft gold flash;
// nothing moves under reduced motion. Custom cells (a calm skipped mark, PayPal's mark only on a row PayPal signed, signed
// amounts in tabular figures), our own side sheet with the full story, a Filter menu over Community's external filter,
// quick search, a header strip of five numbers and a pinned totals row (both from `sessionTotals` of the session's own
// stream only), and "Download your ledger". Under 768 px the same rows are a list with the same filter, search and sheet.
//
// Track L (Joshua's mandate, Fri Oct 30 2:40 PM): Midnight with the egg's one light behind glass (the ledger panel and its
// side sheet). An empty session never opens on a wall of zeros: it leads with the recorded week's story (core's
// `weekStory`), then the recorded run's rows, each labelled recorded, with "where to look" links to four of them. The five
// numbers, the totals row and the session's charts appear once the session has rows of its own. The grid is calmed through
// the Theming API: no vertical lines, a quiet small-caps header, fixed rows with Why held to two lines (the side sheet is
// the expand), a soft hover lift, tabular figures. One filter row: search in view, who-wrote-it in a Filter menu.

import { appHref } from "./menu/href.ts";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GridApi, IRowNode } from "ag-grid-community";
import { demoPolicy, isShoppers, seededRows, toCents, type LedgerEvent, type Policy } from "@goose/core";
import { spendLimits, type FoldWeek } from "./charts/spend.ts";
import { triedOf } from "@goose/core/tries";
import {
  LEDGER_CHIPS, SessionRows, TOTALS_WHO, chipOf, headerStrip, ledgerCharts, matchesSearch, passesLedgerChips, sessionCsv, sessionRows, sessionTotals, streamed,
  totalsWords, weekRows, weekStory, type LedgerChip, type LedgerRow,
} from "@goose/core/session";
import { markTried } from "./tries.ts";
import { RowSheet } from "./ledger/RowSheet.tsx";
import { Cards } from "./ledger/Cards.tsx";
import { Charts } from "./ledger/Charts.tsx";
import { Week } from "./ledger/Week.tsx";
import { FilterMenu } from "./ledger/FilterMenu.tsx";
import { BackRoomNav } from "./ledger/BackRoom.tsx";
import { lookFor, viewCsv } from "./ledger/rows.ts";
import { ShellTable } from "./ledger/ShellTable.tsx";
import { follow, type Follow } from "./ledger/follow.ts";
import { LedgerHero, statusWords, type LedgerStatus } from "./ledger/Hero.tsx";
import ThreatSlot from "./studio/ThreatSlot.tsx";
import { EMPTY_VISIT, stoppedAs, stoppedWords } from "./ledger/stopped.ts";
import { Empty, ErrorBoundary, Offline, RateLimited, StateNote, retryAfterMs, useOnline } from "./states";
import "./ledger/midnight.css";
import "./ledger/ledger.css";
import MerchantOrders from "./ledger/MerchantOrders.tsx";

const NARROW = "(max-width: 767px)";
/** At or under this many rows on show, the table grows to fit them (a filter's or a search's short list). */
const FIT_ROWS = 8;

// Track B, session 6 (Round 0 finding 8): AG Grid Community is its own chunk, fetched only on a wide screen and only
// after the page has painted; the shell table (ShellTable.tsx, the same rows and geometry) stands in until it lands. The
// phone's list never needed it, so a phone never downloads it. The import starts from an effect as soon as the page
// mounts on a wide screen, so the chunk crosses the link while the stream answers, not after.
const loadTable = () => import("./ledger/LedgerTable.tsx");
const LedgerTable = lazy(() => loadTable().then((m) => ({ default: m.LedgerTable })));
// The build's first paint of this page (web/prerender.ts) marks the document and holds the web faces back (shell.css)
// so their bytes never race this chunk on a phone; the chunk is here, so the faces may come now. The page keeps the
// tuned stand-in (shell.css's hold: the fallbacks' measures and spacing) until the three faces it paints have landed,
// then lets go in one swap: dropping the hold first showed the plain fallback for the ~1.2 s the faces take on the
// phone drill, and the swap after it moved the lede by more than 3 px (CLS 0.045 at 3.1 s; Track B session 7).
if (document.documentElement.hasAttribute("data-first-ledger")) {
  const letGo = () => document.documentElement.removeAttribute("data-first-ledger");
  Promise.all(['400 1em "Archivo Goose"', '560 1em "Archivo Goose"', '300 1em "Hanken Goose"'].map((f) => document.fonts.load(f))).then(letGo, letGo);
}

type Pinned = Partial<LedgerRow> & { totals: true };

/** How the first paint's early stream ended: the status its one `fetch` saw (0: no answer), the server's words (the
 *  early stream still reads them; the page draws Track C's, ledger/stopped.ts), and a refusal's Retry-After (`ra`). */
type EarlyEnd = { status: number; body?: { error?: string } | null; ra?: string | null };
/** The stream the build's first paint opened (web/prerender.ts): its EventSource while open, the rows it buffered, and its end once it has one. */
interface EarlyStream { src: EventSource | null; rows: string[]; end: EarlyEnd | null; wait?: (o: EarlyEnd) => void }
declare global { interface Window { __ledgerStream?: EarlyStream } }

/** Where the stream is: reading, live, or what stopped it in the server's words (Hero.tsx, shared with the first paint). */
type Status = LedgerStatus;

/**
 * `proof`: the slot for the Proof panel (Desk-L builds it as its own component). Given one, the page shows it below the
 * ledger and the header's Proof and the lede's "See the proof" jump to it; without one, both go to `?desk=proof`, so
 * Proof is always one tap from here (Desk-B-5).
 */
export default function SessionLedger({ proof }: { proof?: ReactNode } = {}) {
  const api = useRef<GridApi<LedgerRow> | null>(null);
  const online = useOnline();
  const stream = useRef(new SessionRows());
  const events = useRef<LedgerEvent[]>([]);
  // The grid's three runs of rows, in order: the session's own, the stream's seeded row, the recorded demo week.
  const own = useRef<LedgerRow[]>([]);
  const seeded = useRef<LedgerRow[]>([]);
  const week = useRef<LedgerRow[]>([]);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  // What the grid itself holds of the session (its own row nodes): what the check compares with the ledger.
  const [held, setHeld] = useState<{ n: number; last: number | null }>({ n: 0, last: null });
  // How many rows the grid shows after every filter.
  const [inGrid, setInGrid] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  // A short list (a filter or a search left few rows) grows the table to fit them all, so no row hides below its fold.
  const [fit, setFit] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<LedgerChip>>(new Set());
  const pickedRef = useRef(picked);
  const [status, setStatus] = useState<Status>({ kind: "reading" });
  /** Reads the stream again (the effect below fills it in): the "Try again" after an error. */
  const again = useRef<() => void>(() => {});
  /** The recorded week's rows are in (or failed): the panel waits for them, so "Where to look" never lands above a drawn
   *  table and pushes it down (AS-15: CLS 0.030 at 1440 with a session, the look list arriving ~110 ms after the panel). */
  const [weekIn, setWeekIn] = useState(false);
  /** "Try again" pressed and the stream not answered yet. Any answer (a new status) ends it. */
  const [retrying, setRetrying] = useState(false);
  useEffect(() => { setRetrying(false); }, [status]);
  const [open, setOpen] = useState<LedgerRow | null>(null);
  const [fold, setFold] = useState<FoldWeek | null>(null);
  const [limits, setLimits] = useState<Policy | null>(null);
  const [narrow, setNarrow] = useState(() => matchMedia(NARROW).matches);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const still = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  // Rows the stream replays on connect are history; only rows written after it goes quiet are "arriving" and flash.
  const settled = useRef(false);
  // The stream's own rows outside the session part (its seeded starting row): with the session's, they are the ledger
  // the server holds, which the grid's count and the download match exactly.
  const fromStream = useRef(new Set<string>());

  useEffect(() => {
    const m = matchMedia(NARROW);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  // Things to try: Behind the scenes is open, the one try with no ledger row.
  useEffect(() => { markTried("behind"); }, []);
  // The grid's chunk, after the first paint, on a wide screen only (the shell table holds the rows until it lands).
  useEffect(() => { if (!narrow) void loadTable(); }, [narrow]);

  /** A row arriving live: a gold flash in the grid, a gold wash on its card. Never under reduced motion. */
  const arrive = useCallback((nodes: IRowNode<LedgerRow>[], ids: string[]) => {
    if (still || !settled.current) return;
    if (nodes.length) api.current?.flashCells({ rowNodes: nodes, flashDuration: 700, fadeDuration: 1500 });
    setFresh((f) => new Set([...f, ...ids]));
    setTimeout(() => setFresh((f) => { const n = new Set(f); for (const id of ids) n.delete(id); return n; }), 2200);
  }, [still]);

  // The recorded demo week, replayed in the browser from the bundled tape (the same chunk the wallet uses).
  useEffect(() => {
    let gone = false;
    void import("./offline.ts").then((o) => o.storyWeek()).then((w) => {
      if (gone) return;
      week.current = weekRows(w.events);
      api.current?.applyTransaction({ add: week.current });
      setWeekIn(true);
      bump();
    }).catch(() => { if (!gone) setWeekIn(true); /* the week stays out; the session still streams */ });
    return () => { gone = true; };
  }, [bump]);

  useEffect(() => {
    let closed = false;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    // Why the stream ended. A 204 is "no session yet"; a 429 carries its Retry-After, which EventSource can't read, so
    // ask once with fetch (`askWhy`); the build's first paint may have asked already (`early`, below), in which
    // case its answer is read instead of asking twice. What it draws is the kit's (ledger/stopped.ts, Track R).
    const askWhy = async (): Promise<EarlyEnd> => {
      const r = await fetch("/api/runs/session/events", { headers: { accept: "application/json" } }).catch(() => null);
      if (!r) return { status: 0 };
      const ra = r.headers.get("retry-after");
      return { status: r.status, ...(ra ? { ra } : {}) };
    };
    const ended = (o: EarlyEnd) => {
      if (closed) return;
      const wait = retryAfterMs(o.ra);
      setStatus({ kind: "none", code: o.status, ...(wait > 0 ? { retryAfterMs: wait } : {}) });
      if (o.status === 204) {
        seedLocally();
        settled.current = true;
        // Still no session: look again in 3 s while the tab is in view (a 204 logs nothing, so a judge's console stays
        // clean), and at once when it comes back into view, so a run started in another tab or window streams in here.
        retry = setTimeout(back, 3000);
        document.addEventListener("visibilitychange", back);
      }
    };
    // No session yet: the demo week still opens, with the seeded row a fresh session starts from.
    const seedLocally = () => {
      if (seeded.current.length) return;
      seeded.current = sessionRows(seededRows(Date.now())).map(streamed);
      api.current?.applyTransaction({ add: seeded.current, addIndex: own.current.length });
      bump();
    };
    // Track B session 6: the build's first paint opens the stream from an inline script while this chunk is still on
    // its way (web/prerender.ts, `__ledgerStream`), so the handshake's round trips overlap the code's. The first
    // connect adopts it: its open EventSource (a session: the rows it buffered are replayed through the same handler,
    // then its listeners are ours), or its ending (no session, or the server's words), so the page never opens a second
    // stream (the server allows two per browser). Later reconnects make their own.
    const early = window.__ledgerStream;
    delete window.__ledgerStream;
    const onRow = (data: string) => {
      const e = JSON.parse(data) as LedgerEvent;
      const row = stream.current.add(e);
      if (!row) return; // a row the page already has (a reconnect replays from the start)
      events.current.push(e);
      markTried(...triedOf(e)); // Things to try: a row that proves one ticks it as it streams in
      const r = streamed(row);
      if (r.part === "session") {
        const t = api.current?.applyTransaction({ add: [r], addIndex: own.current.length });
        own.current = [...own.current, r];
        arrive(t?.add ?? [], [r.id]);
      } else if (fromStream.current.add(r.id) && !seeded.current.some((x) => x.id === r.id)) {
        api.current?.applyTransaction({ add: [r], addIndex: own.current.length + seeded.current.length });
        seeded.current = [...seeded.current, r];
      }
      setStatus({ kind: "live" });
      bump();
      clearTimeout(quiet);
      if (!settled.current) quiet = setTimeout(() => { settled.current = true; }, 600);
    };
    // Which stream is live, when a failed one asks why, and "Try again" (ledger/follow.ts, AS-15): one stream at a time,
    // only the latest attempt's answer is shown, and "didn't answer" only when nothing did.
    const f: Follow<EventSource> = follow<EventSource>({
      open: () => new EventSource("/api/runs/session/events"),
      askWhy,
      wire: (src) => src.addEventListener("row", (m) => onRow((m as MessageEvent<string>).data)),
      // A stream that opens after the page said why it stopped (a "Try again" that worked) is live again, even when every
      // row it replays is one the page already has.
      opened: () => setStatus((st) => (st.kind === "none" ? { kind: "live" } : st)),
      ended,
    });
    const back = () => {
      if (closed || document.visibilityState !== "visible") return;
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", back);
      f.again();
    };
    // "Try again" (AS-15): the kit block's way on when nothing answered or the server said no; reads again at once.
    again.current = () => { if (closed) return; setRetrying(true); back(); };
    if (early && !early.src) {
      // The first paint's stream has ended; its reason is known or on its way.
      f.start({ end: early.end ? Promise.resolve(early.end) : new Promise<EarlyEnd>((r) => { early.wait = r; }) });
    } else if (early?.src) {
      const adopt = early.src;
      early.src = null;
      for (const d of early.rows) onRow(d);
      early.rows.length = 0;
      f.start({ adopt });
    } else f.start();
    return () => { closed = true; f.stop(); clearTimeout(quiet); clearTimeout(retry); document.removeEventListener("visibilitychange", back); };
  }, [arrive, bump]);

  // Spending against limits (Track D's widget) needs two things only the server holds (N19): the week the guard counts
  // (the run view's shopper fold, owner only) and this session's limits (Settings may have changed them; the wants
  // route sends them as rows). Read after a payment row or a newer run arrives, and when the tab comes back into view (a
  // limit changed in another tab). Without them the widget says the week isn't shown and uses the demo's limits.
  // Only a run the server holds (Round 1's reliability review): each writes a guard row (the limit, or a cart's worst
  // case) and carries the week. A Desk ask's market read writes sellers' and the Watcher's rows under its own run id,
  // which /api/runs/<id> never knew, so fetching it logged a 404 on every visit.
  const lastRun = useMemo(() => [...events.current].reverse().find((e) => isShoppers(e) && e.runId && e.actor === "guard")?.runId ?? null, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const paidRows = useMemo(() => events.current.filter((e) => e.actor === "paypal").length, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [looked, setLooked] = useState(0);
  useEffect(() => {
    const on = () => { if (document.visibilityState === "visible") setLooked((n) => n + 1); };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  useEffect(() => {
    if (!lastRun) return;
    let gone = false;
    const t = setTimeout(() => {
      void Promise.all([
        fetch(`/api/runs/${encodeURIComponent(lastRun)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ shopper?: { week?: FoldWeek } | null } | null>,
        fetch("/api/runs/wants").then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ limits?: { category: string; limit: string }[] } | null>,
      ]).then(([v, w]) => {
        if (gone) return;
        const wk = v?.shopper?.week;
        if (wk) setFold({ from: wk.from, to: wk.to, spent: wk.spent, limit: wk.limit });
        if (w?.limits?.length) setLimits({ ...demoPolicy(), categoryLimit: Object.fromEntries(w.limits.map((l) => [l.category, toCents(l.limit)])) });
      });
    }, 300);
    return () => { gone = true; clearTimeout(t); };
  }, [lastRun, paidRows, looked]);

  // The filter: Community's external filter, reading the picked set through a ref (the grid holds on to its callbacks).
  useEffect(() => { pickedRef.current = picked; api.current?.onFilterChanged(); }, [picked]);
  const toggle = (k: LedgerChip) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const sessionCount = own.current.length;
  const hasSession = sessionCount > 0;
  // The header strip and the totals row: the session's own stream only, never the demo week.
  const totals = useMemo(() => sessionTotals(events.current), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const words = useMemo(() => totalsWords(totals), [totals]);
  const strip = useMemo(() => headerStrip(totals), [totals]);
  const ownEvents = useMemo(() => [...events.current], [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const charts = useMemo(() => ledgerCharts(events.current), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const spend = useMemo(() => spendLimits(events.current, fold, limits ?? undefined), [version, fold, limits]); // eslint-disable-line react-hooks/exhaustive-deps
  // The recorded week's story: core's moving.ts, the Watcher and the policy's limit, never the session's rows.
  const story = useMemo(() => weekStory(), []);
  // The totals row speaks only for the session's own rows; with none yet it would be a row of zeros, so it waits.
  const pinned: Pinned[] = useMemo(() => (hasSession ? [{ totals: true, id: "totals", who: TOTALS_WHO, price: words.spent, did: words.skipped, why: words.kept }] : []), [words, hasSession]);
  const all = useMemo(() => [...own.current, ...seeded.current, ...week.current], [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => {
    const c = Object.fromEntries(LEDGER_CHIPS.map((x) => [x.key, 0])) as Record<LedgerChip, number>;
    for (const r of all) c[chipOf(r)]++;
    return c;
  }, [all]);
  // Where to look in the recorded run: four of its own rows, found by their fields (never typed seqs).
  const look = useMemo(() => lookFor(week.current), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = (r: LedgerRow) => passesLedgerChips(r, picked) && matchesSearch(r, search);
  const onShow = narrow || inGrid === null ? all.filter(shown).length : inGrid;
  const filtering = picked.size > 0 || search !== "" || onShow < all.length;

  const save = (text: string, name: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const download = () => save(sessionCsv(stream.current.rows), "gilded-goose-ledger.csv");
  // What's on show, in the order it's on show; the grid knows that once it's here, and until then the same rows' filters do.
  const downloadShown = () => {
    if (narrow || !api.current) { save(viewCsv(all.filter(shown)), "gilded-goose-rows-shown.csv"); return; }
    const rows: LedgerRow[] = [];
    api.current.forEachNodeAfterFilterAndSort((n) => { if (n.data) rows.push(n.data); });
    save(viewCsv(rows), "gilded-goose-rows-shown.csv");
  };

  // "Try again" reads the stream again under the same page (AS-15): the hero's line says so, the block stays until the
  // answer replaces it, and nothing below it blanks.
  const said = retrying ? statusWords({ kind: "reading" }, sessionCount) : statusWords(status, sessionCount);
  // Until the stream answers and the recorded week is in, nothing below the title is drawn, so the page never opens one
  // way and then jumps.
  const ready = status.kind !== "reading" && weekIn;
  // An empty session leads with the recorded week's story, never a wall of zeros.
  const lead = ready && !hasSession;

  const openRow = (seq: number) => { const r = week.current.find((x) => x.seq === seq); if (r) setOpen(r); };
  const lookLine = look.length > 0 ? (
    <div className="lx-look">
      <p className="lx-look-h" id="lx-look-h">Where to look</p>
      <ol aria-labelledby="lx-look-h">
        {look.map((l) => (
          <li key={l.key}><button type="button" onClick={() => openRow(l.seq)}><span className="lx-look-n lx-num">Row {l.seq}</span>{l.words}</button></li>
        ))}
      </ol>
    </div>
  ) : null;

  // AS-15: the panel says what its rows are in one honesty line and how to open one; the keyboard's way in is said to
  // screen readers and keyboard users only (it was 14 visible words a pointer never needs).
  const panelHead = (
    <div className="lx-panel-head">
      <h2 id="lx-panel-h">{hasSession ? "Every decision" : "Every decision in one recorded haggle"}</h2>
      <p>{hasSession
        ? "Yours first, then a recorded practice haggle."
        : "A recorded practice haggle: fictional sellers, no money moved."}
        {" "}{narrow ? "Tap a row for its full story." : <>Click a row for its full story.<span className="lx-sr"> Or Tab into the table, move with the arrow keys and press Enter. On a filter cell, Enter goes into its box.</span></>}</p>
    </div>
  );

  const tools = (
    <div className="lx-tools">
      <label className="lx-search">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        <input type="search" aria-label="Search the ledger" placeholder="Search: SYSTEM, gift card, $47.73" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      <FilterMenu picked={picked} counts={counts} onToggle={toggle} onClear={() => setPicked(new Set())} />
      {/* The count says decisions, as Every decision does; the seeded row is a starting point, not a decision. */}
      <p className="lx-count" aria-live="polite">{filtering ? `${onShow} of ${all.length} rows` : [
        hasSession ? `${sessionCount} this session` : "",
        week.current.length ? `${week.current.length} decisions in the recorded haggle` : "",
        seeded.current.length ? "the seeded row" : "",
      ].filter(Boolean).join(" · ")}</p>
      <button type="button" className="lx-btn lx-btn-quiet lx-dl lx-dl-shown" onClick={downloadShown} disabled={onShow === 0}>CSV of these rows</button>
      <button type="button" className="lx-btn lx-btn-quiet lx-dl" onClick={download} disabled={!hasSession} title={hasSession ? undefined : "Nothing to download until your session has rows"}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5v9m0 0l-3.5-3.5M10 12.5l3.5-3.5M4.5 16h11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {hasSession ? "Download your ledger" : "Download, after your first ask"}
      </button>
    </div>
  );

  return (
    <div className="lx dk mn-lit" data-palette="midnight">
      <BackRoomNav here="ledger" proofHref={proof ? "#proof" : appHref("?desk=proof")} />

      <main id="main" className="lx-main">
        <section className="lx-sl" aria-labelledby="sl-h" data-rows={narrow ? stream.current.rows.length : held.n} data-last-seq={(narrow ? stream.current.rows.at(-1)?.seq : held.last) ?? ""} data-week-rows={seeded.current.length + week.current.length}>
          {/* The hero is Hero.tsx: the build draws the same markup into index.html before any JS (Track B session 6). */}
          <LedgerHero proofHref={proof ? "#proof" : appHref("?desk=proof")} status={status} said={said} />

          {/* Joshua's Tier 2b: Behind the scenes leads with the Live Threat Board, a lazy chunk of its own (Track T). */}
          <ThreatSlot />

          {/* AS-15 slice 2: a stopped stream is the kit's block below the hero (Track R, docs/guild/062-r.md §7). No session
              yet: brand.md §10.9's Empty, claims row l-ask-rows. Drawn with the story, never before it. */}
          {/* A failure says what failed in Track C's words (ledger/stopped.ts): "Your rows didn't load.", its cause where
              the code knows it, Try again. A 429 stays the kit's RateLimited (Try again waits out Retry-After), titled the
              same; a daily cap or a long wait keeps the kit's own words. */}
          {ready && status.kind === "none" && (() => {
            const retry = () => again.current();
            const kind = stoppedAs(status.code);
            const w = stoppedWords(kind, status.retryAfterMs);
            // R-11, offline wins: Try again needs the network, so while offline a failure is the kit's Offline, no button.
            if (kind !== "empty" && !online) return <Offline className="lx-state" />;
            switch (kind) {
              case "empty": return <Empty className="lx-state lx-state-visit" title={EMPTY_VISIT} />; // Under the board, which has rows: this names whose list is empty.
              case "limited": return w
                ? <RateLimited onRetry={retry} title={w.title} cause={w.line} retryAfterMs={status.retryAfterMs} className="lx-state" />
                : <RateLimited onRetry={retry} retryAfterMs={status.retryAfterMs} className="lx-state" />;
              case "network":
              case "error": return w ? <StateNote kind="error" title={w.title} line={w.line} action={{ label: w.action, onClick: retry }} className="lx-state" /> : null;
            }
          })()}

          {hasSession && (
            <div className="lx-strip" aria-label="This session, in numbers">
              <p className="lx-strip-h">This session</p>
              <dl>
                {strip.map((h) => (
                  <div key={h.key} data-key={h.key}><dt>{h.label}</dt><dd>{h.value}</dd></div>
                ))}
              </dl>
            </div>
          )}

          {/* AS-15: the story leads with no caption over it; the status line above already says what's next. */}
          {lead && (
            <div className="lx-lead">
              <Week w={story} narrow={narrow} />
            </div>
          )}

          {ready && (
            <section className="lx-panel dk-glass" aria-labelledby="lx-panel-h">
              {panelHead}
              {lookLine}
              {tools}
              {/* A part that throws (or a grid chunk lost to a deploy) becomes the kit's error block, not a blank page. */}
              <ErrorBoundary>
              {narrow ? (
                <Cards session={own.current.filter(shown)} week={[...seeded.current, ...week.current].filter(shown)} fresh={fresh} totals={hasSession ? words : null} onOpen={setOpen} />
              ) : (
                <div className={fit ? "lx-grid lx-grid-fit" : "lx-grid"}>
                  <Suspense fallback={<ShellTable rows={all.filter(shown)} timed={hasSession} totals={hasSession ? { who: TOTALS_WHO, price: words.spent, did: words.skipped, why: words.kept } : null} onOpen={setOpen} labelledBy="lx-panel-h" />}>
                  <LedgerTable
                    timed={hasSession}
                    labelledBy="lx-panel-h"
                    onOpen={setOpen}
                    pinnedBottomRowData={pinned as LedgerRow[]}
                    domLayout={fit ? "autoHeight" : "normal"}
                    quickFilterText={search}
                    animateRows={!still}
                    isExternalFilterPresent={() => pickedRef.current.size > 0}
                    doesExternalFilterPass={(n) => (n.data ? passesLedgerChips(n.data, pickedRef.current) : true)}
                    rowClassRules={{
                      "lx-week-first": (p) => own.current.length > 0 && p.data?.part === "week" && p.data.id === (seeded.current[0] ?? week.current[0])?.id,
                    }}
                    onGridReady={(e) => { api.current = e.api; e.api.applyTransaction({ add: [...own.current, ...seeded.current, ...week.current] }); }}
                    onGridPreDestroyed={() => { api.current = null; }}
                    // After every transaction: forEachNode walks every node, filtered or not; only the session's count here.
                    onModelUpdated={(e) => {
                      let n = 0;
                      let last: number | null = null;
                      e.api.forEachNode((r) => { if (r.data && (r.data.part === "session" || fromStream.current.has(r.data.id))) { n++; if (last === null || r.data.seq > last) last = r.data.seq; } });
                      setHeld((h) => (h.n === n && h.last === last ? h : { n, last }));
                      setFit(e.api.getDisplayedRowCount() <= FIT_ROWS);
                      setInGrid(e.api.getDisplayedRowCount());
                    }}
                  />
                  </Suspense>
                </div>
              )}
              </ErrorBoundary>
            </section>
          )}

          {ready && hasSession && <Week w={story} narrow={narrow} />}
          {ready && hasSession && <Charts c={charts} spend={spend} />}
        </section>
        {/* For merchants (scorecard row 20): the same table as under AG Studio's dashboard, so it outlives the licence. */}
        <MerchantOrders events={ownEvents} />
        {proof ? <section id="proof" className="lx-proof" aria-label="Proof">{proof}</section> : null}
      </main>
      <footer className="lx-foot">Fictional sellers. PayPal sandbox. Practice only: no real money.</footer>
      <RowSheet row={open} onClose={() => setOpen(null)} />
    </div>
  );
}
