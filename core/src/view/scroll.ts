// The scroll story under the Desk's hero (Desk-S; Joshua, Fri Oct 30 3:05 AM: "the home page needs to become a scroll
// story"). Every name, price and day here is read from the recorded week (`MOVING_ITEMS`, the Watcher, the demo's
// events limit), and every figure in the stats band is a docs/claims.md row's Value (the Proof panel's rows). The page
// types none of them. The words live here too, so docs/claims.md can point at one file and its probe can read them.

import { fromCents, type Cents, usd } from "../money.ts";
import { categoryLimitFor, type Policy } from "../trust/policy.ts";
import { verdictOf, watch, type WatchVerdict } from "../trust/watch.ts";
import { demoPolicy } from "../scenario.ts";
import { BEAT_DAY } from "../ask/watching.ts";
import { GOT, howOverDays } from "./how-got.ts";
import { MOVING_DAYS, MOVING_ITEMS, TOTAL_SAID, priceOn, type MovingItem } from "../sellers/moving.ts";

/** The item the story follows: the Marsh Lights ticket, the same week the hero's chip and the ledger's chart read. */
export const STORY_ITEM = "marsh-lights-ticket";

const plain = (name: string) => name.replace(/\s*\(fictional\)\s*$/i, "");

/** One seller on the beat day, as the story's list shows it. */
export interface StorySeller {
  id: string;
  name: string;
  total: Cents;
  words: string;
  verdict: WatchVerdict;
  /** The Watcher's own words for a seller it held or refused ("it asks to be paid by gift card"); null when clear. */
  why: string | null;
  /** What the seller wrote, quoted as data (the Watcher read it; Goose never follows it). Empty when it wrote nothing. */
  note: string;
  overLimit: boolean;
}

export interface ScrollStory {
  /** The item without "(fictional)": the card says "fictional" once, in its label. */
  item: string;
  /** The item as a headline names it: "A ticket to The Marsh Lights, Saturday" → "The Marsh Lights ticket". */
  title: string;
  /** The beat's day as the screen counts it (day 1 is the week's first). */
  day: number;
  limit: { cents: Cents; words: string; label: string };
  /** The day Goose's watch pinged, as the screen counts it: the first day a seller it cleared was at or under the limit. */
  ping: number;
  /** The deal: the cheapest seller the Watcher cleared at or under the limit on the beat day. */
  deal: { id: string; name: string; total: Cents; words: string; firstDay: number; firstWords: string; byDay: (Cents | null)[] };
  /** Every seller listing on the beat day, cheapest first. */
  sellers: StorySeller[];
  /** The seller the Watcher refused (the cheapest offer of the week). */
  scam: StorySeller;
  cheapestWasScam: boolean;
  /** "Total with fees and taxes, as you'd pay it." */
  totalSaid: string;
}

/** "A ticket to The Marsh Lights, Saturday" → "The Marsh Lights ticket"; any other item keeps its own words. */
export function ticketTitle(item: string): string {
  const m = /^A ticket to (.+?)(?:,|$)/.exec(item);
  return m ? `${m[1]} ticket` : item;
}

/** The story's week, read from the recorded curves on `BEAT_DAY` (day 5 on screen). Throws if the record stops telling it. */
export function scrollStory(policy: Policy = demoPolicy(), item: MovingItem = MOVING_ITEMS.find((i) => i.id === STORY_ITEM)!, beat: number = BEAT_DAY): ScrollStory {
  const limit = categoryLimitFor(policy, item.category);
  const sellers: StorySeller[] = item.sellers.flatMap((s) => {
    const p = priceOn(s.curve, beat);
    if (!p) return [];
    const flags = watch({ quoted: s.note, merchant: s.name, history: s.history });
    const verdict = verdictOf(flags);
    const why = verdict === "clear" ? null : [...new Set(flags.filter((f) => f.severity === verdict).map((f) => f.said))].join("; ");
    return [{ id: s.sellerId, name: plain(s.name), total: p.total, words: usd(p.total), verdict, why, note: s.note, overLimit: p.total > limit }];
  }).sort((a, b) => a.total - b.total);
  const pick = sellers.find((s) => s.verdict === "clear" && !s.overLimit);
  if (!pick) throw new Error(`scroll story: no cleared seller at or under the limit on day ${beat + 1}`);
  const scam = sellers.find((s) => s.verdict === "refuse");
  if (!scam) throw new Error(`scroll story: no seller set aside on day ${beat + 1}`);
  const curve = item.sellers.find((s) => s.sellerId === pick.id)!.curve;
  const byDay = Array.from({ length: MOVING_DAYS }, (_, d) => priceOn(curve, d)?.total ?? null);
  const firstDay = byDay.findIndex((c) => c !== null);
  // A set-aside seller's lower price never pings: TixQuack's $55.00 on day 2 is the week's cheapest and it stays quiet.
  const clearSellers = item.sellers.filter((x) => verdictOf(watch({ quoted: x.note, merchant: x.name, history: x.history })) === "clear");
  const ping = Array.from({ length: MOVING_DAYS }, (_, d) => d).find((d) => clearSellers.some((x) => { const p = priceOn(x.curve, d); return p !== null && p.total <= limit; }));
  if (ping !== beat) throw new Error(`scroll story: the watch would ping on day ${(ping ?? -1) + 1}, not the beat's day ${beat + 1}`);
  const cleared = sellers.filter((s) => s.verdict === "clear").map((s) => s.total);
  return {
    item: plain(item.item),
    title: ticketTitle(plain(item.item)),
    day: beat + 1,
    ping: ping + 1,
    limit: { cents: limit, words: usd(limit), label: `${item.category} limit` },
    deal: { id: pick.id, name: pick.name, total: pick.total, words: pick.words, firstDay: firstDay + 1, firstWords: usd(byDay[firstDay]!), byDay },
    sellers,
    scam,
    cheapestWasScam: scam.total < Math.min(...cleared),
    totalSaid: TOTAL_SAID,
  };
}

// ---------- The live moment (section 1): a practice tap ----------

/** The moment's head (Joshua, Nov 5: "Make the demo week say it out loud"), one mask per line. */
export const MISSED_DROP = ["Missed the drop?", "Set your price."] as const;
/** Said beside the ping, every time: a ping only opens the deal. */
export const PING_NEVER_BUYS = "The ping never buys: only your tap pays.";

/** The moment's sentence, every figure from the record: the deal's prices up to the beat, the ping's day and the limit it crossed. */
export function pingWords(s: ScrollStory): string {
  const shown = s.deal.byDay.slice(0, s.ping).filter((c): c is number => c !== null).map((c) => usd(c as Cents).replace(/\.00$/, ""));
  const steps = shown.filter((p, i) => p !== shown[i - 1]);
  const got = howOverDays(s.deal.byDay, s.day - 1);
  return `${got ? GOT[got].did : "Goose watched"}: ${steps.join(" → ")}. On simulated day ${s.ping} it pinged you, because the price crossed your ${s.limit.words.replace(/\.00$/, "")}.`;
}

/** Under the moment's Approve, before the tap. The button changes only this page's own state. */
export const PRACTICE_TAP = "Practice tap: it moves no money and calls no PayPal.";
/** After the tap. Said in full, so a practice approval never reads as a payment. */
export const PRACTICE_DONE = "Practice tap: it moved no money and called no PayPal. In a real run, PayPal opens here, and only your tap there pays.";

// ---------- A week with Goose (Joshua, Nov 5 6:10 PM): four moments under the promises ----------

/** The section's small-caps label. */
export const WEEK_LABEL = "A week with Goose";
/** Joshua's footnote, word for word. */
export const WEEK_NOTE = "These moments come from our practice market. Prices are simulated.";

export interface WeekMoment { day: number; line: string }

/** The four moments, every name, price and day read from the recorded week: the ask, the cheapest seller set aside, the
 *  deal under the limit, the tap. Plain words, no feature names, and no notification: Goose shows the deal, it doesn't
 *  send one (T's wording, agreed Nov 5). The Devpost text (Track C) and the video kit use the same four sentences.
 *  Throws if the record stops telling it: the set-aside seller must be the cheapest listing on its first day. */
export function weekMoments(s: ScrollStory = scrollStory(), item: MovingItem = MOVING_ITEMS.find((i) => i.id === STORY_ITEM)!): WeekMoment[] {
  const whole = (c: Cents) => usd(c).replace(/\.00$/, "");
  const curve = (id: string) => item.sellers.find((x) => x.sellerId === id)!.curve;
  const scamDay = Array.from({ length: MOVING_DAYS }, (_, d) => d).find((d) => priceOn(curve(s.scam.id), d) !== null)!;
  const that = (d: number) => item.sellers.map((x) => priceOn(x.curve, d)?.total).filter((c): c is Cents => c !== undefined);
  const scamThen = priceOn(curve(s.scam.id), scamDay)!.total;
  if (scamThen > Math.min(...that(scamDay))) throw new Error(`week: ${s.scam.name} isn't the cheapest on day ${scamDay + 1}`);
  // "Gift card" is said only while the Watcher's own reason says it (row story-week).
  if (!/gift card/.test(s.scam.why ?? "")) throw new Error(`week: ${s.scam.name} is set aside for another reason: ${s.scam.why}`);
  return [
    { day: 1, line: `You ask Goose for ${s.title.replace(/^The /, "a ")} under ${whole(s.limit.cents)}.` },
    { day: scamDay + 1, line: `The cheapest seller, ${s.scam.name}, asks ${whole(scamThen)} by gift card, so Goose sets it aside and tells you why.` },
    { day: s.ping, line: `${s.deal.name}'s total falls to ${whole(s.deal.total)}, under your ${whole(s.limit.cents)}, so Goose shows you the deal.` },
    { day: s.day, line: `You tap to pay ${whole(s.deal.total)} in PayPal; nothing but your tap could pay.` },
  ];
}

// ---------- The scam, shown under the three steps' second step (Goose checks every seller) ----------

export const SCAM_HEAD = "The cheapest seller asked for a gift card.";
/** The protection line, word for word (Joshua's final direction, §3): the one gold sentence in the section. The Desk's
 *  word order, "Goose set TixQuack aside" (docs/launch/surface-words.md: one order everywhere). */
export const protectLine = (scam: string) => `Goose set ${scam} aside. Your money stays put.`;

// ---------- The stats band (section 4): the Proof panel's rows ----------

export * from "./band.ts";

// ---------- The close (section 5) ----------

export const CLOSE = ["Rather see for yourself?", "Try to trick Goose."] as const;
/** The close's end-card lines, Track C's words mounted word for word (track-c/landing-close-for-s2.md, Oct 30): who it's
 *  for, the team (exactly `TEAM` in scripts/claims-placeholders.ts) and how to add the guard (claims row `ten-lines`).
 *  The guard line links to the Safe page's "For a store or PayPal" section, which names `trust/README.md`. "Made to
 *  protect" and the FTC line moved up to the Impact section (`impact.ts`; Joshua, Nov 4). Without `link`, the whole line is the link. */
export const CLOSE_NOTES: readonly { text: string; href?: string; link?: string }[] = [
  { text: "Joshua Javier and Lucas (a team of two)" },
  { text: "Add the guard to your own checkout in ten lines of code.", href: "safe.html#c5" },
];
/** Where "Try to trick Goose" goes: the judge box's seller lab, the same link "Judge? Start here" gives (`judgeSteps`). */
export { TRICK_HREF } from "./menu-hash.ts";
