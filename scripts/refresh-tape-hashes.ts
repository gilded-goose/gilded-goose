// Refresh the cart hashes in the recorded tapes (W7): the tapes were recorded before every cart named its catalog
// entry, and the entry is inside the cart hash (N9), so the guard's `data.hash` moved. This replays each tape's
// recorded moves through the shipped guard (sim clock, seeded RNG, no AI call, $0) and rewrites ONLY `data.hash`.
// Every other byte must already match the replay: anything else that differs stops the script and nothing is written.
//
//   node scripts/refresh-tape-hashes.ts     rewrites docs/fixtures/tape-seed-*.json in place

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { MemoryLedger, RecordedPort, demoDeps, demoGuard, demoSellers, demoWant, isDemoWeek, runHaggle, stableStringify, DEMO_ENTRY, DEMO_SHOPPER, type LedgerEvent, type Tape } from "@goose/core";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const FIXTURES = new URL("../docs/fixtures/", import.meta.url);
type Row = Omit<LedgerEvent, "t">;

/** A row with its hash taken out, and the fields the replay test sets aside (t; seq, which the Watcher's rows shift; the buyer's port fields). */
function rest(e: Row & { t?: number }): string {
  const { t: _t, seq: _q, ...row } = e;
  const { hash: _h, ...data } = row.data ?? {};
  if (row.actor === "buyer") { const { source: _s, model: _m, modelLabel: _l, recordedOn: _r, ...d } = data; return stableStringify({ ...row, data: d }); }
  return stableStringify({ ...row, ...(row.data ? { data } : {}) });
}

let changed = 0;
for (const f of readdirSync(FIXTURES).filter((n) => /^tape-seed-\d+\.json$/.test(n)).sort()) {
  const url = new URL(f, FIXTURES);
  const tape = JSON.parse(readFileSync(url, "utf8")) as Tape;
  if (!isDemoWeek(tape.meta.week)) throw new Error(`${f}: unknown week ${tape.meta.week}`);
  // The replay test's world exactly: the shipped guard, its catalog entry on every cart.
  const deps = demoDeps(tape.meta.seed, sha256);
  const ledger = new MemoryLedger();
  await runHaggle({ want: demoWant(), sellers: demoSellers(tape.meta.week), buyer: new RecordedPort(tape, sha256), guard: demoGuard(deps, ledger), deps, ledger, shopperId: DEMO_SHOPPER, catalogId: DEMO_ENTRY });
  // The tapes predate the Watcher's rows (code's, never the buyer's), so they are set aside as the replay test does.
  const replayed = ledger.read().filter((e) => e.actor !== "watcher");
  const recorded = tape.ledger ?? [];
  if (replayed.length !== recorded.length) throw new Error(`${f}: replay has ${replayed.length} rows, the tape ${recorded.length}; not a hash-only change`);
  recorded.forEach((e, i) => {
    const r = replayed[i]!;
    if (rest(e) !== rest(r)) throw new Error(`${f}: row ${i} differs beyond its hash; not a hash-only change`);
    const was = e.data?.hash;
    const now = r.data?.hash;
    if ((was === undefined) !== (now === undefined)) throw new Error(`${f}: row ${i} gains or loses a hash`);
    if (was !== undefined && was !== now) { e.data!.hash = now!; changed++; console.log(`${f} row ${i}: ${was} → ${now}`); }
  });
  writeFileSync(url, JSON.stringify(tape, null, 1) + "\n");
}
console.log(`REFRESHED ${changed} hash${changed === 1 ? "" : "es"}; nothing else changed`);
