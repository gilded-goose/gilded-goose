// Recommendation: where the run lands. Goose's pick as the one thing on the page: the seller, the price in large figures,
// what it leaves of your limit (the golden egg, with a nest line showing what you'd pay and what stays yours), how it
// compares with the next seller Goose cleared, which sellers were set aside and why, and the single action. Everything
// is the run's own: prices and verdicts come from the compared rows, savings are only ever "less than the next seller
// Goose cleared" (never a made-up list price), and the button opens the same Approve sheet; Goose cannot approve.
import { toCents, usdWhole } from "@goose/core/money";
import { Button } from "../ui/Button.tsx";
import { Egg } from "../ui/Egg.tsx";
import { Nest } from "../ui/Nest.tsx";
import { ArrowRightIcon } from "../ui/icons.tsx";
import type { CompareRow } from "./compare-rows.ts";
import { shortName, usd } from "./receipt-words.ts";
import "./recommendation.css";

const GOOSE = `${import.meta.env.BASE_URL}site/goose-192.webp`;
const whole = usdWhole;
const cents = (n: number) => usd((n / 100).toFixed(2));
const cap = (s: string) => `${s[0]?.toUpperCase() ?? ""}${s.slice(1)}`;

export function Recommendation({ rows, limit, onReview }: { rows: CompareRow[]; limit: number; onReview(): void }) {
  const pick = rows.find((r) => r.best);
  if (!pick) return null;
  const price = toCents(pick.price);
  const cleared = rows.filter((r) => !r.best && r.verdict === "clear" && r.underLimit);
  const next = cleared[0];
  const saves = next ? toCents(next.price) - price : 0;
  const aside = rows.filter((r) => r.verdict === "aside");

  return (
    <section className="rec glass" aria-labelledby="rec-h">
      <div className="rec-main">
        <span className="rec-egg"><Egg size="m" engraving={`Your nest egg · ${whole(limit)}`} moment="approve" /></span>
        <div className="rec-copy">
          <p className="rec-k">Goose's pick</p>
          <h2 id="rec-h" className="rec-name">{shortName(pick.name)}<span className="rec-fiction"> (fictional)</span></h2>
          <p className="rec-price figure">{usd(pick.price)}</p>
        </div>
      </div>

      <Nest limit={limit} spend={price} spendWords="if you approve" />

      <ul className="rec-facts">
        <li>Cleared by Goose's checks. Nothing flagged.</li>
        {next ? <li><b className="figure">{cents(saves)}</b> less than {shortName(next.name)}, the next seller Goose cleared.</li> : <li>The only seller Goose cleared under your limit.</li>}
        {aside.map((r) => (
          <li key={r.id} className="rec-aside"><b>Set aside:</b> {shortName(r.name)}. {r.reason ? `${cap(r.reason)}.` : "Its note tried to give Goose orders."}</li>
        ))}
      </ul>

      <div className="rec-act">
        <img className="rec-goose" src={GOOSE} alt="" width={130} height={192} draggable={false} />
        <div className="rec-act-copy">
          <p className="rec-wait">Nothing moves until you tap.</p>
          <p className="rec-wait-sub">You approve this exact cart in PayPal. Goose can't.</p>
        </div>
        <Button id="rec-cta" tone="ink" onClick={onReview}>Review and approve<ArrowRightIcon size={18} /></Button>
      </div>
    </section>
  );
}
