// The ratchet's "0 failed live walks" (Joshua, Nov 3, 1(d)): every walk that can run by itself, one after another, with
// one number at the end. Before this the number was only ever typed in by hand.
//
//   node scripts/live-walks.ts <url>              cold loads, the one nav, keyboard only through the judge tour. Reads pages.
//   node scripts/live-walks.ts <url> --with-run   and one real Desk run. Never presses Approve. Spends a run: not by default.
//   node scripts/live-walks.ts <url> --quick      for CI, about 2 minutes: the console sweep in place of the one nav, which
//                                                 takes 8 minutes by itself and would eat GitHub's 60 a day. The daily record runs it.
//
// It never POSTs to /api/runs/trick or /api/judge: that counter is real attempts only, and keyboard-tour fails if anything tries.
// Exit 0 when every walk passed, 1 when one failed, 2 when one couldn't finish: a walk that never ended isn't a pass.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
/** The one nav took 475 s on a local server, and live is slower. */
const WALK_MS = 30 * 60 * 1000;

export interface WalkMetric { value: number | null; note?: string }
export interface WalkOutcome { walks: WalkMetric; keyboard: WalkMetric }

export interface WalkOptions { withRun?: boolean; quick?: boolean; say?: (line: string) => void }

export function runWalks(base: string, { withRun = false, quick = false, say = () => {} }: WalkOptions = {}): WalkOutcome {
  const out = mkdtempSync(join(tmpdir(), "live-walks-"));
  const walks: [string, string[]][] = [
    ["cold-walk", ["cold-walk.ts", base]],
    quick ? ["console-sweep", ["console-sweep.ts", base, "--skip-run"]] : ["one-nav", ["one-nav.ts", base, out]],
    ["keyboard-tour", ["keyboard-tour.ts", base]],
    ...(withRun ? [["desk-run", ["console-sweep.ts", base, "--routes", "/?desk=1"]] as [string, string[]]] : []),
  ];
  const failed: string[] = [], unfinished: string[] = [];
  let keyboard: WalkMetric = { value: null, note: "the tour didn't run" };
  for (const [name, args] of walks) {
    const started = Date.now();
    const r = spawnSync("node", [join(SCRIPTS, args[0]!), ...args.slice(1)], { encoding: "utf8", timeout: WALK_MS, maxBuffer: 64 * 1024 * 1024 });
    const secs = Math.round((Date.now() - started) / 1000);
    const lines = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim().split("\n");
    if (name === "keyboard-tour") {
      const m = /^keyboard-tour: (\d+) failed of (\d+) stops/m.exec(r.stdout ?? "");
      keyboard = m ? { value: Number(m[1]), note: `of ${m[2]} stops` } : { value: null, note: `the tour didn't finish: ${lines.at(-1)?.slice(0, 120)}` };
    }
    if (r.status === null) { unfinished.push(name); say(`  ${name}: DIDN'T FINISH after ${secs} s`); continue; }
    if (r.status !== 0) { failed.push(name); say(`  ${name}: FAILED in ${secs} s`); for (const l of lines.filter((x) => /fail|error|\bWORSE\b/i.test(x)).slice(0, 12)) say(`    ${l.slice(0, 200)}`); continue; }
    say(`  ${name}: passed in ${secs} s`);
  }
  rmSync(out, { recursive: true, force: true });
  const note = [failed.length ? `failed: ${failed.join(", ")}` : "", unfinished.length ? `didn't finish: ${unfinished.join(", ")}` : ""].filter(Boolean).join("; ");
  const walksMetric: WalkMetric = unfinished.length ? { value: null, note } : { value: failed.length, note: note || `all ${walks.length} passed` };
  return { walks: walksMetric, keyboard };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const base = args.find((a) => /^https?:/.test(a));
  if (!base) { console.error("usage: node scripts/live-walks.ts <url> [--with-run] [--quick]"); process.exit(2); }
  const { walks, keyboard } = runWalks(base, { withRun: args.includes("--with-run"), quick: args.includes("--quick"), say: console.log });
  console.log(`keyboard-tour: ${keyboard.value ?? "not measured"} failed${keyboard.note ? ` (${keyboard.note})` : ""}`);
  console.log(`live-walks: ${walks.value ?? "not measured"} failed${walks.note ? ` (${walks.note})` : ""}`);
  process.exit(walks.value === null ? 2 : walks.value > 0 ? 1 : 0);
}
