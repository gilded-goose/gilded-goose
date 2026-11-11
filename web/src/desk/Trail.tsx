// S1-4 "Show the engineering" (Round 0, Technical 8: "the live deal card shows none of it"). What PayPal and code did
// with one cart: PayPal's order id, the steps as the guard took them (held → re-checked → captured, or voided), PayPal's
// signed word once its webhook lands, and the cart's mark. Every value is a ledger row's (`core/src/view/trail.ts`);
// nothing is typed here. Its own chunk, loaded by the deal card once the run is done and the card PayPal's return lands on.
//
//   <Trail runId>          the run's rows from `GET /api/runs/:id`, asked again while PayPal's webhook hasn't landed
//   <Trail intent>         on the deal card before the tap (S1-6, the Round 2 judges' top fix): the steps ahead on the
//                          card's face, in a chevron row like "Before you approve" (the DD, DK check 2), open; their
//                          plain words live in "Before you approve" (Desk.tsx); no cart mark yet, since the guard binds
//                          the cart only at the tap
//   <Trail hash intent>    on the deal card after Approve, before PayPal is asked: the cart's mark and the steps ahead

import { useEffect, useMemo, useRef, useState } from "react";
import { TRAIL_WORDS, payAhead, payTrail, shortId, signedWords, stepsAhead, type Trail as T } from "@goose/core/trail";
import "./trail.css";

/** PayPal's signed word usually lands seconds after the capture: ask again this often, this many times, then say so. */
const WAIT_MS = 3000;
const WAIT_TRIES = 10;
const RUN_ID = /^[0-9a-f]{12}$/;

/** `practice`: the server says PAYMENT=fake, so the signature is its practice PayPal's, and the words say so. */
/** `intent`: the server's (`/api/health`), so a CAPTURE cart never shows a Held step. `orderId`: the run's own, shown
 *  with Copy if the rows can't be read (the receipt always named it). */
type Props = ({ runId: string; hash?: never; orderId?: string | null } | { runId?: never; hash?: string | undefined; orderId?: never }) & { intent: unknown; practice?: boolean };

export default function Trail(p: Props) {
  const [rows, setTrail] = useState<T | null>(null);
  const [tries, setTries] = useState(0);
  // The deal card's trail follows its props: the server's intent arrives after the card, and the cart's hash at the tap.
  const ahead = useMemo(() => (p.runId ? null : p.hash ? payAhead(p.intent, p.hash) : stepsAhead(p.intent)), [p.runId, p.hash, p.intent]);
  const trail = p.runId ? rows : ahead;

  useEffect(() => {
    if (!p.runId || !RUN_ID.test(p.runId)) return;
    let live = true;
    fetch(`/api/runs/${p.runId}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { events?: unknown; bound?: { hash?: unknown } | null } | null) => { if (live && v) setTrail(payTrail(v.events, v.bound?.hash, p.intent)); })
      .catch(() => {});
    return () => { live = false; };
  }, [p.runId, tries, p.intent]);

  // Paid and PayPal's webhook not here yet: look again a few times (it lands in this run's ledger when PayPal sends it).
  const waiting = Boolean(p.runId && trail?.paid && !trail.signed);
  useEffect(() => {
    if (!waiting || tries >= WAIT_TRIES) return;
    const t = setTimeout(() => setTries((n) => n + 1), WAIT_MS);
    return () => clearTimeout(t);
  }, [waiting, tries]);

  // The rows couldn't be read (or hold no order yet): the run's own order id still shows, as the receipt always did.
  if (!trail) return p.orderId ? (
    <section className="tl" aria-label={TRAIL_WORDS.order}>
      <dl className="tl-rows"><div className="tl-row"><dt>{TRAIL_WORDS.order}</dt><dd className="tl-order"><span className="tl-mono" title={p.orderId}>{shortId(p.orderId)}</span><Copy text={p.orderId} /></dd></div></dl>
    </section>
  ) : null;
  const before = trail.orderId === null;
  const last = trail.steps.at(-1);
  const rowsDl = (
      <dl className="tl-rows">
        {trail.orderId !== null && (
          <div className="tl-row">
            <dt>{TRAIL_WORDS.order}</dt>
            <dd className="tl-order"><span className="tl-mono" title={trail.orderId}>{shortId(trail.orderId)}</span><Copy text={trail.orderId} /></dd>
          </div>
        )}
        <div className="tl-row">
          {/* Before the tap the section's own head names the steps (the DD, S1-7: no "Steps" label on the deal card); the
              label stays for a screen reader, so the list keeps its name. */}
          <dt className={before ? "dk-sr" : undefined}>{TRAIL_WORDS.steps}</dt>
          <dd>
            <ol className="tl-steps" aria-label={trail.steps.map((s) => `${s.label}: ${STATE[s.state]}`).join(", ")}>
              {trail.steps.map((s) => (
                // S1-10 (the DD, replacing S1-6's rings: a hollow circle beside a word read as a radio button): drawn
                // like the stage header, words on its hairline connector; a done step alone carries the 6 px dot.
                <li key={s.key} className={`tl-step tl-${s.state}`} aria-hidden="true">
                  {s.state === "done" && <span className="tl-dot" />}
                  <span className="tl-word">{s.label}</span>
                </li>
              ))}
            </ol>
            {/* The void's or the stop's own row, in the guard's fixed words; PayPal's text never reaches here. */}
            {trail.why && last?.state !== "next" && <p className="tl-why">{trail.why}</p>}
          </dd>
        </div>
        {!before && (
          <div className="tl-row">
            <dt>{TRAIL_WORDS.word}</dt>
            <dd><div role="status">{signedWords(trail, tries >= WAIT_TRIES, p.practice)}{trail.signed && <span className="tl-ev">{TRAIL_WORDS.signedBy} · <span className="tl-mono">{trail.signed.eventType || "event"}</span> <span className="tl-nb">· <span className="tl-mono">{shortId(trail.signed.eventId)}</span></span></span>}</div></dd>
          </div>
        )}
        {trail.cart && (
          <div className="tl-row">
            <dt>{TRAIL_WORDS.cart}</dt>
            <dd><span className="tl-mono">{trail.cart}</span>, {trail.approved ? TRAIL_WORDS.exact : TRAIL_WORDS.sent}</dd>
          </div>
        )}
      </dl>
  );
  // DK (the DD, check 2): on the deal card the steps ahead are a chevron row like "Before you approve", open, so the
  // steps stay on the card's face; what they mean and what the tap seals sit in "Before you approve" (Desk.tsx).
  if (before) return (
    <details open className="tl tl-ahead tl-fold dk-before">
      <summary><span id="tl-h">{TRAIL_WORDS.ahead}</span><i aria-hidden="true" /></summary>
      {rowsDl}
    </details>
  );
  return (
    <section className="tl" aria-labelledby="tl-h">
      {/* S1-9: the run's head is now its h1 (Round 3's a11y fix 5), so this reads as the level under it; the tag (and its
          styles) stay. */}
      <h3 id="tl-h" className="tl-h" aria-level={2}>{TRAIL_WORDS.title}</h3>
      {rowsDl}
    </section>
  );
}

const STATE = { done: "done", next: "next", stopped: "stopped" } as const;

/** Copy PayPal's order id; where the clipboard is refused, the id is selected instead so a long-press or Cmd+C takes it. */
function Copy({ text }: { text: string }) {
  const [said, setSaid] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy(e: React.MouseEvent<HTMLButtonElement>) {
    const id = e.currentTarget.previousElementSibling;
    try { await navigator.clipboard.writeText(text); setSaid(true); clearTimeout(timer.current); timer.current = window.setTimeout(() => setSaid(false), 2000); }
    catch { if (id) { const r = document.createRange(); r.selectNodeContents(id); getSelection()?.removeAllRanges(); getSelection()?.addRange(r); } }
  }
  return (
    <>
      <button type="button" className="tl-copy" onClick={(e) => void copy(e)} aria-label={`${TRAIL_WORDS.copy} PayPal's order id`}>{said ? TRAIL_WORDS.copied : TRAIL_WORDS.copy}</button>
      <span className="dk-sr" role="status">{said ? TRAIL_WORDS.copied : ""}</span>
    </>
  );
}
