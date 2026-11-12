// PayPal additions 4 (ADR 0013): PayPal's own Pay Later message beside Approve, loaded after first paint. The page asks
// the server for the public client id (GET /api/config), then loads PayPal's v6 SDK from PayPal. Anything that doesn't
// answer leaves no message, never a made-up one, and our line under it shows only once PayPal's message has content.
import { createElement, useEffect, useRef, useState } from "react";
import { PAY_LATER_SDK, PAY_LATER_YOURS, payLaterAmount } from "@goose/core/paylater";

interface PayPalV6 { createInstance(o: { clientId: string; components: string[]; pageType?: string }): Promise<{ createPayPalMessages(o?: { currencyCode?: string }): unknown }> }

let ready: Promise<boolean> | null = null;

/** Loads PayPal's script and starts its messages once per page; false when any step doesn't answer, and then a later
 *  mount asks again (a sleeping server or a dropped script mustn't cost the message for the whole visit). */
function loadMessages(): Promise<boolean> {
  ready ??= (async () => {
    const r = await fetch("/api/config").catch(() => null);
    const cfg = r?.ok && (r.headers.get("content-type") ?? "").includes("json") ? ((await r.json().catch(() => null)) as { payLater?: { clientId?: unknown } | null } | null) : null;
    const clientId = typeof cfg?.payLater?.clientId === "string" ? cfg.payLater.clientId : null;
    if (!clientId) return false;
    const loaded = await new Promise<boolean>((done) => {
      const s = document.createElement("script");
      s.src = PAY_LATER_SDK; s.async = true;
      s.onload = () => done(true); s.onerror = () => { s.remove(); done(false); };
      document.head.appendChild(s);
    });
    const paypal = (window as { paypal?: PayPalV6 }).paypal;
    if (!loaded || !paypal) return false;
    const sdk = await paypal.createInstance({ clientId, components: ["paypal-messages"], pageType: "checkout" });
    sdk.createPayPalMessages({ currencyCode: "USD" });
    return true;
  })().catch(() => false).then((ok) => { if (!ok) ready = null; return ok; });
  return ready;
}

/** Whether PayPal wrote any words: text outside <style> and <script>, so a styled but empty element never counts. */
function words(root: Node): boolean {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const tag = n.parentElement?.tagName;
    if (tag !== "STYLE" && tag !== "SCRIPT" && (n.textContent ?? "").trim()) return true;
  }
  return false;
}

/** Said in the box when PayPal sends no message (no client id, no script, or not eligible): the menu's Pay Later lands
 *  here (`#paylater`, S1-3), so the spot says what goes in it, and never a made-up offer. */
export const PAY_LATER_NONE = "PayPal sent no Pay Later offer.";

/** How long PayPal's loaded script gets to write its message before the box says it sent none. */
const QUIET_MS = 2500;

export function PayLater({ total }: { total: string }) {
  const amount = payLaterAmount(total);
  const [on, setOn] = useState(false);
  const [shown, setShown] = useState(false);
  // PayPal sent nothing: the config, the script or its eligibility didn't answer (or no words came in QUIET_MS).
  const [quiet, setQuiet] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!amount) return;
    let live = true;
    setQuiet(false);
    // After first paint: the SDK never holds up the first screen (ADR 0013).
    const t = setTimeout(() => void loadMessages().then((ok) => { if (live) { setOn(ok); setQuiet(!ok); } }), 0);
    return () => { live = false; clearTimeout(t); };
  }, [amount]);
  useEffect(() => {
    setShown(false);
    const el = box.current?.firstElementChild;
    if (!on || !el) return;
    // PayPal writes words into its element only when the amount is eligible; our line waits for them, so it never
    // stands alone. Its shadow root is open, and a mutation fires even when the tab isn't painting.
    const root = el.shadowRoot ?? el;
    const check = () => setShown(words(root));
    const mo = new MutationObserver(check);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    check();
    const t = setTimeout(() => setQuiet(!words(root)), QUIET_MS);
    return () => { mo.disconnect(); clearTimeout(t); };
  }, [on, amount]);
  if (!amount) return null;
  // PayPal's text takes one of its own colors, white, since the wallet is always the Desk's dark velvet (Desk-J2). Only
  // the option is ours: PayPal's element, its words and its colors are never restyled.
  return (
    <div className="wlater" id="paylater" ref={box}>
      {/* Until the answer comes, this spot holds the height of its quiet line, so what's under Approve doesn't jump up and back. */}
      {!on && !quiet && <p className="wlater-none" aria-hidden="true">{"\u00a0"}</p>}
      {on && createElement("paypal-message", { amount, "currency-code": "USD", "auto-bootstrap": "", "text-color": "white", "logo-position": "inline" })}
      <p className="wlater-yours" role="status">{shown ? PAY_LATER_YOURS : ""}</p>
      {/* A plain line, not the status: it isn't news, only what this spot is for. */}
      {quiet && !shown && <p className="wlater-none">{PAY_LATER_NONE}</p>}
    </div>
  );
}
