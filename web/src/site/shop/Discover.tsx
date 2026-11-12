// Discover: the run, shown as a scene (Guard.tsx) at useRun's pace: Goose weighs each offer against the golden egg, and a
// seller's note that gives orders is seen bouncing off your limit. When the run is done the scene becomes the
// recommendation (Recommendation.tsx), and the per-seller list folds under "Show each test": Compare below carries the
// ranking and the evidence, so the sellers are not listed twice. Reduced motion: useRun goes straight to "done".
import { useMemo } from "react";
import type { Run } from "../../goose/useRun.ts";
import { Button } from "../ui/Button.tsx";
import { Provenance } from "../ui/Provenance.tsx";
import { Stamp } from "../ui/Stamp.tsx";
import { compareRows } from "./compare-rows.ts";
import { Guard } from "./Guard.tsx";
import { Recommendation } from "./Recommendation.tsx";
import { usd } from "./receipt-words.ts";

const bare = (id: string) => id.replace(/^rm-/, "");

export function Discover({ run, onReview }: { run: Run; onReview(): void }) {
  const { market, week, beats, phase, limit } = run;
  const rows = useMemo(() => (market ? compareRows(market.results, limit) : []), [market, limit]);
  if (!market || !week) return null;
  const finished = phase === "done" || phase === "stopped";

  // Sellers in the order they were tested: the first beat that names each.
  const order: string[] = [];
  for (const b of beats) if (!order.includes(b.sellerId)) order.push(b.sellerId);
  const shown = (finished ? market.results.map((r) => bare(r.id)) : order)
    .map((id) => ({ id, row: rows.find((r) => bare(r.id) === id) }))
    .filter((x): x is { id: string; row: NonNullable<typeof x.row> } => Boolean(x.row));
  const struck = (id: string) => finished || beats.some((b) => b.sellerId === id && b.kind !== "list");
  const total = market.results.length;
  const aside = rows.filter((r) => r.verdict === "aside").length;

  const list = (
    <ol className="sellers" aria-live="polite">
      {shown.map(({ id, row }) => {
        const on = struck(id);
        return (
          <li key={id} className="seller" data-verdict={on ? row.verdict : undefined} data-best={on && row.best ? "" : undefined}>
            <div className="seller-top">
              <span className="seller-name">{row.name}</span>
              <span className="seller-price figure">{usd(row.price)}</span>
            </div>
            <Stamp verdict={row.verdict} struck={on} {...(on && row.reason ? { reason: row.reason } : {})} />
            {on && row.quoted ? (
              <blockquote className="seller-note">
                <p className="seller-note-k">Its note</p>
                <p>“{row.quoted}”</p>
              </blockquote>
            ) : null}
            <span className="seller-streak" aria-hidden="true" />
          </li>
        );
      })}
    </ol>
  );

  return (
    <section className="step discover" aria-labelledby="discover-h" data-done={finished ? "" : undefined} data-rec={phase === "done" && rows.some((r) => r.best) ? "" : undefined}>
      <header className="step-head">
        <h2 id="discover-h">Sellers tested</h2>
        <p className="step-sub">{finished ? `${total} ${total === 1 ? "seller" : "sellers"}, each checked by code${aside ? `. ${aside} set aside.` : "."}` : `Testing ${shown.length} of ${total}…`}</p>
      </header>
      <div className="stone discover-stone">
        <div className="discover-top">
          {finished ? <Button tone="quiet" size="s" onClick={run.replay}>Replay</Button> : <span />}
          <Provenance kind="fictional" />
        </div>
        {phase === "done" && rows.some((r) => r.best) ? <Recommendation rows={rows} limit={limit} onReview={onReview} /> : <Guard run={run} rows={rows} />}
        {finished ? (
          <details className="discover-more">
            <summary>Show each test</summary>
            {list}
            <p className="discover-made">Sellers: {market.madeBy}. {market.readerSays}</p>
          </details>
        ) : <p className="discover-made">Sellers: {market.madeBy}. {market.readerSays}</p>}
      </div>
      {phase === "shopping" ? (
        <div className="step-act">
          <Button tone="line" size="s" onClick={run.stop}>Stop Goose</Button>
          <Button tone="quiet" size="s" onClick={run.skip}>Skip to the end</Button>
        </div>
      ) : null}
      {phase === "stopped" ? <p className="step-status">Stopped. Goose bought nothing and holds nothing.</p> : null}
    </section>
  );
}
