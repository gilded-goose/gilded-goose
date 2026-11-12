// Summarise .goose/moves.jsonl (server/src/move-log.ts). Prints the sentence we say
// wherever the fallback claim appears, the real count (Joshua, 2026-10-23), and
// checks the target "at most 1 in 20 live moves falls back". The observed rate is
// not enough: the target is met only when the 95% upper bound on the fallback rate
// is under 1 in 20, over 3+ sessions (0 fallbacks needs 59 moves; 3 needs about 150).
// Exit 1 until the target is met, or if the log is missing.
//
//   node scripts/move-log.ts [path]

import { existsSync, readFileSync } from "node:fs";

const path = process.argv[2] ?? ".goose/moves.jsonl";
if (!existsSync(path)) { console.error(`no move log at ${path}`); process.exit(1); }
type Row = { session: string; run: string; round: number; source: string; reason?: string; ms: number };
const rows: Row[] = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const pct = (xs: number[], p: number) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!; };

/** P(X <= k) for X ~ Binomial(n, p). */
function cdf(k: number, n: number, p: number): number {
  let term = (1 - p) ** n, sum = term;
  for (let i = 1; i <= k; i++) { term *= ((n - i + 1) / i) * (p / (1 - p)); sum += term; }
  return sum;
}
/** One-sided 95% upper bound on the rate after k failures in n tries (exact, Clopper-Pearson). */
function upper95(k: number, n: number): number {
  if (k >= n) return 1;
  let lo = k / n, hi = 1;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (cdf(k, n, mid) > 0.05) lo = mid; else hi = mid; }
  return hi;
}
/** Moves needed with k fallbacks before the bound clears 1 in 20. */
function needed(k: number): number { let n = Math.max(k + 1, 1); while (upper95(k, n) >= 0.05) n++; return n; }

const fallbacks = rows.filter((r) => r.source === "rule-fallback");
const sessions = new Set(rows.map((r) => r.session));
const first = rows.filter((r) => r.round === 1).map((r) => r.ms);
const later = rows.filter((r) => r.round > 1).map((r) => r.ms);
console.log(`${rows.length} live moves, ${sessions.size} sessions, ${new Set(rows.map((r) => r.run)).size} runs`);
console.log(`fallbacks ${fallbacks.length} of ${rows.length}${fallbacks.length ? ": " + fallbacks.map((f) => `round ${f.round} (${f.reason ?? "?"})`).join(", ") : ""}`);
console.log(`first move p50 ${pct(first, 50)} / p95 ${pct(first, 95)} ms (n=${first.length}); later p50 ${pct(later, 50)} / p95 ${pct(later, 95)} ms (n=${later.length})`);
for (const s of sessions) { const r = rows.filter((x) => x.session === s); console.log(`  session ${s}: ${r.length} moves, ${r.filter((x) => x.source === "rule-fallback").length} fallbacks`); }
const k = fallbacks.length, n = rows.length, ub = upper95(k, n);
const ok = ub < 0.05 && sessions.size >= 3;
console.log(`OBSERVED ${k} of ${n}; 95% upper bound ${(ub * 100).toFixed(1)}% (1 in ${Math.floor(1 / ub)})`);
console.log(`SAY: "${k} of ${n} moves fell back to the plain rule."`);
console.log(ok ? "TARGET 1 in 20: MET (95% upper bound)" : `TARGET 1 in 20: NOT YET (the bound clears it at ${needed(k)} moves with ${k} fallbacks${sessions.size < 3 ? `, and needs 3+ sessions, have ${sessions.size}` : ""})`);
process.exit(ok ? 0 : 1);
