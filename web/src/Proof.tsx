// The Proof panel (Joshua, Fri Oct 30): what a judge can check, one tap from Behind the scenes, at `?desk=proof`.
// Every figure is a claims row's Value from docs/claims.md, read at build (`virtual:goose-proof`, web/proof-data.ts);
// `scripts/check-claims.ts` re-reads each Value from its own source on every check. This file types no figure: the
// only number it makes is the test count, counted from the test files at build, shown beside its row's floor.
// Each figure links to its row in the sources list below, which quotes the row as written.
//
// Desk-B-5 (PART 4.2 and 4.4): the back room's own header and Behind the scenes' Midnight tokens, so the two pages read
// as one place; the blind test drawn as dots (Track D's `BlindDots`, web/src/charts: one dot per note, judged twice);
// the three sandbox runs with PayPal's own ids and the two verified webhook events, read from their rows' Claims
// (`sandboxIds`, `webhookEvents`).

import "./proof.css";
import { useEffect } from "react";
import proof from "virtual:goose-proof";
import { TEST_ROW, anchorOf, runFigure, sandboxIds, testFloor, webhookEvents, type ProofItem } from "@goose/core/proof";
import { BAND_HEAD, FAIR_STILL, READER_FOLD, storyBand } from "@goose/core/band";
import { BackRoomNav } from "./ledger/BackRoom.tsx";
import { BlindDots } from "./charts/BlindDots.tsx";
import { BlindSets } from "./charts/BlindSets.tsx";
import { LayerBody } from "./desk/story/MissingLayer.tsx";
import { LAYER_HEAD, LAYER_LEDE } from "@goose/core/missing-layer";

const CLAIMS_URL = `${__GOOSE_REPO__}/blob/main/docs/claims.md`;

/** A claims cell's `code` spans as code, the rest as text. */
function Cell({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/).map((p, i) => (p.startsWith("`") && p.endsWith("`") && p.length > 1 ? <code key={i}>{p.slice(1, -1)}</code> : p))}</>;
}

/** What the figure says: the row's Value, except the test count (the build's own) and the Toolkit (how many it names). */
function figureOf(item: ProofItem): string {
  if (item.id === TEST_ROW) return String(proof.tests.cases);
  if (item.id === "toolkit-tools") return `${item.figure.split(", ").length} called`;
  return item.figure;
}

function Figure({ item }: { item: ProofItem }) {
  const tools = item.id === "toolkit-tools" ? item.figure.split(", ") : null;
  return (
    <li className="pf-item" id={`fig-${item.id}`}>
      <a className="pf-fig" href={`#${item.anchor}`} aria-describedby={`say-${item.id}`}>{figureOf(item)}</a>
      <div className="pf-say">
        <p id={`say-${item.id}`}>{sentence(item.claim)}</p>
        {tools && <ul className="pf-tools" aria-label="Toolkit tools the code calls">{tools.map((t) => <li key={t}><code>{t}</code></li>)}</ul>}
        {item.id === TEST_ROW && <p className="pf-note">Counted in {proof.tests.files} test files under core/test and trust/test when this page was built. The claims row holds the floor: {item.figure}{testFloor(item.figure) !== null && proof.tests.cases >= testFloor(item.figure)! ? ", met" : ", not met"}.</p>}
        <a className="pf-row" href={`#${item.anchor}`}>Its row and source</a>
      </div>
    </li>
  );
}


/** Each sandbox run as the shopper would name it, with the amount, the day and PayPal's own ids from its row. */
const RUN_NAMES: Readonly<Record<string, string>> = {
  "sandbox-capture": "Pay at once",
  "sandbox-authorize": "Hold, re-check, then pay",
  "sandbox-void": "Cart changed after the hold",
};

/** A figure such as a dollar amount then "captured": its first word large, the rest beside it small. */
function Split({ figure }: { figure: string }) {
  const at = figure.indexOf(" ");
  return at < 0 ? <>{figure}</> : <><span className="pf-big">{figure.slice(0, at)}</span> <span className="pf-small">{figure.slice(at + 1)}</span></>;
}

/** A Claim as a sentence: a capital first letter and a closing full stop. The Sources list keeps it as written. */
function sentence(s: string): string {
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}${s.endsWith(".") ? "" : "."}`;
}

/** A sandbox row's Claim without the ids and date the card already shows above it, as a sentence. */
function bare(claim: string): string {
  const s = claim
    .replace(/: order [0-9A-Z]+, (capture|authorization) [0-9A-Z]+, (Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]+ \d+ \d+/, "")
    .replace(/: run [0-9a-f]+, .*?, (Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]+ \d+ \d+/, "");
  return sentence(s);
}

function Money({ items }: { items: ProofItem[] }) {
  const runs = items.filter((i) => i.id in RUN_NAMES);
  const hooks = items.find((i) => i.id === "sandbox-webhooks");
  const w = hooks ? webhookEvents(hooks.claim) : null;
  return (
    <div className="pf-money">
      <ol className="pf-runs">
        {runs.map((r) => {
          const ids = sandboxIds(r.claim);
          return (
            <li key={r.id} className="pf-run" id={`fig-${r.id}`}>
              <p className="pf-run-name">{RUN_NAMES[r.id]}</p>
              <a className="pf-run-fig" href={`#${r.anchor}`} aria-describedby={`say-${r.id}`}><Split figure={runFigure(r)} /></a>
              <p className="pf-run-date">{ids.date}</p>
              <dl className="pf-ids">
                {ids.order && <div><dt>Order</dt><dd><code>{ids.order}</code></dd></div>}
                {ids.capture && <div><dt>Capture</dt><dd><code>{ids.capture}</code></dd></div>}
                {ids.authorization && <div><dt>Voided hold</dt><dd><code>{ids.authorization}</code></dd></div>}
              </dl>
              <p className="pf-run-say" id={`say-${r.id}`}>{bare(r.claim)}</p>
            </li>
          );
        })}
      </ol>
      {hooks && w && (
        <div className="pf-hooks" id={`fig-${hooks.id}`}>
          <a className="pf-run-fig" href={`#${hooks.anchor}`} aria-describedby={`say-${hooks.id}`}><Split figure={hooks.figure} /></a>
          <div>
            <p className="pf-hooks-h">{w.run && <>Run <code>{w.run}</code>, </>}{sandboxIds(hooks.claim).date}</p>
            <ul className="pf-events">{w.events.map((e) => <li key={e}><span className="pf-tick" aria-hidden="true" /><code>{e}</code></li>)}</ul>
            <p className="pf-run-say" id={`say-${hooks.id}`}>{bare(hooks.claim)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The band at the top (Track L): the three proofs a judge asks about first, each figure its claims row's Value through
 * core's `storyBand` (claims row story-band), each linking to its own row in Sources. Glass, over the page's one light.
 * The DD's phone-width ruling (round 6b B2): the blind tests stay in .pf-top; the 3 and the 2 are `Stats`, its sibling in one
 * grid, beside the tests on a wide screen and a two-up row under the intro line below it. One copy of each, never folded.
 */
const BAND = storyBand(proof.groups);

function Band() {
  const b = BAND;
  return (
    <section className="pf-band" aria-labelledby="pf-band-h">
      {/* The band's name, for a screen reader only (the B2 fold, part a): it stays the h2 under Proof's h1 and names this
          section, and its five words leave the first screen. No closing full stop; the landing keeps BAND_HEAD as its heading. */}
      <h2 id="pf-band-h" className="pf-sr">{BAND_HEAD.replace(/\.$/, "")}</h2>
      {/* Round 6b B2: the reader lines, what they mean and FAIR_STILL one tap under the table, so the first screen fits
          its line (scripts/sw-words.ts, SW_BUDGET.proof); the table and the promise under it stay above the fold. */}
      <BlindSets tests={b.tests} href={(id) => `#${anchorOf(id)}`} fold={READER_FOLD}>
        <p className="bs-after">{FAIR_STILL}</p>
      </BlindSets>
    </section>
  );
}

/** The 3 and the 2, out of .pf-top (the DD, round 6b B2): never under the reader's fold, whose label doesn't name them. */
function Stats() {
  const b = BAND;
  return (
    <ul className="pf-stats">
        <li>
          <a className="pf-band-fig" href={`#${anchorOf(b.runs.items[0]!.id)}`}>{b.runs.count}</a>
          <p>{b.runs.say}</p>
          {/* SW (surface-words.md's budget): no list of the three runs here; the Money group just below names each one, with
              its amount and PayPal's ids. The landing's band (the scroll story) still lists them. */}
        </li>
        <li>
          <a className="pf-band-fig" href={`#${anchorOf(b.webhooks.id)}`}>{b.webhooks.figure}</a>
          <p>{b.webhooks.say}</p>
        </li>
    </ul>
  );
}

/** What kind of proof each group is, in plain words: run once and recorded, re-run, or counted (Track L). */
const KIND: Readonly<Record<string, string>> = {
  blind: "A recorded test",
  money: "Recorded sandbox runs",
  attacks: "Re-run on every check",
  code: "Counted from the code",
};

const INTRO: Readonly<Record<string, string>> = {
  blind: "Each measured before we changed anything for it.", // the dots' own notes name each writer and set (BlindDots)
  money: "Attended runs on PayPal's sandbox, each paid by a sandbox buyer's own tap. The check reads these rows against the run log; it doesn't call PayPal again.",
  attacks: "Attacks aimed at our own guard. Both re-run on every check.",
  code: "Counted from the code itself, not typed in.",
};

/** Where a Sources row's "Back to the number" goes: the figure's own card, or for the blind test (whose dots carry no
 *  per-row card) the group's heading. */
const BLIND_IDS = new Set(proof.groups.find((g) => g.key === "blind")?.items.map((i) => i.id) ?? []);
function backOf(it: ProofItem): string {
  return BLIND_IDS.has(it.id) ? "#pf-blind" : `#fig-${it.id}`;
}

/** A link to a Sources row opens the folded list first, so the row is there to scroll to (and to focus). */
function openTarget() {
  let id = "";
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; } // a malformed hash opens nothing
  const el = id ? document.getElementById(id) : null;
  const fold = el?.closest("details");
  if (!el || !fold || fold.open) return;
  fold.open = true;
  el.scrollIntoView({ block: "start" });
  el.focus({ preventScroll: true }); // the row is tabIndex -1: the keyboard lands where the eye does
}

export default function Proof() {
  const items = proof.groups.flatMap((g) => g.items);
  useEffect(() => {
    openTarget();
    addEventListener("hashchange", openTarget);
    return () => removeEventListener("hashchange", openTarget);
  }, []);
  return (
    <div className="pf dk mn-lit" data-palette="midnight">
      <BackRoomNav here="proof" />
      <main id="main" className="pf-wrap">
        {/* SW: the room's first screen is its title and the band, whole (the DD's measure: fold whole blocks); each test
            starts below it, at its own hairline. */}
        {/* The DD's phone-width ruling: one grid, one copy of each block. .pf-top (the title and the blind tests, sw-words' scope)
            is `display: contents`, so its blocks are the grid's cells; the glass card is drawn behind them. */}
        <div className="pf-lead">
        <div className="pf-top">
        <section className="pf-intro" aria-labelledby="pf-h">
          {/* SW (surface-words.md's budget): one nav layer, so no second back link under the bar (the bar's own
              "Behind the scenes" is it); the intro is one line. Not "against the code": the sandbox rows are re-read from
              the run's recording, not from code (check-claims.ts). */}
          <h1 id="pf-h">Proof</h1>
        </section>
        <Band />
        </div>
        <Stats />
        {/* The B2 fold, part a: the intro line sits under the band, outside .pf-top, so the first section is the title
            and the band alone (sw-words' SW_BUDGET.proof scope). Same words, one block lower. */}
        <p className="pf-how">Re-checked on every commit. Tap a number for its source.</p>
        <div className="pf-card dk-glass" aria-hidden="true" />
        </div>
        {proof.groups.map((g) => (
          <section className={`pf-group pf-group-${g.key}`} key={g.key} aria-labelledby={`pf-${g.key}`}>
            <div className="pf-head">
              {KIND[g.key] && <p className="pf-kind">{KIND[g.key]}</p>}
              <h2 id={`pf-${g.key}`}>{g.title}</h2>
              <p>{INTRO[g.key]}</p>
            </div>
            {g.key === "blind" ? <BlindDots />
              : g.key === "money" ? <Money items={g.items} />
              : <ol className="pf-items">{g.items.map((it) => <Figure key={it.id} item={it} />)}</ol>}
          </section>
        ))}
        {/* After the page's own tests: what those tests answer. The landing's section, with its list open. */}
        <section className="pf-group pf-group-layer" id="missing-layer" aria-labelledby="pf-layer">
          <div className="pf-head">
            <h2 id="pf-layer">{LAYER_HEAD}</h2>
            <p>{LAYER_LEDE}</p>
          </div>
          <LayerBody open />
        </section>
        <section className="pf-sources" aria-labelledby="pf-src">
          <div className="pf-head">
            <h2 id="pf-src">Sources</h2>
            <p>Each row as written in {__GOOSE_REPO_PUBLIC__ ? <a href={CLAIMS_URL}>docs/claims.md</a> : "docs/claims.md"}. Its Value is what the number above shows; its Source is where the check reads it again.</p>
          </div>
          {/* SW (surface-words.md: "Sources folded"): the long list is one tap away. A figure's link to its row opens it
              (openTarget, below), so every number still lands on its source. */}
          <details className="pf-fold" id="pf-all">
          <summary>All sources <span aria-hidden="true">›</span></summary>
          <ol className="pf-rows">
            {items.map((it) => (
              <li key={it.id} id={anchorOf(it.id)} tabIndex={-1}>
                <p className="pf-rid"><code>{it.id}</code> <span>line {it.line}</span></p>
                <dl>
                  <div><dt>Claim</dt><dd>{it.claim}</dd></div>
                  <div><dt>Value</dt><dd>{it.figure}</dd></div>
                  <div><dt>Source</dt><dd><Cell text={it.source} /></dd></div>
                </dl>
                <a className="pf-up" href={backOf(it)}>Back to the number</a>
              </li>
            ))}
          </ol>
          </details>
        </section>
      </main>
      <footer className="pf-wrap pf-foot"><p>Fictional sellers. PayPal sandbox. Practice only: no real money.</p></footer>
    </div>
  );
}
