// The living design system's specimens (Track SYS): every token and every component, in their own chunk so the page's
// heading paints first (./System.tsx draws the bar and the heading, then loads this). Every token is read from
// tokens.css itself (`?raw`, parsed by ./tokens.ts); every component is the site's own: the real Case, Trail,
// SpendLimits, BlindDots and ShellTable with fixture props, and the Desk's own classes from desk.css for the parts
// Desk.tsx keeps inside itself (core/test/sys-pages.test.ts fails when a class drawn here no longer exists in the site's
// CSS, or is one the site reads page-wide). Specimens are pictures: each sits in an inert, aria-hidden frame under a
// one-line visible label, so a screen reader hears the labels and never a second nav or menu.

import { appHref } from "../menu/href.ts";
import { useEffect, useState, type ReactNode } from "react";
import { MENU, MENU_LABEL } from "@goose/core/menu";
import type { LedgerRow } from "@goose/core/session";
import Case from "../desk/moment/Case.tsx";
import Trail from "../desk/Trail.tsx";
import { SpendLimits } from "../charts/SpendLimits.tsx";
import { BlindDots } from "../charts/BlindDots.tsx";
import { ShellTable } from "../ledger/ShellTable.tsx";
import { SPRITE } from "../desk/sprite.ts";
import eggStill from "../desk/egg.webp";
import { Lockup } from "../brand/Lockup.tsx";
import tokensCss from "../desk/tokens.css?raw";
import { TEXT_ROLES, allTokenNames, bezier, contrast, familyOf, rgba, tokenSets, valueOf, type Family, type Token } from "./tokens.ts";
// The Desk's own stylesheets, as text: importing them as modules would move them out of the Desk's chunk (the prerender
// pins that chunk's two stylesheets), so the page lays the same files down in a <style> of its own, before its own
// sheet (System.tsx puts them in that order), so the frame rules win ties the way a later stylesheet does.
import deskCss from "../desk/desk.css?inline";
import heroCss from "../desk/story/hero.css?inline";
import glassCss from "../desk/glass.css?inline";
import menuCss from "../menu/menu.css?inline";
import midnightCss from "../ledger/midnight.css?inline";

export const SHEETS = [deskCss, heroCss, glassCss, menuCss, midnightCss].join("\n");

const SETS = tokenSets(tokensCss);
/** A ratio as brand.md writes it: one decimal, always ("13.0", never "13"). */
const one = (r: number | null) => (r === null ? "?" : r.toFixed(1));

const Use = ({ id }: { id: string }) => <svg aria-hidden="true"><use href={`#dk-${id}`} /></svg>;

/** One specimen: a visible one-line label, and the picture, inert and hidden from the accessibility tree. */
function Spec({ label, children, wide, bare, frame = "page" }: { label: string; children: ReactNode; wide?: boolean; bare?: boolean; frame?: "page" | "lit" | "none" }) {
  return (
    <div className={`sys-spec${wide ? " sys-wide" : ""}`}>
      <p className="sys-label">{label}</p>
      <div className={`sys-frame${bare ? " sys-bare" : ""}`} data-frame={frame} inert aria-hidden="true">{children}</div>
    </div>
  );
}

function Family({ id, title, count, children }: { id: string; title: string; count?: number; children: ReactNode }) {
  return (
    <section className="sys-fam" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="sys-h2">{title}{count !== undefined && <span className="sys-count"> {count}</span>}</h2>
      {children}
    </section>
  );
}

const FAMILIES: readonly { key: Family; title: string }[] = [
  { key: "type", title: "Type" }, { key: "space", title: "Space" }, { key: "frame", title: "Frame" }, { key: "radius", title: "Radii" },
  { key: "shadow", title: "Shadows" }, { key: "motion", title: "Motion" }, { key: "light", title: "Light" }, { key: "other", title: "Other" },
];
const shared = (f: Family) => SETS.shared.filter((t) => familyOf(t.name) === f);

/** A palette's colours: each swatch over the page, its value, and the contrast it is held to. */
function Palette({ name, set }: { name: string; set: readonly Token[] }) {
  const page = valueOf(set, "--page-solid")!, card = valueOf(set, "--card")!, cta = valueOf(set, "--cta")!;
  // The text roles first, each with its contrast, in the brand's order; then the surfaces and lines.
  const roles = TEXT_ROLES as readonly string[];
  const colours = set.filter((t) => rgba(t.value)).sort((a, b) => (roles.includes(a.name) ? roles.indexOf(a.name) : 99) - (roles.includes(b.name) ? roles.indexOf(b.name) : 99));
  const rest = set.filter((t) => !rgba(t.value));
  return (
    <div className="sys-pal">
      <h3 className="sys-h3">{name}<span className="sys-count"> {set.length}</span></h3>
      <ul className="sys-swatches">
        {colours.map((t) => {
          const text = roles.includes(t.name);
          const ratio = text ? `${one(contrast(t.value, page))} page · ${one(contrast(t.value, card))} card`
            : t.name === "--on-cta" ? `${one(contrast(t.value, cta))} on cta` : null;
          return (
            <li key={t.name}>
              <span className="sys-chip" style={{ background: `linear-gradient(${t.value}, ${t.value}), ${page}` }} />
              <code>{t.name}</code>
              <span className="sys-val">{t.value}</span>
              {ratio && <span className="sys-ratio">{ratio}</span>}
            </li>
          );
        })}
      </ul>
      <dl className="sys-list">{rest.map((t) => <div key={t.name}><dt><code>{t.name}</code></dt><dd>{t.value}</dd></div>)}</dl>
    </div>
  );
}

function TypeScale() {
  const sizes = shared("type").filter((t) => t.name.startsWith("--t-"));
  const display = new Set(["--t-hero", "--t-h1", "--t-h2", "--t-h3", "--t-num"]);
  return (
    <>
      <ul className="sys-type">
        {sizes.map((t) => (
          <li key={t.name}>
            <span className="sys-meta"><code>{t.name}</code> {t.value}</span>
            <span className={`sys-sample${display.has(t.name) ? " sys-display" : ""}`} style={{ fontSize: `var(${t.name})` }}>{t.name === "--t-num" ? "$47.73" : "Goose shops for you."}</span>
          </li>
        ))}
      </ul>
      <dl className="sys-list">{shared("type").filter((t) => !t.name.startsWith("--t-")).map((t) => <div key={t.name}><dt><code>{t.name}</code></dt><dd>{t.value}</dd></div>)}</dl>
    </>
  );
}

function Curve({ t }: { t: Token }) {
  const b = bezier(t.value)!;
  const p = (x: number, y: number) => `${8 + x * 104} ${112 - y * 104}`;
  return (
    <svg className="sys-curve" viewBox="0 0 120 120" aria-hidden="true">
      <path className="sys-curve-box" d={`M${p(0, 0)} H${8 + 104} V8`} />
      <path d={`M${p(0, 0)} C${p(b[0], b[1])} ${p(b[2], b[3])} ${p(1, 1)}`} />
    </svg>
  );
}

function Tokens() {
  return (
    <>
      <Family id="sys-colour" title="Colour">
        <p className="sys-val sys-total">{allTokenNames(SETS).length} tokens in all, read from <code>web/src/desk/tokens.css</code>.</p>
        <div className="sys-pals">
          <Palette name="Velvet · the shopper" set={SETS.velvet} />
          <Palette name="Midnight · the back room" set={[...SETS.midnight, ...SETS.midnightGlass.filter((g) => !SETS.midnight.some((m) => m.name === g.name))]} />
        </div>
      </Family>
      <Family id="sys-type" title="Type" count={shared("type").length}><TypeScale /></Family>
      <Family id="sys-space" title="Space and frame" count={shared("space").length + shared("frame").length}>
        <ul className="sys-space">{shared("space").map((t) => <li key={t.name}><code>{t.name}</code><span className="sys-bar" style={{ width: `var(${t.name})` }} /><span className="sys-val">{t.value}</span></li>)}</ul>
        <dl className="sys-list">{shared("frame").map((t) => <div key={t.name}><dt><code>{t.name}</code></dt><dd>{t.value}</dd></div>)}</dl>
      </Family>
      <Family id="sys-shape" title="Radii and shadows" count={shared("radius").length + shared("shadow").length}>
        <ul className="sys-tiles">
          {shared("radius").map((t) => <li key={t.name}><span className="sys-tile" style={t.name === "--hair" ? { border: `var(${t.name})` } : { borderRadius: `var(${t.name})` }} /><code>{t.name}</code><span className="sys-val">{t.value}</span></li>)}
          {shared("shadow").map((t) => <li key={t.name}><span className="sys-tile sys-raised" style={{ boxShadow: `var(${t.name})` }} /><code>{t.name}</code></li>)}
          <li><span className="sys-tile sys-raised" style={{ boxShadow: "var(--shadow)" }} /><code>--shadow</code></li>
        </ul>
      </Family>
      <Family id="sys-glass" title="Glass and light">
        <div className="sys-row">
          <Spec label="Glass · .dk-glass over the egg's light" frame="lit">
            <p className="sys-behind">$84.00</p>
            <div className="dk-glass sys-glass"><span className="dk-eyebrow">Glass</span><p>{valueOf(SETS.velvet, "--glass-blur")}</p></div>
          </Spec>
          <Spec label="The egg · the one hero asset" frame="lit">
            <img className="sys-egg" src={eggStill} alt="" width={120} height={144} />
          </Spec>
        </div>
        <dl className="sys-list">{shared("light").map((t) => <div key={t.name}><dt><code>{t.name}</code></dt><dd>{t.value}</dd></div>)}</dl>
      </Family>
      <Family id="sys-motion" title="Motion" count={shared("motion").length}>
        <ul className="sys-tiles">
          {shared("motion").filter((t) => bezier(t.value)).map((t) => <li key={t.name}><Curve t={t} /><code>{t.name}</code><span className="sys-val">{t.value}</span></li>)}
        </ul>
        <ul className="sys-space">{shared("motion").filter((t) => !bezier(t.value)).map((t) => <li key={t.name}><code>{t.name}</code><span className="sys-bar" style={{ width: `calc(${parseInt(t.value, 10)} / 400 * 160px)` }} /><span className="sys-val">{t.value}</span></li>)}</ul>
      </Family>
      {FAMILIES.filter((f) => f.key === "other" && shared("other").length > 0).map((f) => (
        <Family key={f.key} id="sys-other" title={f.title} count={shared("other").length}>
          <dl className="sys-list">{shared("other").map((t) => <div key={t.name}><dt><code>{t.name}</code></dt><dd>{t.value}</dd></div>)}</dl>
        </Family>
      ))}
    </>
  );
}

/** The bar as markup (the page's live bar is SiteNav, at the top): the same classes, so nav.css draws it. */
function Bar({ scrolled, skip }: { scrolled?: boolean; skip?: boolean }) {
  return (
    <header className="gn dk-nav" data-scrolled={scrolled ? "1" : undefined}>
      {skip && <a className="gn-skip sys-skip-on" href="#main">Skip to content</a>}
      <div className="dk-wrap dk-nav-in">
        {/* S1-13 (B-11's lockup in the bar, nav.css): the specimen wears the live bar's lockup. */}
        <Lockup href={appHref("?desk=1")} />
        <span className="dk-practice-ph">Practice only</span>
        <div className="dk-grow" />
        <button type="button" className="gm-btn dk-menu"><span className="gm-w">Everything Goose does <svg viewBox="0 0 12 8" aria-hidden="true"><path d="m1 1.5 5 5 5-5" /></svg></span><span className="gm-ph">Menu</span></button>
        <div className="dk-layer" data-glide=""><a href={appHref("?desk=1")} data-current="">Shopper</a><a href={appHref("?desk=ledger")}>Behind the scenes</a><span className="dk-under" /></div>
        <a className="dk-judge" href={appHref("?desk=tour")}><span>Judge<span className="dk-jl">? Start here</span></span><span className="dk-jt"> tour</span> <span className="dk-arr">›</span></a>
      </div>
    </header>
  );
}

/** Sample rows for the seller list: one in each state the Desk draws. Fictional names; specimen only. */
const ROWS: readonly { cls: string; name: string; st: string; price: string }[] = [
  { cls: "dk-clear dk-best", name: "Lantern Hall Box Office", st: "Best deal you can trust", price: "$84.00" },
  { cls: "dk-clear", name: "Pondside Seats", st: "Nothing set aside", price: "$88.50" },
  { cls: "dk-held", name: "Larkspur Tickets", st: "Waits for your yes: no sales on record", price: "$86.00" },
  { cls: "dk-over", name: "Reedwhistle Tickets", st: "Over your $85.00 cap", price: "$97.00" },
  { cls: "dk-reading", name: "Juniper Box", st: "Reading its note…", price: "$89.00" },
];

const SPEND = {
  categories: [{ key: "events", label: "Events", limitCents: 9000, limitWords: "$90.00", carts: [{ cents: 8400, words: "$84.00" }] }],
  week: { cents: 8400, words: "$84.00", limitCents: 15000, limitWords: "$150.00", openCents: 0, openWords: "$0.00" },
  scaleCents: 15000,
  summary: "Sample data: one Events cart of $84.00 under its $90.00 limit; $84.00 of $150.00 this week.",
};

function Components({ rows }: { rows: LedgerRow[] | null }) {
  return (
    <>
      <Family id="sys-buttons" title="Buttons">
        <div className="sys-row">
          <Spec label="Primary · rest"><button type="button" className="dk-approve"><Use id="lock" />Approve $84.00</button></Spec>
          <Spec label="Primary · focus"><button type="button" className="dk-approve sys-focus"><Use id="lock" />Approve $84.00</button></Spec>
          <Spec label="Primary · disabled"><button type="button" className="dk-approve" disabled><Use id="lock" />Asking the guard…</button></Spec>
          <Spec label="Secondary · hairline pill"><button type="button" className="dk-pill">View details</button></Spec>
          <Spec label="Quiet · underline"><span className="sys-inline"><button type="button" className="dk-why-btn">Why?</button></span></Spec>
          <Spec label="Quiet · link"><a className="dk-linkbtn" href={appHref("?desk=haggle")}>Watch the haggle <span className="dk-arr">›</span></a></Spec>
        </div>
      </Family>
      <Family id="sys-ask" title="Ask box and chips">
        <div className="sys-row">
          <Spec label="Ask box · rest" wide>
            <form className="dk-ask" onSubmit={(e) => e.preventDefault()}>
              <input aria-label="Ask for anything" placeholder="A kettle under $60" readOnly />
              <button type="button" className="dk-ic"><Use id="mic" /></button>
              <button type="button" className="dk-go"><Use id="arrow" /></button>
            </form>
          </Spec>
          <Spec label="Chips" wide>
            <div className="dk-chips"><span className="dk-try">Try</span><span className="dk-chip-row">{["A Marsh Lights ticket under $90", "A kettle under $60", "A used Fernway mixer"].map((c) => <button key={c} type="button">{c.split(/(\$\d+)/).map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</button>)}</span></div>
          </Spec>
        </div>
      </Family>
      <Family id="sys-cards" title="Cards">
        <div className="sys-row sys-cards">
          <Spec label="Deal · the one lit object">
            <div className="dk-right">
              <article className="dk-deal2 dk-mat dk-final">
                <div className="dk-eyebrow">Your deal · Lantern Hall Box Office</div>
                <div className="dk-pr"><div className="dk-big">$84.00</div></div>
                <p className="dk-lim"><i /><span className="dk-sent">No scam wording · lowest of 4 sellers</span></p>
                <details className="dk-before"><summary><span>Before you approve</span><i /></summary></details>
                <button type="button" className="dk-approve"><Use id="lock" />Approve $84.00</button>
                <div className="dk-deal-foot"><p className="dk-onlytap">Only your tap pays.</p><button type="button" className="dk-pill">View details</button></div>
              </article>
            </div>
          </Spec>
          <Spec label="No deal">
            <article className="dk-deal2 dk-nodeal">
              <div className="dk-eyebrow">No deal</div>
              <p className="dk-waited">Nothing here is under your $80.00 cap. The cheapest seller left asks $84.00.</p>
              <p className="dk-nodeal-aside"><i />Goose set TixQuack aside. <button type="button" className="dk-why-btn">Why?</button></p>
              <div className="dk-nodeal-act"><button type="button" className="dk-approve">Keep watching for $80.00 or less</button><button type="button" className="dk-pill">Ask for something else</button></div>
            </article>
          </Spec>
          <Spec label="Set aside · the row and its sealed case">
            <ol className="dk-feed sys-feed">
              <li className="dk-fr dk-aside">
                <span className="dk-pic">T</span>
                <span className="dk-who"><span className="dk-name">TixQuack</span><span className="dk-st"><i />Set aside: asks for gift cards</span></span>
                <span className="dk-price">$60.00</span>
                <Case quoted="Pay with a gift card for the fastest delivery." />
              </li>
            </ol>
          </Spec>
          <Spec label="Protection line">
            <div className="dk-protect">
              <svg className="dk-protect-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75 4.5 5.5v5.8c0 4.6 3.1 8.6 7.5 9.95 4.4-1.35 7.5-5.35 7.5-9.95V5.5L12 2.75Z" /><path d="m8.6 12.1 2.4 2.4 4.4-4.9" /></svg>
              <div><h3>Goose set TixQuack aside.</h3><p className="dk-stay">Your money stays put. <button type="button" className="dk-why-btn">Why?</button></p></div>
            </div>
          </Spec>
          <Spec label="Trail · what PayPal and code will do"><Trail intent="AUTHORIZE" practice /></Spec>
        </div>
      </Family>
      <Family id="sys-rows" title="Rows, dots and pills">
        <div className="sys-row">
          <Spec label="Seller rows · best, clear, held, over, reading" wide>
            <ol className="dk-feed sys-feed">
              {ROWS.map((r) => (
                <li key={r.name} className={`dk-fr ${r.cls}`}>
                  <span className="dk-pic">{r.name.charAt(0)}</span>
                  <span className="dk-who"><span className="dk-name">{r.name}</span><span className="dk-st"><i />{r.st}</span></span>
                  <span className="dk-price">{r.price}</span>
                </li>
              ))}
            </ol>
          </Spec>
          <Spec label="Eyebrow, tag and pill">
            <div className="sys-stack">
              <p className="dk-eyebrow">Your deal</p>
              <ul className="dk-tags"><li>Events</li><li>Under $90.00</li></ul>
              <button type="button" className="dk-pill">Ask for something else</button>
            </div>
          </Spec>
        </div>
      </Family>
      <Family id="sys-nav" title="Nav, menu and sheet">
        <div className="sys-row">
          <Spec label="Bar · rest" wide bare><Bar /></Spec>
          <Spec label="Bar · scrolled, frosted (solid on a phone)" wide bare frame="lit">
            <p className="sys-behind sys-under">Goose set TixQuack aside. Your money stays put.</p>
            <Bar scrolled />
          </Spec>
          <Spec label="Skip link · focused" wide bare><Bar skip /></Spec>
          <Spec label={`Menu · ${MENU_LABEL}`} wide frame="lit">
            <div className="dk sys-menu" data-palette="v">
              <div className="gm-panel">
                <div className="gm-head"><p className="gm-title dk-eyebrow">{MENU_LABEL}</p><button type="button" className="gm-close">Close</button></div>
                <div className="gm-groups">
                  {MENU.map((g) => (
                    <section key={g.name} className="gm-group">
                      <p className="gm-gname">{g.name}</p>
                      <ul>{g.items.map((i) => <li key={i.id}><a className="gm-item" href={appHref(i.href)}><span className="gm-name">{i.name}</span><span className="gm-line">{i.line}</span></a></li>)}</ul>
                    </section>
                  ))}
                </div>
              </div>
            </div>
          </Spec>
          <Spec label="Sheet · drawn in place" frame="lit">
            <div className="dk-sheet sys-sheet">
              <div className="dk-handle" />
              <h3>Why Goose set TixQuack aside</h3>
              <div className="dk-safe"><svg className="dk-protect-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75 4.5 5.5v5.8c0 4.6 3.1 8.6 7.5 9.95 4.4-1.35 7.5-5.35 7.5-9.95V5.5L12 2.75Z" /><path d="m8.6 12.1 2.4 2.4 4.4-4.9" /></svg><span>Your limit lives in code. A seller's words can't change it.</span></div>
              <ul className="dk-reasons"><li><i />It asks to be paid in gift cards.</li><li className="dk-calm"><i />Nothing was paid.</li></ul>
            </div>
          </Spec>
        </div>
      </Family>
      <Family id="sys-data" title="Ledger and charts">
        <div className="sys-row">
          <Spec label="Ledger rows · the recorded week, Midnight" wide>
            <div className="dk sys-mn" data-palette="midnight">
              {rows ? <ShellTable rows={rows} totals={null} onOpen={() => {}} labelledBy="sys-data-h" /> : <p className="sys-val">The recorded week didn't load.</p>}
            </div>
          </Spec>
          <Spec label="Chart frame · spending against limits (sample data)" wide><SpendLimits s={SPEND} /></Spec>
          <Spec label="Chart frame · the blind test, from the claims" wide><BlindDots /></Spec>
        </div>
      </Family>
      <Family id="sys-states" title="States">
        <div className="sys-slot">
          <p className="sys-label">Loading · empty · error · offline · rate-limited · 404 · waking</p>
          <p className="sys-val">States kit: coming.</p>
        </div>
      </Family>
    </>
  );
}

/** Every specimen, with the recorded week's ledger rows once they load. */
export default function Specimens() {
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([import("../offline.ts"), import("@goose/core/session")]).then(async ([o, s]) => {
      const w = await o.storyWeek();
      // One row of each kind the week has, in order: an offer, the Watcher's set-aside, a decision.
      const picked = [...new Map(s.weekRows(w.events).map((r) => [r.kind, r])).values()].slice(0, 4);
      if (live) setRows(picked);
    }).catch(() => { if (live) setRows(null); });
    return () => { live = false; };
  }, []);
  return (
    <>
      <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute"><defs>${SPRITE}</defs></svg>` }} />
      <Tokens />
      <Components rows={rows} />
    </>
  );
}
