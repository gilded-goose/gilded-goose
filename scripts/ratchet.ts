// The quality ratchet (Joshua, Nov 3, 1(d)): fails on any number that got worse than docs/guild/ratchet.json. The last
// step of `pnpm check`, so it reads what that run just made: the test results, the web build. It adds one short run of
// its own, the money paths' coverage. Measured on live or in the walks (first screen, p95, axe, console errors, 404s)
// goes through scripts/ratchet-record.ts instead, which can't flake a merge.
//
//   node scripts/ratchet.ts              check; exit 1 on a worse number
//   node scripts/ratchet.ts --tighten    check, then write today's best as the limits (the Lead, once a day and after a merge)
//   node scripts/ratchet.ts --json       the numbers, for the board
//
// A worse number the DD or Q accepts: add it to docs/guild/ratchet-overrides.json with a written reason. It prints on
// every run until `--tighten` folds it into ratchet.json's `accepted`.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { claimRows } from "@goose/core/proof";
import { boardLine, compare, failing, overrideProblems, report, tighten, type Measured, type Override, type RatchetFile } from "./ratchet-lib.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIMITS = join(ROOT, "docs/guild/ratchet.json");
const OVERRIDES = join(ROOT, "docs/guild/ratchet-overrides.json");
const DIST = join(ROOT, "web/dist");
const MANIFEST = join(ROOT, "web/node_modules/.ratchet/manifest.json");
const MAX_RESULT_AGE_MS = 60 * 60 * 1000;

/** Every problem reading a number stops the ratchet: an empty measurement must never read as a pass. */
export class Unread extends Error {}

/** The packages `pnpm test` runs. Their sum is the number that only goes up. */
export function tests(): Measured {
  let passed = 0, skipped = 0;
  for (const pkg of ["trust", "core", "mcp"]) {
    const file = join(ROOT, pkg, "node_modules/.ratchet/tests.json");
    if (!existsSync(file)) throw new Unread(`${pkg}: no test results at ${file}. Run corepack pnpm test first.`);
    if (Date.now() - statSync(file).mtimeMs > MAX_RESULT_AGE_MS) throw new Unread(`${pkg}: the test results are over an hour old. Run corepack pnpm test first.`);
    const r = JSON.parse(readFileSync(file, "utf8")) as { success: boolean; numPassedTests: number; numPendingTests: number; numTodoTests?: number };
    if (!r.success) throw new Unread(`${pkg}: the last test run failed.`);
    passed += r.numPassedTests;
    skipped += r.numPendingTests + (r.numTodoTests ?? 0);
  }
  return { "tests.passed": passed, "tests.skipped": skipped };
}

/** The money paths' own run (core/vitest.money.config.ts). A report that lost a file, as a bad path once did, fails. */
export function coverage(): Measured {
  const run = spawnSync("corepack", ["pnpm", "--filter", "@goose/core", "exec", "vitest", "run", "--config", "vitest.money.config.ts", "--reporter=dot"], { cwd: ROOT, encoding: "utf8" });
  if (run.status !== 0) throw new Unread(`the money-path run failed:\n${run.stdout.slice(-1500)}\n${run.stderr.slice(-500)}`);
  const summary = JSON.parse(readFileSync(join(ROOT, "core/node_modules/.ratchet/coverage/coverage-summary.json"), "utf8")) as Record<string, Record<"statements" | "branches" | "functions" | "lines", { pct: number; total: number }>>;
  const out: Measured = {};
  for (const name of ["guard", "cart", "money", "policy", "undo"]) {
    const hit = Object.entries(summary).find(([path]) => path.endsWith(`/trust/src/${name}.ts`));
    if (!hit) throw new Unread(`the money-path coverage has no ${name}.ts, so it can't be read as 100%.`);
    if (hit[1].statements.total === 0) throw new Unread(`the money-path coverage read nothing in ${name}.ts.`);
    for (const m of ["statements", "branches", "functions", "lines"] as const) out[`coverage.${name}.${m}`] = hit[1][m].pct;
  }
  return out;
}

interface Chunk { file: string; imports?: string[]; css?: string[]; isEntry?: boolean; assets?: string[] }

/**
 * Which chunks each route's first load pulls in, from web/src/main.tsx: a source path, or a chunk's name where Vite keys a
 * shared chunk by its hash (MenuButton, Desk). A chunk the build no longer has fails below.
 */
export const ROUTE_CHUNKS: Record<string, string[]> = {
  "wallet": ["src/Wallet.tsx", "wallet-week"], // by name: Vite keys wallet-week.ts by its path or by a hash, depending on what shares its chunk
  "classic": ["src/App.tsx", "MenuButton"],
  "desk": ["Desk"],
  "market": ["src/StoreSync.tsx", "MenuButton"],
  "haggle": ["src/Haggle.tsx"],
  "ledger": ["src/studio/pick.ts"],
  "proof": ["src/Proof.tsx"],
  "tour": ["src/tour/Tour.tsx"],
  "system": ["src/system/System.tsx"],
  "how": ["src/how/How.tsx"],
  "builders": ["src/builders/Builders.tsx"],
  "list": ["src/list/List.tsx"],
};

/** The white site (web/goose.html, Lucas, Nov 9) by the same reading, from its own entry: `site` is its first screen
 *  alone, each other route that screen plus the page chunk its hash route loads (web/src/site/App.tsx). Its lines sit
 *  under the old first screen's (the Nov 11 speed gate: the new site may not be slower than the old one). */
export const SITE_ROUTE_CHUNKS: Record<string, string[]> = {
  "site": [],
  "site-shop": ["Shop"], // by name, like wallet-week: Vite keys Shop by its hash when another chunk shares it
  "site-hood": ["src/site/hood/Page.tsx"],
  "site-proof": ["src/site/proof/Proof.tsx"],
  "site-builders": ["src/site/builders/Builders.tsx"],
  "site-legacy": ["src/site/legacy/Pages.tsx"],
  "site-verify": ["src/site/verify/Verify.tsx"],
};

/**
 * First-load bytes per route: the page, its entry, the route's own chunk and everything they statically import. The gate
 * is raw built bytes: a build is byte-identical everywhere, but zlib's output differs between a Mac's chip and GitHub's
 * runner, so gzip could flake a merge. Gzip stays for the board, where it's the number that means download time.
 */
export function bundles(): { raw: Measured; gz: Measured; files: Record<string, string[]> } {
  if (!existsSync(MANIFEST)) throw new Unread(`no build manifest at ${MANIFEST}. Run the web build first (corepack pnpm check:bundle does).`);
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Record<string, Chunk>;
  const entryOf = (html: string) => {
    const e = Object.keys(manifest).find((k) => manifest[k]!.isEntry && (k === html || k.endsWith(`/${html}`)));
    if (!e) throw new Unread(`the build manifest has no ${html} entry.`);
    return e;
  };
  const walk = (key: string, seen: Set<string>) => {
    if (seen.has(key)) return;
    const c = manifest[key];
    if (!c) throw new Unread(`the build has no chunk ${key}. A route moved: update ROUTE_CHUNKS in scripts/ratchet.ts.`);
    seen.add(key);
    for (const i of c.imports ?? []) walk(i, seen);
  };
  const sizes = new Map<string, { raw: number; gz: number }>();
  const size = (file: string) => {
    if (!sizes.has(file)) { const b = readFileSync(join(DIST, file)); sizes.set(file, { raw: b.length, gz: gzipSync(b, { level: 9 }).length }); }
    return sizes.get(file)!;
  };
  const raw: Measured = {}, gz: Measured = {}, files: Record<string, string[]> = {};
  for (const [html, routes] of [["index.html", ROUTE_CHUNKS], ["goose.html", SITE_ROUTE_CHUNKS]] as const) for (const [route, chunks] of Object.entries(routes)) {
    const entry = entryOf(html);
    const seen = new Set<string>();
    walk(entry, seen);
    for (const c of chunks) walk(manifest[c] ? c : Object.keys(manifest).find((k) => new RegExp(`^assets/${c}-[\\w-]+\\.js$`).test(manifest[k]!.file)) ?? c, seen);
    const own = new Set<string>([html]);
    for (const k of seen) { const c = manifest[k]!; own.add(c.file); for (const css of c.css ?? []) own.add(css); }
    files[`bundle.${route}`] = [...own];
    raw[`bundle.${route}`] = [...own].reduce((sum, f) => sum + size(f).raw, 0);
    gz[`bundle.${route}`] = [...own].reduce((sum, f) => sum + size(f).gz, 0);
  }
  return { raw, gz, files };
}

export const claims = (): Measured => ({ "claims.rows": claimRows(readFileSync(join(ROOT, "docs/claims.md"), "utf8")).length });

export const sha = () => execFileSync("git", ["rev-parse", "--short=8", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();

function main(): number {
  const started = Date.now();
  const args = new Set(process.argv.slice(2));
  const file = JSON.parse(readFileSync(LIMITS, "utf8")) as RatchetFile;
  const overrides = (JSON.parse(readFileSync(OVERRIDES, "utf8")) as { overrides: Override[] }).overrides;

  let measured: Measured, gz: Measured;
  try {
    const b = bundles();
    gz = b.gz;
    measured = { ...tests(), ...coverage(), ...b.raw, ...claims() };
  } catch (e) {
    if (!(e instanceof Unread)) throw e;
    console.error(`ratchet FAIL: can't read a number. ${e.message}`);
    return 1;
  }
  if (args.has("--json")) console.log(JSON.stringify({ ...measured, gz }, null, 2));

  const bad = overrideProblems(overrides, file.limits);
  if (bad.length) {
    console.error(`ratchet FAIL: docs/guild/ratchet-overrides.json has problems:\n${bad.map((b) => `  ${b}`).join("\n")}`);
    return 1;
  }
  const rows = compare(file.limits, measured, overrides, file.bundleToleranceBytes);
  for (const line of report(rows)) console.log(line);
  const worse = failing(rows, args.has("--tighten"));
  if (worse.length) {
    console.error(`ratchet FAIL: ${worse.length} number${worse.length === 1 ? "" : "s"} got worse or lost a limit. Fix it, or have the DD or Q accept a written reason in docs/guild/ratchet-overrides.json.`);
    return 1;
  }
  if (args.has("--tighten")) {
    const next = tighten(file, rows, overrides, { date: new Date().toISOString().slice(0, 10), sha: sha() });
    writeFileSync(LIMITS, `${JSON.stringify(next.file, null, 2)}\n`);
    writeFileSync(OVERRIDES, `${JSON.stringify({ overrides: next.overrides }, null, 2)}\n`);
    console.log("ratchet: limits tightened to today's best (docs/guild/ratchet.json).");
  }
  console.log(`ratchet ok in ${((Date.now() - started) / 1000).toFixed(1)} s: ${boardLine(measured, gz)}`);
  return 0;
}

if (import.meta.main) process.exit(main());
