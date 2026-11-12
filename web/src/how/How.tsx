// How it works (`?desk=how`; Track SYS, launch program): one diagram, shopper → Goose → the Watcher → the guard →
// PayPal, with the shopper's tap drawn as the one path back to PayPal. Inline SVG in two layouts (five across on a wide
// screen, stacked on a phone or a narrow window), each a titled, described image; the same steps as an ordered list for
// a screen reader. The words and the files are ./how.ts's, checked against the code by docs/claims.md's `sys-how-*` rows.
// Midnight, the back room's palette, by default; `&palette=v` draws it in Velvet.

import { appHref } from "../menu/href.ts";
import { useEffect, type ReactNode } from "react";
import { SiteNav } from "../nav/SiteNav.tsx";
import { HOW_DESC, HOW_LEAD, HOW_TITLE, STAGES, TAP_LINE, type Stage } from "./how.ts";
import "./how.css";
// The back room's own names (--lx-*), which its bar reads (nav.css `.gn[data-room="back"]`). Without them the bar falls
// back to Velvet over a Midnight page (the DD's ruling). Taken as text, like the design system's sheets, so the ledger's
// chunk and its stylesheet stay as they are. `?raw` less its `@import`: tokens.css is already this page's sheet, and
// `?inline` carried a second copy of it (9.7 KB) in the h1's bytes on the phone drill (Oct 31).
import midnightRaw from "../ledger/midnight.css?raw";

const midnightCss = midnightRaw.replace(/@import[^;]*;/g, "");

/** A path that can break after each slash, so a long one wraps inside its box instead of running out of it. */
const Path = ({ p }: { p: string }): ReactNode => p.split("/").map((seg, i, all) => <span key={i}>{seg}{i < all.length - 1 && <>/<wbr /></>}</span>);

/** One step's box: what kind of thing it is, its name, its sentence, its files. HTML inside the SVG, so the words wrap. */
function Box({ s, x, y, w, h }: { s: Stage; x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect className="how-box" x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={12} />
      <foreignObject x={x} y={y} width={w} height={h}>
        <div className="how-in">
          <span className="how-kind" data-code={s.kind === "Code" ? "" : undefined}>{s.kind}</span>
          <span className="how-name">{s.name}</span>
          <span className="how-line">{s.line}</span>
          <span className="how-files">{s.files.map((f) => <code key={f}><Path p={f} /></code>)}</span>
        </div>
      </foreignObject>
    </g>
  );
}

const Marker = ({ id }: { id: string }) => (
  <defs>
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path className="how-tip" d="M0 0 10 5 0 10z" />
    </marker>
  </defs>
);

// Five across: 5 × 212 + 4 × 19 = 1136, the page's content width at 1440.
const W = { box: 212, gap: 19, h: 276, tapY: 320 };
function Wide() {
  const x = (i: number) => i * (W.box + W.gap);
  const mid = (i: number) => x(i) + W.box / 2;
  return (
    <svg className="how-svg how-wide" viewBox={`0 0 1136 ${W.tapY + 2}`} role="img" aria-labelledby="how-t-wide how-d-wide">
      <title id="how-t-wide">{HOW_TITLE}</title>
      <desc id="how-d-wide">{HOW_DESC}</desc>
      <Marker id="how-a-wide" />
      {STAGES.map((s, i) => <Box key={s.id} s={s} x={x(i)} y={0} w={W.box} h={W.h} />)}
      {STAGES.slice(1).map((s, i) => <path key={s.id} className="how-arrow" d={`M${x(i) + W.box + 3} ${W.h / 2} H${x(i + 1) - 3}`} markerEnd="url(#how-a-wide)" />)}
      <path className="how-tap" d={`M${mid(0)} ${W.h + 3} V${W.tapY} H${mid(4)} V${W.h + 4}`} markerEnd="url(#how-a-wide)" />
      <text className="how-tap-label" x={568} y={W.tapY - 10} textAnchor="middle">{TAP_LINE}</text>
    </svg>
  );
}

// Stacked: a rail on the left carries the tap from You down to PayPal; its label reads up the rail.
const T = { left: 36, w: 340, box: 304, h: 232, gap: 36 };
function Tall() {
  const y = (i: number) => i * (T.h + T.gap);
  const mid = (i: number) => y(i) + T.h / 2;
  const height = y(STAGES.length - 1) + T.h;
  return (
    <svg className="how-svg how-tall" viewBox={`0 0 ${T.w} ${height}`} role="img" aria-labelledby="how-t-tall how-d-tall">
      <title id="how-t-tall">{HOW_TITLE}</title>
      <desc id="how-d-tall">{HOW_DESC}</desc>
      <Marker id="how-a-tall" />
      {STAGES.map((s, i) => <Box key={s.id} s={s} x={T.left} y={y(i)} w={T.box} h={T.h} />)}
      {STAGES.slice(1).map((s, i) => <path key={s.id} className="how-arrow" d={`M${T.left + T.box / 2} ${y(i) + T.h + 3} V${y(i + 1) - 3}`} markerEnd="url(#how-a-tall)" />)}
      <path className="how-tap" d={`M${T.left - 3} ${mid(0)} H22 V${mid(4)} H${T.left - 4}`} markerEnd="url(#how-a-tall)" />
      <text className="how-tap-label" transform={`translate(12 ${(mid(0) + mid(4)) / 2}) rotate(-90)`} textAnchor="middle">{TAP_LINE}</text>
    </svg>
  );
}

export default function How() {
  const pal = new URLSearchParams(location.search).get("palette") === "v" ? "v" : "midnight";
  useEffect(() => { document.title = `${HOW_TITLE} · Gilded Goose`; }, []);
  return (
    <div className="dk how" data-palette={pal}>
      {pal === "midnight" && <style>{midnightCss}</style>}
      <SiteNav here="back" exact={false} {...(pal === "midnight" ? { room: "back" as const } : {})} />
      <main id="main" className="how-wrap how-main">
        <header className="how-head">
          <h1>{HOW_TITLE}</h1>
          <p className="how-lead">{HOW_LEAD}</p>
        </header>
        <figure className="how-fig">
          <Wide />
          <Tall />
          <figcaption className="how-sr">
            <ol>
              {STAGES.map((s) => <li key={s.id}>{s.name} ({s.kind}): {s.line} Code: {s.files.join(", ")}.</li>)}
              <li>{TAP_LINE}.</li>
            </ol>
          </figcaption>
        </figure>
        <p className="how-next"><a href={appHref("?desk=ledger")}>See it on a recorded run <span aria-hidden="true">›</span></a></p>
      </main>
      <footer className="how-wrap how-foot"><p>Fictional sellers. PayPal sandbox. Practice only: no real money.</p></footer>
    </div>
  );
}
