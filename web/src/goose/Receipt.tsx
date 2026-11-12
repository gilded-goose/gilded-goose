// Back from PayPal: the board's last departure. What your tap paid and to whom come from the server's settle; the limit
// Goose held and the sellers it refused come from what this tab saw before PayPal (shown only when it has them). Never
// more than that: no record says so, an unconfirmed payment says so.
import { useMemo } from "react";
import { toCents, usdOf } from "@goose/core/money";
import type { BoardLine } from "./board/Board.tsx";
import { blankLine, headLine, limitLine, spentLine, textLine } from "./board/layout.ts";
import { BoardPanel, useBoardSize } from "./BoardPanel.tsx";
import { Icon } from "./icons.tsx";
import { still } from "./useRun.ts";
import type { Back } from "./back.ts";

const short = (n: string) => n.replace(/\s*\(fictional\)$/i, "");
const usd = (s: string) => usdOf(Number(s).toFixed(2));

export function Receipt({ back, where, onAgain }: { back: Back | null; where: "in practice" | "in PayPal's sandbox"; onAgain: () => void }) {
  const [boxRef, size] = useBoardSize();
  const wide = size === "wide";
  const lines: BoardLine[] = useMemo(() => {
    const state = !back ? "Checking" : back.gone ? "No record" : back.ok ? "Paid" : back.ok === false ? "Not paid" : "Waiting";
    const paid = back?.ok && back.total ? toCents(back.total) : null;
    const recap = back?.ok ? back.recap : undefined;
    const refused = recap?.refused ?? 0;
    return [
      headLine("Receipt", state, size),
      { ...limitLine(paid, size, wide ? "YOUR TAP PAID" : "YOU PAID"), tone: back?.ok ? "gold" : "dim" },
      textLine(back?.merchant ? short(back.merchant) : "", "base", size),
      recap ? { ...limitLine(recap.limit, size, wide ? "LIMIT HELD" : "LIMIT"), tone: "base" } : blankLine(size),
      refused ? textLine(`${refused} ${refused === 1 ? "seller" : "sellers"} refused`, "red", size) : blankLine(size),
      textLine(!back?.ok ? "" : where === "in practice" ? "Practice payment" : `Order ${back.orderId ?? ""}`, "label", size),
      spentLine(size),
    ];
  }, [back, size, wide, where]);

  const head = !back ? "Checking with the server…"
    : back.gone ? "Goose can't find that payment."
    : back.ok ? `Paid ${back.total ? `${usd(back.total)} ` : ""}to ${short(back.merchant ?? "the seller")}.`
    : back.ok === false ? "Not paid." : "PayPal hasn't confirmed this yet.";
  const refused = back?.ok ? back.recap?.refused ?? 0 : 0;

  return (
    <section className="gg-receipt" aria-labelledby="gg-r-h">
      <div className="gg-receipt-board">
        <BoardPanel lines={lines} size={size} instant={still()} mood={back?.ok ? "paid" : "idle"} boxRef={boxRef} />
      </div>
      <div className="gg-receipt-copy">
        <h1 id="gg-r-h" role={back ? undefined : "status"}>{head}</h1>
        {back?.ok && (
          <p>
            Your tap paid, {where}. Goose spent nothing.
            {back.recap && <> It held your {usd((back.recap.limit / 100).toFixed(2))} limit{refused ? ` and refused ${refused} ${refused === 1 ? "seller" : "sellers"}` : ""}.</>}
          </p>
        )}
        {back?.reason && <p>{back.reason}</p>}
        {back?.gone && <p>This server has no record of that run, so it can't say whether anything was paid.</p>}
        {back?.orderId && <p className="gg-receipt-id">{where === "in practice" ? "Practice order" : "PayPal sandbox order"} <code>{back.orderId}</code></p>}
        <button type="button" className="gg-btn gg-btn-ink" onClick={onAgain}>Shop for something else<Icon name="arrow" /></button>
      </div>
    </section>
  );
}
