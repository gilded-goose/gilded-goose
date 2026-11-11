// `virtual:goose-kettle`: the site's one story (spec §2), recorded week 1, computed when the page is built. The wallet
// home is `walletWeek(false)`, the same call the wallet makes; the ledger rows are the same recorded week's own events;
// the guard-off control is the recorded sandbox order. Every figure on the hero is the code's answer, never typed, and the
// page never runs the Watcher's rules on first load (story-data.ts measured why that matters).

import type { Plugin } from "vite";
import type { LedgerEvent, Tape } from "../core/src/index.ts";
import type { WalletHome } from "../core/src/view/wallet.ts";
import { WALLET_AT } from "../core/src/view/wallet.ts";
import { recordedWeek } from "../core/src/view/week.ts";
import { ENTRY_CATEGORY } from "../core/src/view/entry-limit.ts";
import { sha256Hex } from "../core/src/sha256.ts";
import { walletWeek } from "./src/wallet-week.ts";
import WEEK1 from "../docs/fixtures/tape-seed-1.json";
import CONTROL from "../docs/fixtures/control-order.json";

const ID = "virtual:goose-kettle";

export interface KettleData {
  home: WalletHome;
  events: LedgerEvent[];
  control: { orderId: string; amount: string; status: string; ranAt: string };
}

export async function builtKettle(): Promise<KettleData> {
  const home = await walletWeek(false);
  const week = await recordedWeek(WEEK1 as unknown as Tape, sha256Hex, () => WALLET_AT, ENTRY_CATEGORY);
  const control = { orderId: CONTROL.orderId, amount: CONTROL.amount, status: CONTROL.status, ranAt: CONTROL.ranAt };
  // Through JSON once here, so the copy tests read is byte for byte the copy the page is served.
  return JSON.parse(JSON.stringify({ home, events: week.events, control })) as KettleData;
}

export function kettleData(): Plugin {
  return {
    name: "goose-kettle",
    resolveId: (id) => (id === ID ? `\0${ID}` : null),
    load: async (id) => (id === `\0${ID}` ? `export default ${JSON.stringify(await builtKettle())};` : null),
  };
}
