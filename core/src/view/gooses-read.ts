// Goose's Read (Joshua, Nov 3, 4e): BUY NOW / WAIT / SKIP on a want or a deal, from real signals only: the price against the
// shopper's max and total, the seller's verdict, the price's trend, their priority and the days until they need it. Code
// computes it, here, with no model in the loop. A signal we don't have is said as missing, never guessed. An AI reading
// reaches a Read through one door, `moreCareful`, which can only lower the call. A Read is advice: it binds no cart and
// pays nothing, and the guard and the shopper's tap stand whatever it says. Pure: signals in, a Read out.

import { fromCents, type Cents, usd } from "../money.ts";
import { parseReading } from "../trust/reader.ts";

export type ReadCall = "BUY NOW" | "WAIT" | "SKIP";
export type SellerSignal = "clear" | "hold" | "refuse" | "none";

export interface ReadSignals {
  /** The best price from the best-trusted seller; null when no seller has one. */
  priceCents: Cents | null;
  /** The most this want will pay; null on a deal, where the run already held the price to the ask's cap and the limit. */
  maxCents: Cents | null;
  seller: SellerSignal;
  sellerName: string | null;
  /** The lowest cleared price's first and latest recorded day; null when there is no record to read. */
  trend: { fromCents: Cents; toCents: Cents } | null;
  /** The shopper's priority, 1 to 5; null on a deal with no saved want, where `asked` says they asked just now. */
  rank: number | null;
  /** Days until needed, below 0 once passed; null when no day was set. */
  daysLeft: number | null;
  neededSaid: string | null;
  /** What's left of the list's total; null when no total stands. */
  leftCents: Cents | null;
  /** Every price in this demo is simulated, and the Read says so whenever it names one. */
  simulated: boolean;
}

export interface ReadLine { name: string; said: string }
export interface GooseRead { call: ReadCall; because: string; lines: ReadLine[] }

/** Whose work a Read is. A claims row probes it (`x-read-code`). */
export const READ_BY_CODE = "Code worked this out from these signals.";
export const NO_TREND = "No price history for this one, so there's no trend to read.";
/** Whose prices the trend is. The deal card's "Was" is one seller's own, so a judge opening both sees $105.00 and $112.00 for
 *  one day 1 (Track T, Nov 4): both true, and each has to say whose it is. A claims row probes it (`x-read-whose`). */
export const TREND_WHOSE = "Sellers not set aside: lowest price";

/** Priority 4 or 5, or a deal they asked for just now. */
const wanted = (s: ReadSignals) => s.rank === null || s.rank >= 4;
/** Falling and rising are the only trends that change a call; a price that ends where it started has none to speak of. */
const trendOf = (s: ReadSignals) => (!s.trend || s.trend.toCents === s.trend.fromCents ? "flat" : s.trend.toCents < s.trend.fromCents ? "falling" : "rising");

/** The call and its one reason. The order is the point: what rules a purchase out comes first, then what asks for care,
 *  and only a cleared seller at a price within every limit reaches the lines that can say BUY NOW. */
function called(s: ReadSignals): { call: ReadCall; because: string } {
  if (s.seller === "refuse") return { call: "SKIP", because: "Goose set aside every seller it found." };
  if (s.daysLeft !== null && s.daysLeft < 0) return { call: "SKIP", because: "The day you needed it has passed." };
  if (s.priceCents === null) return { call: "WAIT", because: "No seller has a price yet." };
  if (s.leftCents !== null && s.priceCents > s.leftCents) {
    return s.rank !== null && s.rank <= 2
      ? { call: "SKIP", because: "It won't fit what's left of your total, and it's low on your list." }
      : { call: "WAIT", because: "It won't fit what's left of your total." };
  }
  if (s.maxCents !== null && s.priceCents > s.maxCents) return { call: "WAIT", because: "Its ask is over the most you'll pay." };
  if (s.seller !== "clear") return { call: "WAIT", because: "Its seller needs your eye first." };
  const days = s.daysLeft;
  const trend = trendOf(s);
  const pull = s.rank === null ? "You asked for it, and it's within your limit." : "It's high on your list, and it's within your limit.";
  if (trend === "rising") return { call: "BUY NOW", because: "Its price is climbing, and it's within your limit." };
  if (trend === "falling") {
    if (wanted(s)) return { call: "BUY NOW", because: pull };
    return days !== null && days <= 7
      ? { call: "BUY NOW", because: "Its price is falling, but you need it within a week." }
      : { call: "WAIT", because: "Its price is falling, and nothing's pressing." };
  }
  if (days !== null && days <= 14) return { call: "BUY NOW", because: "You need it within two weeks, and it's within your limit." };
  if (wanted(s)) return { call: "BUY NOW", because: pull };
  return { call: "WAIT", because: s.trend ? "Its price is steady, and nothing's pressing." : "Nothing says hurry yet." };
}

const sellerLine: Record<SellerSignal, (name: string) => string> = {
  clear: (n) => `Goose set nothing aside from ${n}.`,
  hold: (n) => `${n} waits for your yes.`,
  refuse: (n) => `Goose set ${n} aside.`,
  none: () => "No seller found yet.",
};

/** One plain line per signal, the missing ones said as missing. */
function linesOf(s: ReadSignals): ReadLine[] {
  const sim = s.simulated ? " (simulated)" : "";
  const price = s.priceCents === null ? "None yet."
    : s.maxCents === null ? `${usd(s.priceCents)}${sim}.`
    : `${usd(s.priceCents)}${sim}, ${s.priceCents > s.maxCents ? "over" : "within"} your ${usd(s.maxCents)} max.`;
  const trend = !s.trend ? NO_TREND
    : s.trend.toCents === s.trend.fromCents ? `${TREND_WHOSE} held at ${usd(s.trend.toCents)}${s.simulated ? " this simulated week" : ""}.`
    : `${TREND_WHOSE} ${s.trend.toCents < s.trend.fromCents ? "fell" : "rose"} from ${usd(s.trend.fromCents)} to ${usd(s.trend.toCents)}${s.simulated ? " this simulated week" : ""}.`;
  const needed = s.daysLeft === null ? "No date set."
    : s.daysLeft < 0 ? `${s.neededSaid}: passed.`
    : s.daysLeft === 0 ? `${s.neededSaid}: today.`
    : `${s.neededSaid}: ${s.daysLeft === 1 ? "1 day" : `${s.daysLeft} days`} away.`;
  return [
    { name: "Price", said: price },
    { name: "Seller", said: sellerLine[s.seller](s.sellerName ?? "This seller") },
    { name: "Trend", said: trend },
    { name: "Priority", said: s.rank === null ? "You asked for this just now." : `${s.rank} of 5.` },
    { name: "Needed by", said: needed },
    { name: "Total", said: s.leftCents === null ? "No total set." : `${usd(s.leftCents)} left.` },
  ];
}

export function gooseRead(s: ReadSignals): GooseRead {
  return { ...called(s), lines: linesOf(s) };
}

/**
 * The one door for an AI's reading. It takes the reading as unknown and reads it with `parseReading`, so anything but an
 * exact reading changes nothing. A "hold" lowers BUY NOW to WAIT; a "refuse" lowers the call by one step. Nothing an AI
 * says can raise a call, and it never moves one by more than a step, the same rule `escalate` keeps for a seller's verdict.
 */
export function moreCareful(read: GooseRead, reading: unknown): GooseRead {
  const r = parseReading(reading);
  if (!r || r.verdict === "clear") return read;
  const call: ReadCall = read.call === "BUY NOW" ? "WAIT" : read.call === "WAIT" && r.verdict === "refuse" ? "SKIP" : read.call;
  return call === read.call ? read : { call, because: "An AI reader asked for more care.", lines: [...read.lines, { name: "AI reader", said: "It asked for more care. It can't ask for less." }] };
}
