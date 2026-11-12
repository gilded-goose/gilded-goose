// Gilded Goose: one page. The first screen asks and shows the board replaying a recorded week; asking turns the same
// wall into your run; PayPal's return turns it into a receipt.
import { useRef } from "react";
import { Icon } from "./icons.tsx";
import { Landing } from "./Landing.tsx";
import { Receipt } from "./Receipt.tsx";
import { RunView } from "./RunView.tsx";
import { Sheet } from "./Sheet.tsx";
import { useRun } from "./useRun.ts";

export function App() {
  const run = useRun();
  const input = useRef<HTMLInputElement>(null);
  const { phase, health } = run;
  const mode = health === "away" ? "away" : health?.payment === "sandbox" ? "sandbox" : health ? "practice" : "checking";
  const modeWords = { away: "Server away", sandbox: "PayPal sandbox", practice: "Practice payments", checking: "Checking…" }[mode];

  const resting = phase === "rest" || (phase === "failed" && !run.read);
  const status = phase === "reading" ? <p className="gg-status" role="status">Reading what you asked…</p>
    : phase === "failed" && (run.retry || run.read) ? (
      <div className="gg-fail" role="alert">
        <p>{run.fail}</p>
        {run.retry && <button type="button" className="gg-link" onClick={() => (run.read ? run.shop() : run.ask(run.words))}><Icon name="again" size={16} />Try again</button>}
      </div>
    ) : mode === "away" ? <p className="gg-status gg-status-away">Goose can't reach its server right now, so it can't shop. Nothing was paid.</p> : null;

  return (
    <div className="gg">
      <a className="gg-skip" href="#main">Skip to content</a>
      <header className="gg-bar">
        <button type="button" className="gg-mark" onClick={run.startOver} aria-label="Gilded Goose, start over">
          <span className="gg-mark-egg" aria-hidden="true" />Gilded Goose
        </button>
        <p className="gg-mode" data-mode={mode}><span aria-hidden="true" />{modeWords}</p>
      </header>

      <main id="main" className="gg-main" data-phase={phase}>
        {phase === "back" ? (
          <Receipt back={run.back} where={mode === "sandbox" ? "in PayPal's sandbox" : "in practice"} onAgain={run.startOver} />
        ) : resting || phase === "reading" ? (
          <Landing words={run.words} setWords={run.setWords} onAsk={run.ask} busy={phase === "reading"} inputRef={input} status={status} error={phase === "failed" && !run.retry ? run.fail : null} />
        ) : (
          <>
            <RunView run={run} />
            {phase === "failed" && <div className="gg-run-fail">{status}</div>}
          </>
        )}
      </main>

      <footer className="gg-foot">
        <p>Every seller and market here is fictional. Payments run {mode === "sandbox" ? "in PayPal's sandbox" : "in practice mode"}: no real money moves.</p>
        <p>Goose never pays on its own. Only your tap on PayPal's page does.</p>
      </footer>

      {run.sheet && run.market && run.week?.best && (
        <Sheet market={run.market} deal={run.week.best} limit={run.limit} payNote={run.payNote} paying={run.paying}
          onApprove={() => void run.approve().then((url) => { if (url) location.assign(url); })} onClose={() => run.setSheet(false)} mode={modeWords} practice={mode !== "sandbox"} />
      )}
    </div>
  );
}
