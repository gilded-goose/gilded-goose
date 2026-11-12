// The Christmas list (`?desk=list`; Joshua, Nov 3, 4d): gifts under one total, its own chunk. The server keeps it in the
// browser's session and the guard enforces the total (trust `listTotal`); this page only draws core/src/view/list.ts.

import { Suspense, useEffect, useState } from "react";
import { lazyOr } from "../states/online.ts";
import { FOR_WHO, RANKS, type ForWho, type Rank } from "@goose/core/wants";
import { TOTAL_CHOICES, totalLine, type GiftRow, type ListView } from "@goose/core/list";
import type { GooseRead } from "@goose/core/read";
import { SiteNav } from "../nav/SiteNav.tsx";
import Read from "./Read.tsx";
import "./list.css";
import { usd, usdOf } from "@goose/core/money";

/** The year view: its own chunk, fetched once the list has gifts. */
const Year = lazyOr(() => import("./Year.tsx"));
const POST = { method: "POST", headers: { "Content-Type": "application/json" } } as const;
const money = usd;
const FAILED = "That didn't save. Nothing changed.";
export const LIST_AWAY = "Your list needs Goose's server, and it isn't answering.";
type WantsBody = { list?: ListView; reads?: Record<string, GooseRead> } | null;
declare global { interface Window { __list?: Promise<WantsBody> | undefined } }
/** What the page's file draws, hidden, while the list is read: a new visitor's list, the one the head's early answer can
 * reveal at once (LIST_EARLY, prerender-routes.ts). Only `total` and `gifts` are drawn while both are empty. */
export const FIRST_LIST: ListView = { total: null, spentCents: 0, spent: "$0.00", leftCents: null, left: null, maxSum: "$0.00", gifts: [], choices: [] };

/** Whole dollars from the limit down in $5 steps, and the gift's own max if it isn't one of them. */
function maxChoices(g: GiftRow): number[] {
  const out = new Set<number>([g.limitCents, g.maxCents]);
  for (let d = Math.floor(g.limitCents / 500) * 5; d >= 5; d -= 5) out.add(d * 100);
  return [...out].sort((a, b) => b - a);
}
const change = (g: GiftRow, to: { rank?: Rank; max?: number; neededBy?: string; forWho?: ForWho }) => ({ catalogId: g.catalogId, rank: to.rank ?? g.rank, max: to.max ?? g.maxCents, ...(to.neededBy ? { neededBy: to.neededBy } : {}), ...(to.forWho ? { forWho: to.forWho } : {}) });

export default function List() {
  const [list, setList] = useState<ListView | "away" | null>(null);
  const [reads, setReads] = useState<Record<string, GooseRead>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Counts saves, so the year view reads its plan again after each. */
  const [stamp, setStamp] = useState(0);

  /** `early`: the head's answer (LIST_EARLY), taken once; null from it (lost, refused) means ask again, as "Try again" does. */
  async function load(early?: Promise<WantsBody>) {
    const ask = async (): Promise<WantsBody> => { const r = await fetch("/api/runs/wants").catch(() => null); return r?.ok ? await r.json().catch(() => null) as WantsBody : null; };
    const body = (early ? await early.catch(() => null) : null) ?? await ask();
    setList(body?.list ?? "away");
    setReads(body?.reads ?? {});
  }
  useEffect(() => {
    document.title = "Your Christmas list · Gilded Goose";
    const early = window.__list;
    window.__list = undefined;
    void load(early);
  }, []);

  async function send(path: string, body: object) {
    if (busy) return;
    setBusy(true); setError(null);
    const r = await fetch(path, { ...POST, body: JSON.stringify(body) }).catch(() => null);
    const next = r ? await r.json().catch(() => null) as { list?: ListView; reads?: Record<string, GooseRead>; error?: string } | null : null;
    if (next?.list) setList(next.list);
    if (next?.reads) setReads(next.reads);
    setStamp((n) => n + 1);
    if (!r?.ok) setError(typeof next?.error === "string" ? next.error : FAILED);
    setBusy(false);
  }

  const on = list && list !== "away" ? list : null;
  /** While reading, the file's hidden empty view (`data-list-first`): the same elements React fills once the answer lands, so a
   * new visitor's list paints once, with the file, and never a second time. */
  const view = on ?? (list === null ? FIRST_LIST : null);
  const share = on?.total ? Math.min(100, (on.spentCents / on.total.cents) * 100) : 0;
  return (
    <div className="dk xl" data-palette="v" data-layer="shopper">
      <SiteNav here="shop" exact={false} />
      <main id="main" className="xl-wrap">
        <h1>Your Christmas list</h1>
        {list === null && <p className="xl-note xl-reading">Reading your list…</p>}
        {list === "away" && <p className="xl-note" role="alert">{LIST_AWAY} <button type="button" className="xl-link" onClick={() => void load()}>Try again</button></p>}
        {view && (
          <div className="xl-body" data-list-first={list === null ? "" : undefined}>
            <section className="xl-total" aria-label="Your total">
              <p className="xl-big">{view.total ? <><b>{usdOf(view.spent)}</b> of {usdOf(view.total.said)}</> : <b>No total set</b>}</p>
              {view.total && <div className="xl-bar" aria-hidden="true"><i style={{ width: `${share}%` }} /></div>}
              <p className="xl-note">{view.total ? totalLine(view.total.said) : "Set one, and no cart in this browser can pass it."}</p>
              <label className="xl-pick">Total <select value={view.total?.cents ?? ""} disabled={busy} onChange={(e) => void send("/api/runs/list", { total: e.target.value === "" ? null : Number(e.target.value) })}>
                <option value="">No total</option>
                {view.total && !TOTAL_CHOICES.includes(view.total.cents) && <option value={view.total.cents}>{money(view.total.cents)}</option>}
                {TOTAL_CHOICES.map((c) => <option key={c} value={c}>{money(c)}</option>)}
              </select></label>
            </section>

            {error && <p className="xl-err" role="alert">{error}</p>}

            {view.gifts.length === 0 ? (
              <div className="xl-empty">
                <p className="xl-empty-t">No gifts yet.</p>
                <button type="button" className="xl-go" disabled={busy} onClick={() => void send("/api/runs/list", { demo: true })}>Start with the demo list</button>
              </div>
            ) : (
              <ul className="xl-gifts">
                {view.gifts.map((g) => (
                  <li key={g.catalogId} className="xl-gift" data-gift={g.catalogId}>
                    <h2>{g.item}</h2>
                    {reads[g.catalogId] && <Read read={reads[g.catalogId]!} />}
                    <div className="xl-fields">
                      <label className="xl-pick">For <select value={g.forWho ?? ""} disabled={busy} onChange={(e) => void send("/api/runs/wants", change(g, { forWho: e.target.value as ForWho }))}>
                        {g.forWho === null && <option value="">Pick</option>}
                        {FOR_WHO.map((w) => <option key={w}>{w}</option>)}
                      </select></label>
                      <label className="xl-pick">Priority <select value={g.rank} disabled={busy} onChange={(e) => void send("/api/runs/wants", change(g, { rank: Number(e.target.value) as Rank }))}>
                        {RANKS.map((r) => <option key={r} value={r}>{r} of 5</option>)}
                      </select></label>
                      <label className="xl-pick">Most I'll pay <select value={g.maxCents} disabled={busy} onChange={(e) => void send("/api/runs/wants", change(g, { max: Number(e.target.value) }))}>
                        {maxChoices(g).map((c) => <option key={c} value={c}>{money(c)}</option>)}
                      </select></label>
                      <label className="xl-pick">Needed by <input type="date" value={g.neededBy ?? ""} disabled={busy} onChange={(e) => { if (e.target.value) void send("/api/runs/wants", change(g, { neededBy: e.target.value })); }} /></label>
                      <button type="button" className="xl-link" disabled={busy} aria-label={`Remove ${g.item}`} onClick={() => void send("/api/runs/wants/remove", { catalogId: g.catalogId })}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {view.choices.length > 0 && view.gifts.length > 0 && (
              <label className="xl-pick xl-add">Add a gift <select value="" disabled={busy} onChange={(e) => { const c = view.choices.find((x) => x.catalogId === e.target.value); if (c) void send("/api/runs/wants", { catalogId: c.catalogId, rank: 3 }); }}>
                <option value="">Pick</option>
                {view.choices.map((c) => <option key={c.catalogId} value={c.catalogId}>{c.item}</option>)}
              </select></label>
            )}
            {view.gifts.length > 0 && <Suspense fallback={null}><Year stamp={stamp} /></Suspense>}
          </div>
        )}
      </main>
      <footer className="xl-wrap xl-foot"><p>Fictional sellers. PayPal sandbox. Practice only: no real money.</p></footer>
    </div>
  );
}
