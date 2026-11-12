// Why this matters, right after the Challenge (Joshua, Wed Nov 4): the size of the problem, and one made-up scene of whom
// Goose is for, shown and labeled. The words and sources are in core (`@goose/core/impact`), each with its claims row.
// No eyebrow on the landing (DD, Thu Nov 5, on the numbered sections): an un-numbered label in the numbered labels' style,
// just above "04 Why now", read as a missing number. IMPACT_EYEBROW stays in core; the headline says what the figures are.
// The Microsoft Research line ("AI shoppers can be tricked too") went on Fri Nov 6 (decision 1a): with the challenge right
// above, the page shows an AI shopper being tried, and the missing layer quotes the same study, both halves, with its rows.
import { IMPACT_FIGURES, IMPACT_HEAD, SCENE_LABEL, SCENE_LINES } from "@goose/core/impact";

export function Impact() {
  return (
    <section className="ds-sec ds-impact" aria-labelledby="ds-impact-h" data-story="ds-impact">
      <div data-sr>
        <h2 id="ds-impact-h" className="ds-h2">{IMPACT_HEAD}</h2>
      </div>
      <div className="ds-band-row" data-sr>
        {IMPACT_FIGURES.map((f) => (
          <div className="ds-stat" key={f.row}>
            <p className="ds-fig ds-num">{f.figure}</p>
            <p className="ds-say">{f.say}</p>
            <a className="ds-src" href={f.url} rel="noopener noreferrer"><span className="ds-u">FTC</span> <span aria-hidden="true">›</span></a>
          </div>
        ))}
      </div>
      <figure className="ds-scene" data-sr>
        <figcaption className="ds-small">{SCENE_LABEL}</figcaption>
        <ol>{SCENE_LINES.map((l) => <li key={l}>{l}</li>)}</ol>
      </figure>
    </section>
  );
}
