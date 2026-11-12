// PayPal additions 4 (Joshua, Oct 29; ADR 0013): PayPal's own Pay Later message beside Approve. The page gets only the
// public client id, at runtime from GET /api/config, and loads PayPal's v6 SDK after first paint. The message is
// PayPal's: when the config, the script or PayPal's eligibility doesn't answer, there is no message, never a made-up one.

/** PayPal's v6 core script, sandbox only (the hard rule: this build never touches live PayPal). */
export const PAY_LATER_SDK = "https://www.sandbox.paypal.com/web-sdk/v6/core";

/** Said under PayPal's message: whether it's offered is PayPal's call, and the choice is the shopper's, in PayPal. Goose
 *  never picks a way to pay (the order sets no funding source). */
export const PAY_LATER_YOURS = "PayPal's offer, not Goose's. If PayPal offers it at checkout, you choose it there. Goose never picks how you pay.";

/** A PayPal client id as the dashboard issues it: letters, digits, `-` and `_`. Anything else is never served. */
const CLIENT_ID = /^[A-Za-z0-9_-]{20,128}$/;

/**
 * What GET /api/config serves for the message: the public client id, only on real sandbox PayPal (never on the fake or
 * with PayPal off), and only when it looks like one. Never the secret, never any other env value.
 */
export function payLaterConfig(clientId: string | undefined, sandbox: boolean): { clientId: string } | null {
  return sandbox && clientId && CLIENT_ID.test(clientId) ? { clientId } : null;
}

/** The amount PayPal's message is asked about: a plain dollars-and-cents total, or nothing. */
export const payLaterAmount = (total: string): string | null => (/^\d{1,7}\.\d{2}$/.test(total) && Number(total) > 0 ? total : null);
