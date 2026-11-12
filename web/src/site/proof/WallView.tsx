// The opened wall: our misses in both directions on the Nov 4 set. Its own chunk, fetched when the reader opens it
// (Proof.tsx's door), so Proof's first screen pays for a heading and a button only. Its styles ride in the chunk as text
// (wall.css?inline, drawn in a <style>), so the door's preload list names one file fewer.
//
// A note is hostile text: scam notes written to get money moved. Each one is drawn as a React text child inside a
// labelled quote and nowhere else: no HTML sink, no markdown, no link made from its words, and this file has no link at
// all. core/test/misses-wall.test.ts renders this with a note that carries a script tag and markdown and reads them back
// as plain characters.
import { useEffect, useRef } from "react";
import { BAND_BOUND, BAND_STILL } from "@goose/core/band";
import { NOTE_LABEL, WALL_FAIR_HEAD, WALL_QUOTES, WALL_SCAM_HEAD, WALL_USED, WALL_WHO, verdictLines, wallFairLede, wallLede, type Wall, type WallNote } from "@goose/core/wall";
import css from "./wall.css?inline";

function Notes({ notes, label }: { notes: readonly WallNote[]; label: string }) {
  return (
    <ol className="mw-notes" aria-label={label}>
      {notes.map((n, k) => {
        const [code, reader] = verdictLines(n);
        return (
          <li key={k} className="mw-note" data-kind={n.kind} data-reader={n.reader}>
            <figure>
              <figcaption className="mw-tag">{NOTE_LABEL[n.kind]}</figcaption>
              <blockquote className="mw-q">{n.note}</blockquote>
            </figure>
            <p className="mw-then"><span>{code}</span> <span className="mw-next">{reader}</span></p>
          </li>
        );
      })}
    </ol>
  );
}

export function WallView({ wall }: { wall: Wall }) {
  // The button that opened this is gone once the notes are here, so the keyboard's place moves to the notes' first
  // words, which a screen reader then reads. A visit that arrived by the section's own address pressed nothing: its
  // focus is left alone.
  const top = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (!location.hash.endsWith("#got-through")) top.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="mw">
      <style>{css}</style>
      <p className="pr-sec-p mw-top" ref={top} tabIndex={-1}>{wallLede(wall)}</p>
      <p className="pr-fine">{WALL_WHO} {WALL_USED}</p>
      <p className="pr-fine">{BAND_BOUND} {BAND_STILL}</p>
      <p className="mw-warn">{WALL_QUOTES}</p>

      <section className="mw-part" aria-labelledby="mw-scam">
        <h3 id="mw-scam">{WALL_SCAM_HEAD}</h3>
        <Notes notes={wall.scam.through} label={WALL_SCAM_HEAD} />
      </section>

      <section className="mw-part" aria-labelledby="mw-fair">
        <h3 id="mw-fair">{WALL_FAIR_HEAD}</h3>
        <p className="pr-sec-p">{wallFairLede(wall)}</p>
        <Notes notes={wall.fair.stopped} label={WALL_FAIR_HEAD} />
      </section>
    </div>
  );
}
