// The hero's scene as data (plan Task 2): recorded week 1, beat by beat, read from the kettle the page is served. Each
// seller's verdict comes from the Watcher's own rows through verdictOf, each price from the ledger, each caption from
// those same beats, so nothing on the scene is typed by hand and a changed recording changes every word with it.
import { usdOf } from "@goose/core/money";
import type { LedgerEvent } from "@goose/core";
import { GOT } from "@goose/core/how";
import type { WalletHome } from "@goose/core/wallet";
import { verdictOf, type Verdict } from "../ui/stamp.ts";

export interface HeroSource { home: WalletHome; events: readonly LedgerEvent[] }

export interface HeroTick { round: number; price: string; goose?: { price: string; proposed?: { price: string; ai: boolean } } }
export interface NoteLine { text: string; flagged: boolean }

export type HeroBeat =
  | { kind: "brief"; limit: string; item: string }
  | { kind: "seller"; name: string; price: string; verdict: Verdict; reason?: string; note?: NoteLine[] }
  | { kind: "haggle"; ticks: HeroTick[] }
  | { kind: "approve"; seller: string; total: string; below: string; minutes: number };

/** The six moments the scene plays, each with one caption. The seller beats share "sellers" and "refusal"; "outcome" has no
 *  beat of its own: the recording ends at the approve card, so what it shows is that nobody tapped. */
export type Scene = "brief" | "sellers" | "refusal" | "haggle" | "approve" | "outcome";
export const SCENES: readonly Scene[] = ["brief", "sellers", "refusal", "haggle", "approve", "outcome"];

/** Each moment's name in the step list. */
export const SCENE_LABELS: Readonly<Record<Scene, string>> = {
  brief: "Your limit",
  sellers: "Sellers tested",
  refusal: "Order refused",
  haggle: "The haggle",
  approve: "Your approval",
  outcome: "The outcome",
};

function fail(m: string): never { throw new Error(`hero-beats: ${m}`); }

/** "60.00" → "$60", "47.73" → "$47.73": a whole-dollar limit reads the way the shopper set it. */
export const dollars = (price: string): string => usdOf(price).replace(/\.00$/, "");

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function heroBeats(k: HeroSource): HeroBeat[] {
  const ev = k.events;
  const deal = k.home.deal ?? fail("the week ended with no deal");
  const worst = ev.find((e) => e.actor === "guard" && e.action === "worst-case" && e.price !== undefined) ?? fail("no limit row");
  const limitCents = Math.round(Number(worst.price) * 100);
  const brief: HeroBeat = { kind: "brief", limit: dollars(worst.price!), item: deal.item };

  // One beat per seller, in the order they first offered; the Watcher's first word on that seller decides the stamp.
  const firstOffers = new Map<string, LedgerEvent>();
  for (const e of ev) if (e.actor === "seller" && e.action === "offer" && e.sellerId && !firstOffers.has(e.sellerId)) firstOffers.set(e.sellerId, e);
  const sellers: HeroBeat[] = [...firstOffers.values()].map((o) => {
    const rows = ev.filter((e) => e.actor === "watcher" && e.sellerId === o.sellerId);
    const watcher = rows.some((e) => e.action === "refuse") ? "refuse" : rows.some((e) => e.action === "hold") ? "hold" : "clear";
    const price = o.price ?? fail(`offer ${o.seq} has no price`);
    const verdict = verdictOf(watcher, Math.round(Number(price) * 100) > limitCents);
    const name = String(o.data?.merchant ?? fail(`offer ${o.seq} names no merchant`));
    const refusal = k.home.refusal && rows.some((e) => e.seq === k.home.refusal!.seq) ? k.home.refusal : null;
    if (refusal) return { kind: "seller", name, price, verdict, reason: refusal.reasons.map(lowerFirst).join("; "), note: refusal.note };
    // A clear seller's note had nothing the Watcher would act on, so none of its words is marked.
    const note = verdict === "clear" && o.quoted ? [{ text: o.quoted, flagged: false }] : undefined;
    return { kind: "seller", name, price, verdict, ...(note ? { note } : {}) };
  });

  // The deal seller's ask round by round while it moves; a round that repeats the ask (the seller saying "Deal.") adds
  // nothing to the ladder, and the approve card carries the agreement.
  const ticks: HeroTick[] = [];
  for (const t of k.home.ticks) {
    if (t.kind !== "ask" || ticks.at(-1)?.price === t.price) continue;
    const g = t.goose;
    ticks.push({ round: t.round, price: t.price, ...(g ? { goose: { price: g.price, ...(g.proposed ? { proposed: { price: g.proposed.price, ai: g.proposed.ai } } : {}) } } : {}) });
  }
  if (!ticks.length) fail("the deal has no haggle ticks");
  // The approval window is the guard's own number; a deal without one would make the card claim a time it can't.
  const minutes = deal.minutes ?? fail("the deal has no approval window");

  return [brief, ...sellers, { kind: "haggle", ticks }, { kind: "approve", seller: deal.seller, total: deal.total, below: deal.below, minutes }];
}

const of = <K extends HeroBeat["kind"]>(beats: readonly HeroBeat[], kind: K) => beats.filter((b): b is Extract<HeroBeat, { kind: K }> => b.kind === kind);

/** The seller's short name, without the "(fictional)" the server adds and without "Deals"/"Goods": "QuickQuack". */
export const shortName = (name: string): string => name.replace(/\s*\(fictional\)$/, "").split(" ")[0] ?? name;

/** The refusal's plain sentence: "QuickQuack's note tried to give Goose orders", from the set-aside seller's own reasons. */
function refusalSaid(beats: readonly HeroBeat[], limit: string): string {
  const aside = of(beats, "seller").find((s) => s.verdict === "aside");
  if (!aside) return `No seller was set aside; your ${limit} held`;
  const who = shortName(aside.name);
  const reasons = (aside.reason ?? "").split("; ").filter(Boolean);
  const orders = reasons.find((r) => r.startsWith("its note"));
  return orders ? `${who}'s ${orders.slice("its ".length)}` : reasons[0] ? `${who} ${reasons[0]}` : `${who} failed a check`;
}

const swapOf = (beats: readonly HeroBeat[]) => (of(beats, "haggle")[0]?.ticks ?? []).find((t) => t.goose?.proposed);

/** One caption per scene, written from the beats' own figures. */
export function captionOf(scene: Scene, beats: readonly HeroBeat[]): string {
  const brief = of(beats, "brief")[0] ?? fail("no brief");
  switch (scene) {
    case "brief": return `Your limit: ${brief.limit}. Words can't raise it.`;
    case "sellers": return "Goose tests every seller.";
    case "refusal": return `${refusalSaid(beats, brief.limit)}. Set aside; your ${brief.limit} held.`;
    case "haggle": {
      const ticks = of(beats, "haggle")[0]?.ticks ?? [];
      const swap = swapOf(beats);
      if (swap?.goose?.proposed) return `${GOT.haggled.did}. The ${swap.goose.proposed.ai ? "AI" : "rule"} suggested ${usdOf(swap.goose.proposed.price)}; code offered ${usdOf(swap.goose.price)}.`;
      return `${GOT.haggled.did} from ${usdOf(ticks[0]?.price ?? "")} to ${usdOf(ticks.at(-1)?.price ?? "")}.`;
    }
    case "approve": return "Only your tap pays.";
    case "outcome": return "No tap, no payment. Nobody tapped in this recording, so no order was made.";
  }
}

const countWord = (n: number): string => ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"][n] ?? String(n);

/** The big words and the one line under them, for the story column: the same facts as the caption, split in two. */
export function momentOf(scene: Scene, beats: readonly HeroBeat[]): { title: string; line: string } {
  const brief = of(beats, "brief")[0] ?? fail("no brief");
  const approve = of(beats, "approve")[0] ?? fail("no approve card");
  const ticks = of(beats, "haggle")[0]?.ticks ?? [];
  switch (scene) {
    case "brief": return { title: `Your limit: ${brief.limit}.`, line: `Goose shops for the ${brief.item}. Words can't raise it.` };
    case "sellers": return { title: "Goose tests every seller.", line: `${countWord(of(beats, "seller").length)} fictional sellers answer. Code reads each note before anything else happens.` };
    case "refusal": return { title: `${refusalSaid(beats, brief.limit)}.`, line: `Set aside. Your ${brief.limit} held.` };
    case "haggle": {
      const swap = swapOf(beats);
      return {
        title: `${GOT.haggled.did} ${usdOf(ticks[0]?.price ?? "")} down to ${usdOf(ticks.at(-1)?.price ?? "")}.`,
        line: swap?.goose?.proposed ? `The ${swap.goose.proposed.ai ? "AI" : "rule"} suggested ${usdOf(swap.goose.proposed.price)}; code offered ${usdOf(swap.goose.price)}.` : "Every counter-offer was code's own.",
      };
    }
    case "approve": return { title: "Only your tap pays.", line: `${approve.seller} at ${usdOf(approve.total)}: ${usdOf(approve.below)} below its ask, open for ${approve.minutes} minutes.` };
    case "outcome": return { title: "No tap, no payment.", line: "Nobody tapped in this recording, so no order was made and nothing was paid." };
  }
}

/** One beat back or forward, held at either end. */
export const stepTo = (at: number, dir: -1 | 1, count: number): number => Math.min(count - 1, Math.max(0, at + dir));
