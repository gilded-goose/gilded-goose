// Item 10 (021 §4; restart notes §22, §24A; 018 N27; 019 §5): two commands the Ask box answers on the page itself, typed
// or said with the keyboard's mic, and the short lines Goose says back. "Buy this right now" prepares: it starts the run
// (as Go does) and, once code binds a cart, says it and brings Approve forward. "Not this one" declines a waiting cart.
// Neither reaches Approve: only the shopper's tap on it makes PayPal's order (H2), and a spoken "yes" still gets
// "Tap Approve to buy." from the Ask rule (`speakLine`). Whole utterances only: "no more than $60" is a limit, not a "no".
// A "no" is the easier one to match (shared Lesson 35): each sentence or clause said may be one ("No. Not this one."),
// and stop, wait, not now and "I changed my mind" count. A buy names no item and no number ("buy a laptop now" and
// "get me a kettle under 40 now" are asks): it only ever means the cart on this page.
// Said back in a median of 3 s or less, the cart lines about 4.3 s (a Mac voice estimate calibrated against desktop
// Chrome; the iPhone that measured 6.4 s is not re-measured), by `scripts/speak-times.ts`.

import { fromCents, toCents, type Cents, usd, usdWhole } from "../money.ts";
import { TAP_TO_BUY } from "./copy.ts";

export type VoiceIntent = "decline" | "buy-now";

const GOOSE = String.raw`(?:(?:hey|ok|okay)\s+goose\b[\s,]*)?`;
const END = String.raw`[\s.!]*$`;
// One clause that says no: "No", "nah", "no no no", "Not this one", "Cancel that order please", "Don't buy it now",
// "Never mind", "Skip it", "stop", "wait", "not now", "decline", "I changed my mind", "forget it".
const NO_ONE = new RegExp(String.raw`^${GOOSE}(?:please\s+)?(?:(?:no|nope|nah)(?:\s+(?:no|nope|nah))*|not\s+(?:this|that)(?:\s+one)?|not\s+now|cancel(?:\s+(?:it|that|this|the\s+(?:cart|order)|(?:this|that)\s+(?:cart|order)))?|(?:don'?t|do\s+not)\s+(?:buy|get|order)(?:\s+(?:it|this|that|one))?(?:\s+(?:right\s+)?now)?|never\s*mind|skip\s+(?:it|this|that)|stop|wait|hold\s+on|decline(?:\s+(?:it|this|that))?|(?:i\s+)?changed\s+my\s+mind|forget\s+(?:it|that))(?:\s+please)?$`, "i");
// Said beside a no and nothing on its own: "thanks", "please", "hey Goose".
const FILLER = /^(?:thanks|thank\s+you|please|(?:hey|ok|okay)\s+goose|goose)$/i;
// "Buy this right now." "Hey Goose, get me one now." "Order the kettle now." "Buy it." A buy word first, "now" last, and
// between them only the cart on this page: never an item or a number of its own.
const THIS = String.raw`(?:(?:it|this|that|one|this\s+one|that\s+one|the\s+kettle|the\s+goldfeather(?:\s+kettle)?)\s+)?(?:for\s+me\s+)?`;
const BUY_NOW = new RegExp(String.raw`^\s*${GOOSE}(?:please\s+)?(?:(?:buy|get|order)\s+(?:me\s+)?${THIS}(?:right\s+)?now|buy\s+(?:it|this|that))${END}`, "i");

/** A command the page answers itself, or null: the words go to the Ask route as before. */
export function voiceIntent(words: string): VoiceIntent | null {
  const w = words.normalize("NFKC").replace(/[‘’]/g, "'").trim();
  const said = w.split(/\s*[.,!?;:]+\s*/).filter(Boolean);
  if (said.length > 0 && said.every((c) => NO_ONE.test(c) || FILLER.test(c)) && said.some((c) => NO_ONE.test(c))) return "decline";
  if (BUY_NOW.test(w)) return "buy-now";
  return null;
}

// Go-to commands (034, Joshua's 12:15 queue, Lead's default 2): words that only open another page of this app, typed
// or said into an Ask box. A go-to only navigates, to one of the fixed addresses below: it never starts a run, never
// sets a cart aside, never approves or pays. It is its own function, not a `VoiceIntent`, so no page's command handler
// can mistake it for "buy this right now". The whole utterance only, and a page named plainly: "show me the market
// price of a kettle", "a wallet", "wallets under $30" and "home decor" are asks. A bare "wallet" is an ask too (it is
// something to shop for); "my wallet" or "open the wallet" goes there.
// Track V (042, Joshua's mandate item 4): "show me my priorities list" opens Your wants, the Desk's room for what she
// wants Goose to watch for (`?desk=1#wants`, the same address the menu uses). It names hers ("my priorities", "my
// wants", "my wish list") or the list itself ("priorities list"): "priority mail", "a wish list notebook" and "my
// priorities are price and speed" are asks.

export type GoTo = "proof" | "ledger" | "wallet" | "market" | "home" | "wants";
/** Where each go-to leads: the app's own addresses. Home is the bare address (the page's own path, no query). */
export const GO_TO_HREF: Readonly<Record<GoTo, string>> = { proof: "?desk=proof", ledger: "?desk=ledger", wallet: "?wallet=1", market: "?market=1", home: "", wants: "?desk=1#wants" };

const GO = String.raw`(?:(?:go|take\s+me|bring\s+me|navigate|jump|switch|head)\s+(?:back\s+)?(?:to\s+)?|(?:open(?:\s+up)?|show(?:\s+me)?|see|view)\s+)`;
const PAGE = String.raw`(?:\s+(?:page|panel|screen|tab|view))?`;
const TAIL = String.raw`(?:\s+please)?[\s.!]*$`;
const HEAD = String.raw`^\s*${GOOSE}(?:please\s+)?(?:(?:can|could)\s+you\s+|i\s+want\s+to\s+|let\s+me\s+)?`;
const WANTS = String.raw`(?:priorit(?:y|ies)(?:\s+list)?|list\s+of\s+(?:my\s+)?priorities|wants(?:\s+list)?|wish\s*list)`;
const GO_TO: readonly (readonly [GoTo, RegExp])[] = [
  // "Show me my priorities list", "my priorities", "open my wants", "go to my wish list", "what's on my priorities list",
  // "priorities list". Hers, or the list by name; never a bare "priority" or "wants".
  ["wants", new RegExp(String.raw`${HEAD}(?:(?:${GO}(?:the\s+|my\s+|your\s+)?|my\s+|your\s+)${WANTS}|what(?:'s|\s+is|\s+are)\s+(?:on\s+)?my\s+${WANTS}|${GO}?(?:the\s+)?priorit(?:y|ies)\s+list)${PAGE}${TAIL}`, "i")],
  // "Show me the proof", "go to proof", "the proof", "proof", "open the Proof panel".
  ["proof", new RegExp(String.raw`${HEAD}${GO}?(?:the\s+)?proof${PAGE}${TAIL}`, "i")],
  // "Behind the scenes", "show me behind the scenes", "go behind the scenes", "ledger", "open the ledger".
  ["ledger", new RegExp(String.raw`${HEAD}(?:${GO}|go\s+)?(?:(?:what's\s+|what\s+is\s+)?behind\s+the\s+scenes|(?:the\s+)?ledger)${PAGE}${TAIL}`, "i")],
  // "My wallet", "go to the wallet", "open my wallet". Bare "wallet" is an ask (see above).
  ["wallet", new RegExp(String.raw`${HEAD}(?:${GO}(?:the\s+|my\s+)?|my\s+)wallet${PAGE}${TAIL}`, "i")],
  // "Market", "the market", "go to the market", "open the market".
  ["market", new RegExp(String.raw`${HEAD}${GO}?(?:the\s+)?market${PAGE}${TAIL}`, "i")],
  // "Home", "go home", "take me home", "go back home", "the home page".
  ["home", new RegExp(String.raw`${HEAD}(?:${GO}|go\s+(?:back\s+)?)?(?:the\s+)?home${PAGE}${TAIL}`, "i")],
];

/** A page the words ask to open, or null: the words go on as an ordinary ask (or another command). */
export function goToIntent(words: string): GoTo | null {
  const w = words.normalize("NFKC").replace(/[‘’]/g, "'").trim();
  if (w.length > 60) return null;
  for (const [to, re] of GO_TO) if (re.test(w)) return to;
  return null;
}

// Voice undo (018 N28, 019 §1): "take it back" kept its words in 7 of 9 quiet clips, every "undo" wording 3 of 9 or
// fewer, so "take it/that back" leads; "undo/refund that (purchase)" are kept for typing. The whole utterance only, so
// "don't take it back" and "take it back to the store" are not it.
const TAKE_BACK = new RegExp(String.raw`^\s*${GOOSE}(?:please\s+)?(?:take\s+(?:it|that)\s+back|(?:undo|refund)\s+(?:it|that|this)(?:\s+(?:purchase|order))?|(?:undo|refund)\s+(?:my\s+)?last\s+(?:purchase|order))(?:\s+please)?${END}`, "i");

/**
 * True when the words ask to take the last purchase back. Only a page with an Undo of its own asks this (the wallet); it
 * never refunds: the page asks for the on-screen Undo tap (`takeBack`).
 */
export const saidTakeBack = (words: string): boolean => TAKE_BACK.test(words.normalize("NFKC").replace(/[‘’]/g, "'"));

/** An amount as it's said: "$55", "$47.73" (cents read aloud only when there are some). */
export const spokenUsd = usdWhole; // "$84", "$1,218", "$84.50"
/** A store as it's said: its first word ("Reedbank"); the card shows the full name. */
export const spokenStore = (name: string) => name.replace(/\s*\(fictional\)\s*$/, "").trim().split(/\s+/)[0] ?? name;

/** The cart said back: its price and store, then the tap, or that this page can't pay (a browser run, H1). */
export function cartSaid(cart: { merchant: string; total: string }, canApprove: boolean): string {
  return `${spokenUsd(toCents(cart.total))} at ${spokenStore(cart.merchant)}. ${canApprove ? TAP_TO_BUY : "Nothing to pay here."}`;
}

export { TAP_TO_BUY };
export const VOICE_SHOPPING = "Shopping for it now.";
export const VOICE_STILL = "Still shopping.";
/**
 * The cart set aside (the server keeps it as a "Not this one" row once it answers; a browser run keeps it on the page).
 * Said at once, before the server answers, so it never says "nothing was charged": true of every cart, since no PayPal
 * order is paid without the shopper's own tap.
 */
export const VOICE_DECLINED = "Set aside. Nothing is paid without your tap.";
/** A "no" while Goose is still haggling: the cart it binds is set aside as it lands, and never said as one to approve. */
export const VOICE_ASIDE_SOON = "I'll set it aside when it's ready.";
export const VOICE_PAID = "That cart is already paid.";
export const VOICE_NO_CART = "No cart to decline.";
/** A run started by voice that bound no cart (walked away, or refused by code). */
export const VOICE_NO_DEAL = "No cart this time. Nothing was charged.";
