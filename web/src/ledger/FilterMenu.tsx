// The ledger's one filter row keeps only search in view; who-wrote-it lives here, in a Filter menu (Track L; Joshua,
// Fri Oct 30: "One filter row; the rest in a Filter menu"). A disclosure, not a modal: the button says how many filters
// are on, the panel holds one toggle per writer with its row count (a writer with no rows is off), and Escape, a click
// outside or tabbing out closes it; Escape puts focus back on the button. The chips are core's (`LEDGER_CHIPS`), filtered by the grid's own external filter.

import { useEffect, useId, useRef, useState } from "react";
import { LEDGER_CHIPS, type LedgerChip } from "@goose/core/session";
import { SEED_WHO } from "./rows.ts";

/** The toggle's name: core's chip label, except the seeded row's, named as its own Who cell names it (DD, CD-1). */
const nameOf = (c: (typeof LEDGER_CHIPS)[number]) => (c.key === "seeded" ? SEED_WHO : c.label);

export function FilterMenu({ picked, counts, onToggle, onClear }: {
  picked: ReadonlySet<LedgerChip>; counts: Readonly<Record<LedgerChip, number>>; onToggle: (k: LedgerChip) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    box.current?.querySelector<HTMLButtonElement>(".lx-fm-item:not(:disabled)")?.focus({ preventScroll: true });
    // On a phone the open panel ran under the bottom rail's fade ("Show every row" at y ~1555 of 1688; DD, CD-1): bring
    // the whole panel into view, its foot a rail and --s-2 above the screen's (scroll-margin-bottom, ledger.css).
    if (window.matchMedia("(max-width: 720px)").matches) panel.current?.scrollIntoView({ block: "nearest" });
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const on = picked.size;
  return (
    <div className="lx-fm" ref={box} onBlur={(e) => { const to = e.relatedTarget as Node | null; if (open && to && !box.current?.contains(to)) setOpen(false); }}>
      <button type="button" ref={btn} className="lx-filter-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13M6 10h8M8.5 14.5h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        Filter{on > 0 && <span className="lx-filter-on">{on} on</span>}
      </button>
      <div className="lx-fm-panel" ref={panel} id={id} hidden={!open} role="group" aria-label="Show rows written by">
        <p className="lx-fm-h" aria-hidden="true">Show rows written by</p>
        {LEDGER_CHIPS.map((c) => (
          <button key={c.key} type="button" className="lx-fm-item" aria-pressed={picked.has(c.key)} onClick={() => onToggle(c.key)} disabled={counts[c.key] === 0 && !picked.has(c.key)} aria-label={`${nameOf(c)}, ${counts[c.key]} ${counts[c.key] === 1 ? "row" : "rows"}`}>
            <span className="lx-fm-box" aria-hidden="true" />
            <span className="lx-fm-label">{nameOf(c)}</span>
            <span className="lx-num lx-fm-n" aria-hidden="true">{counts[c.key]}</span>
          </button>
        ))}
        <button type="button" className="lx-fm-clear" onClick={onClear} disabled={on === 0}>Show every row</button>
      </div>
    </div>
  );
}
