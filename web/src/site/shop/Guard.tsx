// Guard: the run as a scene you can read at a glance. Goose stands on a floor beside the golden egg (your limit, always in
// view) and lays each seller's offer on the counter in turn: a fair one is measured against the egg; a note that gives
// orders sends its number at the egg, the number bounces off, Goose steps in and the egg holds; the pick is set down at
// the end and the scene says nothing moves until you tap. A tray tallies the sellers as they are reached. Every state comes from the run itself (beats, jam, guarding,
// phase); nothing here invents a price or a verdict. Reduced motion: the run goes straight to "done", so this is the
// last frame, static.
import type { CSSProperties } from "react";
import { toCents, usdWhole } from "@goose/core/money";
import type { Run } from "../../goose/useRun.ts";
import { PULLS, pulledTo } from "../../goose/market.ts";
import { EggMark } from "../ui/Egg.tsx";
import { Stamp } from "../ui/Stamp.tsx";
import type { CompareRow } from "./compare-rows.ts";
import { shortName, usd } from "./receipt-words.ts";
import "./guard.css";

const GOOSE = `${import.meta.env.BASE_URL}site/goose-320.webp`;
const bare = (id: string) => id.replace(/^rm-/, "");
const whole = usdWhole;
const cap = (s: string) => `${s[0]?.toUpperCase() ?? ""}${s.slice(1)}`;
const cents = (n: number) => usd((n / 100).toFixed(2));

type Mood = "rest" | "read" | "guard" | "present";

export function Guard({ run, rows }: { run: Run; rows: CompareRow[] }) {
  const { beats, phase, limit, jam, guarding } = run;
  const finished = phase === "done" || phase === "stopped";
  const now = beats[beats.length - 1];
  const rowOf = (id: string) => rows.find((r) => bare(r.id) === id);
  const pick = rows.find((r) => r.best) ?? null;
  const card = phase === "stopped" ? null : finished ? pick : now ? rowOf(now.sellerId) ?? null : null;
  const aside = !finished && now?.kind === "aside";
  const pulls = aside && now.kind === "aside" && now.pulls ? pulledTo(now.quoted, limit) : null;
  const orders = aside && now.kind === "aside" && now.said.includes(PULLS);
  // What flies at the egg: the number the note named (the run's own jam), else the note itself while Goose is guarding.
  const reach = jam !== null ? whole(jam) : aside && guarding && pulls === null ? "Its note" : null;
  const presenting = Boolean(card?.best) && (finished || now?.kind === "under");
  const mood: Mood = phase === "stopped" ? "rest" : aside && guarding ? "guard" : presenting ? "present" : card || phase === "shopping" ? "read" : "rest";

  // The sellers tested so far, in the order Goose reached them.
  const order: string[] = [];
  for (const b of beats) if (!order.includes(b.sellerId)) order.push(b.sellerId);
  // Once it's done, Compare below is the record; the tray is only the run's own tally.
  const tray = (finished ? [] : order).map((id) => rowOf(id)).filter((r): r is CompareRow => Boolean(r));

  const said = ((): string => {
    if (phase === "stopped") return "";
    if (!card) return finished ? `Nothing cleared under your ${whole(limit)}. Goose buys nothing.` : "Goose is reading the sellers.";
    const name = shortName(card.name), price = usd(card.price), c = toCents(card.price);
    if (presenting) return `Goose's pick: ${name} at ${price}. Nothing moves until you tap.`;
    if (card.verdict === "aside") {
      if (pulls) return `${name}'s note asked for ${whole(pulls)}. Your limit stays ${whole(limit)}.`;
      return orders ? `${name}'s note gave Goose orders. Set aside; your ${whole(limit)} limit didn't move.` : `${name} is set aside.`;
    }
    if (card.verdict === "over") return `${name} asks ${price}, over your ${whole(limit)}. Goose won't offer it.`;
    if (card.verdict === "held") return `${name} is held for your yes.`;
    return `${name} asks ${price}, ${cents(Math.max(limit - c, 0))} under your ${whole(limit)}.`;
  })();

  return (
    <div className="guard" data-mood={mood} data-hit={reach !== null ? "" : undefined} data-finished={finished ? "" : undefined}>
      <div className="gd-stage">
        <div className="gd-slot">{card ? <Offer key={beats.length} row={card} limit={limit} present={presenting} /> : null}</div>
        <div className="gd-floor">
          <span className="gd-goose" aria-hidden="true"><img className="gd-goose-img" key={`${mood}-${beats.length}`} src={GOOSE} alt="" width={216} height={320} draggable={false} /></span>
          <span className="gd-egg">
            <EggMark className="gd-egg-art" limit={whole(limit)} />
            {reach !== null ? <span className="gd-ring" aria-hidden="true" /> : null}
          </span>
          {reach !== null ? <span className="gd-pill figure" aria-hidden="true">{reach}</span> : null}
        </div>
      </div>
      <p className="gd-say" role="status" key={said}>{said}</p>
      {tray.length > 0 ? (
        <ul className="gd-tray" aria-hidden="true">
          {tray.map((r) => (
            <li key={r.id} className="gd-chip" data-verdict={r.verdict} data-best={r.best && now?.kind === "under" ? "" : undefined}>
              <span className="gd-chip-name">{shortName(r.name)}</span>
              <span className="gd-chip-price figure">{usd(r.price)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** One offer laid on the counter: its price against your limit, then the verdict struck; a note that gives orders is read aloud and marked. */
function Offer({ row, limit, present }: { row: CompareRow; limit: number; present: boolean }) {
  const c = toCents(row.price);
  const [plain, fiction] = /^(.*?)\s*(\(fictional\))$/.exec(row.name)?.slice(1) ?? [row.name, null];
  return (
    <article className="gd-card" data-verdict={row.verdict} data-present={present ? "" : undefined} style={{ "--fill": Math.min(c / limit, 1) } as CSSProperties}>
      <header className="gd-card-top">
        <h3 className="gd-card-name">{plain}{fiction ? <span className="gd-card-fiction"> {fiction}</span> : null}</h3>
        <span className="gd-card-price figure">{row.price ? usd(row.price) : ""}</span>
      </header>
      {row.verdict !== "aside" ? <span className="gd-track" aria-hidden="true" /> : null}
      <div className="gd-card-foot">
        {present ? <span className="gd-card-pick">Goose's pick</span> : null}
        <Stamp verdict={row.verdict} {...(row.verdict === "aside" && row.reason ? { reason: cap(row.reason) } : {})} />
      </div>
      {row.verdict === "aside" && row.quoted ? <p className="gd-note"><span>“{row.quoted}”</span></p> : null}
    </article>
  );
}
