// Where Behind the scenes mounts the Live Threat Board (Track T): the one thing the ledger page's own chunk carries for it
// is this file. The board is a lazy chunk, and until it lands this draws its first lines in its room (BoardFirst.tsx), so
// the counter stays where the first paint put it and nothing under it moves when the board lands.
// If the chunk can't be fetched the page carries on without the board, and the ledger below it is whole; the counter stays
// in its room with the record's count when the early answer brought one, and otherwise says it can't be read. It is never
// blank (Track P, Fri Nov 6: until then a failed chunk left no counter at all, the board's whole room empty).

import { lazy, Suspense } from "react";
import { Kept } from "../kept.ts";
import { BoardFirst, type FirstWords } from "./BoardFirst.tsx";

// A lost chunk draws the held lines; a board that throws while drawing does too (Kept, below).
const ThreatBoard = lazy(() => import("./ThreatBoard.tsx").catch(() => ({ default: BoardHeld })));

const earlyWords = () => (window.__board?.v as { words?: FirstWords | null } | null | undefined)?.words ?? null;

/** The board couldn't come: its first lines stay, read when this draws (the early answer may have come since the slot did). */
function BoardHeld() {
  return <BoardFirst words={earlyWords()} mark="held" failed />;
}

export default function ThreatSlot() {
  return (
    <Kept or={<BoardHeld />}>
      <Suspense fallback={<BoardFirst words={earlyWords()} mark="room" />}>
        <ThreatBoard />
      </Suspense>
    </Kept>
  );
}
