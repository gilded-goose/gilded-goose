// The judge tour (`?desk=tour`; Joshua, Fri Oct 30, item 1, and Tue Nov 3, section 2: the promises lead it). Twelve stops,
// each the proof of one promise, in the promises' order with "Try to trick Goose" first, each with one live button that
// opens the real feature, ticked as you go. A stop that isn't built end to
// end on the live site (the haggle, until `HAGGLE_HREF` is set) keeps its number and says so plainly, with no button.
// Every stop names the menu items it covers (`menu`), so core/test/reach.test.ts can prove the tour and the menu
// list the same features. The ticks live in this browser only (the page's localStorage), never on the server.

import { APPROVE_HREF, HAGGLE_HREF, LIMITS_NAME, MIXER_ASK, MIXER_HREF, TRICK_HREF, deskHref } from "./menu-hash.ts";
import { HAGGLE_LINE, MENU_ITEMS, limitsSentence, type MenuItem } from "./menu.ts";
import { PROMISES, type GoosePromise, type PromiseId } from "./promises.ts";

export interface TourStop {
  id: string;
  /** The promise this stop is the proof of. */
  promise: PromiseId;
  name: string;
  /** The name the stepper pill shows beside the stop's number (S1-9; Round 3's consumer: "02 · The Watcher"). */
  short: string;
  line: string;
  /** The button's words: a verb for what it opens. */
  go: string;
  /** Where the button goes; empty while the stop isn't built (no button, never a dead link). */
  href: string;
  /** A second, quieter way into the same stop: an ask a visitor wouldn't think to type. It opens the page and waits for a tap. */
  chip?: { words: string; href: string };
  /** The menu items this stop opens or shows. */
  menu: readonly string[];
  /** S1-11: what the stop lands on, when its page doesn't land there itself: the stepper brings it wholly above the pill
   *  once, at landing, if it isn't (Round 4's design judge, fix 5: at 390 the bench's "Send to the agent" landed under
   *  the strip). A CSS selector on the stop's page. */
  land?: string;
  /** S1-13 (the DD at S1-12, item 3): on a wide screen the stop lands with this block's top --s-3 under the bar, so the
   *  block (a chart's card, with the one line that leads it) ends above the pill. A CSS selector on the stop's page. */
  landTop?: string;
  /** S1-13 (Lead-10): the heading the stepper focuses on arrival, for a stop whose page focuses nothing itself (03's
   *  classic page), so a screen reader says where the move went, as the Desk's rooms do for 05, 07 and 09. */
  focus?: string;
  /** S1-13: what the stop's line names, on its page, at each width (CSS selectors, all drawn): it lands wholly between the
   *  bar and the pill or strip. The tour pill keeps it whole when it moves the page; scripts/tour-pill.ts proves it. */
  subject: { wide: readonly string[]; phone: readonly string[] };
}

/** The heading. "About 3 minutes" is a claims row (`s1-tour-time`): measured site waits plus a stated look per stop. */
export const TOUR_TITLE = "Three promises, in about 3 minutes.";
export const TOUR_SUB = "Each button opens the real thing.";
/** What the time leaves out, said under the heading: only the shopper can do it. */
export const TOUR_NOT_COUNTED = "Not counting PayPal's own sandbox login.";
/** The look each open stop is given in the time: an allowance, said as one in the claims row, not a measurement. */
export const TOUR_LOOK_S = 15;
/** Said on a stop that isn't built end to end yet, in place of its button. */
export const TOUR_BUILDING = "Being built now. It gets its button here once it works end to end.";

export const TOUR: readonly TourStop[] = [
  { id: "trick", promise: "fooled", name: "Try to trick Goose", short: "Try to trick Goose", line: "Write a seller's note yourself, as sneaky as you like. Code reads it as data, never as orders.", go: "Try it", href: TRICK_HREF, menu: ["trick"], land: "#ds-ch-note", subject: { wide: ["#ds-ch-note"], phone: ["#ds-ch-note"] } },
  { id: "watcher", promise: "fooled", name: "The Watcher sets aside a scammer", short: "The Watcher", line: "Every run hides one scam seller. Watch its note get read and the seller set aside, with the reason.", go: "Watch it", href: deskHref("watcher"), chip: { words: MIXER_ASK, href: MIXER_HREF }, menu: ["watcher"], subject: { wide: [".dk-ask", ".dk-cue"], phone: [".dk-ask", ".dk-cue"] } },
  { id: "pay", promise: "fooled", name: "Approve and pay in PayPal", short: "Approve in PayPal", line: "The exact cart opens in PayPal's sandbox, with Pay Later beside it when PayPal sends one. Only your tap pays.", go: "Approve", href: APPROVE_HREF, menu: ["approve", "paylater"], subject: { wide: ["button#approve"], phone: ["button#approve"] } },
  { id: "ask", promise: "overspend", name: "Ask Goose", short: "Ask Goose", line: "Ask for something in your own words, or tap an example. Goose says what it understood before it shops.", go: "Ask", href: deskHref("ask"), menu: ["ask"], subject: { wide: [".dk-ask", ".dk-chips"], phone: [".dk-ask", ".dk-chips"] } },
  { id: "talk", promise: "overspend", name: "Talk to Goose", short: "Talk to Goose", line: "No screen to check? Say it. Goose reads the sellers and says when it sets one aside; your tap still pays.", go: "Talk", href: deskHref("talk"), menu: ["talk"], subject: { wide: [".dk-ask", ".dk-chips"], phone: [".dk-ask", ".dk-chips"] } },
  { id: "limits", promise: "overspend", name: LIMITS_NAME, short: LIMITS_NAME, line: limitsSentence(), go: "See limits", href: deskHref("settings"), menu: ["limits"], subject: { wide: ["#dk-set-h"], phone: ["#dk-set-h"] } },
  { id: "haggle", promise: "overspend", name: "The haggle", short: "The haggle", line: HAGGLE_LINE, go: "See it", href: HAGGLE_HREF, menu: HAGGLE_HREF ? ["haggle"] : [], subject: { wide: ["#hg-h", ".hg-chart"], phone: ["#hg-h", ".hg-chart"] } },
  { id: "wants", promise: "overspend", name: "Your wants and your week", short: "Wants and week", line: "The prices Goose watches for you, and a recorded week of shopping, day by day.", go: "Open", href: deskHref("wants"), menu: ["wants", "week"], subject: { wide: ["#dk-wants-h"], phone: ["#dk-wants-h"] } },
  { id: "list", promise: "overspend", name: "The Christmas list", short: "Christmas list", line: "Gifts under one total, a read on each, and Goose's plan for when to buy. Only your tap pays.", go: "Open it", href: "?desk=list", menu: ["list"], subject: { wide: [".xl-total"], phone: [".xl-total"] } },
  { id: "ledger", promise: "hide", name: "Behind the scenes", short: "Behind the scenes", line: "Every decision from this visit, each with its reason.", go: "Open", href: "?desk=ledger", menu: ["ledger"], landTop: ".lx-lead", subject: { wide: [".lx-lead, #st-h"], phone: ["#sl-h, #st-h"] } },
  { id: "after", promise: "hide", name: "After you pay", short: "After you pay", line: "Tracking, Undo for a refund, and what to do if it never arrives.", go: "Open", href: deskHref("after"), menu: ["after"], subject: { wide: [".ap-h"], phone: [".ap-h"] } },
  { id: "proof", promise: "hide", name: "Proof", short: "Proof", line: "Every number on this site, with where it comes from.", go: "Open", href: "?desk=proof", menu: ["proof"], subject: { wide: ["#pf-h"], phone: ["#pf-h"] } },
];

/** The tour's stops under the promise each one proves, in the tour's order, with each stop's place in the whole list. */
export const TOUR_GROUPS: readonly { promise: GoosePromise; stops: readonly { stop: TourStop; at: number }[] }[] = PROMISES.map((promise) => ({
  promise,
  stops: TOUR.flatMap((stop, at) => (stop.promise === promise.id ? [{ stop, at }] : [])),
}));

/** The stops a visitor can open today: the ticks count these. */
export const TOUR_OPEN: readonly TourStop[] = TOUR.filter((s) => s.href !== "");

/** Menu items that aren't one of the tour's stops, linked under the list so the tour still reaches them. */
export const TOUR_ALSO: readonly MenuItem[] = MENU_ITEMS.filter((i) => i.id === "how" || i.id === "builders" || i.id === "storesync");

/** The ticks this browser kept, read back defensively: only ids of open stops, each once. */
export function parseTicks(raw: string | null): string[] {
  let v: unknown;
  try { v = raw === null ? [] : JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(v)) return [];
  const open = new Set(TOUR_OPEN.map((s) => s.id));
  return [...new Set(v.filter((x): x is string => typeof x === "string" && open.has(x)))];
}

/** The eyebrow over the title (S1-3; the Round 0 judge: the tour "never says it is a tour"): what this page is and how
 *  many stops it has, counted from the list (claims row `s1-tour-stops`). */
export const tourEyebrow = (): string => `Judge tour · ${TOUR_OPEN.length} stops`;

/** The tour's one Next (S1-3): the first stop not yet seen, by its place in the list, with the button's words; null
 *  once every open stop is seen. */
export function tourNext(seen: readonly string[]): { stop: TourStop; n: number; words: string } | null {
  const i = TOUR.findIndex((s) => s.href !== "" && !seen.includes(s.id));
  if (i < 0) return null;
  const stop = TOUR[i]!;
  return { stop, n: i + 1, words: seen.length === 0 ? `Start with ${stop.name}` : `Next: ${stop.name}` };
}

/** The progress line: plain counts, never a percent. */
export const tourProgress = (seen: number): string =>
  seen <= 0 ? `${TOUR_OPEN.length} stops to open.` : seen >= TOUR_OPEN.length ? `All ${TOUR_OPEN.length} stops seen.` : `${seen} of ${TOUR_OPEN.length} seen.`;
