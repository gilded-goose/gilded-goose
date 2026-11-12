// Every number the A3 wallet mockup (docs/design/a3-wallet.html) shows, made by the real engine, never typed: the
// recorded week 1 (docs/fixtures/tape-seed-1.json, Claude Haiku's recorded moves) replayed through today's guard by
// `recordedWeek`, the same read the shipped "See how it keeps you safe" page makes (web/src/offline.ts storyWeek, W38),
// plus the seeded week and the Policy the guard enforces. The mockup keeps this JSON in its #a3-data block;
// scripts/a3-screens.ts and `node scripts/motion.ts --a3` regenerate it here and fail when the page's numbers drift.
//
//   node scripts/a3-ticks.ts           prints the data (the command docs/claims.md cites)
//   node scripts/a3-ticks.ts --write   rewrites the mockup's #a3-data block from the engine
import { readFileSync, writeFileSync } from "node:fs";
import { DEMO_CATEGORY, DEMO_SHOPPER, DEMO_T0, DemoShoppers, demoPolicy, dialFor, fromCents, type Tape } from "@goose/core";
import { recordedWeek } from "@goose/core/week";
import { ENTRY_CATEGORY } from "@goose/core/local";
import { sha256Hex } from "@goose/core/sha256";
import { belowOpening, buyerLabel, laneModel } from "@goose/core/view";
import { approvalMinutes, safeStory } from "@goose/core/story";

export const MOCKUP = "docs/design/a3-wallet.html";
const TAPE = "docs/fixtures/tape-seed-1.json";

export type { Bid, Tick } from "@goose/core/wallet";
import { walletTicks, weekRows, type Tick, type WeekRow } from "@goose/core/wallet";
export interface A3Data {
  from: string;
  label: string;
  item: string;
  seller: string;
  ticks: Tick[];
  deal: { seq: number; total: string; opening: string; openingSeq: number; below: string; minutes: number };
  week: WeekRow[];
  empty: WeekRow[];
  limits: { kitchen: string; perPurchase: string; weekly: string; kitchenDial: string };
}

const plain = (s: string) => s.replace(" (fictional)", "");

function fail(m: string): never { throw new Error(`a3-ticks: ${m}`); }

export async function a3Data(): Promise<A3Data> {
  const tape = JSON.parse(readFileSync(TAPE, "utf8")) as Tape;
  const at = DEMO_T0;
  const run = await recordedWeek(tape, sha256Hex, () => at, ENTRY_CATEGORY);
  const ev = run.events;
  const lanes = laneModel(ev);
  const deal = lanes.deal ?? fail("the recorded week ended with no deal");
  const below = belowOpening(lanes) ?? fail("no opening ask for the deal's seller");
  const b = run.bound ?? fail("the recorded week bound no cart");
  const minutes = approvalMinutes(safeStory(ev), b) ?? fail("the cart's expiry can't be read");

  // The ticks: the same row selection the built wallet home plays (core/src/view/wallet.ts walletTicks).
  const ticks = walletTicks(tape, ev);

  const kept = `kept 1 of ${tape.meta.tries} recordings`;
  const seeded = new DemoShoppers().for(DEMO_SHOPPER, at).read();
  const policy = demoPolicy();
  return {
    from: `${TAPE} through recordedWeek (core/src/view/week.ts), as web/src/offline.ts storyWeek`,
    label: `${buyerLabel(ev)} · ${kept}`,
    item: plain(b.item),
    seller: b.merchant,
    ticks,
    deal: { seq: ev.find((e) => e.actor === "guard" && e.action === "ask")?.seq ?? fail("no ask row"), total: b.total, opening: fromCents(below.opening), openingSeq: below.seq, below: fromCents(below.below), minutes },
    week: weekRows([...seeded, ...ev], at, b),
    empty: weekRows(seeded, at, null),
    limits: { kitchen: fromCents(policy.categoryLimit[DEMO_CATEGORY]!), perPurchase: fromCents(policy.perPurchaseCap), weekly: fromCents(policy.weeklyLimit), kitchenDial: dialFor(policy, DEMO_CATEGORY) },
  };
}

const BLOCK = /(<script type="application\/json" id="a3-data">)([\s\S]*?)(<\/script>)/;

/** The mockup's data as one line per field, so a diff shows which number moved. */
export const render = (d: A3Data) => "\n{\n" + Object.entries(d).map(([k, v]) => Array.isArray(v)
  ? ` ${JSON.stringify(k)}: [\n${v.map((x) => "  " + JSON.stringify(x)).join(",\n")}\n ]`
  : ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n}\n";

/** What the mockup says against what the engine says: the first difference, or null when they agree. */
export function drift(html: string, d: A3Data): string | null {
  const m = BLOCK.exec(html);
  if (!m) return `${MOCKUP} has no #a3-data block`;
  const page = m[2]!.trim().split("\n"), engine = render(d).trim().split("\n");
  for (let i = 0; i < Math.max(page.length, engine.length); i++) {
    const at = (l: string | undefined) => l?.trim().replace(/,$/, "") ?? "nothing";
    if (page[i]?.trim() !== engine[i]?.trim()) return `line ${i + 1} of #a3-data: the page has ${at(page[i])}, the engine makes ${at(engine[i])} (fix: node scripts/a3-ticks.ts --write)`;
  }
  return null;
}

if (import.meta.main) {
  const d = await a3Data();
  if (process.argv.includes("--write")) {
    const html = readFileSync(MOCKUP, "utf8");
    if (!BLOCK.test(html)) { console.error(`a3-ticks: ${MOCKUP} has no #a3-data block`); process.exit(1); }
    writeFileSync(MOCKUP, html.replace(BLOCK, (_, a: string, _b: string, c: string) => a + render(d) + c));
    console.log(`a3-ticks: wrote ${d.ticks.length} ticks into ${MOCKUP}`);
  } else console.log(render(d).trim());
}
