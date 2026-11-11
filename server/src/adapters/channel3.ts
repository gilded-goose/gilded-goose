// Track C3 (Joshua, Fri Oct 30 3:25 PM): "Real prices right now" from Channel3's product search, beside the simulated
// sellers. Read-only and labeled. Real stores appear here ONLY as price references (a plain-text product name, the store's
// domain, a price and a link), never as sellers: nothing in this file touches the market, the Watcher, the guard, the
// haggle or a cart, and none of them import it (core/test/channel3.test.ts pins both directions). Checkout stays the
// PayPal sandbox with fictional sellers.
//
// The one outside call: POST https://api.trychannel3.com/v1/search with the `x-api-key` header (Channel3's API
// reference, read Fri Oct 30 2026). The key comes from the environment only (`CHANNEL3_API_KEY`, set in .env and in
// Render): it is sent to Channel3 and nowhere else, never logged and never in a response.
//
// What leaves our server is never the shopper's words: `queryFor` maps them to one fixed, generic product query from a
// short table (or to nothing), so a private ask can't reach a third party, the cache key space is small, and the spend is
// bounded (one live call per query an hour while calls succeed, a failed one tries again after RETRY_MS, all under the
// caps below).
//
// Sources, in order: the cache (a live answer under an hour old) → a live call (with the key, inside the caps) → the
// recorded answer (docs/fixtures/channel3-recorded.json, written by scripts/record-channel3.ts from a real call) → nothing.
// A recording older than RECORDED_MAX_DAYS is not shown. server/src/main.ts hands this class the key only when
// CHANNEL3_LIVE=on, which Joshua sets in Render (J3, Joshua, Thu Nov 5 5:20 PM: "call the API live with caps; without it we
// don't qualify": Channel3's prize page says a project that "only reference[s] Channel3 without calling it" doesn't).
//
// The caps (J3), sized from the credits: the hackathon key's 20,000 (Channel3's prize page: "good for 20,000 product
// searches", one credit a search) plus 1,000 free a month (its pricing page), for Thu Nov 5 to the winners on Mon Dec 21,
// 47 days. A live call is spent only when all three have room; otherwise the recording answers, labeled "not live":
// - LIVE_CALLS_PER_DAY, 200 a UTC day across everyone: 47 days of it is 9,400.
// - LIVE_CALLS_IN_ALL, 10,000 for the whole run, half the hackathon credits: a bound that holds even if a day's count were
//   lost (a deploy's overlap), and leaves the other half for re-recordings and anything unforeseen. Past it, never again.
// - LIVE_PER_VISITOR, 24 a day per network address (in memory, never written down): one visitor sweeping every query
//   twice in a day, so it takes at least nine networks to use up a day.
// The day's and the run's counts are saved (`counts`, the store main.ts gives: Turso on the site), so a restart resets
// neither. Nothing is spent while the store can't save them (`paused`, store.ts livePaused). An unreadable count is
// "full": the recording answers, and the rest of the site never notices.
//
// Two things the real answer showed on Nov 5 that the reference had not: every offer's `url` is a Channel3 redirect
// (buy.trychannel3.com, with an account id and commission tracking), and one product can carry several stores' offers.
// We never publish the redirect: the link is the store's own site, named by the offer's `domain`.

/** Channel3's search endpoint (API reference, `POST /v1/search`). */
export const CHANNEL3_SEARCH_URL = "https://api.trychannel3.com/v1/search";
/** How many reference items the panel shows. */
export const PRICE_ITEMS = 3;
/** How many flagged listings the panel shows under the references. */
export const FLAG_ITEMS = 2;
/** How many other stores one reference names for the same product. */
export const ALSO_STORES = 2;
/** How many products one search asks for: Channel3 answered 30 when asked for 50 (Nov 5), and flags need a wide read. */
const SEARCH_LIMIT = 30;
/** A listing marked at least this far under its own list price is flagged. */
export const HUGE_OFF_PERCENT = 70;
/** Where Channel3's offer links point. We read its `domain` instead and never publish this link (see above). */
const CHANNEL3_LINK_HOST = "buy.trychannel3.com";
/** A live answer is reused for an hour: "right now" means checked within the last hour, and the screen says when. */
export const CACHE_MS = 60 * 60 * 1000;
/** After a failed live call, the recorded answer is used for this long before trying again (no hammering a 401/402). */
export const RETRY_MS = 5 * 60 * 1000;
/** The most live calls a UTC day across everyone, whatever the traffic; past it the recorded answer stands in (J3). */
export const LIVE_CALLS_PER_DAY = 200;
/** The most live calls this server ever makes, saved across restarts (J3): half the hackathon key's 20,000 credits. */
export const LIVE_CALLS_IN_ALL = 10_000;
/** The most live calls one network address starts a UTC day (J3). A cached answer is free and doesn't count. */
export const LIVE_PER_VISITOR = 24;
/** A live call slower than this counts as failed. */
export const LIVE_TIMEOUT_MS = 4000;
/** A recording older than this is too stale to show as a price reference. 50, so the Nov 5 recording still shows when the
 * winners are named (Dec 21, 2 PM PT) and the site doesn't change mid-judging; the panel says "Recorded <date> · not live". */
export const RECORDED_MAX_DAYS = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
const NAME_MAX = 90;

/**
 * The shopper's words → the one generic query sent to Channel3. First match wins; anything else (a fictional concert, a
 * hotel night, a flight seat, a gift card) sends nothing: Channel3 lists products, and Goose's events and travel sellers
 * are fictional.
 */
export const QUERIES: readonly (readonly [RegExp, string])[] = [
  [/\bkettles?\b/, "electric kettle"],
  [/\bnoise[ -]?cancel(l?ing|l?ed)?\b.*\b(head ?phones?|earbuds?)\b/, "noise cancelling headphones"],
  [/\b(head ?phones?|earbuds?)\b/, "headphones"],
  [/\b(running|trail) shoes?\b|\bsneakers?\b|\btrainers?\b/, "running shoes"],
  [/\brain ?jackets?\b|\braincoats?\b/, "rain jacket"],
  [/\bjackets?\b/, "jacket"],
  [/\bbackpacks?\b/, "backpack"],
  [/\bcoffee (makers?|machines?)\b/, "coffee maker"],
  [/\btoasters?\b/, "toaster"],
  [/\bblenders?\b/, "blender"],
  [/\bumbrellas?\b/, "umbrella"],
  [/\bwater bottles?\b/, "water bottle"],
];

export function queryFor(words: unknown): string | null {
  if (typeof words !== "string") return null;
  const w = words.slice(0, 80).toLowerCase();
  for (const [re, q] of QUERIES) if (re.test(w)) return q;
  return null;
}

/** One reference price: plain text and the store's own site, nothing else (no image, no logo, no seller id). The panel shows no link at all. */
export interface PriceItem {
  /** The product's title as Channel3 lists it, plain text. */
  name: string;
  /** The store's domain ("example.com"), as the link's own host. */
  store: string;
  /** Dollars and cents, "34.99". */
  price: string;
  /** The store's own https page for the product, or its site when Channel3 only gave a redirect. */
  url: string;
  /** Other stores in the same Channel3 product entry, cheapest first. */
  also?: { store: string; price: string; url: string }[];
}

/** A listing plain code flagged, and what it read: the listing's own words or its own list price. */
export interface FlaggedItem { name: string; store: string; price: string; url: string; reason: string }

export type PricesSource = "channel3" | "recorded" | "none";

/** Why a matched query has no live answer: the switch is off, a cap is full, the store can't save the counts, or the call
 * failed (or failed within RETRY_MS). For the Lead's check and the logs; the panel says "not live" for all of them. */
export type NotLive = "off" | "capped" | "paused" | "failed";

export interface Prices {
  source: PricesSource;
  /** When Channel3 answered (ISO), or null when there is no answer. */
  fetchedAt: string | null;
  /** The generic query Goose sent, or null when the words map to none. */
  query: string | null;
  items: PriceItem[];
  flagged: FlaggedItem[];
  /** Set when a query matched and the answer isn't live (J3). */
  notLive?: NotLive;
}

/** What scripts/record-channel3.ts writes: each query's items as a real call returned them, with its time. */
export interface Recorded { queries: Record<string, { fetchedAt: string; items: PriceItem[]; flagged?: FlaggedItem[] }> }

const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

function plainName(t: unknown): string | null {
  if (typeof t !== "string") return null;
  const s = t.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  if (s.length === 0) return null;
  return s.length > NAME_MAX ? `${s.slice(0, NAME_MAX - 1).trimEnd()}…` : s;
}

/** The store's domain, lowercase, without "www.", or null if it isn't a plain hostname. */
function plainDomain(d: unknown): string | null {
  if (typeof d !== "string") return null;
  const s = d.trim().toLowerCase().replace(/^www\./, "");
  return /^(?=.{3,100}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : null;
}

/** An https link whose host is the store's domain (or under it): a label that says one store never links to another. */
function storeLink(u: unknown, domain: string): string | null {
  if (typeof u !== "string" || u.length > 2000) return null;
  let url: URL;
  try { url = new URL(u); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === CHANNEL3_LINK_HOST) return `https://${domain}/`;
  return host === domain || host.endsWith(`.${domain}`) ? url.href : null;
}

/**
 * Names the project's public no-competitor rule bars (NEVER_NAMED, scripts/claims-placeholders.ts; a test keeps the two the
 * same, as this file imports nothing). Decided by default, Nov 5: a listing or store that names one is left out. Flip if
 * Joshua says: the price-reference exception covers them too.
 */
export const HELD_NAMES = /\b(AP2|Google|Stripe|Amazon|Visa|Mastercard|OpenAI|ChatGPT|Gemini|Shopify|Klarna|Affirm|Apple Pay)\b/i;
/** Stores' prices further apart than this aren't believed to be one item: Channel3 once grouped $9.99 with $149.99. */
const SAME_ITEM_SPREAD = 2;

/**
 * Stores that sell used or resale goods, whatever one offer's label says: under default filters Channel3 put Vinted at $11
 * beside $115, and labeled a Depop listing "new" (read Nov 5, docs/guild/045-channel3.md). None of them counts as a
 * reference, a comparison or a flag, so a used listing is never compared as the same item, and never flagged as too cheap.
 */
export const RESALE_STORE = /(^|\.)(vinted|depop|poshmark|grailed|vestiaire|vestiairecollective|stockx|kickscrew|stadiumgoods|backmarket|goat|ebay|geartrade|therealreal|thredup|mercari|swappa)\.[a-z.]+$/;

/** Words a listing says about itself that get it flagged. Narrow on purpose: "inspired by" is ordinary copy (Nov 5). */
const LISTING_SAYS: readonly (readonly [RegExp, string])[] = [
  [/\bfactory[ -]direct\b|\bdirect from (?:the )?factory\b/i, "factory direct"],
  [/\bsame as (?:the )?designer\b/i, "same as designer"],
];
const saysReason = (words: string) => `Its listing says “${words}”.`;
// Its own thousands comma, like the one formatter (core/src/money.ts usdOf): this file imports nothing, so its plain code
// is proved by reading it (claims row c3-flag-note), and core/test/money-shown.test.ts allows this one "$" by name.
const commas = (wire: string) => wire.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const offReason = (percent: number, was: string) => `Marked ${percent}% off its own list price of $${commas(was)}.`;
/** The only two sentences a flag can say; a recording is read back against them. */
const FLAG_REASON = /^(Its listing says “[^”]{1,30}”\.|Marked \d{2}% off its own list price of \$\d{1,6}\.\d\d\.)$/;

/** What a listing's own words say, or null. "80% off" counts from HUGE_OFF_PERCENT, as the marked price does. */
function listingSays(text: string): string | null {
  for (const [re, words] of LISTING_SAYS) if (re.test(text)) return saysReason(words);
  for (const m of text.matchAll(/\b(\d{2})\s?% off\b/gi)) if (Number(m[1]) >= HUGE_OFF_PERCENT) return saysReason(`${m[1]}% off`);
  return null;
}

/** Cents from Channel3's price (`price.price`, or `price.amount` as the guide writes it), USD only. */
function usdCents(p: unknown): number | null {
  if (!p || typeof p !== "object") return null;
  const o = p as { price?: unknown; amount?: unknown; currency?: unknown };
  if (o.currency !== "USD") return null;
  const n = typeof o.price === "number" ? o.price : o.amount;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > 100_000) return null;
  return Math.round(n * 100);
}

/** The offer's own list price in cents, when it states one above the price. */
function listCents(p: unknown, cents: number): number | null {
  const c = (p as { compare_at_price?: unknown } | null)?.compare_at_price;
  if (typeof c !== "number" || !Number.isFinite(c) || c > 100_000) return null;
  const was = Math.round(c * 100);
  return was > cents ? was : null;
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

/**
 * A search answer → at most PRICE_ITEMS reference prices and FLAG_ITEMS flagged listings. Only new, in-stock, US-dollar
 * offers with a link we can publish count. A reference is a product's cheapest such offer, naming up to ALSO_STORES other
 * stores in the same product entry; products several stores sell come first, each group in Channel3's order. A flagged
 * product never stands as a reference. Everything else in the answer (images, brands, ratings, commission rates) is
 * dropped here. A bad shape gives null.
 */
export function parseSearch(body: unknown): { items: PriceItem[]; flagged: FlaggedItem[] } | null {
  const products = (body as { products?: unknown } | null)?.products;
  if (!Array.isArray(products)) return null;
  const several: PriceItem[] = [], single: PriceItem[] = [], flagged: FlaggedItem[] = [];
  for (const p of products) {
    const x = p as { title?: unknown; description?: unknown; offers?: unknown };
    const name = plainName(x?.title);
    if (!name || !Array.isArray(x?.offers) || HELD_NAMES.test(String(x.title))) continue;
    // Each store once, at its cheapest.
    const stores = new Map<string, { cents: number; store: string; url: string; was: number | null }>();
    for (const o of x.offers) {
      const y = o as { availability?: unknown; condition?: unknown; domain?: unknown; url?: unknown; price?: unknown };
      // Unstated isn't new: on Nov 5 the only offers with no condition were a refurbished-goods store's.
      if (y?.availability !== "InStock" || y.condition !== "new") continue;
      const store = plainDomain(y.domain);
      const url = store && storeLink(y.url, store);
      const cents = usdCents(y.price);
      if (!store || !url || cents === null || HELD_NAMES.test(store.replaceAll(".", " ")) || RESALE_STORE.test(store)) continue;
      const had = stores.get(store);
      if (!had || cents < had.cents) stores.set(store, { cents, store, url, was: listCents(y.price, cents) });
    }
    const offers = [...stores.values()].sort((a, b) => a.cents - b.cents);
    const best = offers[0];
    if (!best) continue;
    const off = (o: { cents: number; was: number | null }) => (o.was === null ? 0 : Math.floor(((o.was - o.cents) * 100) / o.was));
    // The whole title and description, with hiding characters gone first, so a capped name or a line break can't hide words.
    const says = listingSays(`${x.title} ${typeof x.description === "string" ? x.description : ""}`.replace(CONTROL, " ").replace(/\s+/g, " "));
    const marked = offers.filter((o) => off(o) >= HUGE_OFF_PERCENT).sort((a, b) => off(b) - off(a))[0];
    if (says) flagged.push({ name, store: best.store, price: dollars(best.cents), url: best.url, reason: says });
    else if (marked) flagged.push({ name, store: marked.store, price: dollars(marked.cents), url: marked.url, reason: offReason(off(marked), dollars(marked.was!)) });
    // An entry whose cheapest price is under half the next store's: one of them isn't this item, so it isn't a reference.
    else if (offers[1] && offers[1].cents > best.cents * SAME_ITEM_SPREAD) continue;
    else {
      const item: PriceItem = { name, store: best.store, price: dollars(best.cents), url: best.url };
      const also = offers.slice(1).filter((o) => o.cents <= best.cents * SAME_ITEM_SPREAD).slice(0, ALSO_STORES).map((o) => ({ store: o.store, price: dollars(o.cents), url: o.url }));
      if (also.length) (item.also = also, several.push(item)); else single.push(item);
    }
  }
  const items = [...several, ...single].slice(0, PRICE_ITEMS);
  // Channel3 answered with products but our checks kept none: that is an answer we can't read (a changed shape, links
  // that aren't the stores' own), never "no prices". It counts as a failure, so the screen never says "none" for it.
  if (products.length > 0 && items.length === 0 && flagged.length === 0) return null;
  return { items, flagged: flagged.slice(0, FLAG_ITEMS) };
}

/** The request body for one generic query (fields from the API reference; it rejects unknown ones). */
export function searchBody(query: string) {
  return { query, limit: SEARCH_LIMIT, filters: { availability: ["InStock"], conditions: ["new"] }, config: { country: "US", currency: "USD" } };
}

export type Fetch = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface PricesDeps {
  /** `CHANNEL3_API_KEY`, or undefined/empty when it isn't set (then no call is ever made). */
  key: string | undefined;
  fetch: Fetch;
  now: () => number;
  recorded: Recorded | null;
  /** Fixed words only (a status code, a kind); never the key, the query's answer or Channel3's error text. */
  warn: (line: string) => void;
  /** Where the day's and the run's call counts survive a restart (J3); without it they live in memory (tests). */
  counts?: { day: CountStore; all: CountStore };
  /** True while nothing may spend (store.ts livePaused): no live call then. */
  paused?: () => boolean;
}

/** A saved count, the shape of trust/src/caps.ts `CapStore` (this file imports nothing, so main.ts passes one in). */
export interface CountStore {
  load(): { day: string; counts: Record<string, number> } | null;
  save(day: string, counts: Record<string, number>): void;
}

/** The run's count is one record that never rolls over. */
const ALL_DAY = "all";
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Reference prices for the shopper's words. One instance per server: it holds the cache and the day's call count. */
export class ReferencePrices {
  private readonly cache = new Map<string, { at: number; items: PriceItem[]; flagged: FlaggedItem[] }>();
  private readonly failedAt = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<Prices>>();
  private day = "";
  private calls = 0;
  private all = 0;
  /** Today's live calls per network address, in memory only: no address is ever written down. */
  private readonly visitors = new Map<string, number>();
  private readonly deps: PricesDeps;
  constructor(deps: PricesDeps) {
    this.deps = deps;
    try {
      const day = deps.counts?.day.load();
      if (day) { this.day = day.day; this.calls = count(day.counts.all); }
      const all = deps.counts?.all.load();
      if (all) this.all = all.day === ALL_DAY ? count(all.counts.all) : LIVE_CALLS_IN_ALL;
    } catch {
      // An unreadable count bounds credits, so it is full, never a fresh start: the recording answers until it is fixed.
      this.all = LIVE_CALLS_IN_ALL;
      deps.warn("channel3: the saved call count is unreadable, so no live call is made; showing the recorded prices");
    }
  }

  /** `visitor`: the network address the call would be counted against (main.ts clientIp). */
  async forWords(words: unknown, visitor = ""): Promise<Prices> {
    const query = queryFor(words);
    if (!query) return { source: "none", fetchedAt: null, query: null, items: [], flagged: [] };
    const now = this.deps.now();
    const hit = this.cache.get(query);
    if (hit && now - hit.at < CACHE_MS) return { source: "channel3", fetchedAt: new Date(hit.at).toISOString(), query, items: hit.items, flagged: hit.flagged };
    // A call already going out for this query answers this request too, and spends nothing more.
    const running = this.inFlight.get(query);
    if (running) return running;
    if (!this.deps.key) return this.fallback(query, now, "off");
    if (now - (this.failedAt.get(query) ?? -Infinity) < RETRY_MS) return this.fallback(query, now, "failed");
    if (this.deps.paused?.()) return this.fallback(query, now, "paused");
    if (!this.spend(now, visitor)) return this.fallback(query, now, "capped");
    const p = this.live(query, now).finally(() => this.inFlight.delete(query));
    this.inFlight.set(query, p);
    return p;
  }

  /** One call off the visitor's, the day's and the run's allowance, saved before it goes out; false when any is full. */
  private spend(now: number, visitor: string): boolean {
    const d = utcDay(now);
    if (d !== this.day) { this.day = d; this.calls = 0; this.visitors.clear(); }
    const mine = this.visitors.get(visitor) ?? 0;
    if (this.calls >= LIVE_CALLS_PER_DAY || this.all >= LIVE_CALLS_IN_ALL || mine >= LIVE_PER_VISITOR) return false;
    this.calls++;
    this.all++;
    this.visitors.set(visitor, mine + 1);
    this.deps.counts?.day.save(this.day, { all: this.calls });
    this.deps.counts?.all.save(ALL_DAY, { all: this.all });
    return true;
  }

  private async live(query: string, now: number): Promise<Prices> {
    let why: string;
    try {
      const r = await this.deps.fetch(CHANNEL3_SEARCH_URL, {
        method: "POST",
        headers: { "x-api-key": this.deps.key!, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(searchBody(query)),
        signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
      });
      if (r.ok) {
        const read = parseSearch(await r.json().catch(() => null));
        if (read) {
          this.cache.set(query, { at: now, ...read });
          this.failedAt.delete(query);
          return { source: "channel3", fetchedAt: new Date(now).toISOString(), query, ...read };
        }
        why = "an answer of the wrong shape";
      } else why = `status ${Number(r.status) || 0}`;
    } catch (e) {
      why = (e as Error)?.name === "TimeoutError" ? "a timeout" : "no answer";
    }
    this.failedAt.set(query, now);
    this.deps.warn(`channel3: live search failed (${why}); showing the recorded prices`);
    return this.fallback(query, now, "failed");
  }

  private fallback(query: string, now: number, notLive: NotLive): Prices {
    const r = this.deps.recorded?.queries[query];
    const at = r ? Date.parse(r.fetchedAt) : NaN;
    if (!r || r.items.length === 0 || !Number.isFinite(at) || now - at > RECORDED_MAX_DAYS * DAY_MS || at > now) return { source: "none", fetchedAt: null, query, items: [], flagged: [], notLive };
    return { source: "recorded", fetchedAt: new Date(at).toISOString(), query, items: r.items.slice(0, PRICE_ITEMS), flagged: (r.flagged ?? []).slice(0, FLAG_ITEMS), notLive };
  }
}

/** A saved count: a whole number of at least 0, or full when it isn't one (it bounds credits). */
function count(n: unknown): number {
  return Number.isInteger(n) && (n as number) >= 0 ? (n as number) : LIVE_CALLS_IN_ALL;
}

/**
 * The recorded file, checked item by item with the same rules as a live answer (it is ours, but a check that reads a
 * file back re-checks it). A missing or broken file is "no recording".
 */
export function parseRecorded(raw: unknown): Recorded | null {
  const qs = (raw as { queries?: unknown } | null)?.queries;
  if (!qs || typeof qs !== "object") return null;
  const out: Recorded = { queries: {} };
  for (const [, query] of QUERIES) {
    const e = (qs as Record<string, unknown>)[query] as { fetchedAt?: unknown; items?: unknown; flagged?: unknown } | undefined;
    if (!e || typeof e.fetchedAt !== "string" || !Array.isArray(e.items)) continue;
    const price = (v: unknown): v is string => typeof v === "string" && /^\d{1,6}\.\d\d$/.test(v);
    /** A store, price and link, checked as a live answer's are; null if any fails. */
    const offer = (o: unknown) => {
      const x = o as { store?: unknown; price?: unknown; url?: unknown } | null;
      const store = plainDomain(x?.store), url = store && storeLink(x?.url, store);
      return store && url && price(x?.price) ? { store, price: x!.price as string, url } : null;
    };
    const items: PriceItem[] = [];
    for (const i of e.items) {
      const name = plainName((i as { name?: unknown } | null)?.name), o = offer(i);
      if (!name || !o) continue;
      const also = (Array.isArray((i as { also?: unknown }).also) ? (i as { also: unknown[] }).also : []).map(offer).filter((a) => a !== null).slice(0, ALSO_STORES);
      items.push(also.length ? { name, ...o, also } : { name, ...o });
    }
    const flagged: FlaggedItem[] = [];
    for (const i of Array.isArray(e.flagged) ? e.flagged : []) {
      const name = plainName((i as { name?: unknown } | null)?.name), o = offer(i), reason = (i as { reason?: unknown }).reason;
      if (name && o && typeof reason === "string" && FLAG_REASON.test(reason)) flagged.push({ name, ...o, reason });
    }
    out.queries[query] = { fetchedAt: e.fetchedAt, items: items.slice(0, PRICE_ITEMS), flagged: flagged.slice(0, FLAG_ITEMS) };
  }
  return out;
}
