// Track V (042, Joshua's mandate item 4: "Goose feels like it knows you"), made calm by Track DK (Joshua, Sat Oct 31
// 3:30 AM: "The greeting is one short line"; "Tell Goose your name" and "Mute Goose" move out of the hero). Two parts:
//   <Greeting />   the hero's one short line above the Ask box: "Good evening, Joshua." by the local clock, "Hello" from
//                  midnight to 4:59, "Good evening." with no name. Nothing else: no links, no question.
//   <NameField />  Limits in code's "Your name" row (desk/Panes.tsx, two taps from the hero: the menu, then the row): "Tell
//                  Goose your name" opens a small field; with a name, "Forget my name". Mute is that pane's voice row.
// The name lives only in this browser (web/src/name.ts): never sent, never in a URL, never logged. Goose says its fixed
// line when it learns or forgets the name; the name itself is shown, never spoken (or she can say "call me Sam" into the
// Ask box).

import { useEffect, useRef, useState, type FormEvent } from "react";
import { NAME_FORGOT, NAME_HELLO, NAME_MAX, greeting, tidyName } from "@goose/core/name";
import { forgetName, keepName, useName } from "../name.ts";
import { primeSpeech, say } from "../speech.ts";
import "./greeting.css";

const BAD_NAME = "A first name, in letters, please (one or two words).";

/** The hero's greeting: one short line by the shopper's own clock, kept true when she comes back to a tab left open. */
export function Greeting() {
  const name = useName();
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const now = () => setHour(new Date().getHours());
    addEventListener("visibilitychange", now);
    addEventListener("focus", now);
    return () => { removeEventListener("visibilitychange", now); removeEventListener("focus", now); };
  }, []);
  return <p className="vg-line">{greeting(hour, name)}</p>;
}

/** Limits in code's name row: "Tell Goose your name" (a small field) or, with a name, "Forget my name". `kept` is the
 *  row's name, read once by the pane (so the field and the row's line never disagree). */
export function NameField({ kept }: { kept: string | null }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [bad, setBad] = useState(false);
  const [said, setSaid] = useState(false); // the alert's words, emptied and refilled on each bad Save
  const tellRef = useRef<HTMLButtonElement>(null);
  const forgetRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const focusNext = useRef<"forget" | "tell" | "field" | null>(null);
  useEffect(() => {
    const at = focusNext.current;
    focusNext.current = null;
    (at === "forget" ? forgetRef : at === "tell" ? tellRef : at === "field" ? fieldRef : null)?.current?.focus();
  });

  function save(e: FormEvent) {
    e.preventDefault();
    primeSpeech();
    // Emptied, then filled on the next frame: the same error after a second bad Save is read out again.
    if (!tidyName(draft)) { setBad(true); setSaid(false); requestAnimationFrame(() => setSaid(true)); focusNext.current = "field"; return; }
    keepName(draft);
    say(NAME_HELLO);
    setOpen(false); setDraft(""); setBad(false);
    focusNext.current = "forget";
  }
  function forget() {
    primeSpeech();
    forgetName();
    say(NAME_FORGOT);
    focusNext.current = "tell";
  }
  function cancel() { setOpen(false); setDraft(""); setBad(false); focusNext.current = "tell"; }

  if (!open) return kept
    ? <button type="button" className="dk-why-btn" ref={forgetRef} onClick={forget}>Forget my name</button>
    : <button type="button" className="dk-why-btn" ref={tellRef} onClick={() => { setOpen(true); focusNext.current = "field"; }}>Tell Goose your name</button>;
  return (
    <form className="vg-form" onSubmit={save} noValidate onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}>
      <label className="vg-label" htmlFor="vg-name">What should Goose call you?</label>
      <div className="vg-row">
        <input id="vg-name" ref={fieldRef} className="vg-input" value={draft} maxLength={NAME_MAX} autoComplete="off" autoCapitalize="words" spellCheck={false} enterKeyHint="done"
          aria-invalid={bad || undefined} aria-describedby={bad ? "vg-err vg-note" : "vg-note"} onChange={(e) => { setDraft(e.target.value); setBad(false); }} />
        <button className="vg-save">Save</button>
        <button type="button" className="vg-link" onClick={cancel}>Cancel</button>
      </div>
      {/* On the page from the start, so the error is read out when it fills (an alert added with its words often isn't). */}
      <p id="vg-err" className="vg-note vg-bad" role="alert">{bad && said ? BAD_NAME : ""}</p>
      <p id="vg-note" className="vg-note">Kept in this browser only. Never sent anywhere.</p>
    </form>
  );
}
