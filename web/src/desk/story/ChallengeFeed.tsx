// The column under the Challenge's counter (Joshua, Nov 4, 7:10 AM, 3c): the latest real tries, read from the same answer the
// threat board reads (`GET /api/challenge`, through `readBoard`), or, while there are none or the record can't be read, the
// three layers a note has to get past. A row is drawn from closed lists: verdict, kind of trick, layer and time. A note's
// words have no field to land in.
//
// It asks only while it's near the screen and the tab is in view, every 10 s as the board does, and at once after a try.
// Part of the Challenge's lazy chunk, so the first paint pays nothing for it.
import { useEffect, useRef, useState } from "react";
import type { ChallengeCounts } from "@goose/core/count-words";
import { TYPE_WORDS } from "@goose/core/attempts";
import { FEED_HEAD, FEED_NOTE, FEED_ROWS, LAYERS_HEAD, THREE_LAYERS, agoWords, rowLayerWords, type FeedRow } from "@goose/core/layers";
import { VERDICT_WORDS, readBoard } from "../../studio/board-read.ts";
import { takeEarlyChallenge } from "./early-challenge.ts";

const POLL_MS = 10_000;
const RETRY_MS = 60_000;

/** Same fields in the same minute are told apart by their place from the oldest, so a new row at the top moves no key below it. */
function keyed(rows: readonly FeedRow[], total: number): Array<FeedRow & { key: number }> {
  return rows.map((r, i) => ({ ...r, key: total - i }));
}

export default function ChallengeFeed({ live, fresh, onCounts }: { live: boolean; fresh: number; onCounts: (c: ChallengeCounts) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<readonly FeedRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [near, setNear] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Rows already drawn don't rise again; only one that arrives while this page is open does.
  const seen = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver !== "function") { setNear(true); return; }
    const io = new IntersectionObserver((es) => setNear(es.some((e) => e.isIntersecting)), { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!live || !near) return;
    let gone = false;
    let timer = 0;
    const next = (ms: number) => { if (!gone) timer = window.setTimeout(tick, ms); };
    const tick = async () => {
      if (document.hidden) return; // the listener below asks the moment it's back
      let wait = RETRY_MS;
      try {
        // The first read is the head's, on a #challenge arrival (early-challenge.ts), so the page asks once, not twice.
        const early = await takeEarlyChallenge();
        const r = early ? null : await fetch("/api/challenge", { credentials: "same-origin", headers: { accept: "application/json" } });
        const read = early ? readBoard(early) : r?.ok ? readBoard(await r.json()) : null;
        if (gone) return;
        if (read) {
          if (first.current) { first.current = false; seen.current = read.counts.tried; }
          setRows(read.rows.slice(0, FEED_ROWS));
          setTotal(read.counts.tried);
          onCounts(read.counts);
          setNow(Date.now());
          wait = POLL_MS;
        }
      } catch { /* no network: rows on show stay, and it asks again */ }
      next(wait);
    };
    const back = () => { if (!document.hidden) { clearTimeout(timer); void tick(); } };
    document.addEventListener("visibilitychange", back);
    void tick();
    return () => { gone = true; clearTimeout(timer); document.removeEventListener("visibilitychange", back); };
    // `fresh` asks again after a try.
  }, [live, near, fresh, onCounts]);

  if (!rows || rows.length === 0) {
    return (
      <div className="ds-ch-feed" ref={root} data-sr data-feed="layers">
        <p className="ds-ch-feed-h">{LAYERS_HEAD}</p>
        <ol className="ds-ch-layers">
          {THREE_LAYERS.map((l) => <li key={l.key} data-layer={l.key}><span className="ds-ch-layer-name">{l.name}</span> <span className="ds-ch-layer-words">{l.words}</span></li>)}
        </ol>
      </div>
    );
  }

  return (
    <div className="ds-ch-feed" ref={root} data-sr data-feed="tries">
      <p className="ds-ch-feed-h">{FEED_HEAD}</p>
      <ol className="ds-ch-tries">
        {keyed(rows, total).map((r) => (
          <li key={r.key} data-verdict={r.verdict} data-new={r.key > seen.current || undefined}>
            <span className="ds-ch-try-verdict">{VERDICT_WORDS[r.verdict]}</span>
            <span className="ds-ch-try-when">{agoWords(r.at, now)}</span>
            <span className="ds-ch-try-what">{TYPE_WORDS[r.type]} · {rowLayerWords(r.verdict, r.rule)}</span>
          </li>
        ))}
      </ol>
      <p className="ds-small ds-ch-feed-note">{FEED_NOTE}</p>
    </div>
  );
}
