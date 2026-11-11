// Section 6, the close (Joshua: "Rather see for yourself? Try to trick Goose." → the challenge, on this same page). The "wait" line
// belongs to Desk-A's deal card and appears once on the page, so it isn't here. The egg (the hero's still, already loaded)
// is the only light.
import { appHref } from "../../menu/href.ts";
import { CLOSE, CLOSE_NOTES } from "@goose/core/scroll";
import eggStill from "../egg.webp";

export function Close() {
  return (
    <section className="ds-sec ds-close" aria-labelledby="ds-close-h" data-story="ds-close">
      <div className="ds-close-egg" data-sr aria-hidden="true">
        <img src={eggStill} alt="" width={600} height={720} loading="lazy" decoding="async" />
        <span className="ds-close-shadow" />
      </div>
      <div className="ds-close-copy" data-sr>
        <h2 id="ds-close-h" className="ds-h2 ds-close-h">
          <span className="ds-mask"><span>{CLOSE[0]}</span></span>
          <span className="ds-mask ds-close-2"><span style={{ "--i": 1 } as React.CSSProperties}>{CLOSE[1]}</span></span>
        </h2>
        <div className="ds-close-acts">
          <a className="ds-cta" href="#challenge">{CLOSE[1].replace(/\.$/, "")} <span aria-hidden="true">›</span></a>
          <a className="ds-textlink" href={appHref("?desk=ledger")}><span className="ds-u">Behind the scenes</span> <span aria-hidden="true">›</span></a>
          <a className="ds-textlink" href={appHref("?desk=proof")}><span className="ds-u">Proof</span> <span aria-hidden="true">›</span></a>
        </div>
        {/* Track C's end-card lines, under a hairline, word for word (CLOSE_NOTES, core/src/view/scroll.ts). */}
        <div className="ds-close-notes">
          {CLOSE_NOTES.map((n) => <p key={n.text}><Note {...n} /></p>)}
        </div>
      </div>
    </section>
  );
}

/** One end-card line, its words exactly: no link, the whole line linked, or only its `link` words linked (the FTC line). */
function Note({ text, href, link }: (typeof CLOSE_NOTES)[number]) {
  if (!href) return <>{text}</>;
  if (!link) return <a href={href}>{text}</a>;
  const at = text.indexOf(link);
  return <>{text.slice(0, at)}<a href={href} rel="noopener noreferrer">{link}</a>{text.slice(at + link.length)}</>;
}
