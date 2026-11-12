// What Under the hood draws below its board, as the one chunk the page fetches when the ledger nears the screen: the
// ledger itself (Drawer.tsx, unchanged), and under it "Recompute it yourself" on recorded week 1's cart. The second
// section lives here, heading and all, because the page's own first load is counted to the byte (scripts/ratchet.ts)
// and had no room for it. Its part stays a chunk of its own (the Verify page can mount it without the ledger), asked for
// when this chunk draws, which is when the ledger nears the screen. No InView of its own: that file lives in the page's
// chunk, and importing it from here would fold the page's chunk into this one's graph.
import { Suspense } from "react";
import { GooseLoader } from "../ui/Goose.tsx";
import { lazyPage } from "../ui/lazy-page.tsx";
import { HoodLedger } from "./Drawer.tsx";
import type { HoodRow } from "./rows.ts";

// This file's own two lines, not words.ts's: a module shared with the part would tie the part's chunk to the ledger's.
const RECOMPUTE_HEAD = "Recompute it yourself";
const RECOMPUTE_LOST = "This part didn't load. Reload to try again.";
const RecomputeLost = () => <p className="hood-sec-p" role="alert">{RECOMPUTE_LOST}</p>;
const Recompute = lazyPage(() => import("../../verify/Recompute.tsx"), RecomputeLost);

export default function HoodBelow({ rows }: { rows: HoodRow[] }) {
  return (
    <>
      <HoodLedger rows={rows} />
      <section className="hood-sec hood-next" aria-labelledby="hood-recompute-h">
        <h2 id="hood-recompute-h" className="hood-sec-h">{RECOMPUTE_HEAD}</h2>
        <Suspense fallback={<GooseLoader label="Loading the fingerprint…" fill={false} />}><Recompute /></Suspense>
      </section>
    </>
  );
}
