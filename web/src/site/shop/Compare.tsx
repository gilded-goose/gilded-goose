// Compare, on AG Grid, inside the shop's own flow (no separate page): every seller ranked by price against your limit,
// stamps in one column, prices right-aligned in tabular figures; a seller set aside or held carries the Watcher's reason
// and its own quoted note in its row. Goose's pick is the cheapest Clear seller at or under your limit. The limit is a
// full-width row ruled between the sellers; rows animate to their new place when the list re-ranks. The grid itself is
// CompareGrid.tsx, loaded only when a compare is near (preloadGrid, called when Goose starts shopping). Under it, real
// store prices from Channel3 for reference, labelled Live or Recorded by the server's own answer; they never join the cart.
import { Suspense, lazy, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usdWhole } from "@goose/core/money";
import { getJson } from "../live/api.ts";
import { Egg } from "../ui/Egg.tsx";
import { Provenance } from "../ui/Provenance.tsx";
import { Stamp } from "../ui/Stamp.tsx";
import type { CompareRow } from "./compare-rows.ts";
import { gridRows } from "./compare-grid.ts";
import type { Row } from "./CompareGrid.tsx";
import { usd } from "./receipt-words.ts";

/** Starts fetching the grid's chunk; the shop calls it as soon as Goose starts shopping, so it's in by the compare. */
export const preloadGrid = () => import("./CompareGrid.tsx");
// Lost path (core/test/lazy-lost.test.ts): if the grid's chunk never comes, the same ranked rows as a plain list.
const CompareGrid = lazy(() => preloadGrid().then((m) => ({ default: m.CompareGrid }), () => ({ default: PlainRows })));

/** The grid's rows without AG Grid: rank, seller, Watcher stamp and price, your limit ruled where it falls. */
function PlainRows({ data, limit }: { data: Row[]; narrow: boolean; limit: number }) {
  return (
    <ol className="cg-plain" role="list">
      {data.map((r) => r.kind === "line" ? (
        <li key={r.id} className="ranked-line"><Egg size="s" /><span>Your limit {whole(limit)}</span></li>
      ) : (
        <li key={r.id}>
          <span className="cg-n figure">{r.rank}</span>
          <span className="ranked-name">{r.name}{r.best ? <span className="ranked-pick">Goose's pick</span> : null}</span>
          <Stamp verdict={r.verdict} />
          <span className="ranked-price figure">{usd(r.price)}</span>
        </li>
      ))}
    </ol>
  );
}

const whole = usdWhole;

/** On a phone the stamp column doesn't fit: the stamp rides under the seller's name instead. */
const NARROW = "(max-width: 560px)";
const narrowNow = () => window.matchMedia(NARROW).matches;
const onNarrow = (f: () => void) => { const m = window.matchMedia(NARROW); m.addEventListener("change", f); return () => m.removeEventListener("change", f); };

export function Compare({ rows, limit, recorded = false }: { rows: CompareRow[]; limit: number; recorded?: boolean }) {
  const ranked = useMemo(() => gridRows(rows, limit), [rows, limit]);
  const narrow = useSyncExternalStore(onNarrow, narrowNow, () => false);
  const lineAt = ranked.findIndex((r) => !r.underLimit);
  // The limit line sits after the last seller at or under your limit (or after them all).
  const data = useMemo<Row[]>(() => {
    if (ranked.length === 0) return [];
    const out: Row[] = ranked.map((r) => ({ ...r, kind: "seller" as const }));
    out.splice(lineAt === -1 ? out.length : lineAt, 0, { kind: "line", id: "limit-line" });
    return out;
  }, [ranked, lineAt]);
  // While the grid's chunk loads, its space is held (header 36 + 64 a seller + the 44 limit line), so nothing jumps.
  const held = 36 + 64 * ranked.length + 44;
  return (
    <section className="step compare" aria-labelledby="compare-h">
      <header className="step-head">
        <h2 id="compare-h">Compared against your {whole(limit)}</h2>
        {recorded ? <Provenance kind="recorded" /> : null}
      </header>
      <div className="cg">
        <Suspense fallback={<div className="cg-wait" style={{ minHeight: held }} aria-hidden="true" />}>
          <CompareGrid data={data} narrow={narrow} limit={limit} />
        </Suspense>
      </div>
      <p className="vh">{lineAt === -1 ? `Every seller is at or under your ${whole(limit)} limit.` : `${lineAt} ${lineAt === 1 ? "seller is" : "sellers are"} at or under your ${whole(limit)} limit.`}</p>
    </section>
  );
}

type Prices = { source: "channel3" | "recorded" | "none" | string; query?: string; items?: { name: string; store: string; price: string }[]; notLive?: string };

/** Real store prices for the same words, from Channel3: shown as reference only, with the server's own Live/Recorded word. */
export function RealPrices({ words }: { words: string }) {
  const [got, setGot] = useState<Prices | null>(null);
  useEffect(() => {
    let live = true;
    void getJson<Prices>(`/api/prices?q=${encodeURIComponent(words)}`).then((r) => { if (live) setGot(r === "away" ? null : r); });
    return () => { live = false; };
  }, [words]);
  const items = got?.items?.slice(0, 3) ?? [];
  if (!got || items.length === 0) return null;
  return (
    <aside className="real" aria-labelledby="real-h">
      <div className="real-head">
        <h3 id="real-h">Real stores, for reference</h3>
        <Provenance kind={got.source === "channel3" ? "live" : "recorded"} />
      </div>
      <ul className="real-list">
        {items.map((x) => (
          <li key={`${x.store}-${x.name}`}>
            <span className="real-name">{x.name}<span className="real-store">{x.store}</span></span>
            <span className="figure">{usd(x.price)}</span>
          </li>
        ))}
      </ul>
      <p className="real-note">From Channel3{got.query ? `, for “${got.query}”` : ""}. Not part of this cart.</p>
    </aside>
  );
}
