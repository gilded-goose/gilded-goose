// Every line Goose says back on the home page (item 10), built by the code that says it, for the speak-back budget:
// `voice.test.ts` checks each is in `docs/fixtures/speak-times.json` (median 3 s or less, none over 4.5 s, a cart 4.4 s),
// and `scripts/speak-times.ts` measures them.
// The chips' lines for typical wants, a yes, the ladder's answers on the recorded weeks, the voice commands' answers,
// and each recorded week's bound cart said back with and without an Approve on the page.

import { readFileSync } from "node:fs";
import { LADDER_BEAT, ladder, marketOffers } from "../src/ask/ladder.ts";
import { askInBrowser } from "../src/ask/ask.ts";
import { VOICE_ASIDE_SOON, VOICE_DECLINED, VOICE_NO_CART, VOICE_NO_DEAL, VOICE_PAID, VOICE_SHOPPING, VOICE_STILL, cartSaid } from "../src/ask/voice.ts";
import type { Tape } from "../src/buyer/recorded.ts";
import { toCents } from "../src/money.ts";
import { demoPolicy } from "../src/scenario.ts";
import { sha256Hex } from "../src/sha256.ts";
import { ENTRY_CATEGORY } from "../src/view/local.ts";
import { WALLET_AT } from "../src/view/wallet.ts";
import { recordedWeek } from "../src/view/week.ts";

/** Wants a shopper types or says, for the chips' line. */
export const SAID_WANTS = ["a black kettle like mine", "a kettle", "kitchen stuff", "a laptop", "yes, buy it"];

export async function spokenLines(): Promise<string[]> {
  const lines = new Set<string>();
  for (const w of SAID_WANTS) lines.add((await askInBrowser(w)).speak);
  const limit = demoPolicy().categoryLimit.kitchen!;
  const markets = [LADDER_BEAT];
  for (const seed of [1, 2, 3]) {
    const tape = JSON.parse(readFileSync(new URL(`../../docs/fixtures/tape-seed-${seed}.json`, import.meta.url), "utf8")) as Tape;
    const b = (await recordedWeek(tape, sha256Hex, () => WALLET_AT, ENTRY_CATEGORY)).bound;
    if (!b) continue;
    for (const pay of [true, false]) lines.add(cartSaid(b, pay));
    markets.push({ seed, deal: { merchant: b.merchant, total: b.total } });
  }
  for (const m of markets) for (const saw of ["55.00", "70.00", "80.00"]) for (const l of [limit, null]) { const a = ladder(toCents(saw), l, marketOffers(m), "kettle"); lines.add(a.said); if (a.saidRefused) lines.add(a.saidRefused); }
  for (const l of [VOICE_SHOPPING, VOICE_STILL, VOICE_ASIDE_SOON, VOICE_DECLINED, VOICE_PAID, VOICE_NO_CART, VOICE_NO_DEAL]) lines.add(l);
  return [...lines].sort();
}
