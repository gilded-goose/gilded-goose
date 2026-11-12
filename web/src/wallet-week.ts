// What the wallet reads, and only that: week 1's tape, not the three weeks and the rounds in offline.ts (gate seat 6, Nov 4).
// The wallet runs the Watcher on first render, so every byte here is a first-load byte.
import { sha256Hex } from "@goose/core/sha256";
import type { Tape } from "@goose/core";
import { ENTRY_CATEGORY, entryLimit } from "@goose/core/entry-limit";
import { recordedWeek } from "@goose/core/week";
import { WALLET_AT, walletHome } from "@goose/core/wallet";
import WEEK1 from "../../docs/fixtures/tape-seed-1.json";

export { entryLimit };

/** The wallet home (A3): recorded week 1 read at the demo week's end (WALLET_AT, as scripts/a3-ticks.ts reads it) and
 *  folded with the seeded week; `empty` is the seeded week alone, before the haggle (nothing waits, so Ask leads). */
export async function walletWeek(empty: boolean) {
  if (empty) return walletHome(null, WALLET_AT);
  const tape = WEEK1 as unknown as Tape;
  return walletHome(await recordedWeek(tape, sha256Hex, () => WALLET_AT, ENTRY_CATEGORY), WALLET_AT, tape);
}
