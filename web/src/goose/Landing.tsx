// The first screen: what Goose does, the ask, and the board replaying a recorded week on its own, so the idea is on
// screen before anyone types: prices move day by day, a seller is refused, one drops under the limit.
import { useEffect, useMemo, useState, type RefObject } from "react";
import { Ask } from "./Ask.tsx";
import { boardLines, orderOf, whenOf } from "./board/lines.ts";
import { BoardPanel, useBoardSize } from "./BoardPanel.tsx";
import type { EggMood } from "./egg.ts";
import { buildWeek, tracksAt } from "./market.ts";
import { REPLAY_LIMIT, replayMarket } from "./replay.ts";
import { still } from "./useRun.ts";

const week = (() => { const m = replayMarket(); return m ? buildWeek(m, REPLAY_LIMIT) : null; })();

/** The replay's beat, looping: a beat a second (a refusal holds longer), then the finished board for a while, then again. */
function useReplay(): { shown: number; mood: EggMood } {
  const total = week?.beats.length ?? 0;
  const [shown, setShown] = useState(() => (still() ? total : 0));
  useEffect(() => {
    if (still() || !week) return;
    const prev = week.beats[shown - 1];
    const wait = shown === 0 ? 700 : shown >= total ? 7000 : prev?.kind === "aside" ? 2200 : 1100;
    const t = setTimeout(() => setShown((s) => (s >= total ? 0 : s + 1)), wait);
    return () => clearTimeout(t);
  }, [shown, total]);
  const b = week?.beats[shown - 1];
  const mood: EggMood = shown === 0 ? "idle" : b?.kind === "aside" ? "guarding" : shown >= total ? "idle" : "working";
  return { shown, mood };
}

export function Landing({ words, setWords, onAsk, busy, inputRef, status, error }: {
  words: string; setWords: (w: string) => void; onAsk: (w: string) => void; busy: boolean;
  inputRef: RefObject<HTMLInputElement | null>; status: React.ReactNode; error: string | null;
}) {
  const [boxRef, size] = useBoardSize();
  const { shown, mood } = useReplay();
  const lines = useMemo(() => {
    if (!week) return [];
    return boardLines({ title: "Marsh Lights ticket", when: shown === 0 ? "" : whenOf(week, shown), limit: REPLAY_LIMIT, tracks: tracksAt(week, shown), order: orderOf(week) }, size);
  }, [shown, size]);

  return (
    <section className="gg-hero" aria-labelledby="gg-h1">
      <div className="gg-hero-copy">
        <h1 id="gg-h1">Say your limit. Goose&nbsp;holds&nbsp;it.</h1>
        <p className="gg-lede">Goose watches every seller, refuses scams, and tells you when a price drops under your number. Only your tap in PayPal pays.</p>
        <Ask words={words} setWords={setWords} onAsk={onAsk} busy={busy} inputRef={inputRef} error={error} />
        {status}
      </div>
      <div className="gg-hero-board">
        <BoardPanel lines={lines} size={size} instant={still()} mood={mood} boxRef={boxRef}
          caption={<>A recorded week, replayed. Every seller is fictional.</>} />
      </div>
    </section>
  );
}
