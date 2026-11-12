// A read with an end (Track P, Fri Nov 6). On live, one load in 13 in WebKit kept the ledger board's counter at "Reading the
// record…" for 30 s and more: the board waited on one /api/challenge answer with no limit, so a request that stalled (no
// error, no status) held the board in "Reading" for good, and it never asked again. Every read the board waits on goes
// through this, so a stall reads as a failure: the counter names it, and the feed asks again. No imports, on purpose.

/** `p`'s value, or null once `ms` have passed or when it fails: a request that never answers can't hold a state for good. */
export function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((done) => {
    const t = setTimeout(() => done(null), ms);
    p.then((v) => { clearTimeout(t); done(v); }, () => { clearTimeout(t); done(null); });
  });
}
