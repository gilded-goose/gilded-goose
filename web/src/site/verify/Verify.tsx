// Verify an order (Joshua, Nov 11): for a merchant with a "my AI did it" dispute. Paste an order id Goose placed and read
// what the server holds for it: the cart the shopper approved, its fingerprint, the order, the rows, PayPal's signed event.
// Read only: one GET to /api/verify/:id (server/src/verify-order.ts), which can't pay, refund or change anything. Every
// word of an answer is the server's; this page types only its headings. An id is printed as text, never as markup.
// It carries no example ids: the recorded sandbox orders live on Proof, and this server never kept their carts.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { usdOf } from "@goose/core/usd-of";
import { getJson } from "../live/api.ts";
import { hrefOf } from "../route.ts";
import { Button } from "../ui/Button.tsx";
import "./verify.css";

interface Row { at: string; actor: string; action: string; verdict: string | null; amount: string | null; currency: string | null; words: string }
interface Found {
  found: true; label: string; orderId: string; seenApproved: boolean; readAt: string; verdict: "match" | "mismatch"; headline: string; why: string; witnessWords: string;
  order: { status: string; outcome: string; amount: string; currency: string; fingerprint: string | null };
  cart: { item: string; payee: string; qty: number; total: string; currency: string; fingerprint: string; boundWith: string };
  times: { created: string | null; approved: string; captured: string | null; refunded: string | null };
  rows: Row[];
  webhook: { arrived: boolean; events: { type: string; at: string }[]; words: string };
  refund: { state: string; words: string };
}
type Answer = Found | { found: false; off?: boolean; error?: string };
type State = { at: "idle" } | { at: "asking"; id: string } | { at: "found"; v: Found } | { at: "missing"; words: string; off: boolean } | { at: "away"; id: string };

const money = (amount: string, currency: string) => (currency === "USD" && /^\d+\.\d{2}$/.test(amount) ? usdOf(amount) : `${amount} ${currency}`);
const idInHash = (): string => { try { return decodeURIComponent(location.hash.split("#")[2] ?? ""); } catch { return ""; } };

function Facts({ rows }: { rows: [string, string | null, boolean?][] }) {
  return (
    <dl className="vf-facts">
      {rows.map(([k, v, mono]) => (
        <div key={k}><dt>{k}</dt><dd>{v === null ? "—" : mono ? <code>{v}</code> : v}</dd></div>
      ))}
    </dl>
  );
}

function Result({ v }: { v: Found }) {
  const c = v.cart;
  return (
    <>
      <section className="vf-verdict" data-verdict={v.verdict} aria-labelledby="vf-verdict">
        <p className="vf-label">{v.label}</p>
        <h2 id="vf-verdict">{v.headline}</h2>
        <p>{v.why}</p>
        <p className="vf-fine">{v.witnessWords} As read at {v.readAt}.</p>
      </section>

      <section className="vf-card" aria-labelledby="vf-cart">
        <h2 id="vf-cart">{v.verdict !== "match" ? "The cart on this server's record now" : v.seenApproved ? "The cart the shopper approved" : "The cart this order was created for"}</h2>
        <Facts rows={[
          ["Item", c.qty > 1 ? `${c.qty} × ${c.item}` : c.item],
          ["Seller", c.payee],
          ["Total", money(c.total, c.currency)],
          [v.seenApproved ? "Fingerprint at approval" : "Fingerprint when the order was created", c.boundWith, true],
          ["Fingerprint worked out again now", c.fingerprint, true],
        ]} />
      </section>

      <section className="vf-card" aria-labelledby="vf-order">
        <h2 id="vf-order">The order</h2>
        <Facts rows={[
          ["Order id", v.orderId, true],
          ["How it ended, by Goose's rows", v.order.outcome],
          ["Status at the payment provider", v.order.status],
          ["Amount", money(v.order.amount, v.order.currency)],
          ["Fingerprint in the order's custom_id", v.order.fingerprint, true],
          ["Order created", v.times.created],
          ["Seen approved", v.times.approved],
          ["Captured", v.times.captured],
          ["Refunded", v.times.refunded],
        ]} />
        <p className="vf-fine">Seen approved is when Goose read the order back as approved, just before it took any money. PayPal doesn't tell us the moment of the tap itself.</p>
      </section>

      <section className="vf-card" aria-labelledby="vf-hook">
        <h2 id="vf-hook">PayPal's signed event</h2>
        <p>{v.webhook.words}</p>
        {v.webhook.events.length > 0 ? <ul className="vf-events">{v.webhook.events.map((e, i) => <li key={i}><code>{e.type}</code> <span>{e.at}</span></li>)}</ul> : null}
        <p><b>Refund.</b> {v.refund.words}</p>
      </section>

      <section className="vf-card" aria-labelledby="vf-rows">
        <h2 id="vf-rows">What Goose recorded, in order</h2>
        <ol className="vf-rows">
          {v.rows.map((r, i) => (
            <li key={i} data-verdict={r.verdict ?? undefined}>
              <p>{r.words}</p>
              <p className="vf-fine">{[r.at, `${r.actor} · ${r.action}`, r.verdict, r.amount && r.currency ? money(r.amount, r.currency) : null].filter(Boolean).join(" · ")}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function Missing({ words, off }: { words: string; off: boolean }) {
  return (
    <section className="vf-card" aria-labelledby="vf-missing">
      <h2 id="vf-missing">{off ? "Switched off" : "Not found"}</h2>
      <p>{words}</p>
      {off ? null : <p className="vf-fine">This server answers only for orders Goose itself placed, and keeps recent ones only. It says the same for an id it never saw and for one that belongs to someone else.</p>}
    </section>
  );
}

export function Verify() {
  const [id, setId] = useState("");
  const [state, setState] = useState<State>({ at: "idle" });
  const turn = useRef(0);

  const ask = useCallback(async (raw: string) => {
    const want = raw.trim();
    if (!want) return;
    const mine = ++turn.current;
    setState({ at: "asking", id: want });
    const a = await getJson<Answer>(`/api/verify/${encodeURIComponent(want)}`);
    if (mine !== turn.current) return; // a later lookup already answered
    if (a === "away") setState({ at: "away", id: want });
    else if (a.found) setState({ at: "found", v: a });
    else setState({ at: "missing", off: a.off === true, words: a.error ?? "No order with that id is on record here." });
  }, []);

  // "#/verify#<order id>" opens with that order looked up.
  useEffect(() => {
    const open = () => { const h = idInHash(); if (/^[0-9A-Za-z-]{4,32}$/.test(h)) { setId(h); void ask(h); } };
    open();
    addEventListener("hashchange", open);
    return () => removeEventListener("hashchange", open);
  }, [ask]);

  const submit = (e: FormEvent) => { e.preventDefault(); void ask(id); };
  const asking = state.at === "asking";

  return (
    <div className="wrap pg vf">
      <header className="vf-head">
        <h1 className="sx-h sx-h-page">Verify an order</h1>
        <p className="sx-lede">For a merchant told "my AI did it". Paste the id of an order Goose placed and read the cart the order was made for, its fingerprint, and what was recorded. Test money only: PayPal sandbox and practice orders.</p>
      </header>

      <form className="vf-form" onSubmit={submit}>
        <label htmlFor="vf-id">Order id</label>
        <div className="vf-ask">
          <input id="vf-id" name="order" type="text" inputMode="text" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={32} value={id} onChange={(e) => setId(e.target.value)} placeholder="17 letters and digits" aria-describedby="vf-hint" />
          <Button type="submit" tone="ink" disabled={asking || id.trim() === ""} aria-busy={asking || undefined}>{asking ? "Checking…" : "Verify"}</Button>
        </div>
        <p id="vf-hint" className="vf-fine">Anyone with an order's id can read this page: the item, seller, total, times and payment steps. It never shows the payer's name, email or address, the shopper's spending limit, or anything a seller wrote. Read only: it can't pay, refund or change an order.</p>
      </form>

      <section className="vf-examples" aria-labelledby="vf-ex">
        <h2 id="vf-ex">Where to get an order id</h2>
        <p>Pay for a cart in <a href={hrefOf("shop")}>Shop</a> with a sandbox buyer and paste the receipt's order id.</p>
        <p className="vf-fine">The recorded sandbox orders are on <a href={hrefOf("proof")}>Proof</a>. They were run before this page existed and this server never kept their carts, so it can't look them up.</p>
      </section>

      <div className="vf-result" role="status" aria-live="polite">
        {state.at === "asking" ? <p className="vf-fine">Checking {state.id}…</p> : null}
        {state.at === "found" ? <Result v={state.v} /> : null}
        {state.at === "missing" ? <Missing words={state.words} off={state.off} /> : null}
        {state.at === "away" ? (
          <section className="vf-card" aria-labelledby="vf-away">
            <h2 id="vf-away">Goose's server didn't answer</h2>
            <p>Nothing was checked, and nothing changed. Try again in a moment.</p>
          </section>
        ) : null}
      </div>

      <p className="pg-foot">Where these numbers come from. <a className="sx-link" href={hrefOf("proof")}>Proof</a></p>
    </div>
  );
}
