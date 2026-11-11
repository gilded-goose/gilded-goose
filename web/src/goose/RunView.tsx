// A run: the board on the left doing the watching, your brief and the week in words on the right. The board's limit row
// is yours: drag the limit and its flaps follow; a seller's note that tries to change it jams it for a moment, and Goose
// turns it back.
import { useMemo } from "react";
import { toCents, usdWhole } from "@goose/core/money";
import type { BoardLine } from "./board/Board.tsx";
import { limitLine } from "./board/layout.ts";
import { boardLines, orderOf, SELLER_ROWS, whenOf } from "./board/lines.ts";
import { BoardPanel, useBoardSize } from "./BoardPanel.tsx";
import type { EggMood } from "./egg.ts";
import { Icon } from "./icons.tsx";
import { Log } from "./Log.tsx";
import { tracksAt } from "./market.ts";
import { still, type Run } from "./useRun.ts";

const usd = usdWhole;
const STEP = 500;
const short = (n: string) => n.replace(/\s*\(fictional\)$/i, "");

export function RunView({ run }: { run: Run }) {
  const { phase, read, market, week, shown, beats, limit, held, jam, guarding } = run;
  const [boxRef, size] = useBoardSize();
  const title = short(read?.title ?? read?.item ?? "");

  const lines: BoardLine[] = useMemo(() => {
    const rows = Math.max(SELLER_ROWS, market?.results.length ?? 0);
    const when = phase === "brief" ? "Ready" : phase === "asking" ? "Finding" : week ? whenOf(week, shown) : "";
    const out: BoardLine[] = boardLines({ title, when, limit, tracks: week ? tracksAt(week, shown) : [], order: week ? orderOf(week) : [] }, size, rows);
    if (jam !== null) out[1] = { ...limitLine(jam, size), tone: "red", jam: true };
    return out;
  }, [phase, title, week, shown, limit, jam, size, market]);

  const mood: EggMood = phase === "reading" ? "listening" : guarding ? "guarding" : phase === "shopping" || phase === "asking" ? "working" : "idle";
  const pulled = guarding ? [...beats].reverse().find((b) => b.kind === "aside" && b.pulls) : undefined;
  const canMove = phase === "brief" || phase === "done" || phase === "stopped";
  const floor = Math.max(100, Math.floor((held * 0.5) / 100) * 100);
  // "The most you said" when your words set the number; otherwise name the limit that holds it.
  const yours = read?.said && toCents(read.said.replace(/[$,]/g, "")) === held;
  const longTitle = title.length > 34;

  return (
    <section className="gg-run" aria-label="Goose shopping under your limit">
      <div className="gg-run-board">
        <BoardPanel lines={lines} size={size} instant={still()} mood={mood} boxRef={boxRef} caption={market ? market.claim : "Every seller here is fictional."}>
          {pulled && pulled.kind === "aside" && (
            <div className="gg-jam" role="status">
              <p className="gg-jam-k">{pulled.name}'s listing says</p>
              <q>{pulled.quoted}</q>
              <p>Goose doesn't take orders from sellers. Your limit is still <b>{usd(limit)}</b>.</p>
            </div>
          )}
          {phase === "done" && week && (
            week.best ? (
              <div className="gg-found" role="status">
                <p><b>{short(week.best.merchant)}</b> has it for <b className="gg-num">{usd(toCents(week.best.price))}</b>, under your {usd(limit)}.</p>
                <button type="button" className="gg-btn gg-btn-gold" onClick={() => { run.setPayNote(null); run.setSheet(true); }}>Review<Icon name="arrow" /></button>
              </div>
            ) : (
              <div className="gg-found" data-empty role="status">
                <p><b>Nothing under {usd(limit)} {week.recorded ? "this week" : "right now"}.</b> Goose won't pay over your limit.</p>
                {limit < held && <button type="button" className="gg-btn gg-btn-line" onClick={() => run.setLimit(held)}>Back to {usd(held)}</button>}
              </div>
            )
          )}
        </BoardPanel>
      </div>

      <aside className="gg-rail">
        <div className="gg-brief">
          <p className="gg-brief-k">Goose is shopping for</p>
          <h1 className="gg-brief-h" data-long={longTitle || undefined}>{title}</h1>
          <p className="gg-brief-limit">
            {limit < held ? <>Under <b>{usd(limit)}</b>. You lowered it from {usd(held)}.</> : yours ? <>Under <b>{usd(limit)}</b>, the most you said.</> : <>Under <b>{usd(limit)}</b>, {read?.heldBy}.</>}
          </p>
          {canMove && (
            <div className="gg-limit" role="group" aria-labelledby="gg-limit-k">
              <span id="gg-limit-k">Your limit</span>
              <button type="button" className="gg-step" onClick={() => run.setLimit(Math.max(floor, limit - STEP))} disabled={limit <= floor} aria-label={`Lower your limit by ${usd(STEP)}`}><Icon name="minus" /></button>
              <output className="gg-num" aria-live="polite">{usd(limit)}</output>
              <button type="button" className="gg-step" onClick={() => run.setLimit(Math.min(held, limit + STEP))} disabled={limit >= held} aria-label={`Raise your limit by ${usd(STEP)}, up to ${usd(held)}`}><Icon name="plus" /></button>
              <span className="gg-limit-note">{limit < held ? `Up to ${usd(held)}` : "Can only go down"}</span>
            </div>
          )}
          {phase === "brief" && (
            <div className="gg-brief-actions">
              <button type="button" className="gg-btn gg-btn-ink" onClick={run.shop}>Send Goose<Icon name="arrow" /></button>
              <button type="button" className="gg-link" onClick={run.edit}>Change what to find</button>
            </div>
          )}
          {phase === "asking" && <p className="gg-status" role="status">Finding sellers…</p>}
          {phase === "failed" && <div className="gg-brief-actions"><button type="button" className="gg-link" onClick={run.edit}>Change what to find</button></div>}
        </div>

        {market && week && (
          <div className="gg-week">
            <div className="gg-week-ctl">
              {phase === "shopping" && <button type="button" className="gg-btn gg-btn-stop" onClick={run.stop}><Icon name="stop" size={16} />Stop Goose</button>}
              {phase === "shopping" && <button type="button" className="gg-link" onClick={run.skip}>Skip to now</button>}
              {(phase === "done" || phase === "stopped") && <button type="button" className="gg-link" onClick={run.replay}><Icon name="again" size={16} />{new Set(week.days).size > 1 ? "Replay the week" : "Replay"}</button>}
              <button type="button" className="gg-link" onClick={run.startOver}>Shop for something else</button>
            </div>
            <Log beats={beats} days={week.days} limit={limit} moves={(id) => (week.tracks.find((t) => t.id === id)?.marks.length ?? 0) > 1} />
            {phase === "stopped" && <p className="gg-status">Stopped. Goose bought nothing and holds nothing.</p>}
          </div>
        )}
      </aside>
    </section>
  );
}
