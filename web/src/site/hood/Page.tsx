// Under the hood, as its own page (README: Behind the scenes): the Live Threat Board (real tries by type and rule, the
// four ways a try could have got a payment through, Ask for a view) and under it the ledger in AG Grid, every row as the
// code wrote it. The board is the Desk's own (studio/pick.ts: AG Studio when its licence allows, else the same widgets on
// AG Grid Community and AG Charts); only its look is bridged to this site's tokens (board.css). Beside a run in Shop, the
// same ledger opens as a drawer.
import { Suspense, useEffect, useMemo } from "react";
import { lazyPage } from "../ui/lazy-page.tsx";
import { EggLoader } from "../ui/Egg.tsx";
import { InView } from "../ui/InView.tsx";
import kettle from "virtual:goose-kettle";
import { hrefOf } from "../route.ts";
import { hoodRows } from "./rows.ts";
import "../home/sections.css";
import "./board.css";

const Board = lazyPage(() => import("../../studio/pick.ts").then((m) => m.pick()));
const Ledger = lazyPage(() => import("./Drawer.tsx").then((m) => ({ default: m.HoodLedger })));

export function HoodPage() {
  const rows = useMemo(() => hoodRows(kettle.events, "recorded"), []);
  useEffect(() => {
    document.documentElement.classList.add("hood-on");
    return () => document.documentElement.classList.remove("hood-on");
  }, []);
  return (
    <div className="wrap pg">
      <h1 className="sx-h sx-h-page">Under the hood</h1>
      <p className="sx-lede">Every step of a run as a ledger: who proposed it, what code decided and why, and each PayPal call by its real name.</p>

      <section className="hood-sec" aria-labelledby="hood-board-h">
        <h2 id="hood-board-h" className="hood-sec-h">The Live Threat Board</h2>
        <p className="hood-sec-p">Real tries from Try to trick Goose, by type and rule, and how many got a payment through. Ask for a view below it.</p>
        <div className="hood-board">
          <Suspense fallback={<EggLoader label="Loading the board…" fill={false} />}><Board /></Suspense>
        </div>
      </section>

      <section className="hood-sec" aria-labelledby="hood-ledger-h">
        <h2 id="hood-ledger-h" className="hood-sec-h">The ledger</h2>
        <p className="hood-sec-p">Recorded week 1, replayed. Every seller is fictional. Rows are only ever added.</p>
        {/* Below a board 4,400-9,000 px tall: its AG Grid loads as it nears the screen, not with the page. */}
        <InView reserve={800}><Suspense fallback={<EggLoader label="Loading the ledger…" fill={false} />}><Ledger rows={rows} /></Suspense></InView>
      </section>

      <p className="pg-foot">Your own run's rows stream in beside it as they happen. <a className="sx-link" href={hrefOf("shop")}>Open Shop</a></p>
    </div>
  );
}
