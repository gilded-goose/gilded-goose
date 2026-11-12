// "Your wants" on the wallet home (Nov 4–7; core/src/ask/wants.ts), above "Your week": what this browser is waiting
// for, "really want" first, each with the max Goose waits for and one tap to remove it. Saved by the shopper's own words
// in Ask Goose ("I really want the kettle") or changed here by a tap; the server keeps them in the browser's session, so
// with its store they outlive a restart, and the list says plainly where they're kept. The max is picked from whole
// dollars at or under the limit, never typed. With no server the list says so; the recorded week below never waits on it.

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { lazyOr } from "./states/online.ts";
import type { GooseRead } from "@goose/core/read";
import { WANTS_KEPT, type WantCard, type WantsKept } from "@goose/core/wants";
import type { LimitRow } from "@goose/core/watching";
import type { DialRow } from "@goose/core/view";
import { TRADEOFFS_LABEL, TRADEOFFS_SAID } from "@goose/core/tradeoff";
import { FORGET_ALL, MEMORY_LABEL, MEMORY_NONE, MEMORY_SAID, type MemoryCard } from "@goose/core/memory";
import { liveKnown, useLive } from "./live.ts";
import { OFFLINE, OFFLINE_SAYS } from "./states/words.ts";
import "./wants.css";
import { usd, usdOf } from "@goose/core/money";

/** Goose's Read: its own chunk, fetched only once a want is on screen. */
const Read = lazyOr(() => import("./list/Read.tsx"));
type Got = { wants: (WantCard & { history?: string | null; warning?: string | null; pile?: string | null })[]; reads?: Record<string, GooseRead>; kept: WantsKept; limits?: LimitRow[]; dial?: DialRow[]; dialAsks?: string; tradeoffs?: boolean; memory?: MemoryCard[] };
const POST = { method: "POST", headers: { "Content-Type": "application/json" } } as const;
export const WANTS_AWAY = "Your wants need Goose's server, and it isn't answering.";
export const SETTINGS_AWAY = "Your limits and what Goose remembers need Goose's server, and it isn't answering.";
/** The empty state, brand.md §10.9's Empty (SW): what is so, how to fill it, one action (it takes you to the Ask box,
 *  where the words save it). It says what is missing, never that "nothing" is here (§10.9; AS-15's no_nothing_yet). */
export const WANTS_EMPTY = "No wants yet.";
export const WANTS_LINE = "Tell Goose “I really want the kettle” and it keeps that here.";
const WANTS_GO = "Ask Goose";
/** The Ask box on this page, focused and in view: the empty list's one action. Nothing is typed or sent for you. */
function toAsk() {
  const box = document.getElementById("want");
  box?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  box?.focus({ preventScroll: true });
}
const FAILED = "That didn't save. Nothing changed.";

const shown = (item: string) => item.replace(" (fictional)", "");

/** Whole dollars from the limit down in $5 steps, and the want's own max if it isn't one of them, in cents. */
function maxChoices(w: WantCard): number[] {
  const limit = Math.round(Number(w.limit) * 100);
  const out = new Set<number>([limit]);
  for (let d = Math.floor(limit / 500) * 5; d >= 5; d -= 5) out.add(d * 100);
  out.add(Math.round(Number(w.max) * 100));
  return [...out].filter((c) => c > 0 && c <= limit).sort((a, b) => b - a);
}
const dollars = usd;

/**
 * `saved` counts the Ask box's saves on this page: each one reads the list from the server again. `part` is the view
 * it draws (design B): "wants" on the Desk, the wants themselves; "settings" in Settings, your limits with the dial,
 * "Show me tradeoffs" and what Goose remembers, each with its Forget. Both read the same answer from the server.
 */
export function Wants({ saved, onForgot, onRead, part = "wants" }: { saved: number; onForgot?: (key: string) => void; onRead?: () => void; part?: "wants" | "settings" }) {
  const [got, setGot] = useState<Got | "away" | "offline" | null>(null);
  // Settings draws what comes after the limits (the voice card) once they're read, so nothing on screen moves when they land.
  const read = got !== null;
  useEffect(() => { if (read) onRead?.(); }, [read, onRead]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Each read or change takes a number; only the latest one's answer lands, so a slow read never undoes a newer tap.
  const turn = useRef(0);

  const load = useCallback(async () => {
    const mine = ++turn.current;
    // R-12: offline is the cause the code sees then (live mode's "offline", or a read that failed with onLine false).
    const s = await liveKnown();
    if (s !== "up") { if (mine === turn.current) setGot(s === "offline" ? "offline" : "away"); return; }
    const r = await fetch("/api/runs/wants").catch(() => null);
    const body = r?.ok && (r.headers.get("content-type") ?? "").includes("json") ? (await r.json().catch(() => null)) as Got | null : null;
    if (mine === turn.current) setGot(body && Array.isArray(body.wants) ? body : !r && !navigator.onLine ? "offline" : "away");
  }, []);

  useEffect(() => { void load(); }, [load, saved]);
  // Once she's back, read the list again (the offline note promises it); what's on screen stays while she's offline.
  const off = useLive() === "offline";
  const wasOff = useRef(false);
  // Offline, an "away" note (a server that didn't answer earlier) turns to the offline one: the cause now is her network.
  useEffect(() => { if (off) { wasOff.current = true; setGot((g) => (g === "away" ? "offline" : g)); } else if (wasOff.current) { wasOff.current = false; void load(); } }, [off, load]);

  async function send(path: string, body: object): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const mine = ++turn.current;
    const r = await fetch(path, { ...POST, body: JSON.stringify(body) }).catch(() => null);
    const next = r ? (await r.json().catch(() => null)) as (Got & { error?: string }) | null : null;
    setBusy(false);
    if (next && Array.isArray(next.wants) && mine === turn.current) setGot({ wants: next.wants, kept: next.kept, ...(next.limits ? { limits: next.limits } : {}), ...(Array.isArray(next.dial) ? { dial: next.dial } : {}), ...(typeof next.dialAsks === "string" ? { dialAsks: next.dialAsks } : {}), ...(typeof next.tradeoffs === "boolean" ? { tradeoffs: next.tradeoffs } : {}), ...(Array.isArray(next.memory) ? { memory: next.memory } : {}) });
    if (!r?.ok) setError(typeof next?.error === "string" ? next.error : FAILED);
    return r?.ok === true;
  }
  const change = (w: WantCard, to: { priority?: WantCard["priority"]; max?: number }) =>
    send("/api/runs/wants", { catalogId: w.catalogId, priority: to.priority ?? w.priority, max: to.max ?? Math.round(Number(w.max) * 100) });

  const state = got === null ? "loading" : got === "away" || got === "offline" ? got : got.wants.length ? "some" : "none";
  if (part === "settings") {
    return (
      <>
        <section className="wants scard" aria-labelledby="limits-h" data-state={state}>
          <div className="whead"><h2 id="limits-h">Your limits</h2></div>
          {got === null && <p className="wnote">Reading your settings…</p>}
          {got === "away" && <p className="wnote">{SETTINGS_AWAY}</p>}{got === "offline" && <p className="wnote">{OFFLINE.title} {OFFLINE_SAYS.settings}</p>}
          {got !== null && got !== "away" && got !== "offline" && got.limits && got.limits.length > 0 && <Limits rows={got.limits} dial={got.dial ?? []} asks={got.dialAsks ?? null} busy={busy} set={(category, limit) => void send("/api/runs/limit", { category, limit })} turn={(category, on) => void send("/api/runs/dial", { category, on })} />}
          {error && <p className="aerr" role="alert">{error}</p>}
        </section>
        {got !== null && got !== "away" && got !== "offline" && (
          <section className="wants scard" aria-labelledby="memory-h">
            {/* A2: what Goose remembers, each with one tap to forget it, and one tap to forget everything (the seeded color too). */}
            {got.memory && (
              <div className="wmemory">
                <div className="whead"><h2 id="memory-h">{MEMORY_LABEL}</h2></div>
                <p className="wnote">{MEMORY_SAID}</p>
                {got.memory.length === 0 ? <p className="wempty">{MEMORY_NONE}</p> : (
                  <ul className="wlist">
                    {got.memory.map((m) => (
                      <li key={m.key} className="want" data-memory={m.key === "seeded" ? "seeded" : "yours"}>
                        <div className="wtop"><b>{m.words}</b><button type="button" className="wremove" disabled={busy} aria-label={`Forget ${m.words}`} onClick={() => void send("/api/runs/memory/forget", { key: m.key }).then((ok) => { if (ok) onForgot?.(m.key); })}>Forget</button></div>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="linkish" disabled={busy} onClick={() => void send("/api/runs/memory/forget", { key: "all" }).then((ok) => { if (ok) onForgot?.("all"); })}>{FORGET_ALL}</button>
              </div>
            )}
            {/* §17: her switch for the one honest line beside a cart; it never changes a limit, a want or a buy. */}
            {typeof got.tradeoffs === "boolean" && (
              <label className="wtrade"><input type="checkbox" checked={got.tradeoffs} disabled={busy} onChange={(e) => void send("/api/runs/tradeoffs", { on: e.target.checked })} /> <span><b>{TRADEOFFS_LABEL}</b> {TRADEOFFS_SAID}</span></label>
            )}
            <p className="wnote">{WANTS_KEPT[got.kept]}</p>
          </section>
        )}
      </>
    );
  }
  return (
    <section className="wants" aria-labelledby="wants-h" data-state={state}>
      <div className="whead"><h2 id="wants-h">Your wants</h2></div>
      {got === null && <p className="wnote">Reading your wants…</p>}
      {got === "away" && <p className="wnote">{WANTS_AWAY}</p>}{got === "offline" && <p className="wnote">{OFFLINE.title} {OFFLINE_SAYS.wants}</p>}
      {got !== null && got !== "away" && got !== "offline" && (
        <>
          {got.wants.length === 0 ? <div className="wstate"><p className="wstate-t">{WANTS_EMPTY}</p><p className="wstate-l">{WANTS_LINE}</p><button type="button" className="wstate-go" onClick={toAsk}>{WANTS_GO}</button></div> : (
            <ul className="wlist">
              {got.wants.map((w) => (
                <li key={w.catalogId} className={`want w-${w.priority}`} data-want={w.catalogId}>
                  <div className="wtop"><b>{shown(w.item)}</b><span className="wtag">{w.label}</span></div>
                  {/* The set-aside pile (Joshua, Nov 5, §1a): what the watch compared, then each refused seller named first, as
                      the ladder does; the watch line sits under it. */}
                  {w.pile && <p className="wnote">{w.pile}</p>}
                  {w.warning && <p className="wwarn">{w.warning}</p>}
                  <p className="wwaits">{w.line}</p>
                  {w.history && <p className="wnote whistory">{w.history}</p>}
                  {got.reads?.[w.catalogId] && <Suspense fallback={null}><Read read={got.reads[w.catalogId]!} /></Suspense>}
                  <div className="wacts">
                    {/* A switch with its state on show (Lead-6, slice 5 re-check): on is a really want, off is nice to have. */}
                    <button type="button" role="switch" aria-checked={w.priority === "really"} className="wprio" disabled={busy} aria-label={`Really want: ${shown(w.item)}`} onClick={() => void change(w, { priority: w.priority === "really" ? "nice" : "really" })}>
                      <i className="wknob" aria-hidden="true" />Really want
                    </button>
                    <label className="wmax">Max <select value={Math.round(Number(w.max) * 100)} disabled={busy} onChange={(e) => void change(w, { max: Number(e.target.value) })}>
                      {maxChoices(w).map((c) => <option key={c} value={c}>{dollars(c)}</option>)}
                    </select></label>
                    <button type="button" className="wremove" disabled={busy} aria-label={`Remove ${shown(w.item)} from your wants`} onClick={() => void send("/api/runs/wants/remove", { catalogId: w.catalogId })}>Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="aerr" role="alert">{error}</p>}
          {/* Where they're kept, said once there is something kept (W-8: the empty list is its line and its action). */}
          {got.wants.length > 0 && <p className="wnote">{WANTS_KEPT[got.kept]}</p>}
        </>
      )}
    </section>
  );
}

/**
 * Settings: your limits (§15B reachable), one row per catalog category. The demo's kitchen and events limits are shown,
 * never changed here; a category with no limit of its own says what it's held to and offers one tap to set a first limit; one the
 * shopper set can be changed in $5.00 steps. Only these taps set a limit: no words, want or seller can. Under each limit,
 * the dial (QUEUE M3 "dial proper"): its record from the ledger, a tap to turn it on only at 3 of 3, one tap to turn it
 * back. "On" never spends: the shopper still taps once in PayPal.
 */
function Limits({ rows, dial, asks, busy, set, turn }: { rows: LimitRow[]; dial: DialRow[]; asks: string | null; busy: boolean; set: (category: string, limit: number) => void; turn: (category: string, on: boolean) => void }) {
  return (
    <div className="wlimits">
      <ul className="wlist">
        {rows.map((l) => (
          <li key={l.category} className={l.locked || l.demo || l.own ? "want w-set" : "want"} data-limit={l.category}>
            <div className="wtop"><b>{l.label}</b><span className="wtag">{l.locked || l.demo ? "Set for this demo" : l.own ? "Yours" : "Not set"}</span></div>
            {/* W-8: the value is the fact; the select beside a demo limit already shows it can change. */}
            <p className="wwaits">{l.locked || l.demo ? `${usdOf(l.limit)} per cart.` : l.own ? `${usdOf(l.limit)} per cart, set by you.` : `No limit of its own yet, so Goose holds it to ${usdOf(l.limit)}.`}</p>
            {!l.locked && (
              <div className="wacts">
                {l.suggest !== null && <button type="button" className="linkish" disabled={busy} onClick={() => set(l.category, l.suggest!)}>Set {l.category} to {dollars(l.suggest)}</button>}
                {(l.own || l.demo) && <label className="wmax">Limit <select value={Math.round(Number(l.limit) * 100)} disabled={busy} onChange={(e) => set(l.category, Number(e.target.value))}>
                  {[...l.choices].reverse().map((c) => <option key={c} value={c}>{dollars(c)}</option>)}
                </select></label>}
              </div>
            )}
            {dial.filter((d) => d.category === l.category).map((d) => (
              <div key="dial" className="wdial" data-dial={d.on ? "on" : "off"}>
                <p>{d.said}</p>
                {(d.on || d.canTurnOn) && <button type="button" className="linkish" disabled={busy} onClick={() => turn(l.category, !d.on)}>{d.on ? "Turn back to ask me first" : `Let Goose get ${l.category} carts ready`}</button>}
              </div>
            ))}
          </li>
        ))}
      </ul>
      {/* W-8: the always-asks list is one tap away under its own name (show the limits, explain on a tap). */}
      {asks && <details className="wdasks"><summary>When Goose always asks first ›</summary><p>{asks}</p></details>}
    </div>
  );
}
