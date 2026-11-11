// PayPal additions 5: the Store Sync-shaped market's page (`?market=1`). Three steps, named as in Store Sync's published
// agent flow: search, cart, complete_payment. Every cart goes to the guard on the server (the Watcher, the code-locked
// limits), complete_payment only opens PayPal for the exact cart the guard bound, and only the shopper's tap there pays.
// The claims line comes from core's constant, never retyped here.
import { appHref } from "./menu/href.ts";
import { useEffect, useRef, useState } from "react";
import { useBackFromPayPal } from "./states/online.ts";
import { STORE_SYNC_CLAIM } from "@goose/core/storesync-claim";
import type { StoreResult } from "@goose/core/storesync";
import { syncTried } from "./tries.ts";
import "./storesync.css";
import { wireSkip } from "./skip.ts";
import { BACK_UNREAD, PAID_ELSEWHERE, OFFLINE, OFFLINE_SAYS, SANDBOX_NEXT, WAS_OFFLINE } from "./states/words.ts";
import { usdOf } from "@goose/core/usd-of"; // not "/money": this route loads no other money code

wireSkip();

type Cart =
  | { kind: "cart"; runId: string; decision: "ask" | "buy"; total: string; reason: string; holds: string[]; canPay: boolean }
  | { kind: "refused"; runId: string; reason: string; rule: string }
  | { kind: "missing"; reason: string };

type Back = { total: string | null; merchant: string | null; ok: boolean | null; reason: string | null; orderId: string | null; card: { head: string; line: string | null } | null; mine?: boolean };

// The three steps of Store Sync's agent flow (search, cart, complete_payment; claims row store-sync), in plain words on screen.
const STEPS = [["search", "Search"], ["cart", "Cart"], ["complete_payment", "Approve"]] as const;

const recordWords = (h: number | null) => (h === null ? "No sales record available" : h === 0 ? "New seller, no sales yet" : `${h} sales on record`);

async function json<T>(path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const r = await fetch(path, body === undefined ? { credentials: "same-origin" } : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, data: (await r.json()) as T };
}

export default function StoreSync() {
  const params = new URLSearchParams(location.search);
  const backRun = params.get("run");
  const [query, setQuery] = useState("kettle");
  const [results, setResults] = useState<StoreResult[] | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [back, setBack] = useState<Back | null>(null);
  // Round 5 (B2): the practice-site line by Approve, sandbox only. Stays off until the server says so.
  const [sandbox, setSandbox] = useState(false);
  useEffect(() => { json<{ payment?: unknown }>("/api/health").then(({ data }) => setSandbox(data.payment === "sandbox"), () => {}); }, []);
  // SW (brand.md §10.9): a failed call keeps the step it was on, so "Try again" repeats that step, not a new search.
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  // `auto`: a read (search, the return's read) may run again by itself once the network is back; the cart (it binds a
  // cart, starts a run, spends a daily cap: R-14) and opening PayPal never do, since only her own press acts (review R4).
  const [auto, setAuto] = useState(true);
  // R-11 part 2: whether she was offline when the step failed, so the words name the cause the code saw at the time.
  const [offAt, setOffAt] = useState(false);
  // R-12: which call never got an answer, as state, not as a sentence (the old sentinel held a server claim as its text).
  // "back" is the read of PayPal's return: she has been to PayPal, so a capture may have happened and nothing says
  // "Nothing was bought" for it; "step" is search, cart or complete_payment, none of which can capture.
  const [failed, setFailed] = useState<"step" | "back" | null>(null);
  const fail = (again: () => void, reads = true, at: "step" | "back" = "step") => { setError(null); setFailed(at); setRetry(() => again); setAuto(reads); setOffAt(!navigator.onLine); };
  const clear = () => { setError(null); setFailed(null); };
  const cartRef = useRef<HTMLElement>(null);
  // Offline: no button to press; the failed step runs again by itself once the network is back.
  const again = useRef<(() => void) | null>(null);
  again.current = failed && auto ? retry : null;
  useEffect(() => {
    const off = () => setOnline(false);
    const on = () => { setOnline(true); again.current?.(); };
    addEventListener("online", on); addEventListener("offline", off);
    return () => { removeEventListener("online", on); removeEventListener("offline", off); };
  }, []);
  // The guard's answer lands under the listings: bring it into view, and to the keyboard.
  useEffect(() => {
    if (!cart) return;
    cartRef.current?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    cartRef.current?.focus({ preventScroll: true });
  }, [cart]);

  const step = back ? 2 : cart ? (cart.kind === "cart" ? 2 : 1) : results ? 1 : 0;

  async function search(e?: React.FormEvent, q = query) {
    e?.preventDefault();
    setBusy("search"); clear(); setCart(null);
    try {
      const r = await json<{ results: StoreResult[] }>(`/api/runs/store/search?q=${encodeURIComponent(q)}`);
      setResults(r.data.results);
    } catch { fail(() => void search(undefined, q)); } finally { setBusy(null); }
  }

  async function putInCart(id: string) {
    setBusy(id); clear();
    try {
      const r = await json<Cart & { error?: string }>("/api/runs/store/cart", { listingId: id });
      if (r.data.error) setError(r.data.error); else { setCart(r.data); void syncTried(); } // Things to try: the market run's rows tick it
    // R-14 (lesson 47): the cart POST binds a cart, starts a run and spends one of her daily cart caps, so it is a step
    // that acts: never sent again by itself on `online`, only by her Try again (`pnpm probe:offline-strip` row m).
    } catch { fail(() => void putInCart(id), false); } finally { setBusy(null); }
  }

  useBackFromPayPal(() => setBusy(null));
  async function completePayment(runId: string) {
    setBusy("pay"); clear();
    try {
      const r = await json<{ approveUrl?: string; error?: string }>("/api/runs/store/complete_payment", { runId });
      if (r.data.approveUrl) location.assign(r.data.approveUrl);
      else { setError(r.data.error ?? "PayPal didn't open. Nothing was charged."); setBusy(null); }
    } catch { fail(() => void completePayment(runId), false); setBusy(null); }
  }

  // PayPal's return lands here with the run: say what the server's settle says, never more. R-12: a read that failed is
  // read again in place (by itself once she's back online, or by her Try again), never by reloading the page: a reload is
  // her tap. The read is a GET of the run, which settles nothing (the capture happened, at most once, on PayPal's return
  // route before this page loaded; abuse.test.ts market_return_reload_captures_once).
  function readBack(run: string) {
    clear();
    json<{ bound: { total: string; merchant: string; orderId: string | null } | null; settled: { ok: boolean; reason?: string } | null; card?: { head: string; line: string | null } | null; mine?: boolean }>(`/api/runs/${run}`)
      .then(({ data }) => setBack({ total: data.bound?.total ?? null, merchant: data.bound?.merchant ?? null, ok: data.settled?.ok ?? null, reason: data.settled?.reason ?? null, orderId: data.bound?.orderId ?? null, card: data.card ?? null, mine: !!data.mine }))
      .catch(() => fail(() => readBack(run), true, "back"));
  }
  useEffect(() => {
    if (!backRun || !/^[0-9a-f]{12}$/.test(backRun)) return;
    readBack(backRun);
  }, [backRun]);

  return (
    <main id="main" className="ssm dk" data-palette="v">
      <header className="ssm-band">
        {/* SW (surface-words.md, budget 43): the page named as the menu names it, then the one fact; the steps below
            say "search, cart, approve", so the heading no longer says it twice. */}
        <p className="ssm-eyebrow">The cart, step by step</p>
        <h1>Only your tap pays.</h1>
        <p className="ssm-claim">{STORE_SYNC_CLAIM}</p>
        <ol className="ssm-steps" aria-label="Steps">
          {STEPS.map(([s, said], i) => <li key={s} className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}><b>{i + 1}</b> <span>{said}</span></li>)}
        </ol>
      </header>

      <div className="ssm-desk">
        {/* brand.md §10.9: a server that didn't answer (or no network) is one state block, with its real cause and one action. */}
        {/* R-12: "Nothing was bought." only for a step that can't capture (search, cart, complete_payment: an order, never
            a payment, until her tap in PayPal); the return's read says only that the read failed. R-13: online it is always
            BACK_UNREAD's title, never WAS_OFFLINE's "didn't go through" (after PayPal that reads as a failed payment, and
            she might pay twice); the server line still shows only for a read that failed online (the cause it saw). */}
        {failed === "back"
          ? <div className="ssm-state" role="alert">
              <p className="ssm-state-t">{online ? BACK_UNREAD.title : OFFLINE.title}</p>
              {online ? !offAt && <p className="ssm-state-l">{BACK_UNREAD.line}</p> : <p className="ssm-state-l">{OFFLINE_SAYS.back}</p>}
              {online && retry && <button type="button" className="ssm-act ghost" onClick={retry}>{BACK_UNREAD.action}</button>}
            </div>
          : failed
          ? <div className="ssm-state" role="alert">
              <p className="ssm-state-t">{online ? (offAt ? WAS_OFFLINE.title : "Goose couldn't reach the market.") : OFFLINE.title}</p>
              <p className="ssm-state-l">{online ? (offAt ? "Nothing was bought." : "Goose's server didn't answer. Nothing was bought.") : auto ? "Nothing was bought. Goose tries again once you're back." : "Nothing was bought. Try again once you're back."}</p>
              {/* R-11, offline wins: no Try again while offline (it needs the network); the line says when it comes back. */}
              {online && retry && <button type="button" className="ssm-act ghost" onClick={retry}>Try again</button>}
            </div>
          : <p className="ssm-status" role="status" aria-live="polite">{error ?? ""}</p>}

        {back ? (
          <section className={`ssm-slip ${back.ok && !back.card ? "paid" : "closed"}`} aria-labelledby="ssm-back">
            <h2 id="ssm-back">{back.card?.head ?? (back.ok ? `Paid ${usdOf(back.total)}` : "Waiting on PayPal")}</h2>
            <p>{back.card?.line ?? (back.ok ? !back.mine ? PAID_ELSEWHERE : `You approved this exact cart${back.merchant ? ` from ${back.merchant}` : ""} in PayPal, and code checked it again before capturing.` : back.reason ? `${back.reason[0]!.toUpperCase()}${back.reason.slice(1)}.` : "No answer from PayPal yet on this cart.")}</p>
            {back.orderId && <p className="ssm-mono">Order {back.orderId}</p>}
            <a className="ssm-link" href={appHref("?market=1")}>Search again</a>
          </section>
        ) : (
          <>
            <form className="ssm-search" role="search" onSubmit={search}>
              <label htmlFor="ssm-q">Search the market</label>
              <div>
                <input id="ssm-q" value={query} maxLength={80} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
                <button className="ssm-act" disabled={busy !== null} aria-busy={busy === "search" || undefined}>{busy === "search" ? "Searching…" : "Search"}</button>
              </div>
              <p className="ssm-fine">Fictional sellers. The Watcher reads them first.</p>
            </form>

            {/* brand.md §10.9's Empty: what happened, the way to fill it, one action (it searches; nothing is bought). */}
            {results && results.length === 0 && (
              <div className="ssm-state ssm-empty" role="status">
                <p className="ssm-state-t">No listings match that.</p>
                <p className="ssm-state-l">This practice market sells one thing: a kettle.</p>
                <button type="button" className="ssm-act ghost" disabled={busy !== null} onClick={() => { setQuery("kettle"); void search(undefined, "kettle"); }}>Search for “kettle”</button>
              </div>
            )}
            {results && results.length > 0 && (
              <ul className="ssm-results" aria-label="Listings">
                {results.map((r) => (
                  <li key={r.id} className={`ssm-slip v-${r.watcher}`}>
                    <div className="ssm-row">
                      <div>
                        <h3>{r.merchant}</h3>
                        <p className="ssm-item">{r.item} · {recordWords(r.history)}</p>
                      </div>
                      <p className="ssm-price">{usdOf(r.price)}</p>
                    </div>
                    {/* W-5: an empty note draws nothing (CD-1 did the same for the Desk's "Its note"): no bare “” on a slip. */}
                    {r.quoted.trim() !== "" && <blockquote><span className="ssm-sr">The seller wrote: </span>“{r.quoted}”</blockquote>}
                    <p className={`ssm-watch w-${r.watcher}`}>
                      {r.watcher === "refuse" ? <><b>✕ Set aside by the Watcher:</b> {r.said.join("; ")}.</>
                        : r.watcher === "hold" ? <><b>Held for your yes:</b> {r.said.join("; ")}.</>
                        : <>No known scam wording found. Your max and your tap still decide.</>}
                    </p>
                    <button className="ssm-act ghost" disabled={busy !== null} aria-busy={busy === r.id || undefined} onClick={() => putInCart(r.id)} aria-label={`${r.watcher === "refuse" ? "Try to put in cart" : "Put in cart"}: ${r.merchant}, ${usdOf(r.price)}`}>{busy === r.id ? "Asking the guard…" : r.watcher === "refuse" ? "Try to put in cart" : "Put in cart"}</button>
                  </li>
                ))}
              </ul>
            )}

            {cart && (
              <section ref={cartRef} tabIndex={-1} className={`ssm-slip ssm-cart ${cart.kind}`} aria-labelledby="ssm-cart">
                {cart.kind === "cart" ? (
                  <>
                    <h2 id="ssm-cart">Your cart: {usdOf(cart.total)}</h2>
                    <p>{cart.reason}</p>
                    {cart.holds.length > 0 && <p className="ssm-watch w-hold"><b>Held for your yes:</b> {cart.holds.join("; ")}.</p>}
                    {cart.canPay
                      ? <button className="ssm-act" disabled={busy !== null} aria-busy={busy === "pay" || undefined} aria-describedby={sandbox ? "ssm-next" : undefined} onClick={() => completePayment(cart.runId)}>{busy === "pay" ? "Opening PayPal…" : `Approve ${cart.total} in PayPal`}</button>
                      : <p className="ssm-fine">PayPal isn't connected on this server, so this cart can't be paid here.</p>}
                    {cart.canPay && sandbox && <p className="ssm-practice" id="ssm-next">{SANDBOX_NEXT}</p>}
                    <p className="ssm-fine">Nothing is paid until you approve in PayPal. Code checks this exact cart again before any money moves.</p>
                  </>
                ) : (
                  <>
                    <p className="ssm-stamp">Blocked. Nothing bought.</p>
                    <h2 id="ssm-cart">The guard refused this cart</h2>
                    <p>{cart.reason[0]!.toUpperCase()}{cart.reason.slice(1)}.</p>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
