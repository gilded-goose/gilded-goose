// The board on the wall, with the gold egg sitting on its top edge like a lamp. The panel picks the board's width from
// the space it has (wide: 31 flaps, phone: 20), and hands that size to whoever writes the lines.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Board, type BoardLine } from "./board/Board.tsx";
import { colsOf, type Size } from "./board/layout.ts";
import { Egg } from "./Egg.tsx";
import type { EggMood } from "./egg.ts";

/** The board's size for the width it has: wide needs room for 31 legible flaps. */
export function useBoardSize(): [(el: HTMLDivElement | null) => void, Size] {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>("wide");
  useLayoutEffect(() => {
    if (!el) return;
    const pick = () => setSize(el.clientWidth >= 560 ? "wide" : "narrow");
    pick();
    const ro = new ResizeObserver(pick);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size];
}

export function BoardPanel({ lines, size, instant, mood, caption, children, boxRef }: {
  lines: BoardLine[]; size: Size; instant: boolean; mood: EggMood; caption?: ReactNode; children?: ReactNode;
  boxRef: (el: HTMLDivElement | null) => void;
}) {
  const shell = useRef<HTMLDivElement>(null);
  return (
    <div className="gg-panel" ref={shell}>
      <div className="gg-perch"><Egg mood={mood} /></div>
      <div className="gg-board-wrap" ref={boxRef}>
        <Board lines={lines} cols={colsOf(size)} instant={instant} />
      </div>
      {caption && <p className="gg-panel-cap">{caption}</p>}
      {children}
    </div>
  );
}
