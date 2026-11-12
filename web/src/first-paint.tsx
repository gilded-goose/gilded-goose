// W64b: the wallet's first paint, shared by the wallet itself and by the build, which renders it into index.html
// (scripts/prerender-wallet.ts) so a phone sees the deal before the wallet's JS arrives. One component for both, so the
// HTML a visitor sees first is the same as what React draws over it.
//
// Design B, the guard's desk (Joshua, Thu Oct 29): the refusal leads. A dark desk band holds the header, the headline
// counted from the Watcher's rows, and two trays of the same width: the seller notes as they reached the Watcher (the
// refused one stamped), and Goose's haggle over the deal waiting for your tap. The replay is CSS only (wallet.css,
// `.desk[data-replay="play"]`); every box is drawn at its final size, and the motion is opacity, transforms and shadows
// inside those boxes, so nothing moves the deal. W4 (Round 2): the page opens settled; the replay plays only when asked.

import { appHref } from "./menu/href.ts";
import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import { type DeskMove, type WalletDeal, type WalletDesk, type WalletRefusal } from "@goose/core/wallet";
import { ledgerRowHref } from "@goose/core/wallet-flag";
import { Lockup } from "./brand/Lockup.tsx";
import { SANDBOX_NEXT } from "./states/words.ts";
import { usdOf } from "@goose/core/money";

export const EGG = "M20 2C10 2 3 18 3 29a17 17 0 0 0 34 0C37 18 30 2 20 2Z";

/** The recorded week the wallet shows, and the one its Approve replays on the server. */
export const WALLET_WEEK = 1;

/**
 * The gilt egg, Goose's one mark for where it protects you: a check on the tap, an × on a refusal, a lock on the limit.
 * Each egg carries its own gradient, so an egg inside a hidden view never takes another's fill with it.
 */
export function Egg({ className, mark = "check" }: { className?: string; mark?: "check" | "x" | "lock" | "plain" }) {
  const id = `wgold-${mark}`;
  return (
    <svg className={className} viewBox="0 0 40 48" width="20" height="24" aria-hidden="true">
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6dc86" /><stop offset=".55" stopColor="#d4a62a" /><stop offset="1" stopColor="#9c7412" /></linearGradient></defs>
      <path d={EGG} fill={`url(#${id})`} /><ellipse cx="12.5" cy="17" rx="2.6" ry="5" fill="#fff" opacity=".4" transform="rotate(22 12.5 17)" />
      {mark === "check" && <path d="M12.5 28.5l5.5 5.5 10-12" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />}
      {mark === "x" && <path d="M14 23l12 12M26 23L14 35" fill="none" stroke="#fff" strokeWidth="3.8" strokeLinecap="round" />}
      {mark === "lock" && <><rect x="13" y="26" width="14" height="11" rx="2" fill="#fff" /><path d="M15.5 26v-3a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="#fff" strokeWidth="2.8" /></>}
    </svg>
  );
}

export type WalletTab = "desk" | "settings";

/**
 * The wallet's header: the one nav every page wears (Joshua, Fri 3:40 PM; S1, web/src/nav), as plain markup here so the
 * first paint carries it with no JS (its styles are nav.css, which wallet.css imports). The menu button is inert until
 * the wallet arrives and passes the real one (`menu`).
 * W4 (Round 2's design judge: "the wallet still reads as its own site"): the landing's bar, item for item (index.html,
 * SiteNav.tsx): brand, "Practice only", the menu, Shopper · Behind the scenes, "Judge? Start here". The wallet is a
 * shopper's room, so Shopper is the open view (aria-current "true": the section, not this exact page, as SiteNav marks
 * Proof inside Behind the scenes). The wallet's own Settings is a link in the page (DeskHead's side, and back from the
 * Settings head), not a view in the bar. On a phone the views live in the menu sheet (S1-13 retired the bottom rail).
 */
export function WalletTop({ tab, menu }: { tab: WalletTab; menu?: ReactNode }) {
  return (
    <header className="gn dk-nav wnav" data-tab={tab}>
      {/* W6 (the Lead, S1-11's skip link on the wallet): the first Tab stop; ./skip.ts moves focus to the page. */}
      <a className="gn-skip" href="#main">Skip to content</a>
      <div className="dk-nav-in">
        {/* B-11 (brand.md 10.1): the lockup, whose egg-o is the first screen's only egg (DD, 10.2). */}
        <Lockup />
        <span className="dk-practice-ph">Practice only</span>
        <div className="dk-grow" />
        {menu ?? <button type="button" className="gm-btn dk-menu" aria-haspopup="dialog" aria-expanded="false"><span className="gm-w">Everything Goose does <svg viewBox="0 0 12 8" aria-hidden="true"><path d="m1 1.5 5 5 5-5" /></svg></span><span className="gm-ph">Menu</span></button>}
        <div className="dk-layer" role="group" aria-label="View"><a href={appHref("?desk=1")} aria-current="true">Shopper</a><a href={appHref("?desk=ledger")}>Behind the scenes</a></div>
        <a className="dk-judge" href={appHref("?desk=tour")}><span>Judge<span className="dk-jl">? Start here</span></span><span className="dk-jt"> tour</span> <span className="dk-arr" aria-hidden="true">›</span></a>
      </div>
    </header>
  );
}

/** The plain padlock Approve wears; in the deal card's limit line it takes the line's --gold (DD, 10.2: the egg is the lockup's alone). */
export const LockGlyph = () => <svg viewBox="8 14 24 29" width="20" height="24" aria-hidden="true"><rect x="13" y="26" width="14" height="11" rx="2" fill="currentColor" /><path d="M15.5 26v-3a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="currentColor" strokeWidth="2.8" /></svg>;

/** The deal card's top: where the deal stands, what it is, from whom, and its price beside your limit, locked by code. */
export function HeroTop({ d, limit, k, kicker }: { d: WalletDeal; limit: string | null; k: "paid" | "wrong" | "held" | "tap"; kicker: string }) {
  return (
    <>
      <div className="dt">
        <div className="ttl">
          <p className={`kicker k-${k}`}>{kicker}</p>
          <h2 id="hero-h">{d.item}</h2>
          {/* "(fictional)" is said by the banner and the footer; the card names the seller plainly (W59 review). */}
          <p className="from">from {d.seller.replace(" (fictional)", "")}</p>
        </div>
      </div>
      {/* W59: the limit beside the price, from the Policy (entryLimit); the gold lock says code holds it there. Track W: a
          protection line (gold lock, gold words), never a gold-edged box: only the deal card carries a gold edge. */}
      <div className="prow"><div className="price" data-v="total">{usdOf(d.total)}</div>{limit && <p className="lim" data-v="limit"><LockGlyph /><span><b><small>Your limit:</small> {usdOf(limit)}</b> locked by code</span></p>}</div>
      {/* W59: no clock and no rush: the reason it's a good price, said calmly. */}
      {/* H2: the verb is core's (`how-got.ts`, from the run's rows): the kettle was haggled, never waited for. */}
      {d.lead && <p className="below">{d.lead} <span className="nw"><b>{usdOf(d.below)} below</b> their</span> <span className="nw">{usdOf(d.opening)} ask</span></p>}
    </>
  );
}

/** A replay step's moment, in seconds from the start of a replay the shopper asked for: the CSS reads it. */
const at = (s: number) => ({ "--at": `${s}s` }) as CSSProperties;

/**
 * Who made Goose's moves, in pieces a phone can shorten: core's label is "recorded · <model> · <date>" (buyerLabel).
 * W4 (Round 2's consumer test): shopper copy names no model, the way the Desk's footnote doesn't ("Sellers are simulated
 * by an AI model, for practice."): the moves are "by an AI model" (which one is on the Proof page). A wide screen:
 * "From the recorded run, week 1 · Goose's moves by an AI model · 2026-10-23"; a phone: "Recorded · moves by an AI model".
 * A week with no AI move ("plain rule, no AI") says so as it is.
 */
function Provenance({ label }: { label: string }) {
  const [src, model] = label.split(" · ");
  if (src !== "recorded" || !model) return <span>{label.replace(/Claude Haiku [\d.]+/g, "an AI model")}</span>;
  // W-8: the phone's short form at every width (the date and the week number live on the run page and in the ledger).
  return <span className="lfull">Recorded · moves by an AI model</span>;
}

/**
 * The headline: how many sellers Goose set aside this week (the Watcher refused them), counted from its rows, then the
 * one line under it. W4 (Round 2's design judge): in the Desk's voice, on the room title's scale (--t-h1, the lead under
 * it at --t-lead). One verb for the act, "set aside", as every stamp, slip and ledger row says it (DD, NITS-1).
 * W-8 (the calm hero, Joshua Sat 3:30 AM): the headline, its one line, and the honesty label as one short line; the
 * replay and Settings left the first screen (the week's own section, and Your week). With no desk (the empty week) the
 * headline is Ask's question.
 */
export function DeskHead({ desk, label }: { desk: WalletDesk | null; label: string | null }) {
  const n = desk?.refused ?? 0;
  return (
    <div className="dhead">
      {desk
        ? <h1>Goose set {n === 0 ? "no sellers" : <><span className="dnum">{n}</span> seller{n === 1 ? "" : "s"}</>} aside this week.</h1>
        : <h1>What should Goose find?</h1>}
      <p className="dline">Nothing is paid until you tap.</p>
      {/* Who made the moves, one quiet line (PROFILE "Labels on screen"): a replay never reads as live AI. */}
      {desk && <p className="dlabel">{label ? <Provenance label={label} /> : `Recorded week ${WALLET_WEEK}`}</p>}
    </div>
  );
}

/** W-8: the hero's chips, each one tap to ask Goose in those words (an Ask: never a run, never a payment). */
export const WALLET_CHIPS = ["A black kettle", "Running shoes", "A Marsh Lights ticket"] as const;

/**
 * W-8: the Ask box as the first paint draws it, in AskGoose's own hero markup (its form, its chips), so the box doesn't
 * move when the wallet's JS draws the live one over it. Inert: read-only, and its buttons do nothing yet.
 */
export function AskShell({ heading }: { heading: string }) {
  return (
    <section className="askg ahero" aria-labelledby="ask-h">
      {/* The live box's own visible label (AskGoose's hero), the same height, so nothing moves when it takes over. */}
      <label htmlFor="want" id="ask-h" className="ahlabel">{heading}</label>
      <form className="askrow dk-glass" autoComplete="off">
        <textarea id="want" rows={2} readOnly placeholder="e.g. a black kettle like mine" />
        <button type="button" className="btn">Ask</button>
        <span className="btn ghost snap" aria-hidden="true">Snap it</span>
      </form>
      <ul className="wchips" aria-label="Try asking">{WALLET_CHIPS.map((c) => <li key={c}><button type="button" className="wchip">{c}</button></li>)}</ul>
    </section>
  );
}

/**
 * W-8, the calm hero: the headline, its one line and the Ask box with its chips; beside them (under them on a phone) the
 * one fact, the deal waiting for your tap: its price and Approve. Nothing else on the first screen.
 */
export function WalletHero({ head, ask, deal }: { head: ReactNode; ask: ReactNode; deal: ReactNode }) {
  return (
    <div className={deal ? "whero" : "whero solo"}>
      <div className="wlead">{head}{ask}</div>
      {deal}
    </div>
  );
}

const SLIP_AT = [0.3, 0.6, 0.9];
const plainRounds = (rs: number[]) => (rs.length > 1 && rs.every((r, i) => i === 0 || r === rs[i - 1]! + 1) ? `rounds ${rs[0]}–${rs.at(-1)}` : `round${rs.length > 1 ? "s" : ""} ${rs.join(", ")}`);

/**
 * W73: the refused note, the desk's lead card. Every word is the recorded row's (`walletRefusal`): the seller, its price,
 * its note with the sentences the Watcher refused it for marked by code, and each rule beside its plain words. The gilt
 * stamp lands at the refusal's own moment in the replay. W74 + C: straight to its own row in Every decision.
 */
function Refused({ r, history, again, i }: { r: WalletRefusal; history: number | null; again: number[]; i: number }) {
  let m = 0;
  return (
    <article className="scam enter" style={at(SLIP_AT[i] ?? 0.9)} aria-labelledby="wrefuse-h" data-seq={r.seq}>
      <div className="rhead"><h2 id="wrefuse-h">{r.seller}</h2>{history === 0 && <span>no sales on record</span>}</div>
      <div className="sline">
        <p className="amt" style={at(2.5)}><del>{usdOf(r.price)}</del></p>
        {/* The slot is the stamp's own size: before it lands, a faint dashed outline holds its place (wallet.css). */}
        <div className="sslot"><div className="stamp" style={at(2.5)}><Egg mark="x" /><span><b>Set aside</b><small>by the Watcher</small></span></div></div>
      </div>
      <blockquote className="rnote"><small>Its note, quoted. The AI buyer never read it.</small>“{r.note.map((n, k) => <Fragment key={k}>{k > 0 && " "}{n.flagged ? <mark style={at(1.0 + 0.7 * m++)}>{n.text}</mark> : n.text}</Fragment>)}”</blockquote>
      <ul className="why">{r.rules.map((rule, k) => <li key={rule} data-rule={rule} style={at(2.78 + 0.2 * k)}><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg><span>{r.reasons[k]}</span></li>)}</ul>
      <div className="sfoot" style={at(3.1)}>
        <a className="rlink" href={appHref(ledgerRowHref(r.seq))}>See row {r.seq} in <span className="nw">Every decision ›</span></a>
        {again.length > 0 && <span>Offered again in {plainRounds(again)}; it stayed set aside.</span>}
        {/* W64: the attack demo one tap from the refusal it's about, at every width (S1: the one nav has no such link). */}
        <a className="wbreak2" href={appHref("?desk=1#challenge")}>Try to break it ›</a>
      </div>
    </article>
  );
}

/** The left tray: each seller's first note as it reached the Watcher, read as data, and the one it refused, stamped. */
export function NotesTray({ desk, refusal }: { desk: WalletDesk; refusal: WalletRefusal | null }) {
  return (
    <section className="tray notes" aria-labelledby="notes-h">
      <h2 className="trayh" id="notes-h"><span>Seller notes on the Watcher’s desk</span><b>Read as data, never as orders</b></h2>
      {desk.slips.map((s, i) => s.verdict === "refused" && refusal && refusal.seller === s.seller
        ? <Refused key={s.seq} r={refusal} history={s.history} again={desk.again} i={i} />
        : (
          <div key={s.seq} className={`slip enter v-${s.verdict}`} style={at(SLIP_AT[i] ?? 0.9)} data-seq={s.seq}>
            <b>{s.seller}</b><span className="amt">{usdOf(s.price)}</span>
            {s.note && <q>{s.note}</q>}
            <span className="ok">{s.verdict === "clear" ? "Nothing flagged" : s.verdict === "held" ? "Held for your yes" : "Set aside"}</span>
          </div>
        ))}
      {/* On a phone the cleared slips fold into this one row under the deal (the slips are for the wide desk). */}
      {desk.slips.some((s) => s.verdict === "clear") && (
        <p className="clears enter" style={at(3.1)}><b>Nothing flagged:</b> {desk.slips.filter((s) => s.verdict === "clear").map((s, i) => <Fragment key={s.seq}>{i > 0 && " · "}<span className="nw">{s.seller} {usdOf(s.price)}</span></Fragment>)}</p>
      )}
      <p className="count" style={at(3.1)}>
        <span>Watcher: <b>{desk.refused} of {desk.sellers} sellers set aside</b> on evidence</span>
        <span><b>{desk.notes}</b> {desk.notes === 1 ? "seller note" : "different seller notes"} the AI buyer never read</span>
      </p>
    </section>
  );
}

// The rounds tick in beside the Watcher's reading: two before the stamp, code's catch just after it.
const MOVE_AT = [0.8, 1.5, 3.3, 4.0];
const short = (seller: string) => seller.split(" ")[0]!;

/** One of Goose's moves in plain words: the seller's ask that round, then what Goose did, and where code stepped in. */
function Move({ m, i }: { m: DeskMove; i: number }) {
  const asks = m.ask ? `${short(m.seller)} asks ${usdOf(m.ask)}; ` : "";
  return (
    <li className={`enter${m.kind === "caught" ? " caught" : ""}`} style={at(MOVE_AT[i] ?? 4.0)} data-seq={m.seq}>
      <span className="rn">Round {m.round}</span>
      {m.kind === "caught" && m.proposed
        ? <span>{asks}{m.proposed.ai === true ? "Goose’s AI" : m.proposed.ai === false ? "Goose’s plain rule" : "Goose"} offered <s>{usdOf(m.proposed.price)}</s>; <span className="code">code countered instead</span></span>
        : <span>{asks}Goose {m.kind === "accept" ? "accepts" : "counters"}</span>}
      <b>{usdOf(m.price)}</b>
    </li>
  );
}

/** The right tray, as wide as the left: Goose's haggle round by round, then its quiet tries (`children`). */
export function HaggleTray({ desk, children }: { desk: WalletDesk; children?: ReactNode }) {
  // On a phone the rounds fold under the deal card, one tap to open; the wide desk always shows them (CSS).
  const [open, setOpen] = useState(false);
  const n = desk.moves.length;
  return (
    <section className="tray haggle" aria-labelledby="haggle-h">
      <h2 className="trayh" id="haggle-h"><span>Goose’s haggle, round by round</span><b>The AI proposes, plain code decides</b></h2>
      {n > 0 && <button type="button" className="logfold" aria-expanded={open} aria-controls="haggle-log" onClick={() => setOpen((o) => !o)}><span><b>Goose’s haggle: {n} round{n === 1 ? "" : "s"}</b> The AI proposes, plain code decides</span><span aria-hidden="true">›</span></button>}
      <ol className="log" id="haggle-log" data-open={open || undefined}>{desk.moves.map((m, i) => <Move key={m.seq} m={m} i={i} />)}</ol>
      {children}
    </section>
  );
}

/**
 * W-8: the week's own section, under the first screen: its eyebrow with the replay (a choice, never on arrival) and the
 * run page beside it, then the two trays. The first paint draws the same, inert until the wallet passes the live replay.
 */
export function WeekDesk({ desk, refusal, replay, play = "done", run, children }: { desk: WalletDesk; refusal: WalletRefusal | null; replay?: ReactNode; play?: "done" | "play"; run?: ReactNode; children?: ReactNode }) {
  return (
    <section className="wdesk" aria-labelledby="wdesk-h">
      <div className="wdhead">
        <h2 className="trayh" id="wdesk-h">How Goose got this deal</h2>
        <div className="wways">{replay ?? <button type="button" className="skip">Watch the week</button>}{run}</div>
      </div>
      <div className="desk" data-replay={play}>
        <NotesTray desk={desk} refusal={refusal} />
        <HaggleTray desk={desk}>{children}</HaggleTray>
      </div>
    </section>
  );
}

export const Only = () => <p className="only">Goose can’t pay. Only your tap in PayPal does.</p>;

/**
 * What the built page shows before any JS: the desk band with a deal waiting for your tap, as the wallet lays it out,
 * so the deal doesn't move when the wallet arrives (pages-smoke). Approve and the rest arrive with the wallet; until then
 * `.acts-held` is the block they arrive into, its real pieces unseen, so nothing under them moves and there's no button
 * that can't be pressed yet. Approve is only its box here: index.html is on every route's bill (the ratchet), and an unseen icon and label hold no room
 * the box doesn't. The words stay, as they set their own row's height at every width. Only the password warning shows: on a slow phone it stood out late (2.9 s on live, Nov 4), as
 * the page's largest paint. `practice`: a page with a server. The build can't ask which kind, so the wallet takes it away
 * if the server turns out not to be PayPal's sandbox; live is, and CI's fake port is localhost only.
 */
export function FirstPaint({ d, limit, refusal, desk, label, practice }: { d: WalletDeal; limit: string | null; refusal: WalletRefusal | null; desk: WalletDesk | null; label: string | null; practice: boolean }) {
  const hero = (
    <section className="hero" aria-labelledby="hero-h" data-seq={d.seq}>
      <HeroTop d={d} limit={limit} k="tap" kicker="Waiting for your tap" />
      <div className="acts acts-held">
        <div className="approve" />
        <p className="aterms">This exact cart only</p>
        {practice && <p className="apractice">{SANDBOX_NEXT}</p>}
        <div className="wlater" />
        <Only />
      </div>
    </section>
  );
  return (
    <main id="main" className="wallet has-deal dk" data-palette="v" data-first="">
      <WalletTop tab="desk" />
      <div className="band">
        <WalletHero head={<DeskHead desk={desk} label={label} />} ask={<div className="ask"><AskShell heading={hero ? "Want something else?" : "Ask in your own words."} /></div>} deal={hero} />
        {desk && <WeekDesk desk={desk} refusal={refusal} />}
      </div>
    </main>
  );
}
