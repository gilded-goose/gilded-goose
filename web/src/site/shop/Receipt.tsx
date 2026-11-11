// The receipt, a certificate: what your tap paid and to whom come from the server's settle (useRun's `back`); the limit
// held and the sellers set aside from what this tab saw before PayPal (the `gg-recap:<run>` it wrote), shown only when
// it has them. The egg is the seal. The order id is printed exactly as the server sent it. Undo refunds through PayPal
// while the server says its window is open (`undo` in GET /api/runs/:id, UNDO_KEEP_MINUTES), and only from the tab
// that holds this run's undo key. A run the server can't find is never "Paid". After an Undo the receipt reads the run
// again (read-back.ts), so its headline is the server's card ("Refunded $x"); a failed re-read is the lost-answer state.
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import type { Back } from "../../goose/back.ts";
import { readAfterUndo } from "../../goose/read-back.ts";
import { getJson, postJson } from "../live/api.ts";
import { Button } from "../ui/Button.tsx";
import { Egg } from "../ui/Egg.tsx";
import { ArrowRightIcon } from "../ui/icons.tsx";
import { Provenance } from "../ui/Provenance.tsx";
import { Nest } from "../ui/Nest.tsx";
import { toCents, usdWhole } from "@goose/core/money";
import { readUndoKey } from "./pay.ts";
import { receiptLede, receiptMine, receiptTitle, usd } from "./receipt-words.ts";

// After the payment (AfterPay.tsx) shows only on your own paid receipt, so it loads then, not with the shop. Lost path
// (core/test/lazy-lost.test.ts): if its chunk never comes, one line says so and the receipt above stands.
const AfterPayLost = () => <p className="receipt-lede">Tracking and help after you pay didn't load. Reload this page to see them.</p>;
const AfterPay = lazy(() => import("./AfterPay.tsx").then((m) => ({ default: m.AfterPay }), () => ({ default: AfterPayLost })));

type Undo = { state: "open"; until: number } | { state: "refunded" } | { state: "none" };
type View = { undo?: Undo };

const GOOSE = `${import.meta.env.BASE_URL}site/goose-192.webp`;
const whole = usdWhole;
const clock = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function Receipt({ runId, back: given, mode, onAgain }: { runId: string; back: Back | null; mode: "practice" | "sandbox"; onAgain(): void }) {
  // The server's answer after an Undo replaces PayPal's return's; "checking" while that read is out (headline: checking).
  const [fresh, setFresh] = useState<Back | "checking" | null>(null);
  const back = fresh === "checking" ? null : fresh ?? given;
  const [undo, setUndo] = useState<Undo | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoNote, setUndoNote] = useState<string | null>(null);
  const key = readUndoKey(runId);
  const known = given !== null && !given.gone;

  const look = useCallback(async () => {
    if (!/^[0-9a-f]{12}$/.test(runId)) return;
    const v = await getJson<View>(`/api/runs/${runId}`);
    if (v !== "away" && v.undo) setUndo(v.undo);
  }, [runId]);
  useEffect(() => { if (known) void look(); }, [known, look]);

  const press = async () => {
    if (!key || undoing) return;
    setUndoing(true); setUndoNote(null);
    const r = await postJson<{ ok?: boolean; error?: string }>(`/api/runs/${runId}/undo`, { undoKey: key }, 20_000);
    setUndoing(false);
    if (r === "away") { setUndoNote("Goose's server didn't answer, so nothing was refunded yet. Try Undo again."); return; }
    if (r.ok) { setUndo({ state: "refunded" }); setFresh("checking"); setFresh(await readAfterUndo(runId, given?.recap ?? null)); return; }
    setUndoNote(r.error ?? "The refund didn't go through, so the payment stands.");
    void look();
  };

  // Paid as this browser's own receipt: the server settled it ok, sent no card (a refund, say, has one) and says it's ours.
  // Every other state prints the server's card (receipt-words.ts), and only the owner gets "Your tap", Undo and AfterPay.
  const settledOk = Boolean(back?.ok) && !back?.gone && !back?.lost && !back?.card;
  const mine = receiptMine(back);
  const paid = settledOk && mine;
  const lede = receiptLede(back, mode);
  const recap = paid ? back?.recap : undefined;
  const head = receiptTitle(back, mode);
  const voice = mode === "sandbox"
    ? "Your tap approved it on PayPal's sandbox. No real money moved, and Goose spent nothing on its own."
    : "Your tap approved it on this build's stand-in for PayPal. No money moved, and Goose spent nothing on its own.";

  return (
    <article className="receipt glass" aria-labelledby="receipt-h" data-state={!back ? "checking" : back.gone ? "gone" : paid || settledOk ? (undo?.state === "refunded" ? "refunded" : "paid") : back.card ? "returned" : back.ok === false ? "unpaid" : "waiting"}>
      <header className="receipt-head">
        {paid ? <span className="receipt-seal"><Egg size="m" moment="receipt" {...(recap ? { engraving: `Held · ${whole(recap.limit)}` } : {})} /></span> : null}
        <div className="receipt-words">
          <p className="receipt-k">Receipt</p>
          <h1 id="receipt-h" className="receipt-title" role={back && fresh === null ? undefined : "status"}>{head}</h1>
          {paid ? <p className="receipt-voice">{voice}</p> : null}
        </div>
      </header>

      {paid ? (
        <>
          {recap && back?.total ? <Nest limit={recap.limit} spend={toCents(back.total)} spendWords={mode === "sandbox" ? "approved" : "approved, simulated"} keepWords="stayed yours" /> : null}
          <dl className="receipt-facts">
            {back?.merchant ? <div><dt>To</dt><dd>{back.merchant}</dd></div> : null}
            {back?.item ? <div><dt>For</dt><dd>{back.item}</dd></div> : null}
            {back?.total ? <div className="receipt-total"><dt>Total</dt><dd className="figure">{usd(back.total)}</dd></div> : null}
            {recap ? <div><dt>Your limit</dt><dd><span className="figure">{whole(recap.limit)}</span>, held</dd></div> : null}
            {recap ? <div><dt>Set aside</dt><dd>{recap.refused === 0 ? "No seller" : `${recap.refused} ${recap.refused === 1 ? "seller" : "sellers"}`}</dd></div> : null}
            {back?.orderId ? <div className="receipt-order"><dt>{mode === "sandbox" ? "PayPal sandbox order" : "Practice order (not a PayPal order)"}</dt><dd><code className="receipt-id">{back.orderId}</code></dd></div> : null}
          </dl>
          <div className="receipt-undo">
            {undo?.state === "refunded" ? (
              <p role="status"><b>Undone.</b> {mode === "sandbox" ? "The refund went through PayPal" : "The stand-in reversed it"}{back?.total ? `: ${usd(back.total)} back` : ""}.</p>
            ) : undo?.state === "open" && key ? (
              <>
                <Button tone="line" onClick={() => void press()} disabled={undoing} aria-busy={undoing || undefined}>{undoing ? "Refunding…" : "Undo this payment"}</Button>
                <p>One tap reverses it{mode === "sandbox" ? " through PayPal" : " on the stand-in"}. Open until {clock(undo.until)}.</p>
              </>
            ) : undo?.state === "open" ? (
              <p>Undo is open until {clock(undo.until)}, from the tab that paid.</p>
            ) : null}
            {undoNote ? <p className="shop-fail" role="alert">{undoNote}</p> : null}
          </div>
          <Suspense fallback={null}><AfterPay runId={runId} /></Suspense>
        </>
      ) : null}

      {back?.gone ? <p className="receipt-lede">This server has no record of that run, so it can't say whether anything was paid. If you approved a payment, PayPal's own record has it.</p> : null}
      {!paid && lede ? <p className="receipt-lede">{lede}</p> : null}
      {back && !back.gone && back.ok === null && !back.reason && !back.card ? <p className="receipt-lede">If you approved on PayPal's page, the server settles it on the way back. Nothing is charged without that.</p> : null}

      <footer className="receipt-foot">
        <span className="receipt-mode"><Provenance kind={mode} /><span>{mode === "sandbox" ? "PayPal sandbox: no real money." : "Simulated: no money moved."}</span></span>
        {paid ? <img className="receipt-goose" src={GOOSE} alt="" width={130} height={192} draggable={false} /> : null}
        <Button tone="ink" onClick={onAgain}>Shop for something else<ArrowRightIcon size={18} /></Button>
      </footer>
    </article>
  );
}
