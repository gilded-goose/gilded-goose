// Section 5, the proof band: the blind tests side by side, the three sandbox money paths, the verified webhooks. Every figure is the
// Proof panel's own claims row (`storyBand` over `virtual:goose-proof`), and each links to that row in Proof.
import { appHref } from "../../menu/href.ts";
import { BAND_HEAD, type StoryBand } from "@goose/core/scroll";
import { curly } from "@goose/core/promises";
import { anchorOf } from "@goose/core/proof";
import { BlindSets } from "../../charts/BlindSets.tsx";

const proofHref = (id: string) => appHref(`?desk=proof#${anchorOf(id)}`);

export function Band({ band }: { band: StoryBand }) {
  return (
    <section className="ds-sec ds-band" aria-labelledby="ds-band-h" data-story="ds-band">
      <div className="ds-band-head" data-sr>
        <p className="dk-eyebrow ds-eyebrow">Proof</p>
        <h2 id="ds-band-h" className="ds-h2"><span className="ds-mask"><span>{curly(BAND_HEAD)}</span></span></h2>
        <a className="ds-textlink" href={appHref("?desk=proof")}><span className="ds-u">Every figure, with its source, in Proof</span> <span aria-hidden="true">›</span></a>
      </div>
      <div className="ds-band-row" data-sr>
        <div className="ds-stat ds-stat-blind">
          <BlindSets tests={band.tests} href={proofHref} readers={1} />
        </div>
        <div className="ds-stat ds-stat-runs">
          <p className="ds-fig ds-num">{band.runs.count}</p>
          <p className="ds-say">{band.runs.say}</p>
          <ul className="ds-runs" aria-label="Each run's claims row">
            {band.runs.items.map((r) => (
              <li key={r.id}>
                <a href={proofHref(r.id)}>
                  <span className="ds-u">{r.label}</span>{" "}
                  <span className="ds-num">{r.figure} <span aria-hidden="true">›</span></span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="ds-stat ds-stat-hooks">
          <p className="ds-fig ds-num">{band.webhooks.figure}</p>
          <p className="ds-say">{band.webhooks.say}</p>
          <a className="ds-src" href={proofHref(band.webhooks.id)}><span className="ds-u">Its claims row</span> <span aria-hidden="true">›</span></a>
        </div>
      </div>
    </section>
  );
}
