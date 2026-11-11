// The wallet's held and paid cookies, signed (push review MEDIUM, Thu Oct 29): the browser reads them to draw the wallet
// with no request, so they stay readable, but only the server can write one the server believes. Unsigned, anyone could
// name any order in a held cookie and make the server ask PayPal for that order's state.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** What the key is for; a new version here retires every cookie signed under the old one. */
export const WALLET_COOKIE_LABEL = "goose-wallet-cookie-v1";

/**
 * The signing key: derived from PayPal's client secret (so Joshua sets no new key, and a restart with the same secret
 * still reads the cookies it wrote), or random for this process when there is none (the fake port, a server with PayPal
 * off). Never logged.
 */
export function walletCookieKey(clientSecret: string | undefined): Buffer {
  return clientSecret ? createHmac("sha256", clientSecret).update(WALLET_COOKIE_LABEL).digest() : randomBytes(32);
}

const tag = (key: Buffer, name: string, value: string): string => createHmac("sha256", key).update(`${name}=${value}`).digest("base64url");

/** `value.tag`: base64url has no ".", so the last "." always starts the tag. The cookie's name is signed too. */
export const signWalletCookie = (key: Buffer, name: string, value: string): string => `${value}.${tag(key, name, value)}`;

/** The value the server signed under `name`, or null for an unsigned, bent or foreign one. */
export function openWalletCookie(key: Buffer, name: string, raw: string | null | undefined): string | null {
  const i = raw ? raw.lastIndexOf(".") : -1;
  if (!raw || i <= 0) return null;
  const value = raw.slice(0, i);
  const got = Buffer.from(raw.slice(i + 1)), want = Buffer.from(tag(key, name, value));
  return got.length === want.length && timingSafeEqual(got, want) ? value : null;
}
