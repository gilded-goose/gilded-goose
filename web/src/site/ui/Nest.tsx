// The nest line: the whole bar is your limit (the egg's number), the gold is what this payment takes, the pale rest is what
// stays yours. One pattern, used on the recommendation, the approval sheet and the receipt, so the egg, the limit and
// your control read as one idea. Only transform animates; reduced motion shows it filled.
import { usd, usdWhole } from "@goose/core/money";
import type { CSSProperties } from "react";
import "./nest.css";

const dollars = usd;
const whole = usdWhole;

/** `spend` and `limit` are cents. `spendWords` finishes "$42.00 …" ("if you approve", "you approve", "paid"); `keepWords` finishes "$18.00 of your $60 …". */
export function Nest({ limit, spend, spendWords, keepWords = "stays yours" }: { limit: number; spend: number; spendWords: string; keepWords?: string }) {
  const left = Math.max(limit - spend, 0);
  return (
    <div className="nest" style={{ "--share": Math.min(spend / limit, 1) } as CSSProperties}>
      <span className="nest-bar" aria-hidden="true" />
      <p className="nest-line">
        <span><b className="figure">{dollars(spend)}</b> {spendWords}</span>
        <span><b className="figure">{dollars(left)}</b> of your {whole(limit)} {keepWords}</span>
      </p>
    </div>
  );
}
