// Decide: the best Clear seller under your limit rises with one Review, which opens Approve. When nothing is under it,
// Goose says so and won't pay over it; for an item the catalog knows, Watch for a drop saves a want at your limit (the
// same /api/runs/wants call Wants.tsx makes), so Goose waits for the price. It never buys on its own.
import { useState } from "react";
import { toCents, usdWhole } from "@goose/core/money";
import type { Run } from "../../goose/useRun.ts";
import { postJson } from "../live/api.ts";
import { Button } from "../ui/Button.tsx";
import { ArrowRightIcon } from "../ui/icons.tsx";
import type { CompareRow } from "./compare-rows.ts";
import { usd } from "./receipt-words.ts";

const whole = usdWhole;

export function Pick({ best, limit, onReview, demo = false }: { best: CompareRow; limit: number; onReview?: () => void; demo?: boolean }) {
  const under = (limit - toCents(best.price)) / 100;
  return (
    <section className="step decide" aria-labelledby="decide-h">
      <div className="decide-card">
        <div className="decide-copy">
          <p className="step-k">Goose's pick</p>
          <h2 id="decide-h" className="decide-name">{best.name}</h2>
          <p className="decide-line"><b className="figure">{usd(best.price)}</b>, {usd(under.toFixed(2))} under your {whole(limit)}. Nothing flagged.</p>
        </div>
        {demo ? null : <Button tone="ink" onClick={onReview}>Review<ArrowRightIcon size={18} /></Button>}
      </div>
    </section>
  );
}

export function Decide({ run, best, onReview }: { run: Run; best: CompareRow | null; onReview(): void }) {
  const [watch, setWatch] = useState<"idle" | "saving" | "saved" | string>("idle");
  const { limit, held, market } = run;
  if (best) return <Pick best={best} limit={limit} onReview={onReview} />;

  const catalogId = market?.recorded?.catalogId;
  const save = async () => {
    if (!catalogId || watch === "saving") return;
    setWatch("saving");
    const r = await postJson<{ error?: string }>("/api/runs/wants", { catalogId, priority: "really", max: limit });
    setWatch(r === "away" ? "Goose's server didn't answer. Nothing was saved." : r.error ? r.error : "saved");
  };
  return (
    <section className="step decide" aria-labelledby="decide-h">
      <div className="decide-card" data-empty="">
        <div className="decide-copy">
          <h2 id="decide-h" className="decide-name">Nothing under {whole(limit)} right now.</h2>
          <p className="decide-line">Goose won't pay over your limit.</p>
          {watch === "saved" ? <p className="decide-line" role="status">Saved. Goose watches for a price under {whole(limit)} and tells you; it never buys on its own.</p> : null}
          {watch !== "idle" && watch !== "saving" && watch !== "saved" ? <p className="shop-fail" role="alert">{watch}</p> : null}
        </div>
        <div className="decide-acts">
          {catalogId && watch !== "saved" ? <Button tone="ink" onClick={() => void save()} disabled={watch === "saving"}>{watch === "saving" ? "Saving…" : "Watch for a drop"}</Button> : null}
          {limit < held ? <Button tone="line" onClick={() => run.setLimit(held)}>Back to {whole(held)}</Button> : null}
        </div>
      </div>
    </section>
  );
}
