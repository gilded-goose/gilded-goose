// The week in words, beside the board: the same facts the flaps show, as sentences a screen reader reads out. The
// sellers' reasons are the Watcher's own words from the server. A refused seller's note is one tap away, not repeated
// under the card that already quotes it.
import { usdWhole } from "@goose/core/money";
import type { Beat } from "./market.ts";

const usd = usdWhole;
const reasons = (said: string[]) => (said.length < 2 ? said.join("") : `${said.slice(0, -1).join(", ")} and ${said.at(-1)}`);

function Sentence({ b, limit, first, moved }: { b: Beat; limit: number; first: boolean; moved: boolean }) {
  switch (b.kind) {
    case "list": return <p><b>{b.name}</b> {first ? "lists at" : "is now"} {usd(b.cents)}.</p>;
    case "aside":
      return (
        <>
          <p>
            <b>{b.name}</b> asks {usd(b.cents)}. <span className="gg-refused">Refused:</span> {reasons(b.said)}.
            {b.pulls && <> Your limit stayed {usd(limit)}.</>}
          </p>
          {b.quoted && (
            <details className="gg-quote">
              <summary>Read its listing</summary>
              <p>{b.quoted}</p>
            </details>
          )}
        </>
      );
    case "over": return <p><b>{b.name}</b> at {usd(b.cents)} is over your {usd(limit)}.</p>;
    case "hold": return <p><b>{b.name}</b> at {usd(b.cents)} needs your yes: {b.why}.</p>;
    case "under": return <p><b>{b.name}</b> {moved ? "drops to" : "is lowest at"} {usd(b.cents)}, under your {usd(limit)}. Goose tells you.</p>;
  }
}

export function Log({ beats, days, limit, moves }: { beats: Beat[]; days: string[]; limit: number; moves: (id: string) => boolean }) {
  // A market read once has one moment ("Now"): no day column to repeat it on every line.
  const flat = new Set(days).size <= 1;
  return (
    <ol className="gg-log" aria-live="polite" data-flat={flat || undefined}>
      {beats.map((b, i) => {
        // A price that lands under your limit is said once: the "under" line that follows says it.
        const next = beats[i + 1];
        if (b.kind === "list" && next?.kind === "under" && next.sellerId === b.sellerId && next.day === b.day) return null;
        return (
          <li key={i} data-kind={b.kind}>
            {!flat && <span className="gg-log-day">{days[b.day] ?? ""}</span>}
            <div><Sentence b={b} limit={limit} first={!beats.slice(0, i).some((x) => x.sellerId === b.sellerId)} moved={moves(b.sellerId)} /></div>
          </li>
        );
      })}
    </ol>
  );
}
