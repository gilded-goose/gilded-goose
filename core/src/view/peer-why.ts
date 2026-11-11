// Why a peer scam was set aside, on the Desk's Why sheet (Joshua's Tier 2c, Nov 3). No file here may say what PayPal does
// or doesn't protect in its own words: the quote is PayPal's sentence, copied whole, with its page and read date in
// docs/claims.md. Keyed on the Watcher's fixed `said`, which never holds a seller's words. Its own file with no imports,
// so the Desk's bundle pays for one sentence and not for the Watcher's patterns.

/** Goose's half: what the code does. Probed by the claims row `peer-ff-checkout`. */
export const FF_CHECKOUT = "Payment only goes through PayPal checkout, never Friends & Family.";
/** PayPal's half, copied whole. Probed by the claims row `peer-ff-paypal`; never reworded here. */
export const FF_QUOTE = "Personal payments aren't covered by PayPal Purchase Protection.";
export const FF_SOURCE = "https://www.paypal.com/us/cshelp/article/whats-the-difference-between-friends-and-family-or-goods-and-services-payments-help277";

/** Goose's half for a seller's own page, and PayPal's item from its list of what isn't eligible, copied whole. Rows `peer-offsite-checkout`, `peer-offsite-paypal`. */
export const OFF_SITE_CHECKOUT = "Payment only goes through PayPal checkout.";
export const OFF_SITE_QUOTE = "Payments that you have not sent using your PayPal account.";
export const OFF_SITE_SOURCE = "https://www.paypal.com/us/legalhub/paypal/buyer-protection";
/** Code's words only: PayPal's page says nothing we can quote about these two from the buyer's side. Rows `peer-shipped-why`, `peer-overpay-why`. */
export const SHIPPED_WHY = "A seller's word that it shipped proves nothing. Payment only goes through PayPal checkout, after your tap.";
export const OVERPAY_WHY = "You pay exactly the cart's total, after your tap. Never extra on a promise to send money back.";

export interface PeerWhy { line: string; lead?: string; quote?: string; source?: string }

const FF_LEAD = "PayPal's own words:";
const OFF_SITE_LEAD = "Not eligible for PayPal's Purchase Protection:";

/** The Why sheet's line for these reasons, or null for every other seller. */
export const peerWhy = (said: readonly string[]): PeerWhy | null => {
  const has = (re: RegExp) => said.some((s) => re.test(s));
  if (has(/\bFriends & Family\b/)) return { line: FF_CHECKOUT, lead: FF_LEAD, quote: FF_QUOTE, source: FF_SOURCE };
  if (has(/\bpage outside checkout\b/)) return { line: OFF_SITE_CHECKOUT, lead: OFF_SITE_LEAD, quote: OFF_SITE_QUOTE, source: OFF_SITE_SOURCE };
  if (has(/\balready shipped, so\b/)) return { line: SHIPPED_WHY };
  if (has(/\bmore than the price\b/)) return { line: OVERPAY_WHY };
  return null;
};
