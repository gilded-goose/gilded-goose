// Proof: what a judge can check. Every figure is a claims row's Value from docs/claims.md, read at build
// (`virtual:goose-proof`), and `scripts/check-claims.ts` re-reads each Value from its own source on every check. This
// page types no figure of its own: it draws the rows as shares and cards and links each number to its row in Sources.
// Rules carried from the claims ledger: a scam figure never appears without the fair notes refused beside it, a zero
// is "not a rate", and the sandbox runs are recorded attended runs, not live calls.
import { Suspense, useEffect, useState, type CSSProperties } from "react";
import proof from "virtual:goose-proof";
import { TEST_ROW, anchorOf, nOf, runFigure, sandboxIds, webhookEvents, type ProofItem } from "@goose/core/proof";
import { BAND_BOUND, BAND_HELD, BAND_STILL, FAIR_STILL, storyBand } from "@goose/core/band";
import { hrefOf } from "../route.ts";
import { Button } from "../ui/Button.tsx";
import { lazyPage } from "../ui/lazy-page.tsx";
import "./proof.css";

const BAND = storyBand(proof.groups);
const ITEMS = proof.groups.flatMap((g) => g.items);
const REPO = __GOOSE_REPO_PUBLIC__ ? `${__GOOSE_REPO__}/blob/main/docs/claims.md` : null;

// "The 21 that got through": the notes are their own chunk (MissesWall.tsx), fetched on this button's press or while the
// address names the section (#/proof#got-through; App redraws this page on every hash change), so the first screen pays
// for a heading and a button. Open once: the button gives way to the notes, and the chunk moves the keyboard's place to
// their first words (WallView.tsx). The count is the claims row's own: the band's first row, newest set first, is
// `fresh-code-through` (band.ts BLIND_ROWS; core/test/misses-wall.test.ts holds that order). If the chunk never comes,
// lazyPage draws its reload words.
const Wall = lazyPage(() => import("./MissesWall.tsx"));

function WallDoor() {
  const [open, setOpen] = useState(false);
  return (
    <section className="pr-sec">
      <h2 id="got-through">The {BAND.tests.rows[0]!.cells[0]!.figure.split(" ")[0]} that got through</h2>
      {open || location.hash.endsWith("#got-through") ? <Suspense fallback={null}><Wall /></Suspense> : <p><Button tone="line" onClick={() => setOpen(true)}>Show the notes</Button></p>}
    </section>
  );
}

const RUN_NAMES: Readonly<Record<string, string>> = {
  "sandbox-capture": "Pay at once",
  "sandbox-authorize": "Hold, re-check, then pay",
  "sandbox-void": "Cart changed after the hold",
};

const share = (figure: string): number => { const c = nOf(figure); return c && c.of > 0 ? c.n / c.of : 0; };
const link = (id: string) => hrefOf("proof", anchorOf(id));

/** A share of notes as a bar: the fill is how many, the rest of the track is how many were not. */
function Share({ id, label, figure, tone }: { id: string; label: string; figure: string; tone: "bad" | "good" | "calm" }) {
  return (
    <div className="pr-share" data-tone={tone}>
      <p className="pr-share-label">{label}</p>
      <a className="pr-share-fig figure" href={link(id)}>{figure}</a>
      <span className="pr-bar" aria-hidden="true" style={{ "--v": share(figure) } as CSSProperties} />
    </div>
  );
}

function BlindTests() {
  const { tests } = BAND;
  const through = tests.rows[0]!.cells;
  return (
    <div className="pr-sets">
      {tests.readers.map((r, k) => (
        <article className="pr-set" key={r.set}>
          <h3>{r.set}</h3>
          <Share id={through[k]!.id} label="Scam notes through, code alone" figure={through[k]!.figure} tone="bad" />
          <Share id={r.through.id} label="Scam notes through, AI reader on" figure={r.through.figure} tone="good" />
          <Share id={r.refused.id} label="Fair notes refused, AI reader on" figure={r.refused.figure} tone="calm" />
          <p className="pr-set-note">Fair notes held for your tap, reader on: <a href={link(r.held.id)}>{r.held.figure}</a>.</p>
        </article>
      ))}
    </div>
  );
}

function Money({ items }: { items: ProofItem[] }) {
  const hooks = items.find((i) => i.id === "sandbox-webhooks");
  const w = hooks ? webhookEvents(hooks.claim) : null;
  return (
    <>
      <ol className="pr-runs">
        {items.filter((i) => i.id in RUN_NAMES).map((r) => {
          const ids = sandboxIds(r.claim);
          return (
            <li key={r.id} className="pr-run" id={`fig-${r.id}`}>
              <p className="pr-run-name">{RUN_NAMES[r.id]}</p>
              <a className="pr-run-fig figure" href={link(r.id)}>{runFigure(r)}</a>
              <p className="pr-run-date">{ids.date}, PayPal sandbox</p>
              <dl className="pr-ids">
                {ids.order ? <div><dt>Order</dt><dd><code>{ids.order}</code></dd></div> : null}
                {ids.capture ? <div><dt>Capture</dt><dd><code>{ids.capture}</code></dd></div> : null}
                {ids.authorization ? <div><dt>Voided hold</dt><dd><code>{ids.authorization}</code></dd></div> : null}
              </dl>
            </li>
          );
        })}
      </ol>
      {hooks && w ? (
        <div className="pr-hooks" id={`fig-${hooks.id}`}>
          <a className="pr-run-fig figure" href={link(hooks.id)}>{hooks.figure.split(" ")[0]}</a>
          <div>
            <p className="pr-hooks-h">PayPal webhooks, each checked with PayPal before it wrote a ledger row</p>
            <ul className="pr-events">{w.events.map((e) => <li key={e}><code>{e}</code></li>)}</ul>
          </div>
        </div>
      ) : null}
    </>
  );
}

const figureOf = (i: ProofItem) => (i.id === TEST_ROW ? `${proof.tests.cases}` : i.figure);
const sentence = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}${s.endsWith(".") ? "" : "."}`;

function Counted({ items }: { items: ProofItem[] }) {
  return (
    <ul className="pr-counted">
      {items.map((i) => (
        <li key={i.id} id={`fig-${i.id}`}>
          <a className="pr-counted-fig figure" href={link(i.id)}>{i.id === "toolkit-tools" ? `${i.figure.split(", ").length} called` : figureOf(i)}</a>
          <p>{sentence(i.claim)}</p>
        </li>
      ))}
    </ul>
  );
}

/** A link to a Sources row opens the folded list first, so the row is there to land on. */
function openTarget() {
  let id = "";
  try { id = decodeURIComponent(location.hash.split("#")[2] ?? ""); } catch { return; }
  const el = id ? document.getElementById(id) : null;
  const fold = el?.closest("details");
  if (!el || !fold || fold.open) return;
  fold.open = true;
  el.scrollIntoView({ block: "start" });
}

export function Proof() {
  useEffect(() => {
    const open = () => {
      const t = location.hash.split("#")[2];
      if (t === "sources") document.getElementById("pr-all")?.setAttribute("open", "");
      else openTarget();
    };
    open();
    addEventListener("hashchange", open);
    return () => removeEventListener("hashchange", open);
  }, []);
  const group = (key: string) => proof.groups.find((g) => g.key === key)?.items ?? [];
  const counted = [...group("attacks"), ...group("code")];
  return (
    <div className="wrap pg pr">
      <header className="pr-head">
        <h1 className="sx-h sx-h-page">Proof</h1>
        <p className="sx-lede">What we measured, in the order a judge asks. Every number links to the claims row that holds its source, and the sellers and payments are practice ones.</p>
      </header>

      <section className="pr-sec" aria-labelledby="pr-blind">
        <h2 id="pr-blind">Scam notes that reached the cart</h2>
        <p className="pr-sec-p">Two blind tests, one writer each, measured before anything was changed for them. {BAND_STILL}</p>
        <BlindTests />
        <p className="pr-fine">{BAND_HELD} {BAND_BOUND}</p>
        <p className="pr-fine">{FAIR_STILL}</p>
      </section>

      <WallDoor />

      <section className="pr-sec" aria-labelledby="pr-money">
        <h2 id="pr-money">Money paths on PayPal's sandbox</h2>
        <p className="pr-sec-p">Attended runs, each paid by a sandbox buyer's own tap. The check reads these rows against the run log; it doesn't call PayPal again. They are recorded, not live, and no real money moved. Have an order id? <a href={hrefOf("verify")}>Verify an order</a>.</p>
        <Money items={group("money")} />
      </section>

      <section className="pr-sec" aria-labelledby="pr-counted">
        <h2 id="pr-counted">Re-run and counted</h2>
        <p className="pr-sec-p">Attacks aimed at our own guard, re-run on every check, and tests counted from the code when this page was built.</p>
        <Counted items={counted} />
      </section>

      <section className="pr-sec" id="sources" aria-labelledby="pr-src">
        <h2 id="pr-src">Sources</h2>
        <p className="pr-sec-p">Each row as written in {REPO ? <a href={REPO}>docs/claims.md</a> : "docs/claims.md"}. Its Value is the number above; its Source is where the check reads it again.</p>
        <details className="pr-fold" id="pr-all">
          <summary>All {ITEMS.length} sources</summary>
          <ol className="pr-rows">
            {ITEMS.map((it) => (
              <li key={it.id} id={anchorOf(it.id)} tabIndex={-1}>
                <p className="pr-rid"><code>{it.id}</code></p>
                <dl>
                  <div><dt>Claim</dt><dd>{it.claim}</dd></div>
                  <div><dt>Value</dt><dd>{it.figure}</dd></div>
                  <div><dt>Source</dt><dd>{it.source.replace(/`/g, "")}</dd></div>
                </dl>
              </li>
            ))}
          </ol>
        </details>
      </section>

      <p className="pg-foot">Test it yourself. <a className="sx-link" href={hrefOf("home", "trick")}>Try to trick it</a></p>
    </div>
  );
}
