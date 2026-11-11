// One try's detail (Joshua, Nov 4: "click a try for its detail: the note's rule, layer, the reason in plain words, and its
// ledger rows"). The ledger's own sheet: a native <dialog>, so focus stays inside, Escape closes it and focus returns to the row.
// Every line is one of the row's five stored fields or a closed list's words, so a person's note can't reach it: the row doesn't hold one.

import { useContext, useEffect, useMemo, useRef } from "react";
import { StudioDataContext } from "./data.ts";
import { ledgerForRule, type Source, type TryRow } from "./threat-model.ts";
import { TRIES_NOTE, TRY_LEDGER_HEAD, TRY_LEDGER_NONE, TRY_LEDGER_NOTE, TRY_SIDE_REAL, TRY_SIDE_SEEDED } from "./threat-words.ts";

const SHOWN = 6;

export default function TrySheet({ row, source, who, onClose }: { row: TryRow; source: Source; who: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const back = useRef<Element | null>(null);
  // Studio's page has the ledger; the Community page's board has no ledger rows beside it, so the section isn't there.
  const ledger = useContext(StudioDataContext)?.rows ?? null;
  const cited = useMemo(() => (ledger ? ledgerForRule(ledger, row.rule, source) : []), [ledger, row.rule, source]);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) { back.current = document.activeElement; d.showModal(); }
  }, []);
  const close = () => {
    onClose();
    const b = back.current;
    if (b instanceof HTMLElement && b.isConnected) requestAnimationFrame(() => { if (document.activeElement === document.body) b.focus(); });
  };
  return (
    <dialog ref={ref} className="lx-sheet tb-try-sheet" aria-labelledby="tb-sheet-h" data-try-sheet={row.rule} onClose={close} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); ref.current?.close(); } }} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <div className="lx-sheet-in">
        <div className="lx-sheet-top">
          <p className="lx-sheet-kind">{source === "demo" ? "Seeded demo week" : "Real try"} · {row.when}</p>
          <button type="button" className="lx-x" aria-label="Close" onClick={() => ref.current?.close()}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <h2 id="tb-sheet-h">{row.typeWords}</h2>
        <p className="lx-sheet-did"><span className={`tb-v tb-v-${row.verdict}`}><i aria-hidden="true" />{row.verdictWords}</span></p>
        <dl className="lx-facts">
          <div className="lx-why"><dt>The reason</dt><dd>{row.ruleWords}</dd></div>
          <div><dt>Which layer decided</dt><dd>{row.by}</dd></div>
          <div><dt>Which rule</dt><dd className="lx-mono">{row.rule}</dd></div>
          {who && <div><dt>Who tried</dt><dd>{row.who}</dd></div>}
          <div><dt>From</dt><dd>{source === "demo" ? TRY_SIDE_SEEDED : TRY_SIDE_REAL}</dd></div>
          <div><dt>What's kept</dt><dd>{TRIES_NOTE}</dd></div>
        </dl>
        {ledger && (
          <section aria-labelledby="tb-sheet-l" data-try-ledger={cited.length}>
            <h3 id="tb-sheet-l" className="lx-sheet-kind">{TRY_LEDGER_HEAD}</h3>
            {cited.length === 0 ? <p className="tb-sub">{TRY_LEDGER_NONE}</p> : (
              <>
                <p className="tb-sub">{TRY_LEDGER_NOTE}</p>
                <ol className="tb-try-sheet-rows">
                  {cited.slice(0, SHOWN).map((r) => <li key={r.id}><b>{r.who}</b> <span>{r.did} · {r.layer}</span></li>)}
                </ol>
                {cited.length > SHOWN && <p className="tb-sub">And {cited.length - SHOWN} more on the ledger.</p>}
              </>
            )}
          </section>
        )}
      </div>
    </dialog>
  );
}
