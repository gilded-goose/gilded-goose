// Track C3 (Joshua, Fri Oct 30 3:25 PM): "Real prices right now", beside the simulated sellers once Goose has read every
// note. Reference prices from Channel3 (real stores): a plain-text product name, the price and the store's name. Never a
// seller, never a link, never a button, never a logo or picture, never in the haggle or the cart: this file reads
// /api/prices and nothing else, and passes nothing back to the Desk (core/test/channel3.test.ts reads it to pin that).
// No link, by Channel3's terms and what its links are (Nov 5): every offer URL is a short-lived, mostly commission-earning
// redirect that must be disclosed, and a store's home page can't confirm a recorded price.
// Its own chunk, loaded only when the run is done or the landing's section is near the window (story/RealMarket.tsx), so the
// first screen pays nothing for it. On the landing every word counts against the page, so it leaves out the other stores.
//
// Sources (server/src/adapters/channel3.ts): "channel3" (a live answer under an hour old, only with CHANNEL3_LIVE=on and
// inside the caps): the only one that says "Live"; "recorded" (a real answer recorded earlier, said plainly with its date
// and "not live": the switch is off, a cap is full, the store can't save the counts, or the call failed); "none" (the words
// name no product Channel3 lists, or there is no answer): then nothing shows, because nothing real is there to show. So
// does a source this file doesn't know (J3: "live" only on a real live answer).

import { useEffect, useId, useState } from "react";
import "./realprices.css";
import { usdOf } from "@goose/core/money";
import { usdSpanEnds } from "@goose/core/money-span";

type Also = { store: string; price: string };
type Item = Also & { name: string; also?: Also[] };
type Flagged = Also & { name: string; reason: string };
type Prices = { source: "channel3" | "recorded" | "none"; fetchedAt: string | null; query: string | null; items: Item[]; flagged?: Flagged[] };

/** The panel's one honesty line, word for word (claims row c3-label). */
export const C3_LABEL = "Reference prices from Channel3 (real stores). Goose shops only the simulated sellers, in the PayPal sandbox.";
/** Goose's pick comes from a simulated seller, so a real store never has "that" listing, and a $42 practice backpack set
 *  beside $75 to $1,218 real ones says nothing about either (Round 6b sponsors seat, nit 6). So the line says the pick
 *  isn't one of these and the prices don't compare, recorded or live, and the Desk never says "for comparison" (claims
 *  row c3-kind; core/test/channel3.test.ts). */
export const C3_KIND = "Goose's pick is from our practice market, not one of these, so the prices don't compare. You can't buy these through Goose.";
/** The same line on the landing, where no pick is on screen yet (claims row c3-landing). */
export const C3_LANDING = "You can't buy these through Goose.";
/** Beside a reference: other stores in the same Channel3 product entry, whose grouping we don't check (claims row c3-also). */
export const C3_ALSO = "Channel3 also lists it at";
/** Offers carry neither, so two stores' prices may not be for one size or color (claims row c3-variant). */
export const C3_VARIANT = "Channel3 gives no size or color, so these may differ.";
/** The heading over the flagged listings (claims row c3-flag-head). */
export const C3_FLAG_HEAD = "Flagged, with the reason";
/** What a flag is and isn't (claims row c3-flag-note). */
export const C3_FLAG_NOTE = "Plain code read this from the listing. A flag is not a finding about the store.";
/** The landing's headline, at the demo moment's size (a fresh DD, Nov 6: "Channel3" was once, in 15 px body text). It names
 *  the source and never says live: the line under it does, only for a live answer (claims row c3-head). */
export const C3_HEAD = "Real prices, from Channel3";
/** The landing's bridge from the demo's ticket, the section right above, to what real stores sell (claims row c3-bridge). */
export const C3_BRIDGE = "The ticket is made up.";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
/** "Live · checked today, 4:13 PM" (claims row c3-live); a live answer can be up to an hour old, so just after midnight it names its own date. */
const checked = (iso: string) => `Live · checked ${new Date(iso).toDateString() === new Date().toDateString() ? "today" : date(iso)}, ${time(iso)}`;

export default function RealPrices({ words, landing = false }: { words: string; landing?: boolean }) {
  const [got, setGot] = useState<Prices | null | undefined>(undefined);
  const heading = useId();
  useEffect(() => {
    let live = true;
    fetch(`/api/prices?q=${encodeURIComponent(words.slice(0, 80))}`, { credentials: "omit" })
      .then((r) => (r.ok ? (r.json() as Promise<Prices>) : null))
      .then((p) => { if (live) setGot(p); }, () => { if (live) setGot(null); });
    return () => { live = false; };
  }, [words]);

  // The landing holds this panel's room while it waits (story.css): with no answer, this mark shuts it. Passes nothing back, so the page has no new way to hear from here.
  if (!got || (got.source !== "channel3" && got.source !== "recorded") || !got.fetchedAt || !got.query) return landing && got !== undefined ? <i hidden className="c3-none" /> : null;
  const recorded = got.source !== "channel3";
  // Cheapest first, and the lead says the span (C's panel, Nov 6): a set that runs $75 to $1,218 reads as a range, not one price.
  // The dash is CSS (.c3-to, alternative text "to"): a screen reader hears "$75.00 to $1,218.00", and the page's text, which
  // the landing's word pins count, reads it as one word (Lead-12 and R, Nov 6: the range adds no word to the landing).
  const items = [...got.items].sort((a, b) => Number(a.price) - Number(b.price));
  const ends = usdSpanEnds(items.map((it) => it.price));
  const span = ends && <span className="c3-span">{ends[0]}<span className="c3-to" />{ends[1]}</span>;
  // The bridge's second sentence opens on the query, so it is capitalized there: "“Backpack” at real stores".
  const Q = got.query.charAt(0).toUpperCase() + got.query.slice(1);
  const when = recorded ? `Recorded ${date(got.fetchedAt)} · not live` : checked(got.fetchedAt);
  const list = items.length === 0 ? (
    <p className="c3-none">Channel3 has no in-stock prices for this right now.</p>
  ) : (
    <ul className="c3-list">
      {items.map((it, n) => (
        <li key={n} className="c3-it">
          <span className="c3-name">{it.name}</span>
          <span className="c3-price">{usdOf(it.price)}</span>
          <span className="c3-store">{it.store}</span>
          <span className="c3-also">
            {!landing && it.also?.length ? <>{C3_ALSO} {it.also.map((a, m) => <span key={m} className="c3-also-at">{a.store} {usdOf(a.price)}</span>)}</> : null}
          </span>
        </li>
      ))}
    </ul>
  );
  // One level under the section's own head: the landing's is an h2, the card's an h3 (axe heading-order, push 18).
  const FlagH = landing ? "h3" : "h4";
  const flags = got.flagged?.length ? (
    <div className="c3-flags">
      <FlagH className="c3-flag-h">{C3_FLAG_HEAD}</FlagH>
      <p className="c3-for">{C3_FLAG_NOTE}</p>
      <ul className="c3-flag-list">
        {got.flagged.map((f, n) => (
          <li key={n} className="c3-flag">
            <span className="c3-name">{f.name}</span>
            <span className="c3-reason">{f.reason}</span>
            <span className="c3-flag-at"><span className="c3-price">{usdOf(f.price)}</span> <span className="c3-store">{f.store}</span></span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;
  // The landing's own head, outside the card at the demo moment's size (a fresh DD, Nov 6): the headline names Channel3, the
  // live or recorded line sits under it, the bridge says why a backpack follows a ticket, and the label, still before any
  // single price, takes the head row's right half on a wide screen. Same words as the card's old head and lead, give or take
  // six: the flag note lost its advice so the landing's word pins hold.
  if (landing) return (
    <section className="c3-land" aria-labelledby={heading}>
      <header className="c3-top">
        <h2 id={heading} className="ds-h2 c3-h">{C3_HEAD}</h2>
        <p className="c3-when">{when}</p>
        <p className="ds-lede c3-bridge">{span ? <>{C3_BRIDGE} “{Q}” at real stores: {span}.</> : `${C3_BRIDGE} What “${got.query}” cost at real stores.`}</p>
        <p className="c3-label">{C3_LABEL}</p>
      </header>
      <div className="c3">
        <p className="c3-for c3-for-land">{C3_LANDING}</p>
        {list}
        {flags}
      </div>
    </section>
  );
  return (
    <section className="c3" aria-labelledby={heading}>
      <header className="c3-head">
        <h3 id={heading} className="dk-eyebrow">{recorded ? "Real prices, recorded" : "Real prices right now"}</h3>
        <p className="c3-when">{when}</p>
      </header>
      {/* The label leads (visual review): before any price is read, it says these are references only. */}
      <p className="c3-label">{C3_LABEL}</p>
      <p className="c3-for">
        {recorded
          ? <>What “{got.query}” cost at real stores when this was recorded{span && <>: {span}</>}. {C3_KIND} {C3_VARIANT}</>
          : <>What “{got.query}” costs at real stores{span && <>: {span}</>}. {C3_KIND} {C3_VARIANT}</>}
      </p>
      {list}
      {flags}
    </section>
  );
}
