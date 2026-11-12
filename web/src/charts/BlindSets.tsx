// The blind tests, side by side (Joshua, Wed Nov 4, section 4): "show it next to the old one, each labeled with its set
// and date, never just the better one." One table for the landing's band and the Proof page's, newest set first. Every
// figure is its claims row's Value and links to that row. A set's AI-reader line says its scam figure and its fair notes
// refused in one sentence, same size: the reader's catch and what honest sellers pay for it are never apart.
import type { ReactNode } from "react";
import { BAND_READER, BAND_STILL, BAND_TESTS, type StoryBand } from "@goose/core/band";
import "./blind-sets.css";

/** `readers` is how many sets get their AI-reader line, newest first; the landing has a word ceiling, Proof shows every set.
 *  `fold` (Proof only, round 6b B2) puts the reader lines, the lines after them and `children` one tap under the table,
 *  behind a summary of those words; the table and BAND_STILL, the promise, stay above it. */
export function BlindSets({ tests, href, readers = tests.readers.length, fold, children }: { tests: StoryBand["tests"]; href: (id: string) => string; readers?: number; fold?: string; children?: ReactNode }) {
  const under = (
    <>
      {tests.readers.slice(0, readers).map((r) => (
        <p className="bs-reader" key={r.set}>{r.set}, {BAND_READER.on} <a href={href(r.through.id)}>{r.through.figure}</a> {BAND_READER.through} <a href={href(r.refused.id)}>{r.refused.figure}</a> {BAND_READER.refused} <a href={href(r.held.id)}>{r.held.figure}</a> {BAND_READER.held}</p>
      ))}
      <p className="bs-after">{tests.after.join(" ")}</p>
      {children}
    </>
  );
  return (
    <div className="bs">
      <table className="bs-t">
        <caption>{BAND_TESTS}</caption>
        <thead><tr><td />{tests.sets.map((s) => <th key={s} scope="col">{s}</th>)}</tr></thead>
        <tbody>
          {tests.rows.map((r) => (
            <tr key={r.say}>
              <th scope="row">{r.say}</th>
              {r.cells.map((c) => <td key={c.id}><a href={href(c.id)}>{c.figure}</a></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="bs-still">{BAND_STILL}</p>
      {fold ? <details className="bs-fold"><summary>{fold} <span aria-hidden="true">›</span></summary>{under}</details> : under}
    </div>
  );
}
