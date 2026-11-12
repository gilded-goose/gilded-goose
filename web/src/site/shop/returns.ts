// PayPal's way back (spec §6.7). The server stays as it is, so the site reads every return it sends. back() in
// server/src/main.ts:2149-2160 redirects to one of five shapes, each carrying the run:
//   /goose.html?run=      a run started here (run.line)
//   /?desk=1&run=         the old desk
//   /?market=1&run=       the Store Sync-shaped market
//   /?wallet=0&run=       the classic page
//   /?wallet=1&run=       the wallet
// The id comes back as it came: an unknown or expired one still opens the receipt, which then says it can't find it.

type Loc = { pathname: string; search: string };

const KINDS: readonly (readonly [string, string])[] = [["desk", "1"], ["market", "1"], ["wallet", "0"], ["wallet", "1"]];

export function returnOf(loc: Loc): string | null {
  const q = new URLSearchParams(loc.search);
  const run = q.get("run");
  if (!run) return null;
  if (/\/goose\.html$/.test(loc.pathname)) return run;
  if (!/\/(?:index\.html)?$/.test(loc.pathname)) return null;
  return KINDS.some(([k, v]) => q.get(k) === v) ? run : null;
}

/** The same return, opened on the Shop route (its receipt), or null when the page is not a return. */
export function receiptHref(loc: Loc): string | null {
  return returnOf(loc) === null ? null : `${loc.pathname}${loc.search}#/shop`;
}
