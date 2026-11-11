// Judge in 60 seconds (spec §6.6): the stops, in the video's order, each a link to the real thing. A skeleton from
// Task 1; Task 8 finishes it (which stop you're on, opening Shop with Under the hood open).
import { appHref } from "../../menu/href.ts";
import { hrefOf } from "../route.ts";
import { Sheet } from "../ui/Sheet.tsx";
import { ArrowRightIcon } from "../ui/icons.tsx";
import "./judge.css";

export const JUDGE_STOPS: readonly { title: string; line: string; href: string; ask?: string }[] = [
  { title: "Meet Goose", line: "Your agent shops. Only your tap pays. One recorded purchase, from your limit to the tap.", href: hrefOf("home", "hero") },
  { title: "Watch Goose test four sellers", line: "Opens the Shop on a kettle under $60. Tap Send Goose: one seller's note tries to give it orders.", href: hrefOf("shop"), ask: "A kettle under $60" },
  { title: "Try to trick it", line: "Write a seller's note yourself and see what Goose does with it.", href: hrefOf("home", "trick") },
  { title: "Your limit holds", line: "The same note with the guard off, then on: the egg doesn't move.", href: hrefOf("home", "guard") },
  { title: "Approve it yourself", line: "The run ends on one pick. Review it: nothing moves until you tap approve.", href: hrefOf("shop"), ask: "A kettle under $60" },
  { title: "The receipt and the proof", line: "What was measured, and the sandbox payments with PayPal's own ids.", href: hrefOf("proof") },
];

const primeAsk = (ask?: string) => {
  if (!ask) return;
  try { sessionStorage.setItem("gg-ask", ask); } catch { /* storage blocked: Shop opens with an empty Ask */ }
};

export function JudgeOverlay({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Judge in 60 seconds" wide>
      <p className="judge-lede">{JUDGE_STOPS.length} stops, in the order the video shows them. Each one opens the real thing.</p>
      <ol className="judge-stops" role="list">
        {JUDGE_STOPS.map((s, i) => (
          <li key={s.title}>
            <a className="judge-stop" href={appHref(s.href)} onClick={() => { primeAsk(s.ask); onClose(); }}>
              <span className="judge-n" aria-hidden="true">{i + 1}</span>
              <span className="judge-words">
                <span className="judge-title">{s.title}</span>
                <span className="judge-line">{s.line}</span>
              </span>
              <ArrowRightIcon className="judge-go" />
            </a>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
