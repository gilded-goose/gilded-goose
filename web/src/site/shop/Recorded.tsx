// Two blocks of the Shop that few visits ever draw, kept off its first load (Shop.tsx fetches this chunk only then):
// - Recorded: with the server away, the recorded kettle week as a compare, its pick and a demo approve card, each labelled.
// - Refused: the developer's note when the server refuses this page's address (a WEB_URL that names another origin).
// Nothing here can pay: the approve card is the demo one, with no handler.
import { useMemo } from "react";
import kettle from "virtual:goose-kettle";
import { ApproveCard } from "./ApproveSheet.tsx";
import { Compare } from "./Compare.tsx";
import { Pick } from "./Decide.tsx";
import { kettleRows } from "./kettle-rows.ts";

const KETTLE_LIMIT = 6000;

export function Recorded() {
  const rows = useMemo(() => kettleRows(kettle.events, KETTLE_LIMIT), []);
  const best = rows.find((r) => r.best) ?? null;
  const deal = kettle.home.deal;
  if (!best || !deal) return null;
  return (
    <div className="recorded">
      <Compare rows={rows} limit={KETTLE_LIMIT} recorded />
      <Pick best={best} limit={KETTLE_LIMIT} demo />
      <ApproveCard demo deal={{ merchant: deal.seller, item: deal.item, total: deal.total, limit: "60.00", minutes: deal.minutes ?? 15 }} />
    </div>
  );
}

export function Refused() {
  return <p className="away" role="alert"><b>Goose's server refused this page's address ({location.origin}).</b> It only answers the address its WEB_URL names (http://localhost:5173 unless set). Open the site there, or start the server with WEB_URL={location.origin}. Nothing was paid.</p>;
}
