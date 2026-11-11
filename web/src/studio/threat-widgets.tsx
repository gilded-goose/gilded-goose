// The Live Threat Board's widgets (Track T; Joshua's Tier 2b), one React component each, reading the one model: the same
// four draw on the fallback's page (AG Grid Community + AG Charts, ThreatBoard.tsx) and inside AG Studio's frames as custom
// widgets (widgets/threat.tsx). Nothing here can pay, approve, change a limit or write a row: it only reads.

import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type FormEvent } from "react";
import type { AgCartesianChartOptions, AgChartOptions } from "ag-charts-community";
import type { GridApi } from "ag-grid-community";
import { NO_ORDER } from "@goose/core/count-words";
import { ASK_IDLE, ASK_VIEW_ONLY } from "./words.ts";
import { appHref } from "../menu/href.ts";
import { NARROW_PX, useWidth } from "../charts/size.ts";
import { RULE_WORDS, TYPE_WORDS, challengeWords, type Attempt } from "./threat-shape.ts";
import { typeLines, ALL, WALLS, areaWorthDrawing, barTop, bucketsFor, catchOf, catchRateWords, csvOf, filterTries, tableOf, triesTotals, SIDE_FILE, isAll, overviewOf, tryWord, lineParts, ruleRows, showsSources, shown, sourceRows, spanWindow, tryRows, namesRoom, barTint, triesBy, triesTop, typeRows, viewChips, viewLine, wallCount, type TriesBar, type TriesBy, type BarSplit, type Bucket, type RuleRow, type TryRow } from "./threat-model.ts";
import { realCounts, useBoard } from "./threat-state.tsx";
import {
  DOWNLOAD_XLSX, DOWNLOAD_XLSX_LABEL, TRIES_BY_HEAD, TRIES_WORD, totalsWords, ASK_CHIPS, ASK_HINT, ASK_HINT_SHORT, ASK_LABEL, BOARD_EYEBROW, BOARD_LOADING, BOARD_UNAVAILABLE, BY_SOURCE, BY_TYPE, NO_TRIES, CATCH_PAID, catchPaidWords, CATCH_AI, CATCH_ALL, CATCH_ALL_SEEDED, CATCH_EMPTY, CLEAR, catchRestWords, CREDIT, CREDIT_PHONE, cutWords, DOWNLOAD, DRILL_BACK, drillWords, FIND_HINT, FIND_LABEL, findWords, KEY_CAUGHT, KEY_PAID, KEY_REST, newestWords, OVER_HEAD, OVER_HEAD_VIEW, overCutWords, overWords, REAL_LABEL, RULES_HEAD, SEE_NEWEST, SEEDED_LABEL, SEEDED_NOTE, SHOW_DEMO, TIME_HEAD, TRIES_HEAD, TRIES_NOTE, TRICK_HREF, TRY_LINK, WALLS_HEAD,
  SPARKS_HEAD,
} from "./threat-words.ts";
import "../ledger/shell.css"; // with the board's first lines (threat-first.css)
import "./threat.css";

const Chart = lazy(() => import("../charts/Chart.tsx"));
const ThreatGrids = () => import("./ThreatGrid.tsx");
const RuleGrid = lazy(() => ThreatGrids().then((m) => ({ default: m.RuleGrid })));
const TryGrid = lazy(() => ThreatGrids().then((m) => ({ default: m.TryGrid })));
const SparkGrid = lazy(() => ThreatGrids().then((m) => ({ default: m.SparkGrid })));
// A try's detail, on first ask: nobody who only reads the board pays for it.
const TrySheet = lazy(() => import("./TrySheet.tsx").then((m): { default: (p: ComponentProps<typeof m.default>) => React.JSX.Element | null } => m, () => ({ default: () => null })));

const n = (x: number) => x.toLocaleString("en-US");
/** A phone reads lists and never fetches a grid: the page's own test (SessionLedger's), not the card's width. */
const isPhone = () => typeof matchMedia === "function" && matchMedia("(max-width: 767px)").matches;

/**
 * Take the reader to a card's heading, after the view it follows from has drawn: scrolled to (still for reduced motion) and
 * focused, so the keyboard and a screen reader move with the eye. Both paths share one document, so this works inside Studio's frames too.
 */
function goTo(selector: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  });
}
const TRIES_HEADING = ".tb-tries h3";
const RULES_HEADING = ".tb-rules h3";

/** The seeded mark on every widget while the seeded week is on show, so a shot of one card can't pass for real tries. */
function SeededMark() {
  const { source } = useBoard();
  return source === "demo" ? <span className="tb-mark">{SEEDED_LABEL}</span> : null;
}

/** "Updated 4 s ago": its own small timer, so the rest of the board doesn't redraw each tick. */
function Ago({ at }: { at: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((x) => x + 1), 5000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return <>{s < 5 ? "just now" : s < 60 ? `${s - (s % 5)} s ago` : `${Math.round(s / 60)} min ago`}</>;
}

// ---------- 1. The counter ----------

export function ThreatCounter() {
  const { feed, sources, source, setSource, rows, fresh, newest, showNewest } = useBoard();
  const counts = realCounts(feed);
  const words = counts ? challengeWords(counts, counts.byAi > 0) : null;
  const realN = counts?.tried ?? null;
  const [line, end] = lineParts(words?.line ?? (feed.state === "reading" ? BOARD_LOADING : BOARD_UNAVAILABLE));
  return (
    <div className="tb-counter">
      <p className="dk-eyebrow tb-eye">
        <i className={`tb-live ${feed.state === "live" ? "on" : ""}`} aria-hidden="true" />
        {BOARD_EYEBROW}
        {feed.at !== null && <span className="tb-ago">{feed.state === "live" ? "Updated " : "Last read "}<Ago at={feed.at} /></span>}
      </p>
      <h2 id="tb-h" className={words?.alarm ? "tb-line alarm" : "tb-line"} data-tried={counts?.tried ?? ""} data-paid={counts?.paid ?? ""}>{end ? <><span>{line} </span><span className="tb-line-end">{end}</span></> : line}</h2>
      {words?.second && <p className="tb-second">{words.second}</p>}
      {newest && (
        <p className="tb-newest" data-newest={newest.type}>
          <span>{newestWords(TYPE_WORDS[newest.type], tryWord(newest))}</span>
          <button type="button" onClick={() => { showNewest(); goTo(TRIES_HEADING); }}>{SEE_NEWEST}</button>
        </p>
      )}
      <p className="tb-try"><a href={appHref(TRICK_HREF)}>{TRY_LINK}</a></p>
      {/* The live region stays on the page from the start, so its first words are announced. */}
      <p className="lx-sr" aria-live="polite">{fresh}</p>

      <div className="tb-side">
        <div className="tb-switch" role="group" aria-label="Which tries to show">
          <button type="button" aria-pressed={source === "real"} onClick={() => setSource("real")}>{REAL_LABEL}<b data-real={realN ?? ""}>{realN === null ? "–" : n(realN)}</b></button>
          <button type="button" aria-pressed={source === "demo"} onClick={() => setSource("demo")}>{SEEDED_LABEL}<b data-demo={sources.demo.length}>{n(sources.demo.length)}</b></button>
        </div>
        {source === "demo" && <p className="tb-seeded">{SEEDED_NOTE}</p>}
        <dl className="tb-walls" aria-label={`${WALLS_HEAD}, ${source === "demo" ? SEEDED_LABEL : REAL_LABEL}`}>
          {WALLS.map((w) => {
            const c = wallCount(rows, w.rule);
            return <div key={w.rule} data-wall={w.rule}><dd className={c > 0 ? "alarm" : ""}>{n(c)}</dd><dt>{w.words}</dt></div>;
          })}
        </dl>
        <p className="tb-noorder">{NO_ORDER}</p>
      </div>
    </div>
  );
}

// ---------- 2. Ask for a view (the fallback's box; Studio's hero box reads the same rule) ----------

export function ThreatAsk() {
  const { ask, said } = useBoard();
  const [words, setWords] = useState("");
  const narrow = typeof matchMedia === "function" && matchMedia("(max-width: 720px)").matches;
  const onAsk = (e: FormEvent) => { e.preventDefault(); ask(words); };
  return (
    <form className="tb-ask" onSubmit={onAsk} aria-labelledby="tb-ask-l">
      <label id="tb-ask-l" className="lx-sr" htmlFor="tb-ask-in">{ASK_LABEL}</label>
      <div className="tb-ask-row">
        <input id="tb-ask-in" type="text" value={words} maxLength={120} autoComplete="off" placeholder={narrow ? ASK_HINT_SHORT : ASK_HINT} aria-describedby="tb-ask-idle" onChange={(e) => setWords(e.target.value)} />
        <button type="submit" disabled={!words.trim()}>Ask</button>
      </div>
      {/* Claims row as-view-only: a box that takes typed words says what those words can't do, wherever it is drawn. The same two as Studio's hero: the short line on screen, the full sentence for a screen reader. */}
      <p className="tb-ask-view">{ASK_VIEW_ONLY}</p>
      <span id="tb-ask-idle" className="lx-sr">{ASK_IDLE}</span>
      <ul className="tb-chips" aria-label="Things to ask">
        {ASK_CHIPS.map((c) => <li key={c.prompt}><button type="button" onClick={() => { setWords(c.prompt); ask(c.prompt); }}>{c.label}</button></li>)}
      </ul>
      <ThreatViewLine said={said} />
    </form>
  );
}

/** What's on show, in one sentence from the rows' own count, and each filter as a chip to clear. */
export function ThreatViewLine({ said }: { said: string }) {
  const { rows, view, setView, source, setSource, now } = useBoard();
  const count = shown(rows, view, source, now).length;
  const offer = source === "real" && count === 0 && !isAll(view);
  return (
    <div className="tb-view">
      <p className="tb-view-line" aria-live="polite" data-shown={count}>{viewLine(view, source, count)}{said ? <span className="tb-said"> {said}</span> : null}</p>
      {!isAll(view) && (
        <ul className="tb-on" aria-label="Filters on">
          {viewChips(view, source).map((c) => (
            <li key={c.key}><button type="button" onClick={() => setView({ ...view, [c.key]: c.key === "span" ? "all" : null })}><span className="lx-sr">Remove the filter: </span>{c.words}<span aria-hidden="true"> ×</span></button></li>
          ))}
          <li><button type="button" className="tb-clear" onClick={() => setView(ALL)}>{CLEAR}</button></li>
          {offer && <li><button type="button" className="tb-clear" onClick={() => setSource("demo")}>{SHOW_DEMO}</button></li>}
        </ul>
      )}
    </div>
  );
}

// ---------- 3. Attempts over time, by type: one row per kind (small multiples on one scale, never a rainbow stack) ----------

/** One bar in ink tiers, the same in every row, so a row's colour follows what became of the tries and never whether it's picked. */
function BarsChart({ row, buckets, active, top, onBar, narrow }: { row: { words: string; split: BarSplit[] }; buckets: readonly Bucket[]; active: readonly boolean[]; top: number; onBar: (b: Bucket) => void; narrow: boolean }) {
  const data = useMemo(() => buckets.map((b, i) => ({ b: b.label, ...(row.split[i] ?? { caught: 0, rest: 0, paid: 0 }), i })), [buckets, row.split]);
  const height = narrow ? 40 : 48;
  type Bar = BarSplit & { b: string; i: number };
  const tooltip = { renderer: ({ datum }: { datum: Bar }) => ({ heading: datum.b, title: row.words, data: [{ label: KEY_CAUGHT, value: String(datum.caught) }, { label: KEY_REST, value: String(datum.rest) }, ...(datum.paid > 0 ? [{ label: KEY_PAID, value: String(datum.paid) }] : [])] }) };
  return (
    <Chart
      height={height}
      build={(p): AgCartesianChartOptions => ({
        data,
        padding: { top: 2, right: 0, bottom: 0, left: 0 },
        keyboard: { enabled: false }, // the row's button and the days under the chart are the keyboard's way in; the table beside it reads every number
        tooltip: { enabled: true },
        legend: { enabled: false }, // the key above the rows names the tiers once, for all of them
        listeners: { seriesNodeClick: ({ datum }: { datum: { i: number } }) => { const b = buckets[datum.i]; if (b) onBar(b); } },
        axes: {
          x: { type: "category", position: "bottom", label: { enabled: false }, line: { enabled: true, stroke: p.edge, width: 1 }, tick: { enabled: false }, paddingInner: 0.3, paddingOuter: 0.15 },
          y: { type: "number", position: "left", min: 0, max: barTop(top), label: { enabled: false }, gridLine: { enabled: false }, line: { enabled: false } },
        },
        // Stacked with a hairline of page between the tiers. Paid is the threat marker and has its own tier: it stays invisible only while it's zero.
        series: ([["caught", KEY_CAUGHT, p.ink], ["rest", KEY_REST, p.ink3], ["paid", KEY_PAID, p.mark]] as const).map(([yKey, yName, fill]) => ({
          type: "bar", xKey: "b", yKey, yName, stacked: true, cornerRadius: 2, stroke: p.page, strokeWidth: 1, tooltip,
          itemStyler: ({ datum }: { datum: { i: number } }) => ({ fill: !active[datum.i] ? p.edge : fill }),
        })),
      } as AgCartesianChartOptions)}
    />
  );
}

/** One chart of the view's tries, on request from the ask box. The bars come from `triesBy`; the list under them reads every number. */
export function TriesChart({ by }: { by: TriesBy }) {
  const { rows, view, source, now, feed } = useBoard();
  const bars = useMemo(() => triesBy(by, rows, view, source, now), [by, rows, view, source, now]);
  const id = useId();
  const head = TRIES_BY_HEAD[by];
  const sideways = by !== "day";
  const empty = !bars.some((b) => b.count > 0);
  const [box, width] = useWidth<HTMLDivElement>();
  return (
    <section className="tb-by" aria-labelledby={`${id}-h`} data-by={by} data-bars={bars.map((b) => `${b.key}:${b.count}`).join(",")}>
      <div className="tb-head">
        <h3 id={`${id}-h`} tabIndex={-1}>{head}</h3>
        <SeededMark />
      </div>
      {empty ? <p className="tb-empty-line">{feed.state === "live" ? NO_TRIES : feed.state === "reading" ? BOARD_LOADING : BOARD_UNAVAILABLE}</p> : (
        <>
          <div ref={box} aria-hidden="true">{width > 0 && <Suspense fallback={null}><TriesBars bars={bars} sideways={sideways} words={head} width={width} /></Suspense>}</div>
          <ul className="lx-sr">{bars.map((b) => <li key={b.key}>{b.words}: {n(b.count)}</li>)}</ul>
        </>
      )}
    </section>
  );
}

function TriesBars({ bars, sideways, words, width }: { bars: readonly TriesBar[]; sideways: boolean; words: string; width: number }) {
  type Bar = TriesBar;
  const tooltip = { renderer: ({ datum }: { datum: Bar }) => ({ heading: words, title: datum.words, data: [{ label: TRIES_WORD, value: n(datum.count) }] }) };
  return (
    <Chart
      height={sideways ? Math.max(120, bars.length * 34 + 16) : 200}
      build={(p): AgCartesianChartOptions => ({
        data: [...bars],
        padding: { top: 8, right: 0, bottom: 0, left: 0 },
        keyboard: { enabled: false }, // the list beside it reads every number
        tooltip: { enabled: true },
        legend: { enabled: false }, // one series: the heading names it
        axes: {
          x: { type: "category", position: sideways ? "left" : "bottom", ...(sideways ? { thickness: namesRoom(bars, width) } : {}), label: { color: p.ink, fontFamily: p.face, fontSize: 13 }, line: { enabled: true, stroke: p.edge, width: 1 }, tick: { enabled: false }, paddingInner: 0.3, paddingOuter: 0.15 },
          y: { type: "number", position: sideways ? "bottom" : "left", min: 0, max: triesTop(bars), nice: false, label: { enabled: false }, gridLine: { enabled: false }, line: { enabled: false }, tick: { enabled: false } },
        },
        series: [{
          type: "bar", direction: sideways ? "horizontal" : "vertical", xKey: "words", yKey: "count", yName: words, cornerRadius: 2, tooltip,
          // The board's tiers, so a color means one thing across the page; every bar is named on the axis too, so the color never carries it alone.
          itemStyler: ({ datum }: { datum: Bar }) => ({ fill: p[barTint(datum.key)] }),
          label: { enabled: true, placement: "outside-end", color: p.ink, fontFamily: p.face, fontSize: 13, formatter: ({ value }: { value: number }) => (value > 0 ? n(value) : "") },
        }],
      } as AgCartesianChartOptions)}
    />
  );
}

/** Every try of the view over time, stacked in the bars' tiers: the shape of the week, which twelve small rows can't show at a glance. */
function OverArea({ split, buckets }: { split: readonly BarSplit[]; buckets: readonly Bucket[] }) {
  const data = useMemo(() => buckets.map((b, i) => ({ b: b.label, ...(split[i] ?? { caught: 0, rest: 0, paid: 0 }) })), [buckets, split]);
  const paid = split.some((s) => s.paid > 0);
  return (
    <Chart
      height={112}
      build={(p): AgChartOptions => ({
        data,
        padding: { top: 4, right: 0, bottom: 0, left: 0 },
        keyboard: { enabled: false },
        legend: { enabled: false },
        axes: {
          x: { type: "category", position: "bottom", label: { enabled: false }, line: { enabled: true, stroke: p.edge, width: 1 }, tick: { enabled: false }, paddingInner: 0, paddingOuter: 0 },
          y: { type: "number", position: "left", min: 0, label: { enabled: false }, gridLine: { enabled: false }, line: { enabled: false } },
        },
        series: ([["caught", KEY_CAUGHT, p.ink], ["rest", KEY_REST, p.ink3], ...(paid ? [["paid", KEY_PAID, p.mark] as const] : [])] as const).map(([yKey, yName, fill]) => ({
          type: "area", xKey: "b", yKey, yName, stacked: true, fill, fillOpacity: 0.85, stroke: p.page, strokeWidth: 1, marker: { enabled: false },
        })),
      } as AgChartOptions)}
    />
  );
}

/** What became of the view's tries: parts of one whole, which a donut reads at a glance and three bars don't. Paid is the threat marker, as on the bars. */
function OverDonut({ parts }: { parts: BarSplit }) {
  const data = useMemo(() => [{ words: KEY_CAUGHT, v: parts.caught, key: "caught" }, { words: KEY_REST, v: parts.rest, key: "rest" }, { words: KEY_PAID, v: parts.paid, key: "paid" }].filter((d) => d.v > 0), [parts]);
  const total = parts.caught + parts.rest + parts.paid;
  return (
    <Chart
      height={112}
      build={(p): AgChartOptions => ({
        data,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        keyboard: { enabled: false },
        legend: { enabled: false },
        series: [{
          type: "donut", angleKey: "v", legendItemKey: "words", innerRadiusRatio: 0.72, strokeWidth: 2, strokes: [p.page], calloutLabel: { enabled: false }, sectorLabel: { enabled: false },
          fills: data.map((d) => (d.key === "caught" ? p.ink : d.key === "rest" ? p.ink3 : p.mark)),
          innerLabels: [{ text: n(total), fontFamily: p.face, fontSize: 18, fontWeight: 500, color: p.ink }],
        }],
      } as AgChartOptions)}
    />
  );
}

export function ThreatTimeline() {
  const { rows, view, setView, source, setSource, now, feed } = useBoard();
  const [box, width] = useWidth<HTMLDivElement>();
  const narrow = width > 0 && width < NARROW_PX;
  const known = rows.length > 0;
  const whos = useMemo(() => (showsSources(rows, source) ? sourceRows(rows, view, source, now, bucketsFor(source, rows, now)) : []), [rows, view, source, now]);
  const buckets = useMemo(() => bucketsFor(source, rows, now), [source, rows, now]);
  const types = useMemo(() => typeRows(rows, view, source, now, buckets), [rows, view, source, now, buckets]);
  const top = Math.max(0, ...types.flatMap((t) => t.bars), ...whos.flatMap((t) => t.bars));
  const all = [...types, ...whos];
  const w = spanWindow(view, source, now);
  const active = buckets.map((b) => w === null || (b.from < w.to && b.to > w.from));
  const id = useId();
  const pickBucket = (b: Bucket) => setView({ ...view, span: typeof view.span === "object" && view.span.key === b.key ? "all" : b });
  const { parts, split, drawn } = useMemo(() => overviewOf(rows, view, source, now, buckets), [rows, view, source, now, buckets]);
  const inOver = parts.caught + parts.rest + parts.paid;
  const area = areaWorthDrawing(split);
  // No rows to draw: no axis, no scale, no table, and it says "yet" only once the record has been read and is empty.
  if (!known) {
    return (
      <section className="tb-time" aria-labelledby={`${id}-h`} ref={box} data-narrow={narrow ? "1" : "0"}>
        <div className="tb-head">
          <h3 id={`${id}-h`} tabIndex={-1}>{TIME_HEAD}</h3>
          <SeededMark />
        </div>
        <div className="tb-empty" data-empty={feed.state}>
          <p className="tb-empty-line">{feed.state === "live" ? NO_TRIES : feed.state === "reading" ? BOARD_LOADING : BOARD_UNAVAILABLE}</p>
          {feed.state === "live" && (
            <p className="tb-empty-go">
              <a href={appHref(TRICK_HREF)}>{TRY_LINK}</a>
              <button type="button" onClick={() => { setSource("demo"); goTo(".tb-time h3"); }}>{SHOW_DEMO}</button>
            </p>
          )}
        </div>
      </section>
    );
  }
  return (
    <section className="tb-time" aria-labelledby={`${id}-h`} ref={box} data-narrow={narrow ? "1" : "0"}>
      <div className="tb-head">
        <h3 id={`${id}-h`} tabIndex={-1}>{TIME_HEAD}</h3>
        <SeededMark />
      </div>
      <p className="tb-sub">One scale in every row. Tallest bar: {n(top)}.{source === "real" && feed.cut && feed.counts ? ` ${cutWords(rows.length, feed.counts.tried)}` : ""}</p>
      <ul className="tb-key" aria-label="What the bars show">
        <li><i className="tb-key-caught" aria-hidden="true" />{KEY_CAUGHT}</li>
        <li><i className="tb-key-rest" aria-hidden="true" />{KEY_REST}</li>
        {all.some((t) => t.split.some((s) => s.paid > 0)) && <li><i className="tb-key-paid" aria-hidden="true" />{KEY_PAID}</li>}
      </ul>
      {inOver > 0 && (
        <div className={area ? "tb-over" : "tb-over tb-over-one"} data-over={`${parts.caught}/${parts.rest}/${parts.paid}`}>
          <p className="tb-part">{isAll(view) ? OVER_HEAD : OVER_HEAD_VIEW}</p>
          {/* The canvases draw what this sentence and the table below read: they're hidden from reading only. */}
          <p className="lx-sr">{overWords(parts)}</p>
          <div className="tb-over-charts" aria-hidden="true">
            {area && <div className="tb-over-area"><Suspense fallback={null}><OverArea split={split} buckets={buckets} /></Suspense></div>}
            <div className="tb-over-donut"><Suspense fallback={null}><OverDonut parts={parts} /></Suspense></div>
          </div>
          {area && drawn < inOver && <p className="tb-sub" data-over-cut={drawn}>{overCutWords(drawn, inOver)}</p>}
        </div>
      )}
      <p className="tb-part" id={`${id}-t`}>{BY_TYPE}</p>
      <ul className="tb-types" aria-labelledby={`${id}-t`}>
        {types.map((t) => (
          <li key={t.type} data-type={t.type} data-count={t.count} className={view.type === t.type ? "on" : ""}>
            <button type="button" aria-pressed={view.type === t.type} onClick={() => setView({ ...view, type: view.type === t.type ? null : t.type })}>
              <span className="tb-type-name">{t.words}</span>
              <b className="tb-type-n">{n(t.count)}</b>
            </button>
            {/* The canvas draws what the table below reads: AG's own description is off with its keyboard, so it is hidden from reading only. Not inert: a mouse still picks a day on a bar. */}
            <div className="tb-type-chart" aria-hidden="true"><Suspense fallback={null}><BarsChart row={t} buckets={buckets} active={active} top={top} onBar={pickBucket} narrow={narrow} /></Suspense></div>
          </li>
        ))}
      </ul>
      {whos.length > 0 && (
        <>
          <p className="tb-part" id={`${id}-s`}>{BY_SOURCE}</p>
          <ul className="tb-types" aria-labelledby={`${id}-s`}>
            {whos.map((t) => (
              <li key={t.by} data-by={t.by} data-count={t.count} className={view.by === t.by ? "on" : ""}>
                <button type="button" aria-pressed={view.by === t.by} onClick={() => setView({ ...view, by: view.by === t.by ? null : t.by })}>
                  <span className="tb-type-name">{t.words}</span>
                  <b className="tb-type-n">{n(t.count)}</b>
                </button>
                <div className="tb-type-chart" aria-hidden="true"><Suspense fallback={null}><BarsChart row={t} buckets={buckets} active={active} top={top} onBar={pickBucket} narrow={narrow} /></Suspense></div>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="tb-axis" role="group" aria-label="Pick a time" style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}>
        {buckets.map((b) => <button key={b.key} type="button" aria-pressed={typeof view.span === "object" && view.span.key === b.key} onClick={() => pickBucket(b)}>{b.label}</button>)}
      </div>
      <table className="lx-sr">
        <caption>{TIME_HEAD}{source === "demo" ? `, ${SEEDED_LABEL}` : ""}</caption>
        <thead><tr><th scope="col">Type</th>{buckets.map((b) => <th key={b.key} scope="col">{b.label}</th>)}</tr></thead>
        <tbody>{[...types.map((t) => ({ key: t.type, words: t.words, bars: t.bars, split: t.split })), ...whos.map((t) => ({ key: t.by, words: t.words, bars: t.bars, split: t.split }))].map((t) => <tr key={t.key}><th scope="row">{t.words}</th>{t.bars.map((x, i) => { const s = t.split[i]!; return <td key={buckets[i]!.key} data-split={`${s.caught}/${s.rest}/${s.paid}`}>{x === 0 ? "0" : `${s.caught} of ${x} set aside${s.paid > 0 ? `, ${s.paid} paid` : ""}`}</td>; })}</tr>)}</tbody>
      </table>
    </section>
  );
}

// ---------- 4. The rule behind each verdict ----------

function Verdict({ v, words }: { v: string; words: string }) {
  return <span className={`tb-v tb-v-${v}`}><i aria-hidden="true" />{words}</span>;
}

/** What the Watcher set aside, a plain count; a rate beside it only with real scammer AI rows behind it. Nothing at all while this side has no rows. */
function ThreatCatch() {
  const { rows, view, source, now, feed } = useBoard();
  const c = useMemo(() => catchOf(rows, view, source, now), [rows, view, source, now]);
  if (!c) return null;
  const seeded = source === "demo";
  const rest = catchRestWords(c.of - c.caught);
  return (
    <div className="tb-catch-box">
      <dl className="tb-catch" data-caught={c.caught} data-of={c.of}>
        <div>
          {c.of === 0 ? <dd className="tb-catch-none">{CATCH_EMPTY}</dd> : <dd>{n(c.caught)} of {n(c.of)}</dd>}
          {c.of > 0 && <dt>{seeded ? CATCH_ALL_SEEDED : CATCH_ALL}</dt>}
        </div>
        {c.of > 0 && (
          <div data-paid={c.paid}>
            <dd className={c.paid > 0 ? "alarm" : "tb-catch-zero"}>{catchPaidWords(c.paid, c.of)}</dd>
            <dt>{CATCH_PAID}</dt>
          </div>
        )}
        {c.ai && (
          <div data-ai={c.ai.caught}>
            <dd>{catchRateWords(c.ai)}</dd>
            <dt>{CATCH_AI}</dt>
          </div>
        )}
      </dl>
      {c.of > 0 && <p className="tb-catch-noorder">{NO_ORDER}</p>}
      {rest && <p className="tb-catch-rest">{rest}</p>}
      {source === "real" && feed.cut && feed.counts && <p className="tb-sub">{cutWords(rows.length, feed.counts.tried)}</p>}
    </div>
  );
}

export function ThreatRules() {
  const { rows, view, setView, source, now, freshIds } = useBoard();
  const [phone] = useState(isPhone);
  const list = useMemo(() => ruleRows(rows, view, source, now), [rows, view, source, now]);
  // The rows whose count just moved, once per try: a new try that this view shows, on the real side only. Switching sides and
  // coming back is nothing new, so it flashes nothing.
  const [arrived, setArrived] = useState<ReadonlySet<string>>(() => new Set());
  const counted = useRef(new Set<string>());
  useEffect(() => {
    const news = [...freshIds].filter((tid) => !counted.current.has(tid));
    if (news.length === 0) return;
    for (const tid of news) counted.current.add(tid);
    if (source !== "real") return;
    const inView = tryRows(rows, source).filter((r) => news.includes(r.id) && shown([r], { ...view, rule: null }, source, now).length > 0);
    if (inView.length) setArrived(new Set(inView.map((r) => `${r.rule}|${r.verdict}`)));
  }, [freshIds]); // eslint-disable-line react-hooks/exhaustive-deps -- once per arrival, not per view
  const id = useId();
  // Picking a rule goes on to its tries; picking it again only clears it.
  const pick = (r: RuleRow) => { const on = view.rule === r.rule; setView({ ...view, rule: on ? null : r.rule }); if (!on) goTo(TRIES_HEADING); };
  return (
    <section className="tb-rules" aria-labelledby={`${id}-h`}>
      <div className="tb-head">
        <h3 id={`${id}-h`} tabIndex={-1}>{RULES_HEAD}</h3>
        <SeededMark />
      </div>
      <ThreatCatch />
      {list.length === 0 ? <p className="tb-none">No rule has answered in this view.</p> : phone ? (
        <ul className="tb-rule-list">
          {list.map((r) => (
            <li key={r.id} data-rule={r.rule}>
              <button type="button" aria-pressed={view.rule === r.rule} onClick={() => pick(r)}>
                <span className="tb-rule-words">{r.words}</span>
                <b className="tb-type-n">{n(r.count)}</b>
                <span className="tb-rule-meta"><Verdict v={r.verdict} words={tryWord(r)} /> · {r.by}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <Suspense fallback={<div className="tb-grid-wait" style={{ height: 44 + list.length * 64 }} />}><RuleGrid rows={list} picked={view.rule} onPick={pick} arrived={arrived} labelledBy={`${id}-h`} /></Suspense>}
    </section>
  );
}

// ---------- 5. Every try ----------

/** What the fallback's board is drawn with (claims row tb-credit), matching Studio's "Built with AG Studio". */
export function ThreatCredit() {
  const [phone] = useState(isPhone);
  return <p className="tb-credit">{phone ? CREDIT_PHONE : CREDIT}</p>;
}

const PHONE_STEP = 12;


function save(part: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([part], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
const download = (rows: readonly Attempt[], source: "real" | "demo") => save(csvOf(rows, source), "text/csv", `${SIDE_FILE[source].file}.csv`);
/** The Excel file's writer loads only when it's asked for. Same table as the CSV (`tableOf`), the side in the file's name, the sheet's name and every row. */
const downloadXlsx = (rows: readonly Attempt[], source: "real" | "demo") => import("./xlsx.ts").then(({ xlsxOf }) => {
  const t = tableOf(rows, source);
  save(xlsxOf(SIDE_FILE[source].sheet, t.head, t.rows) as BlobPart, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${SIDE_FILE[source].file}.xlsx`);
});

export function ThreatTries() {
  const { rows, view, setView, source, now, feed, freshIds, spot } = useBoard();
  const [phone] = useState(isPhone);
  const inView = useMemo(() => shown(rows, view, source, now), [rows, view, source, now]);
  // Who tried shows only where real rows answer it two ways, the same test as the bars'.
  const who = showsSources(rows, source);
  const list = useMemo(() => tryRows(inView, source), [inView, source]);
  const totals = useMemo(() => triesTotals(list), [list]);
  const [open, setOpen] = useState<TryRow | null>(null);
  const [more, setMore] = useState(PHONE_STEP);
  useEffect(() => setMore(PHONE_STEP), [view, source]);
  const id = useId();
  // A wide screen's table of each kind over time. A phone already reads the same bars, by type, under the board's timeline.
  const lines = useMemo(() => (phone ? [] : typeLines(rows, view, source, now, bucketsFor(source, rows, now))), [phone, rows, view, source, now]);
  // The filter box: AG Grid's quick filter on a wide screen, the same reading of the same columns on a phone's list.
  // The two sides never share a filter: real rows and the seeded week are two records.
  const [find, setFind] = useState("");
  useEffect(() => setFind(""), [source]);
  const matched = useMemo(() => (phone ? filterTries(list, find, who) : list), [phone, list, find, who]);
  // How many rows the grid shows after its filters; a phone counts its own.
  // It holds only for the rows it was counted on: while a new list lands, or with no grid at all, the list's own count stands.
  const [inGrid, setInGrid] = useState<{ on: number; of: number } | null>(null);
  const on = phone ? matched.length : inGrid && inGrid.of === list.length ? inGrid.on : list.length;
  const grid = useRef<GridApi<TryRow> | null>(null);
  // "See it" and "Show all" mean every row: the filter box and the columns' filters clear with them.
  useEffect(() => { if (spot > 0 || isAll(view)) { setFind(""); grid.current?.setFilterModel(null); } }, [spot, view]);
  // A download is what's on show, in the order it's on show.
  const shownNow = (): readonly TryRow[] => {
    if (!grid.current) return matched;
    const out: TryRow[] = [];
    grid.current.forEachNodeAfterFilterAndSort((node) => { if (node.data) out.push(node.data); });
    return out;
  };
  return (
    <section className="tb-tries" aria-labelledby={`${id}-h`}>
      <div className="tb-head">
        <h3 id={`${id}-h`} tabIndex={-1}>{TRIES_HEAD}</h3>
        <SeededMark />
        <button type="button" className="tb-dl" disabled={on === 0} onClick={() => download(shownNow(), source)}>{DOWNLOAD}</button>
        <button type="button" className="tb-dl tb-dl-2" disabled={on === 0} aria-label={DOWNLOAD_XLSX_LABEL} data-xlsx onClick={() => { void downloadXlsx(shownNow(), source); }}>{DOWNLOAD_XLSX}</button>
      </div>
      <p className="tb-sub">{TRIES_NOTE}{source === "real" && feed.cut ? ` The newest ${n(rows.length)} of ${n(feed.counts?.tried ?? rows.length)}.` : ""}</p>
      {view.rule !== null && (
        <p className="tb-drill" data-drill={view.rule} data-count={list.length}>
          <span>{drillWords(list.length, RULE_WORDS[view.rule])}</span>
          <button type="button" onClick={() => { setView({ ...view, rule: null }); goTo(RULES_HEADING); }}>{DRILL_BACK}</button>
        </p>
      )}
      {lines.length > 0 && (
        <>
          <h4 id={`${id}-s`} className="tb-sparks-h">{SPARKS_HEAD}</h4>
          <Suspense fallback={<div className="tb-grid-wait" style={{ height: 40 + lines.length * 44 }} />}><SparkGrid lines={lines} labelledBy={`${id}-s`} /></Suspense>
        </>
      )}
      {list.length > 0 && (
        <div className="tb-find">
          <input type="search" aria-label={FIND_LABEL} placeholder={FIND_HINT} value={find} maxLength={120} autoComplete="off" onChange={(e) => setFind(e.target.value)} />
          <p aria-live="polite" data-found={on}>{on !== list.length ? findWords(on, list.length) : ""}</p>
        </div>
      )}
      {list.length === 0 ? <p className="tb-none">No tries in this view.</p> : phone ? (
        <>
          {matched.length === 0 && <p className="tb-none">No tries match. Clear the filter.</p>}
          <ol className="tb-try-list">
            {matched.slice(0, more).map((r) => (
              <li key={freshIds.has(r.id) ? `${r.id}|${spot}` : r.id} data-type={r.type} className={freshIds.has(r.id) ? "tb-fresh" : undefined}>
                <button type="button" className="tb-try-open" onClick={() => setOpen(r)}>
                  <span className="tb-try-top"><b>{TYPE_WORDS[r.type]}</b><Verdict v={r.verdict} words={r.verdictWords} /></span>
                  <span className="tb-try-rule">{r.ruleWords}</span>
                  <span className="tb-try-when">{r.when}{who ? ` · ${r.who}` : ""}</span>
                </button>
              </li>
            ))}
          </ol>
          {matched.length > more && <button type="button" className="tb-more" onClick={() => setMore((m) => m + PHONE_STEP * 2)}>Show more ({n(matched.length - more)} left)</button>}
        </>
      ) : <Suspense fallback={<div className="tb-grid-wait" style={{ height: 44 + 44 + 8 * 52 }} />}><TryGrid key={source} rows={list} source={source} who={who} fresh={freshIds} spot={spot} find={find} onOpen={setOpen} onShown={(n, of) => setInGrid({ on: n, of })} onApi={(a) => { grid.current = a; }} labelledBy={`${id}-h`} /></Suspense>}
      {list.length > 0 && <p className="tb-status" data-status={`${list.length}/${totals.aside}/${totals.held}/${totals.over}/${totals.cleared}/${totals.paid}`}>{totalsWords(totals)}</p>}
      {open && <Suspense fallback={null}><TrySheet row={open} source={source} who={who} onClose={() => setOpen(null)} /></Suspense>}
    </section>
  );
}
