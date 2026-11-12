// Track V (029): the words Whisper is primed with, so tiny.en spells the demo's own items the way the catalog does
// (asked for after Joshua's iPhone heard "toser" for "toaster"). Whisper reads a prompt as the text that came before the
// speech, so a word in it is more likely to be heard as spelled. Measured on `say` clips, it fixes the made-up names
// (Mossbell Inn, Tidewater, Harbor) and leaves "toaster" where it was, with or without "toaster" in the list. Built from core's data, never typed:
// every item Goose shops or watches, as Goose says it (`ITEM_WORDS`), so a new catalog item reaches the mic with no edit
// here. Read at build time only (web/voice-words.ts puts the finished prompt in the speech worker).
//
// Items only, measured (029, "Word list"): adding the market table's 70-odd words (toaster, hotel, shirt…) helped no
// item more than the items alone, cost ~255 ms a hold (items alone ~140 ms), and pulled other words toward the list
// ("toaster" heard as "hostel"). Decided by default; flip if Joshua says: "prime the market words too" (add
// MARKET_PLACES' words after the items, singulars only, and re-measure).

import { ITEM_WORDS } from "./shops.ts";

/**
 * Track V (042, Lead-9, after Joshua's iPhone heard "Air plane tickets."): a short list of everyday words a shopper says
 * to the Desk, after the items (the prompt is trimmed from its start, so the items always stay). Short on purpose: 029
 * measured 70-odd market words costing ~115 ms more a hold and pulling other words toward the list. The demo's own asks
 * (airplane, flight, hotel, concert, ticket, toaster, sneakers), common things to buy, and "priorities list", the spoken
 * way to open Your wants. Decided by default: these 11, not yet re-measured on the spike's clips (follow-up in 042).
 * Flip if Joshua says: "items only again" (drop COMMON_WORDS from the default below).
 */
export const COMMON_WORDS: readonly string[] = ["airplane", "flight", "hotel", "concert", "ticket", "toaster", "sneakers", "headphones", "backpack", "laptop", "priorities list"];

/** The words, in order, each once (any case): the catalog's items as Goose names them, then the everyday words. */
export function voiceWords(items: readonly string[] = [...Object.values(ITEM_WORDS), ...COMMON_WORDS]): string[] {
  const seen = new Set<string>();
  return items.filter((w) => !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase()));
}

/** The prompt itself: the words as one list, the way a shopper's earlier words would read. */
export const voicePrompt = (words: readonly string[] = voiceWords()): string => `${words.join(", ")}.`;
