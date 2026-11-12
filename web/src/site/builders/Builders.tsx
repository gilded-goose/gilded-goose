// Builders: everything in the repo for a judge, in the README's own words, each linked to where it runs (the Desk app
// is served from the same site at /). Then the guard as a package, the sponsor tools, and what we didn't check.
import type { RefCallback } from "react";
import { appHref } from "../../menu/href.ts";
import { hrefOf } from "../route.ts";
import "../home/sections.css";
import "./builders.css";

type Item = { name: string; line: string; href?: string; where: string };

const OPEN: readonly Item[] = [
  { name: "The Desk", line: "The three promises, Ask (typed, or hold the mic), Try to trick Goose, then the run, the deal card, Approve, Paid.", href: "/?desk=1", where: "/?desk=1" },
  { name: "Behind the scenes", line: "The Live Threat Board, AG Studio's Ask for a view, and this browser's ledger in AG Grid: who decided, which rule, which row.", href: hrefOf("under-the-hood"), where: "/?desk=ledger" },
  { name: "Judge tour", line: "Each promise with its proof, one button each.", href: "/?desk=tour", where: "/?desk=tour" },
  { name: "Your Christmas list", line: "Gifts under one total the guard won't let a cart pass, Goose's Buy now, Wait or Skip on each, on prices labeled simulated.", href: hrefOf("list"), where: "/?desk=list" },
  { name: "The haggle", line: "The recorded week's haggle as a price ladder, round by round.", href: hrefOf("haggle"), where: "/?desk=haggle" },
  { name: "How it works", line: "You, Goose, the Watcher, the guard and PayPal, one sentence each, each with the file that does it.", href: hrefOf("how"), where: "/?desk=how" },
  { name: "The wallet", line: "The kettle week: a deal haggled to $47.73, one seller set aside, and an Approve button that makes a real sandbox order.", href: "/?wallet=1", where: "/?wallet=1" },
  { name: "Try to break it", line: "The same check beside a guard-off control that sends its price straight to PayPal, unpaid and never captured.", href: "/?desk=1#challenge", where: "/?desk=1#challenge" },
  { name: "A fictional market", line: "Search, cart, complete, modeled on PayPal Store Sync's published cart flow; not connected to Store Sync.", href: hrefOf("market"), where: "/?market=1" },
  { name: "On-device voice", line: "The Desk's mic turns speech into text in the browser with Whisper tiny.en. Your audio never leaves the device; the mic only fills the Ask box.", href: "/?desk=1", where: "/?desk=1, the mic" },
  { name: "Your name, kept here", line: "Say “call me Sam” and Goose remembers it in this browser only; go-to commands only navigate, never start a run, approve or pay.", href: "/?desk=1", where: "/?desk=1, the mic" },
];

const SPONSORS: readonly Item[] = [
  { name: "AG Grid", line: "AG Studio, AG Grid and AG Charts in Behind the scenes; AG Grid also runs Under the hood here.", href: hrefOf("under-the-hood"), where: "/?desk=ledger" },
  { name: "Channel3", line: "Real stores' prices beside Goose's pick, for reference only. You can't buy them through Goose.", where: "Shop, Decide step" },
  { name: "Render", line: "The live site runs on Render, with a health check at /api/health.", href: "/api/health", where: "render.yaml" },
  { name: "Postman", line: "Check one tap, one exact cart, with no account and no keys: create, get, capture, a mock decline, and the guard refusing a changed cart.", where: "docs/builders/" },
];

const CODE: readonly Item[] = [
  { name: "@gilded-goose/trust", line: "The guard, the Watcher and its reader as their own package. About ten lines put it in front of any checkout, and our tests run those lines.", where: "trust/README.md" },
  { name: "Your limits", line: "Live in code, whatever the AI says. Every shopper's payment is created, held, captured or voided by the guard.", where: "trust/src/guard.ts" },
  { name: "The buyer agent", line: "Claude Haiku 5.5 with one forced tool whose schema is the move. It has no PayPal tool and no Approve button.", where: "server/" },
  { name: "PayPal", line: "Orders v2 and Payments v2 over REST, sandbox only: authorize, then capture after your tap, or void. Agent Toolkit 1.11.0 for get_order, refunds, tracking and disputes.", where: "server/" },
  { name: "Replayable core", line: "Pure TypeScript with the clock, randomness and hash injected, so a seeded run replays byte for byte.", where: "core/" },
];

const NOT: readonly string[] = [
  "Live PayPal (not sandbox) is untested.",
  "Not built: a real shipment tracker in the sandbox, PayPal's transaction report, and anything with live money.",
  "Limits are per browser: another browser starts fresh, and so does this one after seven days without a visit.",
  "The Watcher can miss a scam. That is why your tap is always the last step.",
];

function List({ items }: { items: readonly Item[] }) {
  return (
    <ul className="bd-list" role="list">
      {items.map((i) => (
        <li key={i.name} className="bd-row">
          <span className="bd-name">{i.name}</span>
          <span className="bd-line">{i.line}</span>
          {i.href ? <a className="bd-where" href={appHref(i.href)}>{i.where}</a> : <code className="bd-where">{i.where}</code>}
        </li>
      ))}
    </ul>
  );
}

// The Try-the-guard part: this page pays only for the room the part takes and these few lines. The part (heading,
// box, the package's readSeller, every word) is TryGuard's own chunk, asked for once, the first time this room nears the
// screen (within one screen's height of it, so someone tabbing or reading down the page finds the heading and the box in
// their place, not behind them): the observer lets go on that first hit, so a chunk that never arrives is one request and one message, never a
// retry. No state here, so nothing re-renders and the ref below is called once; the chunk draws itself into the room.
// (The ref returns its cleanup, so React never calls it with null: hence the cast where it's used.)
const tryGuard = (el: HTMLElement) => {
  const io = new IntersectionObserver((e) => e.at(-1)!.isIntersecting && (io.disconnect(), import("./TryGuard.tsx").then((m) => m.default(el), () => { el.role = "alert"; el.textContent = "Didn’t load. Reload to try it."; })), { rootMargin: "100%" });
  io.observe(el);
  return () => io.disconnect();
};

export function Builders() {
  return (
    <div className="wrap pg bd">
      <header className="bd-head">
        <h1 className="sx-h sx-h-page">Everything in the repo</h1>
        <p className="sx-lede">Every part of Gilded Goose, one line each, with where to open it. All practice: fictional sellers, recorded weeks and PayPal’s sandbox. No real money moves.</p>
      </header>

      <section className="bd-sec" aria-labelledby="bd-open">
        <h2 id="bd-open" className="bd-h">What you can open</h2>
        <List items={OPEN} />
      </section>

      <section className="bd-sec" aria-labelledby="bd-code">
        <h2 id="bd-code" className="bd-h">The guard, in code</h2>
        <List items={CODE} />
      </section>

      <div ref={tryGuard as RefCallback<HTMLDivElement>} />

      <section className="bd-sec" aria-labelledby="bd-sponsors">
        <h2 id="bd-sponsors" className="bd-h">Sponsor tools, and how we used each</h2>
        <List items={SPONSORS} />
      </section>

      <section className="bd-sec" aria-labelledby="bd-not">
        <h2 id="bd-not" className="bd-h">What we didn’t check</h2>
        <ul className="bd-not" role="list">{NOT.map((n) => <li key={n}>{n}</li>)}</ul>
      </section>
    </div>
  );
}
