// Your price on a real product (Joshua, Nov 5, 3b and 4a). A watch is Channel3's product id plus one store's domain: one
// id can hold very different listings across stores (one "Millennium Falcon" id held $84.99 at one store and $1,118.79 at
// another), so a price is only ever read at the store she watched, and no word here calls it "this exact item". Pure: the
// server reads prices (server/src/adapters/channel3-product.ts) and this only checks a watch and says its row. A real price
// never feeds a cart, the guard or a verdict; its row has no deal button, because she buys at the store herself.

import { usd, type Cents } from "../money.ts";

export const DAY_MS = 86_400_000;
/** Decided by default: five real watches per browser, so one browser can't use the site's daily reads alone. */
export const REAL_WATCHES_MAX = 5;
const PRODUCT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DOMAIN = /^(?=.{3,100}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const NAME_MAX = 80;
const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

export interface RealWatch {
  productId: string;
  domain: string;
  name: string;
  target: Cents;
  at: number;
  /** The last read: `price` null when her store had no new, in-stock price that day. */
  last?: { price: Cents | null; checkedAt: number };
}


export type RealCheck = { ok: true; watch: RealWatch } | { ok: false; error: string };

/** A watch from the page, checked field by field; the page's name is cleaned and cut, and only she ever sees it. */
export function checkRealWatch(raw: unknown, now: number): RealCheck {
  const r = (raw ?? {}) as Partial<Record<keyof RealWatch, unknown>>;
  if (typeof r.productId !== "string" || !PRODUCT_ID.test(r.productId)) return { ok: false, error: "That product can't be watched." };
  const domain = typeof r.domain === "string" ? r.domain.trim().toLowerCase().replace(/^www\./, "") : "";
  if (!DOMAIN.test(domain)) return { ok: false, error: "That store can't be watched." };
  const name = typeof r.name === "string" ? r.name.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "";
  if (!name) return { ok: false, error: "That product can't be watched." };
  if (typeof r.target !== "number" || !Number.isSafeInteger(r.target) || r.target <= 0 || r.target > 10_000_000) return { ok: false, error: "Type a price in dollars, like 90." };
  const at = typeof r.at === "number" && Number.isFinite(r.at) ? r.at : now;
  const last = r.last as RealWatch["last"] | undefined;
  const kept = last && Number.isFinite(last.checkedAt) && (last.price === null || (Number.isSafeInteger(last.price) && last.price > 0)) ? { price: last.price, checkedAt: last.checkedAt } : undefined;
  return { ok: true, watch: kept ? { productId: r.productId, domain, name, target: r.target, at, last: kept } : { productId: r.productId, domain, name, target: r.target, at } };
}

export const sameWatch = (a: Pick<RealWatch, "productId" | "domain">, b: Pick<RealWatch, "productId" | "domain">) => a.productId === b.productId && a.domain === b.domain;

/** With thousands commas, like every shown price (the one formatter, core/src/money.ts): a real product can cost $1,118.79. */
export const usdWide = usd;
const day = (t: number) => Math.floor(t / DAY_MS);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "checked today", "checked yesterday" or "checked Nov 3" (UTC days, the same days the cap counts). */
export function checkedWords(checkedAt: number, now: number): string {
  const d = day(now) - day(checkedAt);
  if (d <= 0) return "checked today";
  if (d === 1) return "checked yesterday";
  const t = new Date(checkedAt);
  return `checked ${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}`;
}

export interface RealRow {
  productId: string;
  domain: string;
  item: string;
  target: Cents;
  /** Her store's price at the last read, or null. Never a price from another store. */
  best: { total: Cents; at: string } | null;
  pinged: boolean;
  /** When her store's price was last read, or null before the first read: the ping's trigger pings only a read made
   *  during the visit (core/src/ask/real-ping.ts), so an old read is never news. */
  checkedAt: number | null;
  status: string;
  /** Where the price came from and when: a real price is never shown without its store and its day. */
  when: string;
}

export function realRow(w: RealWatch, now: number): RealRow {
  const base = { productId: w.productId, domain: w.domain, item: w.name, target: w.target, checkedAt: w.last?.checkedAt ?? null };
  if (!w.last) return { ...base, best: null, pinged: false, status: `Watching for ${usd(w.target)} or less at ${w.domain}. Not checked yet.`, when: `Real price at ${w.domain}, not checked yet` };
  const when = `Real price at ${w.domain}, ${checkedWords(w.last.checkedAt, now)}`;
  const p = w.last.price;
  if (p === null) return { ...base, best: null, pinged: false, status: `No new, in-stock price at ${w.domain}. Still watching for ${usd(w.target)} or less.`, when };
  if (p <= w.target) return { ...base, best: { total: p, at: w.domain }, pinged: true, status: `Pinged: ${usd(p)} at ${w.domain} is ${p === w.target ? "right at" : `${usd(w.target - p)} under`} your ${usd(w.target)}.`, when };
  return { ...base, best: { total: p, at: w.domain }, pinged: false, status: `${usd(p - w.target)} over your ${usd(w.target)}. Still watching.`, when };
}
