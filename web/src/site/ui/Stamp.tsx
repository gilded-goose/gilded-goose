// The stamp: every verdict on the site is struck with the same 90ms press (spec §3, the signature). Unstruck, it is the
// blank die: the words in plain ink, no colour, so the content is there before anything moves. Struck, it takes the
// verdict's colour; the strike plays once, when `struck` first becomes true. Reduced motion shows it already struck.
import { stampWords, type Verdict } from "./stamp.ts";
import "./ui.css";

export function Stamp({ verdict, reason, struck = true }: { verdict: Verdict; reason?: string; struck?: boolean }) {
  return (
    <span className="stamp" data-verdict={verdict} data-struck={struck ? "" : undefined}>
      <span className="stamp-die">{stampWords(verdict)}</span>
      {reason ? <span className="stamp-reason">{reason}</span> : null}
    </span>
  );
}
