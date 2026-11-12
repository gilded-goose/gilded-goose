// "The missing layer" (Joshua, Nov 3): the industry gap and the research, each linked to its source. One body on the
// landing and on Proof, so the two can't say different things; every word is core's (`@goose/core/missing-layer`, rows
// `ml-*`). Links leave the site as plain links, the way the close's FTC link does. The landing folds the full list, its
// page being long already; Proof, where a judge goes to check, opens it.
import { AP2_NOTE, LEAD_GAP_WHO, LAYER_CAVEAT, LAYER_GOOSE_HEAD, LAYER_GOOSE_REST, LAYER_GROUPS, LAYER_HEAD, LAYER_LEDE, LAYER_READ, LAYER_SOURCES, LEAD_GAP, LEAD_RESEARCH, RESEARCH_NOTE, sourceOf, type LayerSource } from "@goose/core/missing-layer";
import "./missing-layer.css";

function Lead({ source, who = source.who, before, quote, note, also }: { source: LayerSource; who?: string; before?: string; quote: string; note: string; also?: string }) {
  return (
    <figure className="ml-lead">
      <blockquote cite={source.url}>{before && `${before} `}“{quote}”</blockquote>
      <figcaption>
        <a className="ml-link" href={source.url} rel="noopener noreferrer">{who}</a>
        {also ? <>{" also says: "}“{also}” {note}</> : <>. {note}</>}
      </figcaption>
    </figure>
  );
}

/** The quotes, the layer and the sources: everything but the heading and its line, which each page sets in its own way. */
export function LayerBody({ open = false }: { open?: boolean }) {
  const gap = sourceOf(LEAD_GAP), research = sourceOf(LEAD_RESEARCH);
  return (
    <div className="ml">
      <div className="ml-leads">
        <Lead source={gap} who={LEAD_GAP_WHO} before="By design," quote={gap.quotes[1]!.text} note={AP2_NOTE} />
        <Lead source={research} before="Some models" quote={research.quotes[0]!.text} also={research.quotes[1]!.text} note={RESEARCH_NOTE} />
      </div>
      <p className="ml-goose"><span className="ml-goose-head">{LAYER_GOOSE_HEAD}</span> {LAYER_GOOSE_REST}</p>
      <details className="ml-fold" open={open}>
        <summary>All {LAYER_SOURCES.length} sources, each with its read date <span aria-hidden="true">›</span></summary>
        <p className="ml-caveat">{LAYER_CAVEAT}</p>
        <div className="ml-groups">
          {LAYER_GROUPS.map((g) => (
            <div key={g.key}>
              <h3>{g.title}</h3>
              <ul>
                {g.sources.map((s) => (
                  <li key={s.id}>
                    <a className="ml-link" href={s.url} rel="noopener noreferrer">{s.who}: {s.title}</a>
                    {s.quotes.map((q) => <q key={q.row} cite={s.url}>{q.text}</q>)}
                    <p>{s.note} Read {LAYER_READ}.</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

export function MissingLayer() {
  return (
    <section className="ds-sec ds-layer" data-sr data-story="ds-layer" id="missing-layer" aria-labelledby="ds-layer-h">
      <h2 id="ds-layer-h" className="ds-h2">{LAYER_HEAD}</h2>
      <p className="ds-lede">{LAYER_LEDE}</p>
      <LayerBody />
    </section>
  );
}
