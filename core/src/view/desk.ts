// The Desk's words that depend on what the server says (slice 1). Pure, so the page and its tests read the same lines:
// the payments line comes from /api/health's one `payment` value, and is neutral until that answers; the deal is chosen
// from the Watcher's verdicts, never from a seller's words.

import type { StoreResult } from "../storesync.ts";
import { LIMITS_NAME } from "./menu.ts";
import { capUsd } from "../ask/cap.ts";
import type { Cents } from "../money.ts";
import { usdOf } from "../money.ts";

/** What /api/health's `payment` field may say. Anything else (or no answer yet) is `null`. */
export type PaymentMode = "sandbox" | "fake" | "off";

export const PAYMENTS_WORDS: Readonly<Record<PaymentMode | "unknown", string>> = {
  sandbox: "In PayPal sandbox. Only your tap pays.",
  fake: "Practice payments on this server. Only your tap pays.",
  off: "PayPal isn't connected on this server, so nothing can be paid here.",
  // Before /api/health answers (or if it can't): true on every server, and claims no mode.
  unknown: "Only your tap pays.",
};

/** The one payments mode from /api/health's body, or null when it hasn't said a known one. */
export function paymentMode(health: unknown): PaymentMode | null {
  const p = typeof health === "object" && health !== null ? (health as { payment?: unknown }).payment : undefined;
  return p === "sandbox" || p === "fake" || p === "off" ? p : null;
}

export const paymentsWords = (mode: PaymentMode | null): string => PAYMENTS_WORDS[mode ?? "unknown"];

/** A listing the Desk may offer: the Watcher didn't refuse it, and it isn't over what the ask is held to (Track H-3). */
export const deskOpen = (r: StoreResult): boolean => r.watcher !== "refuse" && r.over === undefined;

/** The cheapest listing the Watcher didn't set aside, over her cap or not: what the No deal card names (DD H-4). */
export const cheapestSafe = (results: readonly StoreResult[]): StoreResult | null =>
  results.filter((r) => r.watcher !== "refuse").reduce<StoreResult | null>((best, r) => (best === null || Number(r.price) < Number(best.price) ? r : best), null);

/** The deal card's count line when her cap or the limit narrowed the choice (DD H-4): the Watcher alone counts a seller unsafe. */
export const underWords = (open: number, held: string): string => (open === 1 ? `Not set aside · the one under ${held}` : `Not set aside · lowest under ${held}`);
/** The deal card's count line with no cap of hers narrowing the choice (Round 4 judges, "New" 4): the Watcher alone
 *  counts a seller unsafe, so a set-aside seller under the limit (TixQuack at $55.00) is never counted as an option.
 *  Six words at most, as "Cheapest of the N sellers left" was: the deal card holds 50 with the practice-site line
 *  (desk-walk.ts), and "lowest of the N left" made it 52 (Track F, push 4). */
export const safeWords = (open: number): string => (open === 1 ? "Not set aside · only one left" : `Not set aside · lowest of ${open}`);
/** The deal's row tag (Joshua, Nov 5 §1b: "Best deal you can trust."): the lowest price among the sellers the Watcher
 *  didn't set aside, inside what the cart is held to. The Watcher can miss a scam, so the tap is still what protects her. */
export const BEST_DEAL = "Best deal you can trust";
/** True when what the cart is held to is her own cap (cap.ts `heldWords`: "your $45.00 cap"), not a limit in code. */
export const heldByCap = (held: string | null | undefined): boolean => typeof held === "string" && /^your \$[\d,.]+ cap$/.test(held);
/** What "Keep watching" sends (`/api/runs/wants`): a "really want", at `max` = what the cart is held to (her own cap when
 *  it is under the category's limit; S1-11, after H-6 and POL-3: "nothing over $85" waits for $85.00 or less). With no
 *  max the server keeps the want at the category's limit. */
export const watchWant = (catalogId: string, max?: Cents | null): { catalogId: string; priority: "really"; max?: Cents } =>
  (max === undefined || max === null ? { catalogId, priority: "really" } : { catalogId, priority: "really", max });
/** The No deal card's second choice (Round 4 judges, fix 5): wait for a price at or below what she's held to (the watch fires at <= max). */
export const keepUnderWords = (held: Cents): string => `Keep watching for ${capUsd(held)} or less`;
/** No deal because every seller left is over what she's held to (DD H-4): what is true, and the price to weigh. "The
 *  cheapest" is joined by a no-break space (W7), so a line never ends on a lone "The". */
export const noDealUnder = (held: string, cheapest: string): string => `Nothing here is under ${held}. The cheapest seller left asks ${usdOf(cheapest)}.`;

/** The listing the Desk offers as the deal: the cheapest open one (`deskOpen`), or null when none is. */
export function deskDeal(results: readonly StoreResult[]): StoreResult | null {
  const open = results.filter(deskOpen);
  return open.reduce<StoreResult | null>((best, r) => (best === null || Number(r.price) < Number(best.price) ? r : best), null);
}

/** The set-aside pile's count on a finished run (Joshua, Nov 5, §1a): `pileHead`'s words, kept here so the Desk doesn't
 *  load the ladder's words for one line (core/test/pile.test.ts holds the two the same). Each set-aside row says why. */
export const deskPile = (results: readonly StoreResult[]): string => {
  const m = deskAside(results).length;
  return results[0] ? `Checked ${results.length} listing${results[1] ? "s" : ""}. ${m ? `Set aside ${m}.` : "Nothing set aside."}` : "No listings to check.";
};

/** The listings the Watcher set aside (on a made-up market, at least the one code planted). */
export const deskAside = (results: readonly StoreResult[]): StoreResult[] => results.filter((r) => r.watcher === "refuse");

/** A Watcher phrase as a sentence: first letter up, one full stop. */
export const sentence = (words: string): string => (words ? `${words[0]!.toUpperCase()}${words.slice(1).replace(/[.\s]+$/, "")}.` : "");

/** The one reason the protected card leads with: how the seller wants to be paid, if it said, since that is the line a
 *  shopper reads fastest; else the Watcher's first. Every reason still shows in the "Why?" sheet. */
export const skipReason = (said: readonly string[]): string => said.find((s) => /\bpaid\b|\bpay\b|gift card|wire/.test(s)) ?? said[0] ?? "";

/** A seller's name for a headline or a row. The market label says "fictional" once, so the name drops the
 *  "(fictional)" code adds to every made-up store (Joshua, Oct 30: "Goose skipped Gullwing Clearance."). */
export const sellerName = (merchant: string): string => merchant.replace(/\s*\(fictional\)\s*$/i, "");

/**
 * A seller's note as the deal's "View details" quotes it, or null when it has none (Round 2 judges, fix 1b: a clean
 * seller with no note printed `Its note “”`). Null means the line isn't drawn at all: never an empty pair of quotes.
 */
export const noteWords = (quoted: string | null | undefined): string | null => {
  const t = typeof quoted === "string" ? quoted.trim() : "";
  return t === "" ? null : t;
};

/** The best deal Goose has seen so far as sellers are checked one by one: the cheapest the Watcher didn't refuse among
 *  the first `checked` results, so the price on screen only ever moves to a real listing's price. */
export const dealSoFar = (results: readonly StoreResult[], checked: number): StoreResult | null => deskDeal(results.slice(0, Math.max(0, checked)));

/** The Ask box's longest entry (the input's maxLength). */
export const ASK_MAX = 80;
/** What the mic adds to the Ask box (Joshua, Oct 30: "The transcript lands in the Ask box, editable, and is never sent
 *  on its own"): the box's words, then the heard ones, trimmed to the box's length. Only text: the shopper taps Ask. */
export const heard = (box: string, said: string): string => `${box.trim()} ${said.trim()}`.trim().slice(0, ASK_MAX);
/** The Desk's one voice line as Joshua set it (Oct 30): no numbers, no comparisons. One word changed (Wed Nov 4): it
 *  said "your phone" on a laptop too, and the model runs in the browser on either. */
export const VOICE_LINE = "Speech becomes text on your device, about a second after you let go; your voice is never sent anywhere.";

/** The deal card's "Before you approve" row, last line (Joshua, Oct 30: "the hold that pays exactly this amount or
 *  nothing"): Approve binds the cart to its total, and the guard refuses any other amount before PayPal takes payment. */
export const boundLine = (total: string): string => `Approve binds the cart to exactly ${usdOf(total)}: PayPal pays that after your tap, or nothing.`;
/**
 * Who made the sellers, in a shopper's words (Round 1's cold consumer test: "Sellers made by: claude-haiku-5-5" put a model
 * id in shopper copy). The server's `madeBy` is the maker's name: the recorded week's and the fixed set's say "(no AI
 * call)" (`RECORDED_MAKER_NAME`, `FIXED_MAKER_NAME`); anything else is the AI model's id, which stays in Behind the scenes
 * and Proof, where engineers look. Claims row s1-made-by.
 */
export const MADE_BY_WORDS = {
  recorded: "No AI made these sellers.",
  fixed: "Sellers are a fixed practice set; no AI made them.",
  ai: "Sellers are simulated by an AI model, for practice.",
} as const;
export const madeByWords = (madeBy: string): string =>
  /no AI call/i.test(madeBy) ? (/recorded/i.test(madeBy) ? MADE_BY_WORDS.recorded : MADE_BY_WORDS.fixed) : MADE_BY_WORDS.ai;
/** The run's one honesty line under its title (the DD, DK check 2: the market line, who made the sellers and the planted
 *  scam were three lines and a footnote; now one of 12 words or fewer). Same three makers as `madeByWords`, the same
 *  facts: fictional sellers, who made them (no model id), and code's one planted scam (`PLANTED_SAYS`). The AI-made
 *  market's prices are estimates (`FICTIONAL_MARKET_CLAIM`), so its line says so. Claims row s1-made-by. */
export const MARKET_LINE = {
  recorded: "Recorded fictional week, no AI; one seller is a planted scam.",
  peer: "Fictional secondhand sellers, no AI; one seller is a planted scam.",
  fixed: "Fictional practice set, no AI; one seller is a planted scam.",
  ai: "AI-made fictional sellers, estimated prices; one is a planted scam.",
} as const;
export const marketLine = (madeBy: string): string =>
  /no AI call/i.test(madeBy) ? (/secondhand/i.test(madeBy) ? MARKET_LINE.peer : /recorded/i.test(madeBy) ? MARKET_LINE.recorded : MARKET_LINE.fixed) : MARKET_LINE.ai;
/** A set-aside seller's row, short (the DD, check 2: "Set aside: gift card"): the payment it asked for when that is a
 *  gift card, else the Watcher's reason as `skipReason` gives it. The full reason is in "Before you approve" and Why?. */
export const asideTag = (said: readonly string[]): string => {
  const why = skipReason(said).replace(/^it /, "");
  return /gift card/i.test(why) ? "gift card" : /Friends & Family/.test(why) ? "Friends & Family" : /page outside checkout/.test(why) ? "pay off-site" : /already shipped/.test(why) ? '“already shipped”' : /more than the price/.test(why) ? "overpay and refund" : why;
};
/** Under the deal card, Joshua's words (Oct 30). Shown only where the price watch can keep watching (a recorded item),
 *  with the button that saves the want it watches. */
export const RATHER_WAIT = "Goose keeps watching the price.";
/** After "Keep watching" saves the want: the max the price watch waits for, the want card's own (server's wantsBody). */
export const watchingLine = (max: string): string => `Saved to your wants. Goose watches for ${usdOf(max)} or less.`;
/**
 * PayPal's return (or a reload of it) names a run the server doesn't have (Track J: a kept run's window ended, or the
 * address was edited). The server says 404, so the page says it can't tell, never "Waiting on PayPal" and never paid
 * or not paid: it doesn't know which.
 */
export const CART_GONE = { title: "Cart not found", line: "This server no longer has that cart, so it can't say what PayPal did with it." } as const;
/** Goose's one sentence before the card of what code read in the shopper's words (ask/understood.ts). */
export const UNDERSTOOD = "Here's what I understood.";
/** Behind "Why this limit?" when her words named a price: no number in her words is read (`marketWant`). */
export const PRICE_NOT_LIMIT = "A price in your words isn't a limit.";
/** Why it isn't: if her words could set a limit, a seller's could too (the guard reads no limit from any words). */
// S1-6 named the Desk's limits pane "Limits in code" everywhere (`LIMITS_NAME`), so the lines that send her there say it.
export const PRICE_WHY = `${PRICE_NOT_LIMIT} Limits are set only in ${LIMITS_NAME}, so no seller's words can set one either.`;
/** Under the card's limit when her words named a price, one quiet line: her words back, and where the limit comes from. */
export const priceNotLimit = (said: string): string => `You said “${said}”. Your limit is set only in ${LIMITS_NAME}.`;
/** Track H-3: behind "Why this limit?" when her words said a cap. A cap can only lower; the limits stay code's. */
export const CAP_WHY = `Your words can set a lower cap for this ask, never a higher one. Limits are set only in ${LIMITS_NAME}.`;

/** DK (the brief's item 5: every Desk state designed; to swap for Track R's `web/src/states/**` when it lands): why the
 *  server gave the Desk no answer. Read from what came back, never guessed: the browser says it is offline; nothing came
 *  back at all; a free host asleep answers its own non-JSON 503 (the Wallet's rule, Track W); a 429 is a cap, whose own
 *  words the server sends; anything else is the server's error. */
export type Trouble = "offline" | "away" | "waking" | "capped" | "error";
export function troubleOf(status: number, isJson: boolean, online: boolean): Trouble {
  if (!online) return "offline";
  if (status === 0) return "away";
  if (status === 503 && !isJson) return "waking";
  if (status === 429) return "capped";
  return "error";
}
/** Each trouble as one state block, in brand.md §10.9's words: what happened in 8 words or fewer, then only the cause
 *  (the status line above the block already says "Nothing changed", so the block never repeats it); 24 words in all; no
 *  countdown and no promised wake or reset time, since none is measured. `retry`: whether a Try again can help (a cap
 *  can't: the server sends no Retry-After, so no time to enable it is known); `auto`: the page asks again by itself
 *  (offline: on the browser's `online` event). Decided by default (DK, Oct 31): a cap keeps its honest daily title, not
 *  §10.9's "Goose needs a minute.", because this server's caps are per day; flip if the DD rules otherwise. */
/** DK-12: offline's line once she has typed new words in the box: those are hers to send, so nothing is promised for
 *  them (the kit's own offline line, web/src/states/words.ts OFFLINE.line). */
export const OFFLINE_STAYS = "What's on screen stays.";
export const TROUBLE: Readonly<Record<Trouble, { title: string; line: string; retry: boolean; auto?: true }>> = {
  offline: { title: "You're offline.", line: `${OFFLINE_STAYS} Goose checks sellers again once you're back.`, retry: false, auto: true },
  away: { title: "Goose couldn't load this.", line: "Goose's server didn't answer.", retry: true },
  waking: { title: "Goose's server is waking up.", line: "Give it a moment, then try again.", retry: true },
  capped: { title: "That's today's limit from here.", line: "Today's tries are used up.", retry: false },
  error: { title: "Goose couldn't load this.", line: "Goose's server hit an error.", retry: true },
};
/** A cap's one way forward (the DD, DK part 9: the capped frame was a dead end). The cap is per browser, per network and
 *  site-wide, per day (server main.ts ASK_CAPS), so a different ask fails too; the recorded week needs no fresh market:
 *  the haggle page replays recorded week 1 in the browser (Haggle.tsx, offline.ts), with no request to the server. Its
 *  `href` is an app address, made a link by appHref. Offline's way forward is its own ask again (`auto`), so it has none. */
export const WEEK_WAY = { label: "Watch the recorded week", href: "?desk=haggle" } as const;
/** A trouble as one line, for a note under a control (a pane's Save, the deal card's Approve): nothing changed, and why. */
export const troubleLine = (t: Trouble): string => `Nothing changed. ${t === "offline" ? "You're offline." : TROUBLE[t].line}`;
/** A server's failure sentence as the cause under a trouble's head: its closing "Nothing changed." goes, since the status
 *  line above already says it (the DD, DK check 2 b: said once); under a cap's head, which already says "from here", its
 *  "from here" goes too (the DD, part 2 nit 1: "Today's made-up markets are used up."). */
export const causeOnly = (said: string, t?: Trouble | null): string => {
  const s = said.replace(/\s*Nothing changed\.\s*$/, "") || said;
  return t === "capped" ? s.replace(/\s+from here\b/, "") : s;
};
/** The failure's own words ask her to reword (the market maker's MARKET_FAILED, a 500): its action puts her words back
 *  in the Ask box, never Try again, since the same words fail the same way (the DD, DK check 2 f). */
export const asksToReword = (reason: string | null | undefined): boolean => !!reason && /\breword/i.test(reason);
/** Waiting on the server after 400 ms (§10.9 Loading: what Goose is really doing). Sellers loading say ASKING; else this. */
export const LOADING = "Goose is loading this.";
export const ASKING = "Goose is checking the sellers.";
/** Your wants with nothing saved (§10.9 Empty): what is missing, when it starts, and the one way to start it. */
export const WANTS_EMPTY = { title: "No wants yet.", line: "They start when you tap Keep watching.", action: "Ask Goose" } as const;
