// The row's full story (Joshua: "tap a row → a smooth side sheet with the full story: who, what, why, which rule"):
// our own sheet, not Enterprise master/detail. A native <dialog> opened with showModal(), so the browser traps focus,
// Escape closes it, the page behind is inert, and closing returns focus to whatever opened it (a grid cell or a card).
// It slides in from the right on desktop and rises from the bottom on a phone, in 320 ms with no overshoot; under
// reduced motion it simply appears. Every line is one of the row's own fields; nothing is inferred.

import { useEffect, useRef } from "react";
import { watchRuleWords, type LedgerRow } from "@goose/core/session";
import { Amount, KIND_ONE, PayPalMark, timeOf } from "./marks.tsx";
import { didWords, fromSheet, whoWords } from "./rows.ts";

/**
 * `paypal`: the PayPal rows of this row's own visit, each one a row the sheet can move to (Studio's audit log). `onRow`
 * moves it. Leave them out and the sheet is the row's alone.
 */
export function RowSheet({ row, onClose, paypal, onRow }: { row: LedgerRow | null; onClose: () => void; paypal?: readonly LedgerRow[]; onRow?: (r: LedgerRow) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const back = useRef<Element | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (row && !d.open) { back.current = document.activeElement; d.showModal(); }
    else if (!row && d.open) d.close();
  }, [row]);

  const close = () => {
    onClose();
    // The browser restores focus on close; a grid cell may have been redrawn meanwhile, so make sure it lands.
    const b = back.current;
    if (b instanceof HTMLElement && b.isConnected) requestAnimationFrame(() => { if (document.activeElement === document.body) b.focus(); });
  };

  const r = row;
  return (
    <dialog ref={ref} className="lx-sheet" aria-labelledby="lx-sheet-h" onClose={close} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); ref.current?.close(); } }} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      {r && (
        <div className="lx-sheet-in">
          <div className="lx-sheet-top">
            <p className="lx-sheet-kind">{KIND_ONE[r.kind]}{r.part === "week" ? ` · ${r.source === "seeded" ? "Seeded row" : `Recorded run, row ${r.seq}`}` : ` · row ${r.seq}`}</p>
            <button type="button" className="lx-x" aria-label="Close" onClick={() => ref.current?.close()}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </div>
          <h2 id="lx-sheet-h">{whoWords(r)}</h2>
          <p className="lx-sheet-did">{didWords(r)}{r.price ? <> · <Amount r={r} /></> : null}</p>
          <PayPalMark r={r} />
          {r.kind === "skipped" && <p className="lx-protect">Goose set this seller aside. The guard refuses any cart from it, in code.</p>}
          <dl className="lx-facts">
            <div className="lx-why"><dt>Why</dt><dd>{r.why}</dd></div>
            {r.quoted && <div><dt>The seller's own words, quoted and never followed</dt><dd><q>{r.quoted}</q></dd></div>}
            {r.fenced && <div><dt>Held back from the reason</dt><dd><q>{r.fenced}</q></dd></div>}
            {/* The check that wrote it, in the same words as Every decision's Check column ("5 · The dial"); a rule only when the row names one. */}
            <div><dt>Which check</dt><dd>{r.layer}</dd></div>
            {r.rule && <div><dt>Which rule</dt><dd>{r.actor === "watcher" ? r.rule.split(", ").map(watchRuleWords).map((w, i) => (i ? `${w.charAt(0).toLowerCase()}${w.slice(1)}` : w)).join(", ") : r.rule}</dd></div>}
            <div><dt>Who wrote it</dt><dd>{r.source === "seeded" && r.part === "week" ? "The demo's seed, standing in for a PayPal capture: simulated, no money moved" : r.who}</dd></div>
            <div><dt>When</dt><dd>{r.part === "week" ? "In the demo week; no time in your session" : `${timeOf(r)} UTC`}</dd></div>
            <div><dt>From</dt><dd>{fromSheet(r)}{r.run && r.part === "session" ? <span className="lx-dim"> · run {r.run}</span> : null}</dd></div>
            {r.label && <div><dt>The agent's move</dt><dd>{r.label}</dd></div>}
            {r.eventId && <div><dt>PayPal event</dt><dd className="lx-mono">{r.eventId}</dd></div>}
          </dl>
          {paypal && paypal.length > 0 && (
            <section aria-labelledby="lx-sheet-pp" data-sheet-paypal={paypal.length}>
              <h3 id="lx-sheet-pp" className="lx-sheet-kind">PayPal rows in this visit</h3>
              <ol className="lx-sheet-pp">
                {paypal.map((p) => <li key={p.id}><button type="button" onClick={() => onRow?.(p)}><b>{p.who}</b> <span>{p.did}</span>{p.eventId ? <span className="lx-mono"> {p.eventId}</span> : null} <PayPalMark r={p} /></button></li>)}
              </ol>
            </section>
          )}
        </div>
      )}
    </dialog>
  );
}
