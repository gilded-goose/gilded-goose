// Sections 04 to 06 of the numbered landing (Joshua, Thu Nov 5 6:20 PM): Why now, What Goose keeps (with what it doesn't
// do, in the same calm style) and For builders. Each is a small label (its number is the page's own counter, hero.css),
// one headline, a few plain sentences, on the section's hairline. No word is typed here: the thesis, what's kept and what
// Goose doesn't do are core's (`@goose/core/thesis`, the words Devpost says, rows c-thesis*, c-kept-* and c-doesnt-do);
// the builders' lead and the name of its code are that page's own (builders.ts). Row p-landing-calm pins the mounts.
import { DOESNT_LABEL, DOESNT_LINE, KEPT_FOLD, KEPT_HEAD, KEPT_LABEL, KEPT_LINES, THESIS_LABEL, THESIS_LINES, THESIS_QUOTE } from "@goose/core/thesis";
import { BUILDERS_HREF } from "@goose/core/menu-hash";
import { BUILDERS_LEAD, BUILDERS_TITLE, CODE_HEAD } from "../../builders/builders.ts";
import { appHref } from "../../menu/href.ts";
import { KEPT_ID } from "./ChallengeStart.tsx";

/** 04, Why now: the pull quote is the headline, then the two sentences ("We think" marks the first as our view). */
export function Thesis() {
  return (
    <section className="ds-sec ds-calm" data-sr data-story="ds-thesis" aria-labelledby="ds-thesis-h">
      <h2 id="ds-thesis-h" className="dk-eyebrow ds-eyebrow ds-n">{THESIS_LABEL}</h2>
      <p className="ds-h2 ds-quote">{THESIS_QUOTE}</p>
      {THESIS_LINES.map((l) => <p key={l} className="ds-lede">{l}</p>)}
    </section>
  );
}

/** 05, What Goose keeps: the headline, the four lines the code backs, the link that opens the Challenge's own fold
 *  (it opens on the hash), then What Goose doesn't do, its one honest line. */
export function KeptNote() {
  return (
    <section className="ds-sec ds-calm" data-sr data-story="ds-kept" aria-labelledby="ds-kept-h">
      <p className="dk-eyebrow ds-eyebrow ds-n">{KEPT_LABEL}</p>
      <h2 id="ds-kept-h" className="ds-h2">{KEPT_HEAD}</h2>
      <ul className="ds-calm-list">{KEPT_LINES.map((l) => <li key={l}>{l}</li>)}</ul>
      <a className="ds-textlink" href={`#${KEPT_ID}`}><span className="ds-u">{KEPT_FOLD}</span> <span aria-hidden="true">›</span></a>
      <h3 className="dk-eyebrow ds-eyebrow ds-doesnt-h">{DOESNT_LABEL}</h3>
      <p className="ds-doesnt">{DOESNT_LINE}</p>
    </section>
  );
}

/** 06, For builders: that page's own lead, and a link to its code. */
export function ForBuilders() {
  return (
    <section className="ds-sec ds-calm" data-sr data-story="ds-builders" aria-labelledby="ds-builders-h">
      <h2 id="ds-builders-h" className="dk-eyebrow ds-eyebrow ds-n">{BUILDERS_TITLE}</h2>
      <p className="ds-lede ds-calm-first">{BUILDERS_LEAD}</p>
      <a className="ds-textlink" href={appHref(BUILDERS_HREF)}><span className="ds-u">{CODE_HEAD}</span> <span aria-hidden="true">›</span></a>
    </section>
  );
}
