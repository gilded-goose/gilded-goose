// The board: rows of split flaps. React owns the lines; the flaps turn themselves (flap.ts), so a price change is a
// few compositor animations, never a re-render per leaf. The board is a picture of the same facts the page lists in
// words beside it, so it is hidden from screen readers.
import { useEffect, useLayoutEffect, useRef } from "react";
import { Flap } from "./flap.ts";
import type { Line } from "./layout.ts";

const RIPPLE_MS = 14;

export interface BoardLine extends Line { /** ms before this row starts turning. */ delay?: number; /** The row is being pulled: it shudders once. */ jam?: boolean }

export function Board({ lines, cols, instant, className }: { lines: BoardLine[]; cols: number; instant: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const grid = useRef<{ rows: HTMLDivElement[]; flaps: Flap[][]; cols: number } | null>(null);

  // Build the flaps for this many rows and columns. A rebuild (a resize) shows the current lines at once.
  useLayoutEffect(() => {
    const el = box.current!;
    const rebuilt = grid.current !== null;
    el.replaceChildren();
    const rows: HTMLDivElement[] = [], flaps: Flap[][] = [];
    for (let r = 0; r < lines.length; r++) {
      const row = document.createElement("div");
      row.className = "gg-board-row";
      const line: Flap[] = [];
      for (let c = 0; c < cols; c++) {
        const f = new Flap(rebuilt ? (lines[r]!.text[c] ?? " ") : " ");
        line.push(f);
        row.append(f.el);
      }
      rows.push(row); flaps.push(line); el.append(row);
    }
    grid.current = { rows, flaps, cols };
    return () => { for (const l of flaps) for (const f of l) f.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt only when the shape changes
  }, [lines.length, cols]);

  useEffect(() => {
    const g = grid.current;
    if (!g) return;
    lines.forEach((line, r) => {
      const row = g.rows[r];
      if (!row) return;
      row.dataset.tone = line.tone;
      if (line.jam) row.dataset.jam = "1"; else delete row.dataset.jam;
      g.flaps[r]!.forEach((f, c) => {
        const ch = line.text[c] ?? " ";
        if (instant) f.set(ch);
        else f.to(ch, (line.delay ?? 0) + c * RIPPLE_MS);
      });
    });
  }, [lines, instant]);

  return <div ref={box} className={`gg-board ${className ?? ""}`} style={{ ["--cols" as string]: cols }} aria-hidden="true" />;
}
