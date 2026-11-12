// Moved to the trust library (007 #1, ADR 0006): Gilded Goose is its first user, and this path stays for its imports.
export * from "@gilded-goose/trust/money";
import { fromCents, type Cents } from "@gilded-goose/trust/money";
import { usdOf } from "./usd-of.ts";
export { usdOf };

// The one price a person reads (C's panel, Nov 6: Channel3's backpack read "$1218.00"). fromCents stays PayPal's wire
// format ("1218.00", no comma: the cart's hash and the order's amount ride on it); every price on a screen, in a
// sentence or said aloud goes through usd or usdOf (usd-of.ts; a range: usdSpan, money-span.ts), so it reads
// "$1,218.00". core/test/money-shown.test.ts finds every "$" glued to a value by hand in core, server and web
// (core/test/money-sites.ts) and fails on any it doesn't know.

/** Whole cents as a person reads them: "$84.00", "$1,218.00". A negative amount reads "-$5.00"; cents are rounded. */
export const usd = (c: Cents): string => (Math.round(c) < 0 ? "-" : "") + usdOf(fromCents(Math.abs(Math.round(c))));

/** Without the cents when there are none: "$84", "$1,218", "$84.50" (the landing's and the ping's whole prices). */
export const usdWhole = (c: Cents): string => usd(c).replace(/\.00$/, "");
