// Goose's Read on screen: the call, its one reason, and every signal folded under it. Its own small chunk, loaded lazily
// by each page that shows a want or a deal; the words are all code's (core/src/view/gooses-read.ts), sent by the server.
// On the deal, `words` (her ask) adds one real price under the signals (Joshua, Fri Nov 6 1:10 PM): the same /api/prices
// answer the Real prices panel reads (the server answers both from one live call, its cache or the recording), made a line
// by core/src/view/real-reference.ts. The call and its reason stay the server's: withReference adds a line and nothing else.

import { useEffect, useState } from "react";
import { READ_BY_CODE, type GooseRead, type ReadLine } from "@goose/core/read";
import { realReference, withReference } from "@goose/core/real-reference";
import "./read.css";

/** `brief`, on the deal: the call alone on one line, its reason the first line once opened. Approve sits just below it. */
export default function Read({ read: told, brief, words }: { read: GooseRead; brief?: boolean; words?: string }) {
  const [ref, setRef] = useState<ReadLine | null>(null);
  useEffect(() => {
    setRef(null);
    if (!words) return;
    let live = true;
    fetch(`/api/prices?q=${encodeURIComponent(words.slice(0, 80))}`, { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: unknown) => { if (live) setRef(realReference(p, "channel3")); }, () => {});
    return () => { live = false; };
  }, [words]);
  const read = withReference(told, ref);
  return (
    <details className="gr" data-call={read.call} data-brief={brief || undefined}>
      <summary>
        <span className="gr-head"><span className="gr-name">Goose's read</span><b className="gr-call">{read.call}</b></span>
        {!brief && <span className="gr-why">{read.because}</span>}
      </summary>
      {brief && <p className="gr-first">{read.because}</p>}
      <dl className="gr-lines">
        {read.lines.map((l) => <div key={l.name}><dt>{l.name}</dt><dd>{l.said}</dd></div>)}
      </dl>
      <p className="gr-by">{READ_BY_CODE}</p>
    </details>
  );
}
