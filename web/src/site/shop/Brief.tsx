// Ask and Understand. The ask is plain words; code (no model) reads them into a brief: the item, your limit and why that
// limit. The limit is engraved on the egg, your nest egg, and can only go down from what code set (the steppers' floor
// and step are RunView's). Below it, what Goose remembers about you, each with Forget; a seller's note never writes there.
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { FORGET_ALL, MEMORY_LABEL, MEMORY_NONE, MEMORY_SAID, type MemoryCard } from "@goose/core/memory";
import { toCents, usdWhole } from "@goose/core/money";
import type { Run } from "../../goose/useRun.ts";
import { getJson, postJson } from "../live/api.ts";
import { Button } from "../ui/Button.tsx";
import { Egg } from "../ui/Egg.tsx";
import { GooseMark } from "../ui/Goose.tsx";
import { ArrowRightIcon } from "../ui/icons.tsx";
import { AskTools } from "../ui/AskTools.tsx";
import { handleSaid } from "../live/said.ts";
import { Provenance } from "../ui/Provenance.tsx";
// One list of examples for both ask boxes (the home page's is already loaded when the Shop opens).
import { ASK_EXAMPLES } from "../home/AskBox.tsx";

const STEP = 500;
const whole = usdWhole;
const short = (n: string) => n.replace(/\s*\(fictional\)$/i, "");

/** `children`: Goose's one suggestion (Suggest.tsx), a list item beside the examples, when there is one. */
export function ShopAsk({ run, live, children }: { run: Run; live: boolean; children?: ReactNode }) {
  const id = useId();
  const busy = run.phase === "reading";
  const [help, setHelp] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (handleSaid(run.words, setHelp)) { run.setWords(""); return; }
    void run.ask(run.words);
  };
  return (
    <form className="ask" onSubmit={submit} aria-busy={busy || undefined}>
      <div className="ask-head">
        <label htmlFor={id} className="ask-label">What should Goose find?</label>
        {live ? <Provenance kind="live" /> : null}
      </div>
      <div className="ask-row">
        <input
          id={id}
          className="ask-input"
          value={run.words}
          onChange={(e) => run.setWords(e.target.value)}
          placeholder="A kettle under $60"
          autoComplete="off"
          enterKeyHint="go"
          maxLength={200}
          disabled={busy}
        />
        <AskTools disabled={busy} onWords={run.setWords} onStatus={setHelp} />
        <Button tone="ink" type="submit" disabled={busy || run.words.trim().length < 2}>
          {busy ? "Reading…" : "Shop for this"}<ArrowRightIcon size={18} />
        </Button>
      </div>
      <p className="ask-help" aria-live="polite" data-on={help ? "" : undefined}>{help ?? "Hold the mic to talk. Your voice stays on this device."}</p>
      <ul className="ask-examples" aria-label="Examples">
        {ASK_EXAMPLES.map((x) => (
          <li key={x}><button type="button" className="chip" disabled={busy} onClick={() => { run.setWords(x); void run.ask(x); }}>{x}</button></li>
        ))}
        {children}
      </ul>
      {run.phase === "failed" && !run.read && run.fail ? <p className="shop-fail" role="alert">{run.fail}</p> : null}
    </form>
  );
}

type Memory = { memory?: MemoryCard[] };

function Remembers({ refresh }: { refresh: string }) {
  const [cards, setCards] = useState<MemoryCard[] | "away" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getJson<Memory>("/api/runs/wants").then((r) => { if (live) setCards(r === "away" ? "away" : r.memory ?? []); });
    return () => { live = false; };
  }, [refresh]);

  const forget = async (key: string) => {
    if (busy) return;
    setBusy(true); setError(null);
    const r = await postJson<Memory & { error?: string }>("/api/runs/memory/forget", { key });
    setBusy(false);
    if (r === "away") { setError("Goose's server didn't answer. Nothing was forgotten."); return; }
    if (r.error) { setError(r.error); return; }
    setCards(r.memory ?? []);
  };

  return (
    <section className="memory" aria-labelledby="memory-h">
      <h3 id="memory-h" className="memory-h">{MEMORY_LABEL}</h3>
      <p className="memory-said">{MEMORY_SAID}</p>
      {cards === null ? <p className="memory-none" aria-busy="true">Reading…</p>
        : cards === "away" ? <p className="memory-none">Goose's server isn't answering, so it can't say what it remembers.</p>
        : cards.length === 0 ? <p className="memory-none">{MEMORY_NONE}</p>
        : (
          <>
            <ul className="memory-list">
              {cards.map((m) => (
                <li key={m.key}>
                  <span>{m.words}</span>
                  <Button tone="line" size="s" disabled={busy} aria-label={`Forget ${m.words}`} onClick={() => void forget(m.key)}>Forget</Button>
                </li>
              ))}
            </ul>
            {cards.length > 1 ? <Button tone="quiet" size="s" disabled={busy} onClick={() => void forget("all")}>{FORGET_ALL}</Button> : null}
          </>
        )}
      {error ? <p className="shop-fail" role="alert">{error}</p> : null}
    </section>
  );
}

export function Brief({ run }: { run: Run }) {
  const { read, limit, held, phase } = run;
  if (!read) return null;
  const title = short(read.title ?? read.item);
  const floor = Math.max(100, Math.floor((held * 0.5) / 100) * 100);
  const canMove = phase === "brief" || phase === "done" || phase === "stopped";
  // "The most you said" only when your own words named this number ("under $60"); toCents throws on anything else.
  const said = /\d[\d,]*(?:\.\d{1,2})?/.exec(read.said ?? "")?.[0]?.replace(/,/g, "");
  const yours = said ? toCents(said) === held : false;
  // Once Goose is out shopping, the brief folds to its item and limit, so the sellers are what you see.
  const folded = !(phase === "brief" || phase === "asking" || phase === "failed");
  return (
    <section className="step brief" aria-labelledby="brief-h" data-folded={folded ? "" : undefined}>
      <div className="brief-egg">
        <Egg size="m" engraving={`Your nest egg · ${whole(limit)}`} />
      </div>
      <div className="brief-body">
        <p className="step-k"><GooseMark className="step-goose" />Goose is shopping for</p>
        <h2 id="brief-h" className="brief-title">{title}</h2>
        {folded ? null : <p className="brief-why">
          {limit < held ? <>Under <b className="figure">{whole(limit)}</b>. You lowered it from {whole(held)}.</>
            : yours ? <>Under <b className="figure">{whole(limit)}</b>, the most you said. {read.why}</>
            : <>Under <b className="figure">{whole(limit)}</b>. {read.why}</>}
        </p>}
        <div className="limit" role="group" aria-labelledby="limit-k">
          <span id="limit-k" className="limit-k">Your limit</span>
          <div className="limit-ctl">
            <button type="button" className="limit-step" onClick={() => run.setLimit(Math.max(floor, limit - STEP))} disabled={!canMove || limit <= floor} aria-label={`Lower your limit by ${whole(STEP)}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
            </button>
            <output className="limit-n figure" aria-live="polite">{whole(limit)}</output>
            <button type="button" className="limit-step" onClick={() => run.setLimit(Math.min(held, limit + STEP))} disabled={!canMove || limit >= held} aria-label={`Raise your limit by ${whole(STEP)}, up to ${whole(held)}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
            </button>
          </div>
          <span className="limit-note">{limit < held ? `Up to ${whole(held)}` : "Can only go down. Words can't raise it."}</span>
        </div>
        {phase === "brief" ? (
          <div className="step-act">
            <Button tone="ink" onClick={() => void run.shop()}>Send Goose<ArrowRightIcon size={18} /></Button>
            <Button tone="quiet" onClick={run.edit}>Change what to find</Button>
          </div>
        ) : null}
        {phase === "asking" ? <div className="step-wait"><GooseMark walk /><p className="step-status" role="status" aria-busy="true">Finding sellers…</p></div> : null}
      </div>
      {folded ? null : <details className="memory-fold"><summary>What Goose remembers</summary><Remembers refresh={read.item} /></details>}
    </section>
  );
}
