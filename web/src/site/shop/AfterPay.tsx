// "After you pay" on the receipt (Joshua's feature, Oct 30): what PayPal holds for tracking, and where a purchase that never
// arrives goes. Undo is the receipt's own button, so it isn't repeated here. Every sentence is core's (core/src/view/after.ts,
// core/src/disputes.ts) or the server's own answer; it promises no time, amount or outcome the run view doesn't hold.
import { useEffect, useState } from "react";
import { AFTER_PARTS, AFTER_TITLE, DISPUTE_URL, afterView, statusWords, type AfterView } from "@goose/core/after";
import { getJson, postJson } from "../live/api.ts";

type Load = "loading" | "none" | AfterView;

const WAIT_MS = 2500;
const WAIT_TRIES = 4;

function trackingLine(v: AfterView, gaveUp: boolean): string {
  const t = v.tracking;
  if (t.kind === "waiting") return gaveUp ? "PayPal hasn't confirmed the seller's tracking yet. Open this again in a moment." : "Waiting on the seller's tracking.";
  if (t.kind === "unconfirmed") return t.why;
  const s = statusWords(t.status);
  return `${v.sandbox ? "PayPal" : "The stand-in"} holds tracking number ${t.number} (${t.carrier})${s ? `, marked ${s}` : ""}.`;
}

export function AfterPay({ runId }: { runId: string }) {
  const [load, setLoad] = useState<Load>("loading");
  const [tick, setTick] = useState(0);
  const [asked, setAsked] = useState<{ said?: string; error?: string; busy: boolean }>({ busy: false });

  useEffect(() => {
    let live = true;
    void getJson<Record<string, unknown>>(`/api/runs/${runId}`).then((r) => {
      if (!live) return;
      setLoad(r === "away" ? "none" : afterView(r, false) ?? "none");
    });
    return () => { live = false; };
  }, [runId, tick]);

  const waiting = typeof load === "object" && load.tracking.kind === "waiting";
  useEffect(() => {
    if (!waiting || tick >= WAIT_TRIES) return;
    const t = setTimeout(() => setTick((n) => n + 1), WAIT_MS);
    return () => clearTimeout(t);
  }, [waiting, tick]);

  async function askDisputes() {
    if (asked.busy) return;
    setAsked({ busy: true });
    const r = await postJson<{ words?: string; cached?: boolean; error?: string }>(`/api/runs/${runId}/disputes`, {});
    if (r === "away" || r.error || typeof r.words !== "string") setAsked({ busy: false, error: r !== "away" && r.error ? r.error : "PayPal couldn't be asked just now. Try again." });
    else setAsked({ busy: false, said: `${r.cached ? "Asked a moment ago: " : ""}${r.words}` });
  }

  if (typeof load !== "object") return null;
  return (
    <section className="after" aria-labelledby="after-h">
      <h2 id="after-h" className="after-h">{AFTER_TITLE}</h2>
      <div className="after-part">
        <h3>{AFTER_PARTS.tracking.name}</h3>
        <p role="status">{trackingLine(load, tick >= WAIT_TRIES)}</p>
        <p className="after-small">{load.sandbox ? AFTER_PARTS.tracking.does : "Practice mode: no PayPal call was made, so this is the stand-in's own record. Nothing physical ships."}</p>
      </div>
      <div className="after-part">
        <h3>{AFTER_PARTS.never.name}</h3>
        {load.sandbox ? (
          <>
            <p>{AFTER_PARTS.never.does}</p>
            <p><a href={DISPUTE_URL.sandbox} target="_blank" rel="noopener noreferrer">Open PayPal's disputes page<span className="vh"> (opens in a new tab)</span></a></p>
            <p><button type="button" className="after-ask" onClick={() => void askDisputes()} aria-busy={asked.busy || undefined}>{asked.busy ? "Asking PayPal…" : "What does PayPal list on this purchase?"}</button></p>
            <p role="status">{asked.said ?? ""}</p>
            {asked.error ? <p className="shop-fail" role="alert">{asked.error}</p> : null}
          </>
        ) : <p>Nothing was paid at PayPal in practice mode, so there is no PayPal dispute to open.</p>}
      </div>
    </section>
  );
}
