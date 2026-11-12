// Spending against limits, drawn (Track D). Self-contained, so the Behind the scenes page and an AG Studio widget can
// each mount it unchanged: data in as a prop (`spendLimits(events)`, spend.ts), sized by its container (a container
// query, never the window), its own question and text alternative. HTML, not a canvas: a few marks on one dollar scale,
// with numbers in tabular figures beside them, need no chart library.
//
// Each category's row is a track from $0 to that category's per-cart limit; each paid cart is a dot on it. The week's row
// is a bar of what the guard counts this week, up to the weekly limit. Every row shares one scale, so $60 is the same
// length in every row and the weekly limit's track is visibly longer than any one cart's.

import type { SpendLimitsData } from "./spend.ts";
import { HowThisWorks } from "../ledger/How.tsx";
import "./charts.css";

const at = (cents: number, scale: number) => `${Math.min(100, (cents / scale) * 100)}%`;

export function SpendLimits({ s }: { s: SpendLimitsData }) {
  // The week's row draws whenever the guard counts anything, even with no paid cart left (a refund doesn't free room).
  const w = s.week;
  const empty = s.categories.length === 0 && (w?.cents ?? 0) === 0;
  return (
    <figure className="gc-sl" aria-labelledby="gc-sl-q">
      <h3 id="gc-sl-q">How close did each payment come to its limit?</h3>

      {!empty && (
        <div className="gc-sl-rows" aria-hidden="true">
          {s.categories.map((r) => {
            const top = Math.max(...r.carts.map((c) => c.cents));
            return (
              <div className="gc-sl-row" key={r.key}>
                <p className="gc-sl-label">{r.label}<span>each cart up to {r.limitWords}</span></p>
                <div className="gc-sl-track">
                  <span className="gc-sl-room" style={{ width: at(r.limitCents, s.scaleCents) }} />
                  <span className="gc-sl-limit" style={{ left: at(r.limitCents, s.scaleCents) }} />
                  {r.carts.map((c, i) => <span className="gc-sl-cart" key={i} style={{ left: at(c.cents, s.scaleCents) }} />)}
                </div>
                <p className="gc-sl-num">{r.carts.length > 1 ? `${r.carts.length} carts, top ` : ""}{r.carts.find((c) => c.cents === top)!.words} <span>of {r.limitWords}</span></p>
              </div>
            );
          })}
          {w && (
            <div className="gc-sl-row gc-sl-week">
              <p className="gc-sl-label">This week<span>all carts, any 7 days</span></p>
              <div className="gc-sl-track">
                <span className="gc-sl-room" style={{ width: at(w.limitCents, s.scaleCents) }} />
                <span className="gc-sl-used" style={{ width: at(w.cents, s.scaleCents) }} />
                <span className="gc-sl-limit" style={{ left: at(w.limitCents, s.scaleCents) }} />
              </div>
              <p className="gc-sl-num">{w.words} <span>of {w.limitWords}</span></p>
            </div>
          )}
        </div>
      )}
      <figcaption>{s.summary}</figcaption>
      {/* AS-15: how the two limits differ is one tap away; the footer and the nav carry "Practice only". */}
      <HowThisWorks about="spending against limits"><p>A category's limit caps one cart; the weekly limit caps them all together.</p></HowThisWorks>
    </figure>
  );
}
