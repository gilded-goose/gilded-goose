// The year view (Track X): Goose's plan for each gift, a price dot per month. Its own chunk, fetched once the list has
// gifts. A real table, so a screen reader hears every month's simulated price; the words are all code's (core `yearPlan`).

import { useEffect, useState } from "react";
import type { PlanMonth, YearView } from "@goose/core/year-plan";
import "./year.css";
import { usdOf } from "@goose/core/money";

/** Each dot's height within its own gift's prices: dots, not bars, so the row can zoom in on a small swing honestly. */
function place(months: readonly PlanMonth[], m: PlanMonth): number {
  const prices = months.flatMap((x) => (x.cents === null ? [] : [x.cents]));
  const lo = Math.min(...prices), hi = Math.max(...prices);
  return hi === lo ? 50 : ((m.cents! - lo) / (hi - lo)) * 100;
}

export default function Year({ stamp }: { stamp: number }) {
  const [year, setYear] = useState<YearView | null>(null);
  useEffect(() => {
    let on = true;
    void fetch("/api/runs/list/year").then((r) => (r.ok ? r.json() : null)).catch(() => null).then((v: YearView | null) => { if (on) setYear(v); });
    return () => { on = false; };
  }, [stamp]);
  if (!year) return null;
  return (
    <section className="xy" aria-labelledby="xy-h">
      <h2 id="xy-h">{year.label}</h2>
      <p className="xy-note">{year.simulated} Planned: {usdOf(year.planned)}{year.left !== null ? `, ${usdOf(year.left)} left over` : ""}.</p>
      <table className="xy-t">
        <caption className="xy-sr">Each gift's simulated price by month, with Goose's pick</caption>
        <thead><tr>{year.months.map((m, i) => <th key={`${m}${i}`} scope="col" data-past={i < year.monthsPast || undefined}>{m}</th>)}</tr></thead>
        {year.gifts.map((g) => (
          <tbody key={g.catalogId} data-status={g.status}>
            <tr><th className="xy-gift" scope="rowgroup" colSpan={12}><b>{g.item}</b> <span>{g.said}</span></th></tr>
            <tr className="xy-row">
              {g.months.map((m, i) => (
                <td key={`${m.label}${i}`} title={m.said} data-past={m.past || undefined} data-plan={m.plan || undefined} data-needed={m.needed || undefined}>
                  <span className="xy-sr">{m.said}</span>
                  {m.cents !== null && <i aria-hidden="true" style={{ bottom: `calc(${place(g.months, m) * 0.6}% + 8px)` }} />}
                </td>
              ))}
            </tr>
          </tbody>
        ))}
      </table>
      <p className="xy-key"><i aria-hidden="true" /> Goose's pick <em aria-hidden="true" /> Needed by <span>In a row, higher dot, higher price.</span></p>
    </section>
  );
}
