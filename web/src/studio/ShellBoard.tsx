// The Live Threat Board's four cards in the shell's frames (Joshua, Nov 4, AG Grid item 4): the same components the
// dashboard's widgets draw (widgets/threat.tsx) with the same card classes, in a chunk with no AG Studio in it, so a
// phone reads the board while Studio's 1.6 MB is on its way. A card's click on a row or a filter works as on the plain page.
// Nothing here can pay, approve, change a limit or write a row: they only read the board.

import { useEffect, type ReactNode } from "react";
import { useBoard } from "./threat-state.tsx";
import { ThreatCounter, ThreatRules, ThreatTimeline, ThreatTries, ThreatViewLine } from "./threat-widgets.tsx";

interface Props { onLanded: () => void }

const Frame = ({ id, kind, children }: { id: string; kind: string; children: ReactNode }) => <div className={`st-card ${kind}`} data-shell-card={id}>{children}</div>;

/** The record has answered (or can't): the dashboard's chunk may start now, behind what the shopper is already reading. */
export function Counter({ onLanded }: Props) {
  const { feed } = useBoard();
  const answered = feed.state !== "reading";
  useEffect(() => { if (answered) onLanded(); }, [answered, onLanded]);
  return <div className="st-card tb-w-counter" data-shell-card="threat-counter" data-board="shell"><ThreatCounter /><ThreatViewLine said="" /></div>;
}
export const Time = (_: Props) => <Frame id="threat-time" kind="tb-w-time"><ThreatTimeline /></Frame>;
export const Rules = (_: Props) => <Frame id="threat-rules" kind="tb-w-rules"><ThreatRules /></Frame>;
export const Tries = (_: Props) => <Frame id="threat-tries" kind="tb-w-tries"><ThreatTries /></Frame>;
