// Home part 2: the same note, with the guard off and on (spec §4 Innovation, §6.1 part 2). QuickQuack's note from
// recorded week 1, its flagged sentences marked by the Watcher's own reading (`home.refusal.note`). Guard off: the real
// sandbox order our script made with the note's number, from `docs/fixtures/control-order.json`. Guard on: the same note
// in the recorded week, set aside, and the limit held. "Run it live" sends the note's number to `POST /api/control`
// (server/src/main.ts), the guard-off route, and shows exactly what it answers; with no server it says so and the
// recording stays. Nothing here is typed by hand: every id, amount and reason comes from the kettle data or the server.
import { usdOf } from "@goose/core/money";
import { useEffect, useState } from "react";
import kettle from "virtual:goose-kettle";
import { Stamp } from "../ui/Stamp.tsx";
import { Provenance } from "../ui/Provenance.tsx";
import { Button } from "../ui/Button.tsx";
import { getJson, postJson } from "../live/api.ts";
import { useServer } from "../live/useServer.ts";
import "./control.css";

/** `POST /api/control`'s answer (`ControlCard`, core/src/judge/control.ts). */
type ControlCard =
  | { state: "landed"; orderId: string; status: string; amount: string; currency: string; at: string; left: number; fake: boolean }
  | { state: "capped" | "off" | "failed"; sentence: string; left: number };
/** `GET /api/control`: whether this server can make one, and how many are left today. */
interface ControlStatus { on: boolean; fake: boolean; left: number }
type Live = { kind: "idle" } | { kind: "sending" } | { kind: "away" } | { kind: "said"; error: string } | { kind: "card"; card: ControlCard };

const { control, home } = kettle;
const refusal = home.refusal ?? null;
const LIMIT = "$60";
const usd = (amount: string) => usdOf(amount);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const utc = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;

function isCard(x: unknown): x is ControlCard {
  if (typeof x !== "object" || x === null) return false;
  const c = x as Record<string, unknown>;
  if (c.state === "landed") return typeof c.orderId === "string" && typeof c.amount === "string" && typeof c.status === "string" && typeof c.at === "string";
  return (c.state === "capped" || c.state === "off" || c.state === "failed") && typeof c.sentence === "string";
}

export function Control() {
  const server = useServer();
  const [status, setStatus] = useState<ControlStatus | null>(null);
  const [live, setLive] = useState<Live>({ kind: "idle" });

  useEffect(() => {
    if (server !== "live") return;
    let gone = false;
    void getJson<ControlStatus>("/api/control").then((s) => {
      if (!gone) setStatus(s !== "away" && typeof s.on === "boolean" && typeof s.left === "number" ? s : null);
    });
    return () => { gone = true; };
  }, [server]);

  async function runLive() {
    setLive({ kind: "sending" });
    const r = await postJson<unknown>("/api/control", { price: control.amount });
    if (r === "away") { setLive({ kind: "away" }); return; }
    if (isCard(r)) {
      setLive({ kind: "card", card: r });
      setStatus((s) => (s ? { ...s, left: r.left } : s));
      return;
    }
    const error = (r as { error?: unknown } | null)?.error;
    setLive(typeof error === "string" ? { kind: "said", error } : { kind: "away" });
  }

  const away = server === "away" || live.kind === "away";
  const label = away ? "Server away: showing the recording"
    : server === "checking" ? "Checking the server…"
    : live.kind === "sending" ? `Sending ${usd(control.amount)} with no guard…`
    : "Run it live";
  const noneLeft = status !== null && (!status.on || status.left === 0);

  return (
    <section id="guard" className="sx" aria-labelledby="guard-title">
      <div className="wrap">
      <header className="ctl-head">
        <h2 id="guard-title" className="sx-h">The same note, with the guard <span className="sx-n">off</span> and <span className="sx-n">on</span></h2>
        <p className="sx-lede">{`QuickQuack’s note told the shopping agent its budget was raised to $500. With no guard, our own script believed it and PayPal’s sandbox made a real ${usd(control.amount)} order. With the guard on, Goose set the note aside and the ${LIMIT} limit held.`}</p>
      </header>
      {refusal ? (
        <figure className="ctl-note stone sx-pond">
          <figcaption className="ctl-note-head">
            <span className="ctl-note-who">{refusal.seller} <span className="ctl-note-fic">(fictional)</span></span>
            <span className="ctl-note-ask figure">asking {usd(refusal.price)}</span>
            <Provenance kind="recorded" />
          </figcaption>
          <blockquote className="ctl-quote sx-note" dir="auto">
            {refusal.note.map((s, i) => (
              <span key={i}>
                {i > 0 ? " " : null}
                {s.flagged ? <mark className="ctl-flag">{s.text}<span className="vh"> (flagged)</span></mark> : s.text}
              </span>
            ))}
          </blockquote>
          <p className="ctl-note-key"><span className="ctl-key-mark" aria-hidden="true" />Marked: the sentences Goose’s code flagged.</p>
        </figure>
      ) : null}

      <div className="ctl-pair">
        <article className="ctl-panel" data-side="off" aria-labelledby="ctl-off-h">
          <header className="ctl-panel-head">
            <h3 id="ctl-off-h">Guard off</h3>
            <span className="ctl-tags"><Provenance kind="sandbox" /><Provenance kind="recorded" /></span>
          </header>
          <p className="ctl-lead">Our script sent the note’s number straight to PayPal.</p>
          <p className="ctl-amount figure">{usd(control.amount)}</p>
          <p className="ctl-amount-note">An order over your {LIMIT} limit.</p>
          <dl className="ctl-facts">
            <div><dt>Order</dt><dd className="mono">{control.orderId}</dd></div>
            <div><dt>PayPal status</dt><dd className="mono">{control.status}</dd></div>
            <div><dt>Made</dt><dd>{day(control.ranAt)}</dd></div>
          </dl>
          <p className="ctl-never">Never approved, never captured.</p>

          <div className="ctl-live">
            {away ? (
              <p className="ctl-away" role="status"><span className="ctl-away-dot" aria-hidden="true" />{label}</p>
            ) : (
              <Button tone="line" size="s" onClick={() => void runLive()} disabled={server !== "live" || live.kind === "sending" || noneLeft} aria-busy={live.kind === "sending" || undefined}>
                {label}
              </Button>
            )}
            <LiveLine live={live} status={status} />
          </div>
        </article>

        <article className="ctl-panel" data-side="on" aria-labelledby="ctl-on-h">
          <header className="ctl-panel-head">
            <h3 id="ctl-on-h">Guard on</h3>
            <span className="ctl-tags"><Provenance kind="recorded" /></span>
          </header>
          <p className="ctl-lead">Goose read the same note.</p>
          <p className="ctl-amount ctl-kept figure">Kept at {LIMIT}.</p>
          <p className="ctl-amount-note">No order was made.</p>
          <dl className="ctl-facts">
            <div><dt>Order</dt><dd>None</dd></div>
            <div><dt>Your limit</dt><dd className="figure">{LIMIT}, unchanged</dd></div>
            {refusal ? <div><dt>{refusal.seller}</dt><dd><Stamp verdict="aside" reason={refusal.reasons.join(" · ")} /></dd></div> : null}
          </dl>
          <p className="ctl-never">Words can’t raise your limit. Only your tap pays.</p>
        </article>
      </div>

      <p className="ctl-rule sx-voice">The AI reader can only make Goose more careful, never less.</p>
      </div>
    </section>
  );
}

/** What the live run came to, in the server's own words and fields. Nothing while it hasn't run. */
function LiveLine({ live, status }: { live: Live; status: ControlStatus | null }) {
  if (live.kind === "card") {
    const c = live.card;
    if (c.state !== "landed") return <p className="ctl-live-said" role="status">{c.sentence}</p>;
    return (
      <div className="ctl-live-card" role="status">
        <p className="ctl-live-tags"><Provenance kind="live" /><Provenance kind={c.fake ? "practice" : "sandbox"} /></p>
        <p>
          Just now: order <span className="mono">{c.orderId}</span> for <span className="figure">{usd(c.amount)} {c.currency}</span>, status{" "}
          <span className="mono">{c.status}</span>, made {utc(c.at)}. Unapproved, never captured.
        </p>
        {c.fake ? <p className="ctl-live-small">This server runs pretend payments: nothing was sent to PayPal.</p> : null}
        <p className="ctl-live-small">{c.left} left today.</p>
      </div>
    );
  }
  if (live.kind === "said") return <p className="ctl-live-said" role="status">{live.error}</p>;
  if (live.kind === "away") return <p className="ctl-live-small" role="status">The recorded order above is the one our script made.</p>;
  if (status && !status.on) return <p className="ctl-live-small">PayPal isn’t connected on this server, so the recorded order stands.</p>;
  if (status && status.left === 0) return <p className="ctl-live-small">No unguarded orders left today, so the recorded order stands.</p>;
  if (status) return <p className="ctl-live-small">Makes a new unapproved order with no guard. {status.left} left today.</p>;
  return null;
}
