// The blind sets, once, through the Desk shopping path's own functions (Lead-12 and R, Fri Nov 6; Joshua: "the blind sets
// are re-scored once on the shopping path, no tuning to them"). One run per mode, no retry: a reader timeout or error is a
// miss, and that note stands on code's read, counted.
//
//   node scripts/blind-rescore.ts selftest                        the plumbing on the store's own five notes, nothing written
//   node scripts/blind-rescore.ts baseline                        code alone, the reader off; no key is read
//   read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY && node scripts/blind-rescore.ts reader
//                                                                 the reader on: the key comes only from this terminal's
//                                                                 environment and is never printed or written
// Options: --tree <dir> runs another checkout's code (default: this repo); --out <dir> (default: the OS temp dir).
//
// The path, as a Desk run takes it: storeSearch (code's read of each seller) → shopSellers → readShop (only sellers code
// cleared are asked, and the reader can only hold) → readerHeld. The reader's time limit and per-run count are read from the
// tree's server/src/main.ts, so they are the Desk's own. Each note sits in one fictional kettle listing from an established
// seller (history 412, $52.00, under the limit), so code reads the note's words; a new shop (history 0) would be held for
// having no sales and the reader never asked. Nothing here starts a server or sends a request except the reader's own call.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const mode = args.find((a) => a === "baseline" || a === "reader" || a === "selftest");
if (!mode) { console.error("usage: node scripts/blind-rescore.ts selftest|baseline|reader [--tree <dir>] [--out <dir>]"); process.exit(2); }
const root = resolve(flag("--tree") ?? join(import.meta.dirname, ".."));
const outDir = resolve(flag("--out") ?? join(tmpdir(), "goose-blind-rescore"));
const out = join(outDir, `blind-${mode}.json`);
if (mode !== "selftest" && existsSync(out)) { console.error(`${out} exists: one run per mode, no second try.`); process.exit(3); }
const key = mode === "reader" ? process.env.ANTHROPIC_API_KEY ?? "" : "";
if (mode === "reader" && !key) { console.error("reader mode reads ANTHROPIC_API_KEY from this terminal's environment, and it isn't set."); process.exit(4); }

// The Desk's own numbers, from the tree being scored.
const main = readFileSync(join(root, "server/src/main.ts"), "utf8");
const TIMEOUT_MS = Number(/const DESK_READER_TIMEOUT_MS = (\d+);/.exec(main)?.[1]);
const PER_RUN = Number(/envInt\("DESK_READER_PER_RUN", (\d+)\)/.exec(main)?.[1]);
if (!(TIMEOUT_MS > 0 && PER_RUN > 0)) { console.error(`${root} has no Desk reader (DESK_READER_TIMEOUT_MS / DESK_READER_PER_RUN in server/src/main.ts).`); process.exit(5); }

const ss = await import(join(root, "core/src/storesync.ts"));
const rd = await import(join(root, "core/src/trust/reader.ts"));
const sc = await import(join(root, "core/src/scenario.ts"));
const money = await import(join(root, "core/src/money.ts"));
let port: { name: string } | null = null;
if (mode === "reader") {
  const { ClaudeReader } = await import(join(root, "server/src/adapters/claude.ts"));
  port = new ClaudeReader(key, readFileSync(join(root, "server/prompts/reader.md"), "utf8"));
}
const day = { take: () => true }; // at most 189 notes; the Desk's day cap isn't what this measures

type Row = { file: string; set: string; group: string; note: string; code: string; final: string; reader: string; asked: number; miss: string | null; ms: number };
type Fixture = { rows: Array<{ set: string; group?: string; note: string }> };
const SETS = [["docs/fixtures/sealed-8-first-run.json", "sealed-8 (Nov 4)"], ["docs/fixtures/reader-r4.json", "reader-r4 (Oct 28)"]] as const;
const rows: Row[] = [];
for (const [file, label] of mode === "selftest" ? [["(store)", "the store's own notes"] as const] : SETS) {
  const data: Fixture = mode === "selftest" ? { rows: (ss.STORE_LISTINGS as Array<{ note: string }>).map((l) => ({ set: "asks", note: l.note })) }
    : JSON.parse(readFileSync(join(root, file), "utf8")) as Fixture;
  const done: Row[] = new Array(data.rows.length);
  // Four notes side by side (a Desk run reads its sellers side by side); each note is its own run of one seller.
  for (let k = 0; k < data.rows.length; k += 4) {
    await Promise.all(data.rows.slice(k, k + 4).map(async (r, j) => {
      const i = k + j;
      const listing = { id: `blind-${i}`, sellerId: "blind", merchant: "Marshgate Goods (fictional)", item: sc.DEMO_ITEM, catalogId: sc.DEMO_ENTRY, price: money.toCents("52.00"), currency: "USD", history: 412, note: r.note };
      const results = ss.storeSearch(sc.DEMO_ITEM, [listing]);
      if (results.length !== 1) throw new Error(`search didn't find row ${i}`);
      const t = performance.now();
      const read = await rd.readShop(port, ss.shopSellers(results, [listing]), { perRun: PER_RUN, timeoutMs: TIMEOUT_MS, day });
      done[i] = {
        file: label, set: r.set, group: r.group ?? (r.set === "fair" ? "fair" : "scam"), note: r.note, code: results[0].watcher,
        final: ss.readerHeld(results, read.holds)[0].watcher, reader: read.holds.has(listing.id) ? "hold" : read.asked ? "no hold" : "not asked",
        asked: read.asked, miss: read.miss, ms: Math.round(performance.now() - t),
      };
    }));
  }
  rows.push(...done);
}
if (mode === "selftest") { for (const r of rows) console.log(`${r.code} → ${r.final} (${r.reader}, miss ${r.miss})`); process.exit(0); }

const scam = (r: Row) => r.set !== "fair";
const tally = (f: string, pick: (r: Row) => boolean) => {
  const rs = rows.filter((r) => r.file === f && pick(r)), n = (p: (r: Row) => boolean) => rs.filter(p).length;
  return { n: rs.length, clear: n((r) => r.final === "clear"), hold: n((r) => r.final === "hold"), refuse: n((r) => r.final === "refuse"), codeClear: n((r) => r.code === "clear"),
    readerHeld: n((r) => r.reader === "hold"), misses: n((r) => !!r.miss && r.miss !== "off"), off: n((r) => r.miss === "off"), calls: rs.reduce((a, r) => a + r.asked, 0) };
};
const summary = Object.fromEntries(SETS.map(([, l]) => [l, { scam: tally(l, scam), fair: tally(l, (r) => !scam(r)) }]));
mkdirSync(outDir, { recursive: true });
writeFileSync(out, JSON.stringify({ mode, root, at: new Date().toISOString(), timeoutMs: TIMEOUT_MS, perRun: PER_RUN, model: port?.name ?? null, summary, rows }, null, 1));
const line = (k: string, s: ReturnType<typeof tally>) => `${k} ${s.n - s.clear} of ${s.n} stopped (${s.hold} hold, ${s.refuse} refuse; ${s.clear} clear); reader held ${s.readerHeld}, calls ${s.calls}, misses ${s.misses}, reader-off ${s.off}`;
for (const [l, s] of Object.entries(summary)) console.log(`${mode} ${l}:\n  ${line("scam", s.scam)}\n  ${line("fair", s.fair)}`);
console.log(`wrote ${out}`);
