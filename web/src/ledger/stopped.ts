// AS-15 slice 2 (Track R's kit, docs/guild/062-r.md §7): which of the kit's states a stopped ledger stream draws below
// the hero, from what the server answered, and its words. One place, so the page and its test read the same rule.
import { LONG_WAIT_MS } from "../states/retry.ts";
import { ERROR, LIMITED, OFFLINE } from "../states/words.ts";

/** The kit's block for a stopped stream. */
export type Stopped = "empty" | "network" | "limited" | "error";

/**
 * 204: no session yet, so `<Empty title={EMPTY_VISIT} />` ("Your visit has no rows yet." · "They start when you ask Goose." · Ask Goose ›). 0: nothing
 * answered (a dropped network, a server that is down), the only case that says "Goose's server didn't answer.". 429: the
 * server's limit, `<RateLimited>`. Anything else: the server answered and the stream still failed.
 */
export function stoppedAs(code: number): Stopped {
  return code === 204 ? "empty" : code === 0 ? "network" : code === 429 ? "limited" : "error";
}

/** Track C's title for a ledger that stopped (the DD gate, 06:14 PDT): the same noun as the empty state's "Your visit has no rows yet.",
 *  for the same thing, this browser's session events. */
export const ROWS_FAILED = "Your rows didn't load.";

/**
 * A failure's words, in the kit's three parts (title · cause · action), or null where the kit's own words stand (Empty,
 * and a 429 the kit draws as a daily cap or a long wait: LIMITED_DAILY / LIMITED_LATER). The cause is said only when the
 * code knows it: status 0 is ERROR.network, a short 429 is LIMITED's; any other failure has none, since "answered with an
 * error" would be false for a 200 whose stream broke later. Each ends "What's on screen stays." (the kit's OFFLINE line),
 * which is true here: a stopped stream only sets the status, and the page never removes a row it drew (as15.test.ts).
 */
export function stoppedWords(kind: Stopped, retryAfterMs = 0): { title: string; line: string; action: string } | null {
  const stays = OFFLINE.line;
  switch (kind) {
    case "empty": return null;
    case "network": return { title: ROWS_FAILED, line: `${ERROR.network} ${stays}`, action: ERROR.action };
    case "limited": return retryAfterMs > LONG_WAIT_MS ? null : { title: ROWS_FAILED, line: `${LIMITED.line} ${stays}`, action: LIMITED.action };
    case "error": return { title: ROWS_FAILED, line: stays, action: ERROR.action };
  }
}

/** The ledger's empty state, under a board that has rows of its own (the DD, Round 5 B1): whose list it is, so the page can't read as contradicting itself. */
export const EMPTY_VISIT = "Your visit has no rows yet.";
