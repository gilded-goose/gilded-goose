// "After you pay" (Joshua, Fri Oct 30, item 1): tracking, Undo for a refund, and "if it never arrives", in one place.
// Its own chunk: the Desk's paid card and its "After you pay" room load it when they show. Every line is core's
// (core/src/view/after.ts) or the server's answer; nothing here promises a time, an amount or an outcome the run view
// doesn't hold. Undo is the shopper's own tap, from the tab that approved the cart (its key never leaves sessionStorage).

import { useEffect, useState } from "react";
import { AFTER_EMPTY, AFTER_PARTS, AFTER_TITLE, DISPUTE_URL, afterView, refundWords, statusWords, type AfterView } from "@goose/core/after";
import { RUN_ID, read, undoSlot } from "./keep.ts";
import "./after.css";
import { OFFLINE, OFFLINE_SAYS } from "../states/words.ts";
import { usdOf } from "@goose/core/money";

const POST = { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" } } as const;
/** The shipping row lands a moment after the settle: look again a few times while it hasn't. */
const WAIT_MS = 2500;
const WAIT_TRIES = 4;
const PARTS = ["tracking", "undo", "never"] as const;

type Load = { kind: "loading" } | { kind: "none" } | { kind: "gone" } | { kind: "error" } | { kind: "offline" } | { kind: "paid"; v: AfterView };

/**
 * `runId`: the run to show (the paid card's, or this tab's last). `room`: the Desk's own room, with its heading and
 * the empty state; on the paid card it's three short parts under the receipt. `onAsk`: the empty state's way to start.
 */
export default function AfterPay({ runId, room, onAsk, headRef }: { runId: string | null; room?: boolean; onAsk?: () => void; headRef?: React.Ref<HTMLHeadingElement> }) {
  const [load, setLoad] = useState<Load>(runId ? { kind: "loading" } : { kind: "none" });
  const [tick, setTick] = useState(0);
  const [tries, setTries] = useState(0);
  const hasKey = runId !== null && read(undoSlot(runId)) !== null;

  useEffect(() => {
    if (!runId || !RUN_ID.test(runId)) { setLoad({ kind: "none" }); return; }
    let live = true;
    fetch(`/api/runs/${runId}`, { credentials: "same-origin" })
      .then(async (r) => {
        if (!live) return;
        if (r.status === 404) { setLoad({ kind: "gone" }); return; }
        const v = afterView(r.ok ? await r.json() : null, hasKey);
        if (live) setLoad(v ? { kind: "paid", v } : { kind: "none" });
      })
      // R-12: a read lost while she is offline names that cause, and is read again once she is back (below).
      .catch(() => { if (live) setLoad({ kind: navigator.onLine ? "error" : "offline" }); });
    return () => { live = false; };
  }, [runId, tick]);

  // R-12: the offline line promises a read once she's back; this is that read (a read only, never a reload).
  const offline = load.kind === "offline";
  useEffect(() => {
    if (!offline) return;
    const on = () => setTick((n) => n + 1);
    addEventListener("online", on);
    return () => removeEventListener("online", on);
  }, [offline]);

  // Tracking still waiting: ask again a few times (the seller's tracking reaches PayPal just after the payment).
  const waiting = load.kind === "paid" && load.v.tracking.kind === "waiting";
  useEffect(() => {
    if (!waiting || tries >= WAIT_TRIES) return;
    const t = setTimeout(() => { setTries((n) => n + 1); setTick((n) => n + 1); }, WAIT_MS);
    return () => clearTimeout(t);
  }, [waiting, tries]);

  const head = room
    ? <h1 id="ap-room-h" ref={headRef} tabIndex={-1} className="ap-h">{AFTER_TITLE}</h1>
    : <h3 id="ap-card-h" className="ap-h ap-h-card">{AFTER_TITLE}</h3>;

  if (load.kind !== "paid") {
    // The paid card shows this only for a paid run, so anything else there is said by the card itself.
    if (!room) return null;
    const lead = load.kind === "loading" ? "Asking the server about this tab's purchase."
      : load.kind === "gone" ? "The server no longer has this tab's last cart, so its tracking and Undo can't be shown here. If you paid, PayPal still has the purchase."
      : load.kind === "error" ? "The server isn't answering right now, so this tab's purchase can't be shown. Nothing changed."
      : load.kind === "offline" ? `${OFFLINE.title} ${OFFLINE_SAYS.after}`
      : AFTER_EMPTY;
    return (
      <section className="ap ap-room" aria-labelledby="ap-room-h" aria-busy={load.kind === "loading" || undefined}>
        {head}
        <p className="ap-lead" role="status">{lead}</p>
        <ul className="ap-parts">
          {PARTS.map((k) => <li key={k} className="ap-part"><h2>{AFTER_PARTS[k].name}</h2><p>{AFTER_PARTS[k].does}</p></li>)}
        </ul>
        {load.kind === "none" && onAsk && <button type="button" className="dk-approve ap-go" onClick={onAsk}>Ask Goose for something</button>}
      </section>
    );
  }

  const v = load.v;
  const H = room ? "h2" : "h4";
  return (
    <section className={`ap ${room ? "ap-room" : "ap-card"}`} aria-labelledby={room ? "ap-room-h" : "ap-card-h"}>
      {head}
      {room && <p className="ap-lead">{[v.item, v.total && `${usdOf(v.total)}`].filter(Boolean).join(" · ")}{v.merchant ? `, from ${v.merchant}` : ""}</p>}
      <div className="ap-parts">
        {v.refund.kind !== "refunded" && <div className="ap-part">
          <H>{AFTER_PARTS.tracking.name}</H>
          <TrackingLine v={v} gaveUp={tries >= WAIT_TRIES} />
          <p className="ap-small">{AFTER_PARTS.tracking.does}</p>
        </div>}
        <div className="ap-part">
          <H>{AFTER_PARTS.undo.name}</H>
          <UndoPart runId={runId!} v={v} onDone={() => setTick((n) => n + 1)} />
        </div>
        <div className="ap-part">
          <H>{AFTER_PARTS.never.name}</H>
          <p>{AFTER_PARTS.never.does}</p>
          {v.sandbox && <p><a className="ap-link" href={DISPUTE_URL.sandbox} target="_blank" rel="noopener noreferrer">Open PayPal's disputes page<span className="dk-sr"> (opens in a new tab)</span> <span aria-hidden="true">›</span></a></p>}
          <AskDisputes runId={runId!} />
        </div>
      </div>
    </section>
  );
}

function TrackingLine({ v, gaveUp }: { v: AfterView; gaveUp: boolean }) {
  const t = v.tracking;
  if (t.kind === "waiting") return <p role="status">{gaveUp ? "PayPal hasn't confirmed the seller's tracking yet. Open this again in a moment." : "Waiting on the seller's tracking."}</p>;
  if (t.kind === "unconfirmed") return <p role="status">{t.why}</p>;
  const s = statusWords(t.status);
  return <p role="status">PayPal holds tracking number <span className="ap-mono">{t.number}</span> ({t.carrier}){s ? `, marked ${s}` : ""}.</p>;
}

/** Undo: the shopper's tap refunds through PayPal, by this tab's key; the window's close in local time. */
function UndoPart({ runId, v, onDone }: { runId: string; v: AfterView; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = v.refund;
  const clock = r.kind === "open" && Number.isFinite(r.until) && r.until > 0 ? new Date(r.until).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;
  async function undo() {
    const key = read(undoSlot(runId));
    if (!key || busy) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/runs/${runId}/undo`, { ...POST, body: JSON.stringify({ undoKey: key }) }).catch(() => null);
    const body = ((await res?.json().catch(() => null)) ?? {}) as { ok?: unknown; error?: unknown };
    setBusy(false);
    if (res?.ok && body.ok === true) { onDone(); return; }
    setError(typeof body.error === "string" ? body.error : "The refund didn't go through. Nothing changed; try Undo again.");
  }
  return (
    <>
      <p role="status">{refundWords(r, v.total, clock)}</p>
      {r.kind === "open" && r.here && (
        <button type="button" className="dk-btn2 ap-undo" onClick={() => void undo()} aria-disabled={busy || undefined} aria-busy={busy || undefined}>
          {busy ? "Refunding…" : `Undo: refund ${v.total ? `${usdOf(v.total)}` : "this payment"}`}
        </button>
      )}
      <p className="ap-err" role="alert">{error ?? ""}</p>
      <p className="ap-small">{AFTER_PARTS.undo.does}</p>
    </>
  );
}

/** "What does PayPal list?": one read-only look at PayPal's disputes on this purchase, in the server's fixed words. */
function AskDisputes({ runId }: { runId: string }) {
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function ask() {
    if (busy) return;
    setBusy(true); setSaid(null); setError(null);
    const r = await fetch(`/api/runs/${runId}/disputes`, { ...POST, body: "{}" }).catch(() => null);
    const body = ((await r?.json().catch(() => null)) ?? {}) as { words?: unknown; cached?: unknown; error?: unknown };
    setBusy(false);
    if (r?.ok && typeof body.words === "string") setSaid(`${body.cached === true ? "Asked a moment ago: " : ""}${body.words}`);
    else setError(typeof body.error === "string" ? body.error : "PayPal couldn't be asked just now. Try again.");
  }
  return (
    <div className="ap-ask">
      <button type="button" className="ap-link" onClick={() => void ask()} aria-disabled={busy || undefined} aria-busy={busy || undefined}>{busy ? "Asking PayPal…" : "What does PayPal list on this purchase?"} <span aria-hidden="true">›</span></button>
      <p role="status">{said ?? ""}</p>
      <p className="ap-err" role="alert">{error ?? ""}</p>
    </div>
  );
}
