// The blind test as dots (Track D; Joshua's mandate: "dots for the blind test", "say 'one writer, one set'"). One dot
// per note, every note judged twice: by code alone, then with the AI reader on. Each dot shows one of three outcomes by
// shape as well as colour (solid: went wrong; half: held for your yes; ring: went right), and a note keeps its column in
// both rows, so the eye sees exactly which notes the reader changed.
//
// Every figure is a claims row's Value, read at build (`virtual:goose-proof`): the two-way counts (`d-blind-pairs`), the
// bound on a clean zero (`d-blind-bound`), and the four rows the page already quoted (blind-code-through,
// blind-reader-on, blind-fair, blind-code-alone), each figure linking to its row under Sources. The dots are hidden from
// screen readers; the words beside them say every number the dots show.
//
// Mount (Track L, web/src/Proof.tsx): `import { BlindDots } from "./charts/BlindDots.tsx";` and, in the blind group,
// `<BlindDots />` in place of `<Blind items={g.items} />`.

import proof from "virtual:goose-proof";
import { anchorOf, nOf, type ProofItem } from "@goose/core/proof";
import { changeLine as change, countsOf, dotsOf, parseBlindPairs, wrong, type BlindSet, type Outcome, type SetPairs } from "./blind.ts";
import "./charts.css";

const item = (id: string): ProofItem => {
  const it = proof.groups.flatMap((g) => g.items).find((i) => i.id === id);
  if (!it) throw new Error(`the blind test's dots need claims row "${id}" in the Proof panel's groups`);
  return it;
};

const WORDS: Readonly<Record<BlindSet, { title: string; wrong: string; right: string; row: string }>> = {
  scam: { title: "scam notes", wrong: "got through with no warning", right: "refused", row: "blind-code-through" },
  fair: { title: "fair notes", wrong: "wrongly refused", right: "cleared", row: "blind-fair" },
};

/** A dot's look: what went wrong is solid, a hold is half filled (it waits for your yes), what went right is a ring. */
function look(set: BlindSet, o: Outcome): string {
  return o === wrong(set) ? "bd-dot is-wrong" : o === "hold" ? "bd-dot is-hold" : "bd-dot";
}

function Row({ s, by, figure, source = "d-blind-pairs", beside }: { s: SetPairs; by: "code" | "reader"; figure: ProofItem; source?: string; beside?: { figure: ProofItem; words: string } }) {
  const w = WORDS[s.set];
  const c = countsOf(s, by);
  const bad = c[wrong(s.set)];
  // The row's headline is its claims row's Value, as written; the test below holds it equal to the pairs row's count.
  const head = nOf(figure.figure);
  if (!head || head.n !== bad || head.of !== s.of) throw new Error(`claims row "${figure.id}" (${figure.figure}) disagrees with the blind test's pairs row (${bad} of ${s.of})`);
  const right = s.set === "scam" ? c.refuse : c.clear;
  return (
    <div className="bd-row">
      <div className="bd-head">
        <p className="bd-label">{by === "code" ? "Code alone" : "Code plus the AI reader"}</p>
        <div className="bd-figs">
          <a className="bd-fig" href={`#${figure.anchor}`}>
            {/* A tick only for a clean row: a zero with holds still leaves those notes to the shopper's own yes. */}
            <span className="bd-n">{figure.figure}{bad === 0 && c.hold === 0 && <span className="pf-tick" aria-hidden="true" />}</span>
            <span className="bd-w">{w.title} {w.wrong}</span>
          </a>
          {/* Lead-10's rule (Wed Nov 4): this zero is never apart from what honest sellers paid for it, same size, same line. */}
          {beside && (
            <a className="bd-fig" href={`#${beside.figure.anchor}`}>
              <span className="bd-n">{beside.figure.figure}</span>
              <span className="bd-w">{beside.words}</span>
            </a>
          )}
        </div>
      </div>
      <div className="bd-body">
        <div className="bd-dots" aria-hidden="true">
          {dotsOf(s, by).map((o, i) => <span key={i} className={look(s.set, o)} />)}
        </div>
        {/* In the dots' own order: what went wrong, what was held, what went right. */}
        <p className="bd-split">
          <a href={`#${anchorOf(source)}`}>{[bad > 0 ? `${bad} ${w.wrong}` : "", `${c.hold} held for your yes`, `${right} ${w.right}`].filter(Boolean).join(", ")}</a>
        </p>
      </div>
    </div>
  );
}

export function BlindDots() {
  const pairs = item("d-blind-pairs");
  const bound = item("d-blind-bound");
  const sets = parseBlindPairs(pairs.figure);
  const [scamBound, fairBound] = bound.figure.split("; ");
  const scam = sets[0]!, fair = sets[1]!;
  const fresh = parseBlindPairs(item("fresh-counts").figure);
  return (
    <div className="bd">
      <p className="bd-key" aria-hidden="true">
        <span><i className="bd-dot is-wrong" />Went wrong</span>
        <span><i className="bd-dot is-hold" />Held for your yes</span>
        <span><i className="bd-dot" />Went right</span>
      </p>
      {/* Newest first (Joshua, Wed Nov 4, section 4). Each first run, once, before anything was tuned on it. */}
      <h3 className="bd-date">Nov 4 set</h3>
      <p className="bd-lead">A new writer, a Claude Sonnet agent that never opened our repo, wrote these. Each note was scored once by code alone and once with the AI reader on, before anything was tuned on them. A note keeps its place in both rows.</p>
      {fresh.map((s) => (
        <section className="bd-set" key={s.set} aria-labelledby={`bd-fresh-${s.set}`}>
          <h4 id={`bd-fresh-${s.set}`}>{s.of} {WORDS[s.set].title}</h4>
          <Row s={s} by="code" figure={item(s.set === "scam" ? "fresh-code-through" : "fresh-fair-refused")} source="fresh-counts" />
          {s.set === "scam"
            ? <Row s={s} by="reader" figure={item("fresh-reader-through")} source="fresh-counts" beside={{ figure: item("fresh-reader-fair-refused"), words: `${WORDS.fair.title} ${WORDS.fair.wrong}` }} />
            : <Row s={s} by="reader" figure={item("fresh-reader-fair-refused")} source="fresh-counts" />}
          <p className="bd-change">{change(s)}</p>
        </section>
      ))}
      <p className="bd-bound">One writer, one set: a bounded test, not a rate. A zero here isn't "never": the AI reader can miss a scam, and honest sellers paid for this catch in the fair notes it refused. The set is in our repo now, so it's no longer blind either.</p>
      <h3 className="bd-date">Oct 28 set</h3>
      <p className="bd-lead">Every note was judged twice: by code alone, then with the AI reader on. A note keeps its place in both rows, so you can see which ones the reader changed.</p>
      {sets.map((s) => (
        <section className="bd-set" key={s.set} aria-labelledby={`bd-${s.set}`}>
          <h4 id={`bd-${s.set}`}>{s.of} {WORDS[s.set].title}</h4>
          <Row s={s} by="code" figure={item(WORDS[s.set].row)} />
          <Row s={s} by="reader" figure={item(s.set === "scam" ? "blind-reader-on" : "blind-fair")} />
          <p className="bd-change">{change(s)}</p>
        </section>
      ))}
      {/* What the set is and isn't, from the corpus's own `about` (core/test/fixtures/reader-blind-r4.json) and the
          claims row blind-reader-on: the writer was an AI, the reader is from the same family, and the reader runs live
          only in Try to trick Goose. */}
      <p className="bd-bound">
        One writer, one set: an AI model (a Claude Sonnet agent told never to open our repo) wrote all {scam.of + fair.of} notes,
        and the reader is Claude Haiku, so writer and reader come from the same family; scams people write may differ.
        Recorded twice, with the same counts. The AI reader runs live only in Try to trick Goose; on the Desk and everywhere
        else, the code-alone row is what runs.
      </p>
      <p className="bd-bound">
        A clean zero isn't "never": code plus a reader that let through <a href={`#${bound.anchor}`}>{scamBound}</a> scam
        notes could still score 0 of {scam.of}, one time in 20; one that wrongly refused <a href={`#${bound.anchor}`}>{fairBound}</a> fair
        notes could still score 0 of {fair.of}. The check counts the recording again; it doesn't re-run the reader. The set
        has since gone into our tests, so it's no longer blind; the Nov 4 set above is the new writer.
      </p>
    </div>
  );
}
