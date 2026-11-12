// The board's first lines' words, on their own so the ledger's own chunk doesn't load the board's whole vocabulary before
// the board is asked for: a bundler keeps a module's used exports together. No imports, on purpose.

export const BOARD_EYEBROW = "Live threat board";
export const BOARD_LOADING = "Reading the record…";
/** No number stands in when the record can't be read: the counter says so, and the seeded week stays labeled below. */
export const BOARD_UNAVAILABLE = "The live count can't be read right now.";
export const TRY_LINK = "Try to trick Goose ›";
export const TRICK_HREF = "?desk=1#challenge"; // core's TRICK_HREF, spelled out for "no imports"; promises.test.ts pins them equal
