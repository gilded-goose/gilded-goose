// Your price on a real product (Joshua, Nov 5, 3b): one read of Channel3's product, GET /v1/products/{id}, for a watch
// the shopper set from Find. Never a search (a search costs a credit; a product read is free by Channel3's docs, which we
// can't prove, so the reads are capped anyway). The cap is taken here, on the server, so no page can lift it: at most
// PRODUCT_READS_PER_DAY reads a day across the whole site (Lead-12, Nov 5), and a watch is read at most once a day. Over
// the cap, the watch keeps its last read and its row says when that was. Like channel3.ts this file imports nothing: the
// price it reads only fills the Watching list, and can't reach a market, the Watcher, the guard, a cart or a verdict
// (core/test/channel3-product.test.ts). The key comes from main.ts only when CHANNEL3_WATCH=on, which the site doesn't set.

export const CHANNEL3_PRODUCT_URL = "https://api.trychannel3.com/v1/products/";
export const PRODUCT_READS_PER_DAY = 20;
/** One browser's share of the site's reads (Lead-12, Nov 5: "5 a day per browser, inside the site-wide 20"). */
export const BROWSER_READS_PER_DAY = 5;
/** One address's share: a cookie is the page's to mint, an address isn't. Two browsers' worth, so a home or a school behind
 *  one address still reads, and one address takes at most half the site's day. Decided by default (Nov 5, the security
 *  review); flip if Joshua says another number. */
export const IP_READS_PER_DAY = 10;
export const PRODUCT_TIMEOUT_MS = 4000;
const DAY_MS = 86_400_000;

/** Real-price watching is on: Joshua sets CHANNEL3_WATCH=on in Render (Lead-12: off until his dashboard proof). Off, no
 *  watch is saved and Find shows no watch button (Track C reads this in its find route), so no row waits on a read that
 *  never comes. Reads also need the key. */
export const watchOn = (env: Record<string, string | undefined>): boolean => env.CHANNEL3_WATCH === "on";

export type GetFetch = (url: string, init: { method: "GET"; headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** What a read needs of a watch: Channel3's id, her store, and the last read. */
export interface Watched { productId: string; domain: string; last?: { price: number | null; checkedAt: number } }

/** The lowest new, in-stock, US-dollar price at `domain` in a product answer, in cents. Null: none there, or a shape we can't read. */
export function priceAt(body: unknown, domain: string): number | null {
  const offers = (body as { offers?: unknown } | null)?.offers;
  if (!Array.isArray(offers)) return null;
  let low: number | null = null;
  for (const o of offers) {
    const y = o as { availability?: unknown; condition?: unknown; domain?: unknown; price?: unknown } | null;
    if (typeof y?.domain !== "string" || y.domain.trim().toLowerCase().replace(/^www\./, "") !== domain) continue;
    if (y.availability !== "InStock" || y.condition !== "new") continue;
    const p = y.price as { price?: unknown; amount?: unknown; currency?: unknown } | null;
    if (!p || p.currency !== "USD") continue;
    const n = typeof p.price === "number" ? p.price : p.amount;
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > 100_000) continue;
    const c = Math.round(n * 100);
    if (low === null || c < low) low = c;
  }
  return low;
}

export interface ProductReadDeps {
  /** `CHANNEL3_API_KEY` when CHANNEL3_WATCH=on, else undefined: then no read is ever made. */
  key: string | undefined;
  fetch: GetFetch;
  now: () => number;
  /** Trust's `LiveCaps`: BROWSER_READS_PER_DAY per browser, IP_READS_PER_DAY per address and PRODUCT_READS_PER_DAY for the
   *  whole site. It counts a read only when all three have room, so a full browser or address never spends the site's. */
  caps: { take(token: string, ip: string): boolean };
  /** Fixed words only: a status code or "no answer", never the key or Channel3's text. */
  warn: (line: string) => void;
}

type Read = { price: number | null; checkedAt: number };

export class ProductReads {
  // Plain fields, not parameter properties: the server runs under Node's type stripping, which has none.
  private readonly deps: ProductReadDeps;
  /** Today's read of each product at each store, so a page holding an older copy of a watch never reads it again. */
  private readonly recent = new Map<string, Read>();
  /** A read on its way: a second caller waits for it instead of spending another (the security review's race, Nov 5). */
  private readonly flying = new Map<string, Promise<Read | null>>();
  constructor(deps: ProductReadDeps) { this.deps = deps; }

  /**
   * The watch, read again when neither it nor the site has read its product at its store in the last day, and this
   * browser, its address (`who`) and the site all have reads left; else the newest read known, or the same object. The
   * caps are taken before the call, so a failing answer spends its slots and can't loop past them. A read that finds no price at her
   * store is still a read: it isn't tried again until tomorrow.
   */
  async refresh<W extends Watched>(w: W, who: { token: string; ip: string }): Promise<W> {
    const at = this.deps.now();
    if (!this.deps.key) return w;
    const k = `${w.productId} ${w.domain}`;
    const known = this.recent.get(k);
    const last = known && (!w.last || known.checkedAt > w.last.checkedAt) ? known : w.last;
    if (last && at - last.checkedAt < DAY_MS) return last === w.last ? w : { ...w, last };
    const going = this.flying.get(k);
    if (going) { const got = await going; return got ? { ...w, last: got } : w; }
    if (!this.deps.caps.take(who.token, who.ip)) return w;
    const p = this.read(w, k, at);
    this.flying.set(k, p);
    try {
      const got = await p;
      return got ? { ...w, last: got } : w;
    } finally {
      this.flying.delete(k);
    }
  }

  /** One GET; a good answer goes into `recent` before the read stops flying, so no caller falls between the two. */
  private async read(w: Watched, k: string, at: number): Promise<Read | null> {
    try {
      const r = await this.deps.fetch(CHANNEL3_PRODUCT_URL + encodeURIComponent(w.productId), {
        method: "GET",
        headers: { "x-api-key": this.deps.key!, Accept: "application/json" },
        signal: AbortSignal.timeout(PRODUCT_TIMEOUT_MS),
      });
      if (!r.ok) { this.deps.warn(`channel3 product read: status ${r.status}`); return null; }
      const got: Read = { price: priceAt(await r.json(), w.domain), checkedAt: at };
      for (const [key, v] of this.recent) if (at - v.checkedAt >= DAY_MS) this.recent.delete(key);
      this.recent.set(k, got);
      return got;
    } catch {
      this.deps.warn("channel3 product read: no answer");
      return null;
    }
  }
}
