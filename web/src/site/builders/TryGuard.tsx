// Try the guard in your browser: the lazy part (Builders.tsx asks for it when its room nears the screen). It runs the
// package's own `readSeller` on the pasted note, here in the page: no request, nothing stored, nothing logged, and no
// money path (no price, cart, order or tap exists in this file). The note and the reading are drawn as text only.
import { Component, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
// `?own` is a build mark, not another package: this chunk carries its own copy of the same source (web/own-copy.ts says why).
import { readSeller } from "@gilded-goose/trust?own";
import { name, version } from "../../../../trust/package.json";
import { stampWords, verdictOf } from "../ui/stamp.ts";
import { CAP_SAID, CHECK, CODE_HEAD, CODE_LINES, CODE_MISSES, CODE_ONLY, EXAMPLES, EXAMPLES_HEAD, NOTE_LABEL, NOTHING_SENT, LOST, PROOF_LINK, RETURNED, TRY_HEAD, capNote, sameCode } from "./try-guard-words.ts";
// Nothing here imports the site's entry chunk (Button, Stamp, route.ts): an import of it lists the entry's stylesheet as a
// preload in the Builders page's first load, 127 B for nothing. So the button and the stamp are drawn with the same classes
// those two draw, and the Proof link is typed; try-guard.test.ts holds all three equal to the originals.
// In the chunk's own JS (vite.config.ts lists it no preloads), so the Builders page carries no word of this part's styles.
import css from "./try-guard.css?inline";

type Read = { of: string } & ReturnType<typeof readSeller>;

function TryGuard() {
  const [note, setNote] = useState("");
  const [cut, setCut] = useState(false);
  const [read, setRead] = useState<Read | null>(null);

  // Typed, pasted or filled from an example: the box keeps at most the cap, and says so when it left words out.
  function take(text: string) {
    const kept = capNote(text);
    setNote(kept.note);
    setCut(kept.cut);
  }

  function check() {
    const { verdict, rule, reason, cantSee } = readSeller(note);
    setRead({ of: note, verdict, rule, reason, cantSee });
  }

  // A reading stays only beside the words it read: change the note and it goes.
  const shown = read && read.of === note ? read : null;
  return (
    <section className="bd-sec tg" aria-labelledby="bd-try">
      <style>{css}</style>
      <h2 id="bd-try" className="bd-h">{TRY_HEAD}</h2>
      <label className="tg-label" htmlFor="tg-note">{NOTE_LABEL}</label>
      <textarea id="tg-note" className="tg-note" rows={4} dir="auto" value={note} onChange={(e) => take(e.target.value)} aria-describedby="tg-sent" autoComplete="off" spellCheck={false} />
      {cut ? <p className="tg-cap" role="status">{CAP_SAID}</p> : null}
      <p id="tg-sent" className="tg-small">{NOTHING_SENT}</p>
      <div className="tg-row" role="group" aria-label={EXAMPLES_HEAD}>
        <span className="tg-small" aria-hidden="true">{EXAMPLES_HEAD}</span>
        {EXAMPLES.map((e) => <button key={e.label} type="button" className="tg-chip" aria-pressed={note === e.note} onClick={() => take(e.note)}>{e.label}</button>)}
      </div>
      <p><button type="button" className="btn" data-tone="ink" data-size="m" disabled={note.trim() === ""} onClick={check}>{CHECK}</button></p>
      <div className="tg-out" aria-live="polite">
        {shown ? (
          <div className="tg-read" data-verdict={shown.verdict}>
            <span className="stamp" data-verdict={verdictOf(shown.verdict, false)} data-struck="">
              <span className="stamp-die">{stampWords(verdictOf(shown.verdict, false))}</span>
              <span className="stamp-reason">{shown.reason}</span>
            </span>
            <p className="tg-small">{shown.cantSee}</p>
            <p className="tg-small">{RETURNED} <code>{`{ verdict: ${JSON.stringify(shown.verdict)}, rule: ${JSON.stringify(shown.rule)} }`}</code></p>
          </div>
        ) : null}
      </div>
      {shown ? (
        <div className="tg-how">
          <p className="tg-small">{CODE_HEAD}</p>
          <pre className="tg-code"><code>{CODE_LINES.map((l, i) => <span key={l} className="tg-ln">{l.split(" ").flatMap((w, k) => [k ? " " : "", <span key={k}>{w}</span>])}{i < CODE_LINES.length - 1 ? "\n" : ""}</span>)}</code></pre>
        </div>
      ) : null}
      <p className="tg-small">{sameCode(name, version)}</p>
      <p className="tg-small">{CODE_ONLY} {CODE_MISSES} <a href="#/proof">{PROOF_LINK}</a>.</p>
    </section>
  );
}

/** Draws the part into the room the Builders page keeps for it. Its own root: the page holds no state for it, so nothing
 *  there re-renders when it lands. The room leaves the page with the page; the part holds no timer, listener or request. */
export default function mount(room: HTMLElement): void {
  createRoot(room).render(<Hold><TryGuard /></Hold>);
}

/** A part that loads and then throws while drawing says the same one line a lost chunk says, once, in place of the part:
 *  never the room's 560 px of silent blank. It lives here, so it costs the Builders page's first load nothing. */
class Hold extends Component<{ children: ReactNode }, { lost: boolean }> {
  override state = { lost: false };
  static getDerivedStateFromError() { return { lost: true }; }
  override render() { return this.state.lost ? <p role="alert">{LOST}</p> : this.props.children; }
}
