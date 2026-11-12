// The quality ratchet's rules (Joshua, Nov 3, 1(d)): pure, so core/test/ratchet.test.ts can show every rule failing. The
// measuring is in scripts/ratchet.ts; the limits are docs/guild/ratchet.json; a written reason is
// docs/guild/ratchet-overrides.json. Limits only tighten, and only `--tighten` writes them.

export type Measured = Record<string, number>;

export interface Override { metric: string; limit: number; by: string; reason: string; date: string }
export interface Accepted extends Override { foldedAt: string }

export interface RatchetFile {
  about: string;
  /** Raw bytes a route may sit over its limit, about one short sentence: a word changed isn't a regression. Absolute, so it can't compound. */
  bundleToleranceBytes: number;
  measuredAt: string;
  sha: string;
  limits: Record<string, number>;
  /** Overrides folded by `--tighten`: the reasons stay when the override file empties. */
  accepted: Accepted[];
}

/** Sizes get smaller and skips fewer; everything else (tests, coverage, claims) gets bigger. */
export const lowerIsBetter = (metric: string): boolean => metric.startsWith("bundle.") || metric === "tests.skipped";

export const MIN_REASON = 20;
const GATEKEEPERS = new Set(["DD", "Q"]);

export function overrideProblems(list: unknown, limits: Record<string, number>): string[] {
  if (!Array.isArray(list)) return ['ratchet-overrides.json: "overrides" must be a list'];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of list.entries()) {
    const o = (raw ?? {}) as Partial<Override>;
    const at = `override ${i + 1} (${String(o.metric)})`;
    if (typeof o.metric !== "string" || !Object.hasOwn(limits, o.metric)) out.push(`${at}: names no metric in ratchet.json`);
    if (typeof o.limit !== "number" || !Number.isFinite(o.limit)) out.push(`${at}: needs a numeric limit`);
    if (!GATEKEEPERS.has(String(o.by))) out.push(`${at}: "by" must be DD or Q, not ${JSON.stringify(o.by)}`);
    if (typeof o.reason !== "string" || o.reason.trim().length < MIN_REASON) out.push(`${at}: needs a written reason of at least ${MIN_REASON} characters`);
    if (typeof o.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) out.push(`${at}: needs a date, YYYY-MM-DD`);
    if (typeof o.metric === "string") {
      if (seen.has(o.metric)) out.push(`${at}: a second override for one metric`);
      seen.add(o.metric);
    }
  }
  return out;
}

export interface Row { metric: string; limit: number | null; value: number | null; state: "ok" | "better" | "new" | "worse" | "missing" | "accepted"; by?: string; reason?: string }

/** One row per metric. Pure: same inputs, same rows. */
export function compare(limits: Record<string, number>, measured: Measured, overrides: readonly Override[], bundleToleranceBytes: number): Row[] {
  const rows: Row[] = [];
  for (const [metric, limit] of Object.entries(limits)) {
    const value = Object.hasOwn(measured, metric) ? measured[metric]! : null;
    // A number that can't be read never passes: a measurement that came back empty is the failure this exists to catch.
    if (value === null || !Number.isFinite(value)) { rows.push({ metric, limit, value, state: "missing" }); continue; }
    const low = lowerIsBetter(metric);
    const slack = metric.startsWith("bundle.") ? bundleToleranceBytes : 0;
    const within = (l: number) => (low ? value <= l + slack : value >= l);
    if (within(limit)) { rows.push({ metric, limit, value, state: value === limit ? "ok" : (low ? value < limit : value > limit) ? "better" : "ok" }); continue; }
    const o = overrides.find((x) => x.metric === metric);
    // An override can only loosen as far as it says, and only say what the number is now: a worse number still fails it.
    if (o && within(o.limit)) rows.push({ metric, limit, value, state: "accepted", by: o.by, reason: o.reason });
    else rows.push({ metric, limit, value, state: "worse" });
  }
  for (const [metric, value] of Object.entries(measured)) if (!Object.hasOwn(limits, metric)) rows.push({ metric, limit: null, value, state: "new" });
  return rows;
}

/**
 * What stops a merge. A number with no limit does too, unless `--tighten` is adding it: deleting a line from ratchet.json
 * must never be the way to get a worse number through.
 */
export const failing = (rows: readonly Row[], adding = false): Row[] => rows.filter((r) => r.state === "worse" || r.state === "missing" || (!adding && r.state === "new"));

/**
 * New limits: each metric's best of its limit and today's number; an accepted worse number becomes the limit, its reason
 * folded into `accepted`. Never call this on failing rows: a failure is not a new limit.
 */
export function tighten(file: RatchetFile, rows: readonly Row[], overrides: readonly Override[], at: { date: string; sha: string }): { file: RatchetFile; overrides: Override[] } {
  if (failing(rows, true).length) throw new Error("ratchet: a failing number can't tighten the limits");
  const limits = { ...file.limits };
  const accepted = [...file.accepted];
  const left = [...overrides];
  for (const r of rows) {
    if (r.value === null) continue;
    if (r.state === "new" || r.state === "better" || r.state === "accepted") limits[r.metric] = r.value;
    const i = left.findIndex((o) => o.metric === r.metric);
    if (i >= 0 && r.state === "accepted") accepted.push({ ...left[i]!, foldedAt: at.date });
    // A number back within its old limit needs no reason any more; an unused override doesn't linger as a blank cheque.
    if (i >= 0) left.splice(i, 1);
  }
  return { file: { ...file, measuredAt: at.date, sha: at.sha, limits: Object.fromEntries(Object.entries(limits).sort(([a], [b]) => a.localeCompare(b))), accepted }, overrides: left };
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const show = (metric: string, n: number | null) => (n === null ? "unread" : metric.startsWith("bundle.") ? kb(n) : String(n));

export function report(rows: readonly Row[]): string[] {
  const out: string[] = [];
  for (const r of failing(rows, true)) out.push(`  WORSE ${r.metric}: ${show(r.metric, r.value)}, limit ${show(r.metric, r.limit)}`);
  for (const r of rows) if (r.state === "accepted") out.push(`  accepted ${r.metric}: ${show(r.metric, r.value)}, limit ${show(r.metric, r.limit)}. ${r.by}: ${r.reason}`);
  for (const r of rows) if (r.state === "new") out.push(`  new ${r.metric}: ${show(r.metric, r.value)} has no limit in ratchet.json. A new route: run node scripts/ratchet.ts --tighten and commit it. A deleted line: put it back.`);
  return out;
}

/** The numbers for the board, one line. */
export function boardLine(m: Measured, gz: Measured = {}): string {
  const cov = Object.entries(m).filter(([k]) => k.startsWith("coverage."));
  const low = cov.length ? Math.min(...cov.map(([, v]) => v)) : 0;
  const routes = Object.entries(m).filter(([k]) => k.startsWith("bundle.")).sort(([, a], [, b]) => b - a);
  const big = routes[0];
  return `tests ${m["tests.passed"]} (${m["tests.skipped"]} skipped), money coverage ${low}%, claims ${m["claims.rows"]}, ${routes.length} routes, heaviest ${big ? `${big[0].slice(7)} ${kb(big[1])}${gz[big[0]] === undefined ? "" : ` (${kb(gz[big[0]]!)} gz)`}` : "none"}`;
}

// ---------- The board's numbers (Lead-10, Nov 4: "daily numbers on the board"). Pure, so a test can show every state. ----------

export interface LiveMetric { value: number | null; note?: string }
export interface LiveRecord { at: string; base: string; ranFrom: string; metrics: Record<string, LiveMetric> }
export interface BoardInput {
  at: string;
  sha: string;
  /** Code in this checkout that isn't in `sha`: the numbers aren't that commit's. */
  dirty: boolean;
  measured: Measured;
  gz: Measured;
  /** What couldn't be read, with why. A number here prints "not measured", never a pass. */
  unread: string[];
  limits: Record<string, number>;
  bundleToleranceBytes: number;
  live: LiveRecord | null;
  best: Record<string, number>;
}
export interface DayRow { date: string; sha: string; numbers: Record<string, number | null> }

/** Live numbers older than this say so: a day-old "0" isn't today's. */
export const STALE_HOURS = 36;
const TIMING_SLACK = 1.15;
/** Joshua's absolutes: these are held to 0, whatever yesterday's best was. */
const MUST_BE_ZERO: readonly [string, string][] = [["axeViolations", "Axe violations, every route, 1440 and 390"], ["keyboardTourFailed", "Keyboard-only through the judge tour, stops failed"], ["consoleErrors", "Console errors"], ["assets404", "Asset 404s"], ["liveWalksFailed", "Failed live walks"]];

const hoursOld = (then: string, now: string) => (Date.parse(now) - Date.parse(then)) / 3_600_000;
const liveIsFresh = (i: BoardInput) => i.live !== null && hoursOld(i.live.at, i.at) <= STALE_HOURS;
const moneyCoverage = (m: Measured): number | null => { const c = Object.entries(m).filter(([k]) => k.startsWith("coverage.")).map(([, v]) => v); return c.length ? Math.min(...c) : null; };
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** The table Joshua reads. "worse" needs a limit to compare with; a number nobody measured says so and why. */
export function boardTable(i: BoardInput): string {
  const here = `this checkout, ${i.sha}${i.dirty ? " plus uncommitted code" : ""}`;
  const whyUnread = (what: string) => i.unread.find((u) => u.startsWith(`${what}:`))?.slice(what.length + 1).trim() ?? "not read";
  const rows: string[][] = [];
  const gated = (name: string, metric: string, value: number | null, what: string, say: (n: number) => string = String, slack = 0) => {
    const limit = i.limits[metric];
    const low = lowerIsBetter(metric);
    const state = value === null ? `not measured: ${whyUnread(what)}`
      : limit === undefined ? "no limit yet"
      : (low ? value > limit + slack : value < limit) ? "WORSE"
      : (low ? value < limit : value > limit) ? "better" : "at the limit";
    rows.push([name, value === null ? "not measured" : say(value), limit === undefined ? "none" : `${low ? "at most" : "at least"} ${say(limit)}`, state, here]);
  };
  gated("Tests passing", "tests.passed", i.measured["tests.passed"] ?? null, "tests");
  gated("Tests skipped", "tests.skipped", i.measured["tests.skipped"] ?? null, "tests");
  const cov = moneyCoverage(i.measured);
  gated("Money paths' coverage, the lowest of guard, cart, money, policy, undo", "coverage.guard.branches", cov, "coverage", (n) => `${n}%`);
  gated("Claims rows", "claims.rows", i.measured["claims.rows"] ?? null, "claims");

  const liveRow = (name: string, key: string, say: (n: number) => string, zero: boolean) => {
    const m = i.live?.metrics[key];
    const where = i.live ? `${i.live.base.replace(/^https?:\/\//, "")}, ${i.live.at.slice(0, 16).replace("T", " ")} UTC` : "nowhere yet";
    const best = i.best[key];
    const target = zero ? "must be 0" : best === undefined ? "none" : `best ${say(best)}`;
    let state: string;
    if (!i.live) state = "not measured: nothing recorded yet";
    else if (!m || m.value === null) state = `not measured: ${m?.note ?? "the record has no such number"}`;
    else {
      const bad = zero ? m.value > 0 : best !== undefined && m.value > best * TIMING_SLACK;
      state = `${bad ? "WORSE" : "ok"}${bad && m.note ? ` (${m.note})` : ""}`;
      if (!liveIsFresh(i)) state = `stale, ${Math.round(hoursOld(i.live.at, i.at))} h old; ${state}`;
    }
    rows.push([name, m && m.value !== null && m.value !== undefined ? say(m.value) : "not measured", target, state, where]);
  };
  const ms = (n: number) => `${n} ms`;
  for (const key of Object.keys(i.live?.metrics ?? {}).filter((k) => k.startsWith("firstScreenP95Ms ")).sort()) liveRow(`First screen p95, ${key.slice(17)}`, key, ms, false);
  if (!Object.keys(i.live?.metrics ?? {}).some((k) => k.startsWith("firstScreenP95Ms "))) liveRow("First screen p95", "firstScreenP95Ms /", ms, false);
  liveRow("Interaction p95", "interactionP95Ms", ms, false);
  for (const [key, name] of MUST_BE_ZERO) liveRow(name, key, String, true);

  const routes = Object.keys(i.limits).filter((k) => k.startsWith("bundle.")).sort();
  for (const metric of routes) {
    const route = metric.slice(7);
    const gz = i.gz[metric];
    gated(`First load, ${route}${gz === undefined ? "" : ` (${kb(gz)} gzipped)`}`, metric, i.measured[metric] ?? null, "bundles", kb, i.bundleToleranceBytes);
  }
  const head = `**Ratchet, ${i.at.slice(0, 16).replace("T", " ")} UTC.** Limits only tighten; a worse number blocks a merge unless the DD or Q writes a reason. Bytes are raw first-load, the gate; gzipped is what a phone downloads. To refresh: \`corepack pnpm ratchet:record <live url>\`, then, after \`corepack pnpm check\`, \`corepack pnpm ratchet:board\`.`;
  return [head, "", "| Number | Now | Limit or best | State | Measured on |", "|---|---|---|---|---|", ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}

/** Today's row, for the trend. A stale live number isn't today's, so it's blank here, not repeated. */
export function dayRow(i: BoardInput): DayRow {
  const live = (k: string) => (liveIsFresh(i) ? i.live!.metrics[k]?.value ?? null : null);
  const sizes = Object.entries(i.measured).filter(([k]) => k.startsWith("bundle.")).map(([, v]) => v);
  return { date: i.at.slice(0, 10), sha: i.sha, numbers: {
    tests: i.measured["tests.passed"] ?? null, coverage: moneyCoverage(i.measured), claims: i.measured["claims.rows"] ?? null, heaviestBytes: sizes.length ? Math.max(...sizes) : null,
    firstScreenMs: live("firstScreenP95Ms /"), axe: live("axeViolations"), keyboard: live("keyboardTourFailed"), console: live("consoleErrors"), assets404: live("assets404"), walks: live("liveWalksFailed"),
  } };
}

/** One row a date, the newest run of that date winning; the last two weeks kept. */
export function addDay(days: readonly DayRow[], row: DayRow, keep = 14): DayRow[] {
  return [...days.filter((d) => d.date !== row.date), row].sort((a, b) => a.date.localeCompare(b.date)).slice(-keep);
}

export function trendTable(days: readonly DayRow[], show = 7): string {
  const n = (v: number | null | undefined, say: (x: number) => string = String) => (v === null || v === undefined ? "–" : say(v));
  const rows = days.slice(-show).map((d) => `| ${d.date} | ${d.sha} | ${n(d.numbers.tests)} | ${n(d.numbers.coverage, (x) => `${x}%`)} | ${n(d.numbers.claims)} | ${n(d.numbers.heaviestBytes, kb)} | ${n(d.numbers.firstScreenMs, (x) => `${x} ms`)} | ${n(d.numbers.axe)} | ${n(d.numbers.keyboard)} | ${n(d.numbers.console)} | ${n(d.numbers.assets404)} | ${n(d.numbers.walks)} |`);
  return ["Day by day (– means it wasn't measured that day):", "", "| Day | SHA | Tests | Money coverage | Claims | Heaviest route | First screen, / | Axe | Keyboard | Console | 404s | Walks |", "|---|---|---|---|---|---|---|---|---|---|---|---|", ...rows].join("\n");
}

export const BOARD_START = "<!-- ratchet:start -->";
export const BOARD_END = "<!-- ratchet:end -->";

/** Only what's between the markers changes. Missing or doubled markers throw: the board is the Lead's, and never gets guessed at. */
export function spliceBoard(md: string, section: string): string {
  const a = md.split(BOARD_START).length - 1, b = md.split(BOARD_END).length - 1;
  if (a !== 1 || b !== 1 || md.indexOf(BOARD_START) > md.indexOf(BOARD_END)) throw new Error(`the board needs one ${BOARD_START} before one ${BOARD_END}`);
  return `${md.slice(0, md.indexOf(BOARD_START) + BOARD_START.length)}\n${section}\n${md.slice(md.indexOf(BOARD_END))}`;
}
