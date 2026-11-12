// For builders (`?desk=builders`; Joshua, Nov 4, 2a). The words are ./builders.ts's; the code is the example file itself,
// imported as text so it can't drift from what the test suite runs. Midnight, the back room's palette, like How it works.

import { useEffect, type CSSProperties } from "react";
import { appHref } from "../menu/href.ts";
import { SiteNav } from "../nav/SiteNav.tsx";
import { HOW_HREF, TRICK_HREF } from "../../../core/src/view/menu-hash.ts";
import tenLines from "../../../trust/examples/ten-lines.ts?raw";
import readSellerFile from "../../../trust/examples/read-seller.ts?raw";
import {
  BUILDERS_LEAD, BUILDERS_TITLE, CODE_HEAD, CODE_NOTE, GET_INSTALL, GET_NOT_YET, GET_VERSION, GUARD_AFTER, GUARD_CHECKS, GUARD_HEAD, GUARD_LEAD, NEXT_HOW, NEXT_TRICK, NOT_HEAD,
  NOT_PROMISED, NPM_PUBLISHED, POSTMAN_LINE, POSTMAN_LINK, RENDER_LINE, RENDER_LINK, SELLER_CLEAR, SELLER_HEAD, SELLER_NOTE, SELLER_NO_RULE, SELLER_READS, SELLER_READS_HEAD, WATCHER_AI, WATCHER_HEAD, WATCHER_HOLD, WATCHER_LEAD, WATCHER_REFUSES, WATCHER_REFUSE_HEAD, WHO, WHO_HEAD,
} from "./builders.ts";
import "./builders.css";
import midnightRaw from "../ledger/midnight.css?raw";

const midnightCss = midnightRaw.replace(/@import[^;]*;/g, "");

/** A file, line by line, comments dimmed. Its text is the file's, byte for byte (scripts/builders-walk.ts reads it back).
 *  Each line carries its own indent (`--i`), so a phone's wrap hangs under the line it belongs to, never at the left edge. */
function Code({ file, text }: { file: string; text: string }) {
  const lines = text.split("\n");
  return (
    <pre className="bd-code" data-file={file}><code>
      {lines.map((l, i) => <span key={i} className={l.trim().startsWith("//") ? "bd-ln bd-note" : "bd-ln"} style={{ "--i": l.length - l.trimStart().length } as CSSProperties}>{l}{i < lines.length - 1 ? "\n" : ""}</span>)}
    </code></pre>
  );
}

export default function Builders() {
  useEffect(() => { document.title = `${BUILDERS_TITLE} · Gilded Goose`; }, []);
  return (
    <div className="dk bd" data-palette="midnight">
      <style>{midnightCss}</style>
      <SiteNav here="back" exact={false} room="back" />
      <main id="main" className="bd-wrap bd-main">
        <header className="bd-head">
          <h1>{BUILDERS_TITLE}</h1>
          <p className="bd-lead">{BUILDERS_LEAD}</p>
        </header>

        <section aria-labelledby="bd-who">
          <h2 id="bd-who">{WHO_HEAD}</h2>
          <ul className="bd-who">
            {WHO.map((w) => <li key={w.id}><h3>{w.who}</h3><p>{w.line}</p></li>)}
          </ul>
        </section>

        <section aria-labelledby="bd-code">
          <h2 id="bd-code">{CODE_HEAD}</h2>
          <p className="bd-text">{CODE_NOTE}</p>
          <Code file="trust/examples/ten-lines.ts" text={tenLines} />
          {/* web/postman.ts emits docs/builders' one collection file at the build's base. */}
          <p className="bd-text">{GET_VERSION} {NPM_PUBLISHED ? <code>{GET_INSTALL}</code> : GET_NOT_YET} {POSTMAN_LINE} <a href={`${import.meta.env.BASE_URL}gilded-goose.postman_collection.json`} download>{POSTMAN_LINK}</a>. {RENDER_LINE} <a href={`${__GOOSE_SITE__}/api/health`}>{RENDER_LINK}</a>.</p>
        </section>

        <div className="bd-two">
          <section aria-labelledby="bd-guard">
            <h2 id="bd-guard">{GUARD_HEAD}</h2>
            <p className="bd-text">{GUARD_LEAD}</p>
            <ul className="bd-list">{Object.entries(GUARD_CHECKS).map(([rule, line]) => <li key={rule}>{line}</li>)}</ul>
            {GUARD_AFTER.map((line) => <p key={line} className="bd-text">{line}</p>)}
          </section>

          <section aria-labelledby="bd-watcher">
            <h2 id="bd-watcher">{WATCHER_HEAD}</h2>
            <p className="bd-text">{WATCHER_LEAD}</p>
            <p className="bd-text">{WATCHER_REFUSE_HEAD}</p>
            <ul className="bd-list">{Object.entries(WATCHER_REFUSES).map(([rule, line]) => <li key={rule}>{line}</li>)}</ul>
            <p className="bd-text">{WATCHER_HOLD}</p>
            <p className="bd-text">{WATCHER_AI}</p>
          </section>
        </div>

        <section aria-labelledby="bd-seller">
          <h2 id="bd-seller">{SELLER_HEAD}</h2>
          <p className="bd-text">{SELLER_NOTE}</p>
          <Code file="trust/examples/read-seller.ts" text={readSellerFile} />
          <p className="bd-text">{SELLER_READS_HEAD}</p>
          <ul className="bd-reads">
            {SELLER_READS.map((r) => <li key={r.note} data-verdict={r.verdict}><q>{r.note}</q> <span><code>{r.verdict}</code> · {r.rule === null ? SELLER_NO_RULE : <code>{r.rule}</code>}</span></li>)}
          </ul>
          <p className="bd-text">{SELLER_CLEAR}</p>
        </section>

        <section className="bd-not" aria-labelledby="bd-not">
          <h2 id="bd-not">{NOT_HEAD}</h2>
          <ul>{NOT_PROMISED.map((n) => <li key={n.id}>{n.line}</li>)}</ul>
        </section>

        <p className="bd-next">
          <a href={appHref(HOW_HREF)}>{NEXT_HOW} <span aria-hidden="true">›</span></a>
          <a href={appHref(TRICK_HREF)}>{NEXT_TRICK} <span aria-hidden="true">›</span></a>
        </p>
      </main>
      <footer className="bd-wrap bd-foot"><p>Fictional sellers. PayPal sandbox. Practice only: no real money.</p></footer>
    </div>
  );
}
