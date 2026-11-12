// The Live Threat Board's logic (Track T), with no React and no AG: the same model draws the licensed path (AG Studio
// widgets) and the fallback (AG Grid Community + AG Charts), and the tests read it directly.
//
// Real and seeded rows never mix in a count, by construction: every function here takes one source's rows, there is no
// function that takes both, and the page holds them apart (`BoardRows`). Nothing here holds or could hold a note's words:
// a row is when, verdict, rule and type, and all but the time come from closed lists.

import { ATTEMPT_VERDICTS, RULE_WORDS, TYPE_WORDS, THREAT_TYPES, TRY_SOURCES, type Attempt, type AttemptRule, type AttemptVerdict, type ThreatType, type TrySource } from "./threat-shape.ts";
import { VERDICT_WORDS, readBoard } from "./board-read.ts";
export { VERDICT_WORDS, readBoard };

export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export type Source = "real" | "demo";
/** The two sources, kept apart. `real` is null while the record can't be read: no number stands in for it. */
export interface BoardRows { real: readonly Attempt[] | null; demo: readonly Attempt[] }

/** A window of time on the board: a bar of the chart, picked. */
export interface Bucket { key: string; label: string; from: number; to: number }

export interface ThreatView {
  type: ThreatType | null;
  /** A bucket of the one fold (web/src/site/tries-fold.ts), so a filter, its chip and its rows share one word. */
  verdict: FoldVerdict | null;
  rule: AttemptRule | null;
  /** Who tried. */
  by: TrySource | null;
  /** Today (on the seeded side, its last day), the last seven days, or one bar of the chart. */
  span: "all" | "today" | "week" | Bucket;
}
export const ALL: ThreatView = { type: null, verdict: null, rule: null, by: null, span: "all" };
export const isAll = (v: ThreatView) => v.type === null && v.verdict === null && v.rule === null && v.by === null && v.span === "all";

/** How many days the seeded week has; its `at` counts from Day 1, 00:00. */
export const DEMO_DAYS = 7;


/** Who decided, for the rule column: the Watcher read the note, the guard read the cart, or nothing fired and your tap is the wall. */
const GUARD_RULES: ReadonlySet<AttemptRule> = new Set(["item", "currency", "qty", "price", "max", "cap", "limit", "week", "deadline", "attribute"]);
export function decidedBy(rule: AttemptRule): "Watcher" | "Guard" | "Your tap" {
  if (rule === "your-tap") return "Your tap";
  return GUARD_RULES.has(rule) ? "Guard" : "Watcher";
}

// ---------- Time ----------

const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** The seven days or six four-hour blocks a source's rows fall in. The seeded week is always its seven days. */
export function bucketsFor(source: Source, rows: readonly Attempt[], now: number): Bucket[] {
  if (source === "demo") return Array.from({ length: DEMO_DAYS }, (_, i) => ({ key: `d${i}`, label: `Day ${i + 1}`, from: i * DAY_MS, to: (i + 1) * DAY_MS }));
  const oldest = rows.length ? Math.min(...rows.map((r) => r.at)) : now;
  if (now - oldest <= DAY_MS) {
    // The last day in four-hour blocks, ending at the block now is in.
    const end = new Date(now);
    end.setMinutes(0, 0, 0);
    end.setHours(end.getHours() - (end.getHours() % 4) + 4);
    const stop = end.getTime();
    return Array.from({ length: 6 }, (_, i) => {
      const to = stop - (5 - i) * 4 * HOUR_MS;
      return { key: `h${to}`, label: new Date(to - 4 * HOUR_MS).toLocaleTimeString("en-US", { hour: "numeric" }), from: to - 4 * HOUR_MS, to };
    });
  }
  const today = startOfDay(now);
  return Array.from({ length: 7 }, (_, i) => {
    // Through Date, not day arithmetic, so a clock change doesn't shift a boundary.
    const fromD = new Date(today); fromD.setDate(fromD.getDate() - (6 - i));
    const toD = new Date(fromD); toD.setDate(toD.getDate() + 1);
    return { key: `d${fromD.getTime()}`, label: fromD.toLocaleDateString("en-US", { weekday: "short" }), from: fromD.getTime(), to: toD.getTime() };
  });
}

/** The time a view's span covers for this source, or null for all of it. */
export function spanWindow(view: ThreatView, source: Source, now: number): { from: number; to: number } | null {
  const s = view.span;
  if (s === "all") return null;
  if (typeof s === "object") return { from: s.from, to: s.to };
  if (source === "demo") return s === "today" ? { from: (DEMO_DAYS - 1) * DAY_MS, to: DEMO_DAYS * DAY_MS } : null;
  return s === "today" ? { from: startOfDay(now), to: Infinity } : { from: now - 7 * DAY_MS, to: Infinity };
}

const within = (w: { from: number; to: number } | null, at: number) => w === null || (at >= w.from && at < w.to);

// ---------- Reading a view ----------

/** The rows a view shows, from one source's rows. */
export function shown(rows: readonly Attempt[], view: ThreatView, source: Source, now: number): Attempt[] {
  const w = spanWindow(view, source, now);
  return rows.filter((r) => (view.type === null || r.type === view.type) && (view.verdict === null || attemptVerdict(r) === view.verdict) && (view.rule === null || r.rule === view.rule) && (view.by === null || r.source === view.by) && within(w, r.at));
}

export type TriesBy = "type" | "day" | "verdict";
export interface TriesBar { key: string; words: string; count: number }
/**
 * The bars of a chart of the view's tries, which always sum to the view. Kinds and verdicts with no tries draw no bar; days do, since a
 * quiet day is what a chart by day is there to show: the seeded week's seven, or every calendar day from a real first try to its last.
 */
export function triesBy(by: TriesBy, rows: readonly Attempt[], view: ThreatView, source: Source, now: number): TriesBar[] {
  const rowsIn = shown(rows, view, source, now);
  const tally = (keyOf: (r: Attempt) => string) => { const m = new Map<string, number>(); for (const r of rowsIn) m.set(keyOf(r), (m.get(keyOf(r)) ?? 0) + 1); return m; };
  if (by === "type") {
    const m = tally((r) => r.type);
    return THREAT_TYPES.filter((t) => m.has(t)).map((t) => ({ key: t as string, words: TYPE_WORDS[t], count: m.get(t)! })).sort((a, b) => b.count - a.count);
  }
  if (by === "verdict") {
    // By the one fold (web/src/site/tries-fold.ts), in the stamp's words, so the bars, the rows and the strip agree.
    const m = new Map<string, { words: string; count: number }>();
    for (const r of rowsIn) { const k = attemptVerdict(r); const e = m.get(k) ?? { words: tryWord(r), count: 0 }; e.count++; m.set(k, e); }
    return [...m].map(([key, e]) => ({ key, words: e.words, count: e.count })).sort((a, b) => b.count - a.count);
  }
  const m = tally((r) => dayWords(r.at, source));
  const days: string[] = [];
  if (source === "demo") for (let d = 0; d < DEMO_DAYS; d++) days.push(dayWords(d * DAY_MS, "demo"));
  else if (rowsIn.length > 0) {
    const ats = rowsIn.map((r) => r.at), first = new Date(Math.min(...ats)), last = dayWords(Math.max(...ats), "real");
    for (let i = 0; ; i++) {
      const w = dayWords(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i, 12).getTime(), "real");
      days.push(w);
      if (w === last) break;
    }
  }
  return days.map((d) => ({ key: d, words: d, count: m.get(d) ?? 0 }));
}

/** Room for a sideways chart's names: AG caps its axis at under a third of the chart, which cut "Hidden instructions" at 390, on a canvas no check can read. */
/** A verdict's bar wears the board's tier (`splitOf`): Set aside in ink, Waits for your yes, Over your limit and Clear in the quieter ink, Paid in the marker. A type's or a day's bar holds every verdict, so it stays in ink. */
export const barTint = (key: string): "ink" | "ink3" | "mark" => key === "paid" ? "mark" : key === "set-aside" || key === "aside" ? "ink" : (ATTEMPT_VERDICTS as readonly string[]).includes(key) || key === "held" || key === "over" || key === "clear" ? "ink3" : "ink";
export const namesRoom = (bars: readonly TriesBar[], width: number): number => Math.min(Math.ceil(Math.max(0, ...bars.map((b) => b.words.length)) * 6.8) + 14, Math.round(width * 0.5));
/** The value axis's top: a little past the longest bar, so the number at its end stays on the canvas. */
export const triesTop = (bars: readonly TriesBar[]): number => Math.max(1, ...bars.map((b) => b.count)) * 1.22;

/** What became of one bar's tries. The three always sum to the bar: a bar can't hide a try that got through. */
export interface BarSplit { caught: number; rest: number; paid: number }
const splitOf = (rows: readonly Attempt[], b: Bucket): BarSplit => {
  const s: BarSplit = { caught: 0, rest: 0, paid: 0 };
  for (const r of rows) if (r.at >= b.from && r.at < b.to) { if (r.verdict === "set-aside") s.caught++; else if (r.verdict === "paid") s.paid++; else s.rest++; }
  return s;
};
const barOf = (s: BarSplit) => s.caught + s.rest + s.paid;

export interface TypeRow { type: ThreatType; words: string; count: number; bars: number[]; split: BarSplit[] }

/**
 * One row per kind of trick: its count under the view (all of it but the type, so a picked row keeps its neighbours for
 * comparison) and its bars over time (all of it but the type and the time, so a picked day keeps its week). Rows sum to
 * the count of the same view with no type picked: nothing falls off the board. "No known trick" shows only with rows in it.
 */
export function typeRows(rows: readonly Attempt[], view: ThreatView, source: Source, now: number, buckets: readonly Bucket[]): TypeRow[] {
  const inView = shown(rows, { ...view, type: null }, source, now);
  const forBars = shown(rows, { ...view, type: null, span: "all" }, source, now);
  return THREAT_TYPES.map((type) => {
    const mine = forBars.filter((r) => r.type === type);
    const split = buckets.map((b) => splitOf(mine, b));
    return { type, words: TYPE_WORDS[type], count: inView.filter((r) => r.type === type).length, bars: split.map(barOf), split };
  }).filter((t) => rows.some((r) => r.type === t.type));
}

export interface TypeLine { id: ThreatType; words: string; count: number; bars: number[]; setAside: number }

/** The table's row per kind of trick: `typeRows`' own rows and bars, plus how much of that kind's view was set aside (0 to 1). */
export function typeLines(rows: readonly Attempt[], view: ThreatView, source: Source, now: number, buckets: readonly Bucket[]): TypeLine[] {
  const inView = shown(rows, { ...view, type: null }, source, now);
  return typeRows(rows, view, source, now, buckets).map((t) => {
    const mine = inView.filter((r) => r.type === t.type);
    return { id: t.type, words: t.words, count: t.count, bars: t.bars, setAside: mine.length ? mine.filter((r) => r.verdict === "set-aside").length / mine.length : 0 };
  });
}

/** A sparkline's points in a `width` by `height` box, tallest bar at the top and a margin so its stroke isn't cut. One bucket draws a flat line, so a kind with one day still shows. */
export function sparkPoints(bars: readonly number[], width: number, height: number): [number, number][] {
  const top = Math.max(1, ...bars), pad = 1, y = (b: number) => height - pad - (b / top) * (height - 2 * pad);
  if (bars.length === 0) return [];
  if (bars.length === 1) return [[0, y(bars[0]!)], [width, y(bars[0]!)]];
  return bars.map((b, i) => [(i / (bars.length - 1)) * width, y(b)]);
}

/** Who tried, in words. Only ever said of real rows: the seeded rows are notes we wrote, so nobody and no AI tried them. */
/** `source: "person"` means only "not the scammer AI": one `curl` counts as one, so no word here credits a person (the ruling on the counter, Round 5). */
export const sourceWords = (by: TrySource): string => (by === "person" ? "Not the scammer AI" : "Scammer AI");

/** Who tried is a question only once real rows answer it two ways. Until a real scammer AI row exists, the board says nothing about one. */
export const showsSources = (rows: readonly Attempt[], side: Source): boolean =>
  side === "real" && rows.some((r) => r.source === "scammer-ai") && rows.some((r) => r.source === "person");

export interface SourceRow { by: TrySource; words: string; count: number; bars: number[]; split: BarSplit[] }

/** One row per source, under the view (all of it but the source, and the time for its bars), the same shape as `typeRows`. */
export function sourceRows(rows: readonly Attempt[], view: ThreatView, side: Source, now: number, buckets: readonly Bucket[]): SourceRow[] {
  const inView = shown(rows, { ...view, by: null }, side, now);
  const forBars = shown(rows, { ...view, by: null, span: "all" }, side, now);
  return TRY_SOURCES.map((by) => {
    const mine = forBars.filter((r) => r.source === by);
    const split = buckets.map((b) => splitOf(mine, b));
    return { by, words: sourceWords(by), count: inView.filter((r) => r.source === by).length, bars: split.map(barOf), split };
  });
}

/**
 * What the Watcher set aside, as a plain count over the rows in view: a person's try may not be a scam, so this is never a
 * rate. A rate means something only over notes that are scams by construction, so `ai` exists only with real scammer AI
 * rows behind it, and never on the seeded week. Null while this side has no rows. Reads the view, all of it but the source and the rule.
 */
export interface Catch { caught: number; of: number; paid: number; ai: { caught: number; of: number } | null }
export function catchOf(rows: readonly Attempt[], view: ThreatView, side: Source, now: number): Catch | null {
  if (rows.length === 0) return null;
  const inView = shown(rows, { ...view, by: null, rule: null }, side, now);
  const caught = (list: readonly Attempt[]) => list.filter((r) => r.verdict === "set-aside").length;
  const ai = side === "real" ? inView.filter((r) => r.source === "scammer-ai") : [];
  return { caught: caught(inView), of: inView.length, paid: inView.filter((r) => r.verdict === "paid").length, ai: ai.length ? { caught: caught(ai), of: ai.length } : null };
}

/** A percent says too much about a few tries, so under ten it's the count alone; and a percent always says what it's over, in the same line. */
export const catchRateWords = (c: { caught: number; of: number }): string =>
  c.of >= 10 ? `${Math.round((c.caught / c.of) * 100)}% of ${c.of.toLocaleString("en-US")}` : `${c.caught} of ${c.of}`;

/** The headline in two lines, the same words in the same order: how it ended stands alone, whichever way it ended. A line with no tries is one line. */
export function lineParts(line: string): [string, string | null] {
  const m = /^(.+\.) ((?:None got it to pay|It didn't get Goose to pay|[\d,]+ got it to pay)\.)$/.exec(line);
  return m ? [m[1]!, m[2]!] : [line, null];
}

/** The bars' shared scale: never under five tries, so one try in a thin week is a low bar, not a wall of colour. */
export const barTop = (tallest: number) => Math.max(5, tallest);

export interface RuleRow { id: string; rule: AttemptRule; words: string; by: "Watcher" | "Guard" | "Your tap"; verdict: AttemptVerdict; count: number; types: string }

/** The rule behind each verdict: one row per rule and verdict, under the view (all of it but the rule), the most used first. */
export function ruleRows(rows: readonly Attempt[], view: ThreatView, source: Source, now: number): RuleRow[] {
  const inView = shown(rows, { ...view, rule: null }, source, now);
  const out = new Map<string, { rule: AttemptRule; verdict: AttemptVerdict; count: number; types: Set<ThreatType> }>();
  for (const r of inView) {
    const k = `${r.rule}|${r.verdict}`;
    const e = out.get(k) ?? { rule: r.rule, verdict: r.verdict, count: 0, types: new Set<ThreatType>() };
    e.count++;
    e.types.add(r.type);
    out.set(k, e);
  }
  return [...out.entries()]
    .map(([id, e]) => ({ id, rule: e.rule, words: RULE_WORDS[e.rule], by: decidedBy(e.rule), verdict: e.verdict, count: e.count, types: THREAT_TYPES.filter((t) => e.types.has(t)).map((t) => TYPE_WORDS[t]).join(", ") }))
    .sort((a, b) => b.count - a.count || a.words.localeCompare(b.words));
}

/** A row with an id the grid can follow as rows stream in (two tries in one minute can look the same; `k` tells them apart). */
export interface TryRow extends Attempt { id: string; when: string; typeWords: string; verdictWords: string; ruleWords: string; by: string; who: string }

/** The day a try falls on, in the same words as `whenWords`: the pivots' columns, one per day. */
export function dayWords(at: number, source: Source): string {
  if (source === "demo") return `Day ${Math.floor(at / DAY_MS) + 1}`;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The same day as `dayWords`, the reader's own, written to sort as a date: Studio's Day column, which a visitor's chart sorts as text. Never `toISOString`, whose date is UTC's: it put 4:59 PM on Nov 4 in California on Nov 5. */
export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** `dayWords`' days in the order they happened, not the alphabet's: "Day 2" before "Day 10", "Oct 31" before "Nov 1". */
export function dayOrder(a: string, b: string): number {
  const key = (w: string) => { const n = /^Day (\d+)$/.exec(w); if (n) return Number(n[1]); const [m, d] = w.split(" "); return MONTHS.indexOf(m ?? "") * 100 + Number(d); };
  return key(a) - key(b);
}

export function whenWords(at: number, source: Source): string {
  if (source === "demo") {
    const day = Math.floor(at / DAY_MS) + 1;
    const mins = Math.floor((at % DAY_MS) / 60_000);
    return `Day ${day}, ${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  return new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function tryRows(rows: readonly Attempt[], source: Source): TryRow[] {
  const seen = new Map<string, number>();
  // Numbered from the oldest, so a new row at the top doesn't change the ids of the rows under it.
  const ids = [...rows].reverse().map((r) => {
    // Every field a filter can read is in the base, so a row keeps its id under any view.
    const base = `${source}|${r.at}|${r.verdict}|${r.rule}|${r.type}|${r.source}`;
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    return `${base}|${k}`;
  }).reverse();
  return rows.map((r, i) => ({ ...r, id: ids[i]!, when: whenWords(r.at, source), typeWords: TYPE_WORDS[r.type], verdictWords: tryWord(r), ruleWords: RULE_WORDS[r.rule], by: decidedBy(r.rule), who: source === "real" ? sourceWords(r.source) : "" }));
}

/** What a filter finds under a row's rule: what its tip says too, so "Watcher" finds what the Watcher decided. Read by the phone's box and the grid's. */
export const ruleFindText = (r: { ruleWords: string; by: string; rule: string }): string => `${r.ruleWords} ${r.by} ${r.rule}`;

/**
 * The filter box on a phone, which has no grid: every word typed is somewhere in what the row shows, as AG Grid's quick
 * filter reads the same columns on a wide screen (`tryColumns` in ThreatGrid.tsx). Who counts only where it's on show.
 */
export function filterTries(rows: readonly TryRow[], words: string, who: boolean): TryRow[] {
  const parts = words.toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [...rows];
  return rows.filter((r) => {
    const text = [r.when, r.typeWords, who ? r.who : "", r.verdictWords, ruleFindText(r)].join(" ").toLowerCase();
    return parts.every((p) => text.includes(p));
  });
}

/** A row's tooltip: the rule behind the verdict, who decided it, the rule's name in code. Closed lists only, never a note's words. */
export const ruleTip = (r: { ruleWords: string; by: string; rule: string }): string => `${r.ruleWords}. Decided by: ${r.by}. Rule: ${r.rule}.`;

/**
 * The "All tries" block: one list, the rows the view shows, so its total, its area and its donut can't disagree with each
 * other or with the rest of the board. `drawn` is what the area holds: the buckets cover the last days, the total may not.
 */
export interface Over { parts: BarSplit; split: BarSplit[]; drawn: number }
export function overviewOf(rows: readonly Attempt[], view: ThreatView, source: Source, now: number, buckets: readonly Bucket[]): Over {
  const inView = shown(rows, view, source, now);
  const parts: BarSplit = { caught: inView.filter((r) => r.verdict === "set-aside").length, rest: inView.filter((r) => r.verdict !== "set-aside" && r.verdict !== "paid").length, paid: inView.filter((r) => r.verdict === "paid").length };
  const split = buckets.map((b) => splitOf(inView, b));
  return { parts, split, drawn: split.reduce((a, s) => a + barOf(s), 0) };
}

/** An area needs a shape: with fewer buckets than this holding tries it would draw a spike and imply a trend, so it isn't drawn. */
export const AREA_MIN_BUCKETS = 3;
export const areaWorthDrawing = (split: readonly BarSplit[]): boolean => split.filter((s) => s.caught + s.rest + s.paid > 0).length >= AREA_MIN_BUCKETS;


/** The ids in the newer answer that the older one didn't have. The first read has nothing to compare with, so nothing in it is news. */
export function arrivals(before: readonly Attempt[] | null, after: readonly Attempt[]): string[] {
  if (before === null) return [];
  const had = new Set(tryRows(before, "real").map((r) => r.id));
  return tryRows(after, "real").map((r) => r.id).filter((id) => !had.has(id));
}

/** The four ways a try could beat Goose, counted from the rows: each stays 0 only while no row says otherwise. */
export const WALLS: ReadonlyArray<{ rule: AttemptRule; words: string }> = [
  { rule: "money-moved", words: "Money moved" },
  { rule: "over-limit", words: "Over your limit" },
  { rule: "different-cart", words: "A different cart" },
  { rule: "no-tap", words: "Without your tap" },
];
export const wallCount = (rows: readonly Attempt[], rule: AttemptRule) => rows.filter((r) => r.rule === rule && r.verdict === "paid").length;

/** A source's rows as a plain table, the fields the row holds and nothing else: one table for the CSV and the Excel file, so they can't disagree. Every cell comes from a closed list. */
export function tableOf(rows: readonly Attempt[], source: Source): { head: string[]; rows: string[][] } {
  // No "who" on the seeded side: nobody tried those notes.
  if (source === "demo") return { head: ["side", "when", "type", "verdict", "rule"], rows: tryRows(rows, source).map((r) => ["seeded demo week", r.when, r.typeWords, r.verdictWords, r.ruleWords]) };
  return { head: ["side", "when", "type", "who", "verdict", "rule"], rows: tryRows(rows, source).map((r) => ["real", r.when, r.typeWords, r.who, r.verdictWords, r.ruleWords]) };
}

/** The table as CSV. Formula-looking text can't arise: every cell comes from a closed list. */
export function csvOf(rows: readonly Attempt[], source: Source): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const t = tableOf(rows, source);
  return [t.head.join(","), ...t.rows.map((r) => r.map(q).join(","))].join("\n");
}

/** A download's name and the Excel sheet's: each file says which side it holds, whatever it's renamed to, by its rows' `side` column too. */
export const SIDE_FILE: Record<Source, { file: string; sheet: string }> = {
  demo: { file: "goose-seeded-demo-week", sheet: "Seeded demo week" },
  real: { file: "goose-real-tries", sheet: "Real tries" },
};

/**
 * What changed in the Every-try list: the rows that just arrived, when every row that was there still is, in order, under
 * them. That's a live try, which the grid takes as one transaction, so nothing else on the table is touched. Any other
 * change (a filter, a time picked) returns null, and the grid takes the new list whole.
 */
export function triesArrived(before: readonly { id: string }[], after: readonly { id: string }[]): TryRow[] | null {
  const added = after.length - before.length;
  if (added < 0) return null;
  for (let i = 0; i < before.length; i++) if (after[i + added]?.id !== before[i]!.id) return null;
  return after.slice(0, added) as TryRow[];
}

/** The strip under the table: what became of the tries in view, counted by the one fold the home page's counter uses (`web/src/site/tries-fold.ts`). */
export { foldTries as triesTotals, tryWord } from "../site/tries-fold.ts";
import { attemptVerdict, foldWord, tryWord, type FoldVerdict } from "../site/tries-fold.ts";

/**
 * The ledger rows a rule decided, on this side only: a try's row keeps no link to any run (it holds five fields and no
 * words), so these are the rows citing the same rule, and the sheet says so. The seeded side reads the demo week's rows and
 * the real side only this session's: the two records never mix.
 */
export function ledgerForRule<R extends { rule: string | null; part: "week" | "session" }>(rows: readonly R[], rule: AttemptRule, source: Source): R[] {
  const part = source === "demo" ? "week" : "session";
  return rows.filter((r) => r.part === part && r.rule !== null && r.rule.split(", ").includes(rule));
}

// ---------- Ask for a view ----------

/** The fixed rule's words: what it can read. Word-start matches only, so "paid" isn't found in "unpaid". */
const TYPE_ASKS: ReadonlyArray<readonly [ThreatType, RegExp]> = [
  ["friends-family", /\bfriends?\s*(?:&|and|n|\+)\s*family\b|\bf\s*&\s*f\b|\bff\b/],
  ["gift-card", /\bgift\s*-?\s*cards?\b|\bsteam card|\bitunes\b/],
  ["hidden-instructions", /\bhidden\b|\binstructions?\b|\binjection|\bprompt\b|\bsystem\b|\bgiv\w* (?:goose )?orders?\b/],
  ["fake-urgency", /\burgen|\bhurry|\bpressure|\brush\w*\b|\bcountdown\b|\blast chance\b/],
  ["pay-off-site", /\boff[\s-]?(?:site|paypal|platform)\b|\boutside (?:of )?paypal\b|\bzelle\b|\bvenmo\b|\bwire\b|\bcrypto|\bbank transfer|\bcash\b/],
  ["factory-direct", /\bfactory\b|\bdirect from\b/],
  ["already-shipped", /\balready[\s-]shipped\b|\bshipped\b/],
  ["overpay-refund", /\boverpa(?:y|id|yment)\b|\brefund/],
  ["none", /\bno known trick\b/],
];
// The fold's buckets: a refusal off the money rules is Set aside, as the strip counts it; "Waits for your yes" is held.
const VERDICT_ASKS: ReadonlyArray<readonly [FoldVerdict, RegExp]> = [
  ["paid", /\bgot (?:it|goose|through)\b|\bpaid\b|\bgot it to pay\b/],
  ["aside", /\bset[\s-]aside\b|\bblocked?\b|\bcaught\b|\bstopped\b|\brefus/],
  ["held", /\bwaits? for your yes\b|\byour yes\b|\bheld\b|\bhold\b|\byour tap\b/],
  ["clear", /\bcleared\b|\bgot past\b|\bclear ones?\b|\bverdict clear\b/],
];
const RULE_ASKS: ReadonlyArray<readonly [AttemptRule, RegExp]> = [
  ["no-history", /\bno (?:sales|history)\b|\bnew (?:shop|seller)\b/],
  ["max", /\bover (?:your |the |my )?(?:limit|max)\b/],
];
const BY_ASKS: ReadonlyArray<readonly [TrySource, RegExp]> = [
  ["scammer-ai", /\bscammer(?: ai)?\b|\bbots?\b|\bby (?:the |an )?ai\b/],
  ["person", /\bpeople\b|\bpersons?\b|\bhumans?\b/],
];
const SOME_VIEW = /\battempts?\b|\btr(?:y|ies)\b|\btricks?\b|\bthreats?\b|\bscams?\b|\bevery(?:thing)?\b|\ball\b|\bboard\b|\breset\b|\bclear\b/;

export interface AskRead { view: ThreatView; source: Source | null }

/** What a fixed rule makes of the words, or null when they aren't a threat-board view. Never the words themselves: only closed values come out. */
export function readAsk(words: string): AskRead | null {
  const w = words.toLowerCase().replace(/\s+/g, " ").trim();
  if (!w) return null;
  const type = TYPE_ASKS.find(([, re]) => re.test(w))?.[0] ?? null;
  const verdict = VERDICT_ASKS.find(([, re]) => re.test(w))?.[0] ?? null;
  const rule = RULE_ASKS.find(([, re]) => re.test(w))?.[0] ?? null;
  const by = BY_ASKS.find(([, re]) => re.test(w))?.[0] ?? null;
  const day = /\bday ([1-7])\b/.exec(w);
  const source: Source | null = /\bseeded\b|\bdemo\b|\bexamples?\b/.test(w) || day ? "demo" : /\breal\b|\blive\b|\bactual\b/.test(w) ? "real" : null;
  const span: ThreatView["span"] = day
    ? { key: `d${Number(day[1]) - 1}`, label: `Day ${day[1]}`, from: (Number(day[1]) - 1) * DAY_MS, to: Number(day[1]) * DAY_MS }
    : /\btoday\b|\bso far today\b/.test(w) ? "today" : /\b(?:this|last|past) week\b|\b7 days\b|\bseven days\b/.test(w) ? "week" : "all";
  if (type === null && verdict === null && rule === null && by === null && span === "all" && source === null && !SOME_VIEW.test(w)) return null;
  return { view: { type, verdict, rule, by, span }, source };
}

/**
 * An asked-for source only stands where real rows hold it. Asked for the scammer AI with none on the record, the view
 * drops the source and says so, because showing every try in answer would imply they were its. The seeded side has no source.
 */
export function askedView(view: ThreatView, side: Source, real: readonly Attempt[] | null): { view: ThreatView; noAi: boolean } {
  if (view.by === null) return { view, noAi: false };
  const holds = side === "real" && (view.by === "person" || (real ?? []).some((r) => r.source === "scammer-ai"));
  return holds ? { view, noAi: false } : { view: { ...view, by: null }, noAi: view.by === "scammer-ai" };
}

/** Words that are about this board, for the Studio ask box, where the agent answers everything else ("everything Goose blocked this week" stays the ledger's). */
export function asksBoard(words: string): boolean {
  const w = words.toLowerCase();
  return TYPE_ASKS.some(([, re]) => re.test(w)) || RULE_ASKS.some(([, re]) => re.test(w)) || /\b(?:tries|tried|attempts?|threats?|tricks?|scammer|got it to pay|catch rate|seeded)\b/.test(w);
}

/**
 * Words that ask for a chart, not for a list of rows: "Tries by day", "chart the attempts" (F on the rehearsal, Nov 5: these got the
 * whole board back with "No AI call" and no chart). The board's own rule filters, so a chart goes to the view path, which draws one.
 * "every try by the scammer AI" and "tries on Day 3" stay filters: "by" counts only before a thing a chart can split on.
 */
export const CHART_ASK = /\b(?:charts?|graphs?|plots?|histogram|pie|donut|bars?|trend|breakdown|break down|over time|daily|by (?:type|kind|day|date|week|verdict|outcome|result)|per (?:day|week|type|kind|verdict)|each (?:day|type|kind|verdict))\b/;
export const asksChart = (words: string): boolean => CHART_ASK.test(words.toLowerCase());
/** What the Studio box hands the board's rule: its words, less a chart of them. A request to act is the box's own to refuse first. */
export const boardTakes = (words: string): boolean => asksBoard(words) && !asksChart(words);

const SPAN_WORDS = (view: ThreatView, source: Source) =>
  typeof view.span === "object" ? `on ${view.span.label}` : view.span === "today" ? (source === "demo" ? "on Day 7" : "today") : view.span === "week" ? (source === "demo" ? "this week" : "in the last 7 days") : "";

/** The one sentence a view says, from the rows' own count: the sentence and the rows can't disagree. */
export function viewWords(view: ThreatView, source: Source, count: number): string {
  const what = [view.type ? TYPE_WORDS[view.type] : "", count === 1 ? "try" : "tries"].filter(Boolean).join(" ");
  const verdict = view.verdict ? (view.verdict === "paid" ? "that got it to pay" : view.verdict === "held" ? "waiting for your yes" : view.verdict === "over" ? "over your limit" : view.verdict === "clear" ? "marked Clear" : "set aside") : "";
  const rule = view.rule ? `under “${RULE_WORDS[view.rule]}”` : "";
  const by = view.by && source === "real" ? (view.by === "person" ? "not by the scammer AI" : "by the scammer AI") : "";
  const line = [count === 0 ? "No" : count.toLocaleString("en-US"), source === "real" ? "real" : "seeded", what, by, verdict, rule, SPAN_WORDS(view, source)].filter(Boolean).join(" ");
  return `${line}.`;
}

/** The line under the ask says only what a filter narrowed: with none on, the count is the switch's own, right above it (DD, Nov 4). */
export const viewLine = (view: ThreatView, source: Source, count: number): string => (isAll(view) ? "" : viewWords(view, source, count));

/** The words for one filter in place, shown as a chip the visitor can clear. */
export function viewChips(view: ThreatView, source: Source): ReadonlyArray<{ key: keyof ThreatView; words: string }> {
  const out: Array<{ key: keyof ThreatView; words: string }> = [];
  if (view.type) out.push({ key: "type", words: TYPE_WORDS[view.type] });
  if (view.verdict) out.push({ key: "verdict", words: foldWord(view.verdict) });
  if (view.rule) out.push({ key: "rule", words: RULE_WORDS[view.rule] });
  if (view.by && source === "real") out.push({ key: "by", words: sourceWords(view.by) });
  if (view.span !== "all") out.push({ key: "span", words: typeof view.span === "object" ? view.span.label : view.span === "today" ? (source === "demo" ? "Day 7" : "Today") : source === "demo" ? "The week" : "Last 7 days" });
  return out;
}
