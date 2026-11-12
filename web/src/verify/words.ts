// Every sentence "Recompute it yourself" draws, in one place, so each has its row in docs/claims.md (the fp- rows) and a
// reword here fails the claims check until the row is reworded with it. No imports: the words load with the lazy part.

export const RECOMPUTE_WORKS = "Your browser works this cart's fingerprint out again from the fields below, with its own SHA-256.";
export const RECOMPUTE_LOCAL = "Nothing is sent anywhere, and nothing is kept.";
export const RECOMPUTE_TRY = "Change the total by one cent and the match breaks.";
export const RECOMPUTE_RECORDED = "Recorded week 1, a practice run with fictional sellers. No PayPal order was made for this cart, so it is compared with the fingerprint in the recorded week's file: the value Goose would have written to the order's custom_id.";
export const RECOMPUTE_HOW = "The fingerprint is the SHA-256 of that text's UTF-8 bytes, cut to its first 32 characters.";
export const RECOMPUTE_NO_KEY = "The hash has no key: anyone with these fields can work out this fingerprint, so a match by itself says nothing about who made it. What binds the cart is that PayPal's order holds the fingerprint in custom_id from the moment the order is created, and the server refuses to capture when the cart it holds no longer works out to it.";
/** The line under the part: two links to copies this site serves itself (web/fingerprint-recipe.ts writes them at build). */
export const RECIPE_LINK = "The recipe, step by step";
export const VECTORS_LINK = "16 test vectors";
export const RECIPE_SERVED = "Both are served from this site, as the build copied them from the code's own files.";
/** The served copies' file names, at the site's root. */
export const RECIPE_FILE = "fingerprint-v0.txt";
export const VECTORS_FILE = "fingerprint-vectors.json";

/** Where the value the browser's answer is compared with came from. Only "recorded" is mounted on the site today (Under the
 *  hood). "paypal" and "stored" are for the Verify page, which passes a real order's fields and the order's own custom_id:
 *  their words must never be drawn for a cart that was not a PayPal order (core/test/fingerprint-recompute.test.ts holds
 *  the list of files that may mount the part with them). */
export type Witness = "paypal" | "stored" | "recorded";

export const WITNESS_LABEL: Readonly<Record<Witness, string>> = {
  paypal: "PayPal's custom_id",
  stored: "The custom_id this server sent",
  recorded: "The recorded fingerprint",
};

export const MATCH_WORDS: Readonly<Record<Witness, { match: string; differ: string }>> = {
  paypal: { match: "Matches PayPal's custom_id", differ: "Does not match PayPal's custom_id" },
  stored: { match: "Matches the custom_id this server sent", differ: "Does not match the custom_id this server sent" },
  recorded: { match: "Matches the recorded fingerprint", differ: "Does not match the recorded fingerprint" },
};

export const RECOMPUTE_LABELS = {
  fields: "What goes in, in this order",
  text: "The exact text that is hashed",
  mine: "Worked out in your browser",
  addCent: "Add one cent",
  reset: "Reset",
  none: "none (written as null)",
  noCustomId: "none",
  working: "Working it out…",
  cantHash: "This browser can't hash here: Web Crypto needs a secure (https) page.",
  badQty: "No fingerprint: the quantity must be a whole number.",
  badTotal: "No fingerprint: the total must be dollars and cents, like 47.73.",
} as const;

/** The fields in the recipe's order: the name the recipe gives each, and the words beside it. */
export const FIELD_WORDS = {
  item: "Item",
  merchant: "Seller",
  sellerId: "Seller's id",
  qty: "Quantity",
  price: "Total",
  currency: "Currency",
  shape: "Kind of payment",
  catalogId: "Catalog entry",
  payee: "Payee (PayPal merchant id)",
  attributes: "Attributes",
  nonce: "Nonce, new for every approval",
  expiresAt: "Approval runs out (ms since 1970, UTC)",
} as const;
