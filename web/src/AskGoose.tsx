// Ask Goose, typed first (A1; 019). A typed box (the phone keyboard's own dictation mic works in it on any phone, the
// universal voice path); the server turns the words into chips (one Haiku call within the caps, else the labeled
// keyword rule) and F4 checks each one. The chips show with "from a fictional catalog" beside them, and the reader
// that ran, in fixed words. Speak-back: after the shopper's own tap, the browser says a short line built from the chips
// by code (never a question a spoken yes could answer, N27), and stays silent where speechSynthesis is missing. A color
// chip steers the next run (W49c, `onChips`), and the box says exactly that under every answer (CHIPS_IN_RUNS).
// No in-page mic here: it waits on the iPhone test (019). The words live only in this box; nothing here keeps them.
// "I saw it for $X" (021 item 8) is its own field, shown before any Ask (empty, optional; in the wallet's hero, W-8, only
// once there is an answer) and under the answer after one, filled from the same words by `sawPrice` for the shopper to see and fix. What is in it stays for the next Ask
// on the same item (`sawNext`), and × clears it. Only a comparison, in this component's state alone (no server, no storage).
// Under it, once an Ask named the kettle and the field holds a price, the answer ladder (item 9, `ladder`): the answer
// first ("$Y cheaper at …", "Buy it where you saw it", or over budget), said back in the chips' place, then the sellers
// the Watcher refused, then what it compared. It compares the market the page shows (`market`) with Goose's own deal there.
// Two commands the page answers itself (item 10, `voiceIntent`): "buy this right now" and "not this one". Where the page
// passes `onVoice` (the home), they never go to the Ask route: the page does what it can (start the run, set the waiting
// cart aside), says its line, and keeps the line under the box live (`voiceLine`) as the run goes. Nothing here can
// press Approve. Without `onVoice`, the words are asked as before.
// The wants list (core/src/ask/wants.ts): words that ask to save ("I really want it") come back with the server's
// `want`, said under the chips in fixed words; the page hears it (`onWant`, the wallet's list reads again). In the
// browser nothing is saved, and the line says why.
// "Take it back" (018 N28): where the page passes `onTakeBack` (the wallet), the words never go to the Ask route; the
// page brings its own Undo forward and returns the line to show and say. Nothing here refunds: the Undo tap does.

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PhotoAnswer } from "@goose/core/photo";
import { SETTINGS_ONLY, MAX_ASK_CHARS, PHOTO_OFF, keepsLastChips, CHIPS_IN_RUNS, SAW_LABEL, SAW_ONLY, SAW_WHICH, SAW_MAYBE, SAW_SPOKEN, SAW_NOT_A_PRICE, SAW_TYPE_A_PRICE } from "@goose/core/ask-copy";
import { SAW_EMPTY, sawField, sawNext, sawPrefill, sawPrice, sawShown, sawTag, type SawState } from "@goose/core/saw";
import { fromCents, toCents, type Cents, usdOf } from "@goose/core/money";
import type { AskResult } from "@goose/core/ask";
import type { Chip } from "@goose/core";
import type { LadderMarket } from "@goose/core/ladder";
import { saidTakeBack, voiceIntent, type VoiceIntent } from "@goose/core/voice";
import { ITEM_WORDS, LADDER_IDS, RUN_ENTRY, notShoppedYet, runEntry } from "@goose/core/shops";
import type { WantReply } from "@goose/core/wants";
import { FROM_YOUR_WEEK } from "@goose/core/memory";
import { liveAway, liveKnown, useLive } from "./live.ts";
import type { LiveState } from "@goose/core/live";
import { canSpeak, primeSpeech, say } from "./speech.ts";
import { pageCommand } from "./commands.ts";
import { markTried } from "./tries.ts";
import { OFFLINE, OFFLINE_SAYS } from "./states/words.ts";


/** An Ask's answer, with the server's word on a save when the words asked for one. */
type Answer = AskResult & { want?: WantReply };

/**
 * A chip as the shopper reads it; the limit's amount is Settings' (the page's /api/limit, the kettle's), never the words'.
 * A ticket, night or seat is held to its own category's limit, so its chip says the words alone (§15B part 2). Beside an
 * over-budget answer it is just "your limit", never "under your limit" (visual review: the two read as a contradiction).
 */
/** A2: the chip memory added (its color, from the answer's `memory`). */
const isRemembered = (r: AskResult, c: Chip) => r.memory !== null && r.memory !== undefined && c.kind === "attribute" && c.name === "color" && c.value === r.memory.color;
const FORGET_FAILED = "Goose couldn't reach its server to forget that, so it may offer it again. Forget it in Your wants.";
/** R-12: a forget that failed while she was offline names that cause (the server may or may not have heard it). */
const FORGET_OFFLINE = `${OFFLINE.title} ${OFFLINE_SAYS.forget}`;
/** A server that answered with an error was reached: it is never said to be unreachable. */
const FORGET_REFUSED = "Goose's server couldn't forget that, so it may offer it again. Forget it in Your wants.";

function chipWords(c: Chip, limit: string | null, over: boolean): string {
  if (c.kind === "limit") return limit ? `${over ? "your limit" : c.value} · ${usdOf(limit)}` : c.value;
  return c.kind === "item" ? ITEM_WORDS[c.value] ?? c.value : c.value;
}

/**
 * `heading` (the wallet home, A3): "Ask Goose" becomes a small label over that question; the current home omits it.
 * `market`: the market the page shows and Goose's deal there, for the ladder; null when no run is on screen (the
 * recorded beat, `LADDER_BEAT`). Left out, no ladder shows: an answer that can't see the deal beside it could contradict it.
 * `onVoice`: a command for the page (null: the words were an ordinary ask, so the page's last line goes). `voiceLine`:
 * the page's line under the box, kept live by the page; the chips wait while it shows. `onTakeBack`: "take it back" for
 * the page's Undo, which answers with the line to show and say.
 */
/** What an ask does while Goose's server isn't answering (read() below): the keyword rule, in this browser, nothing saved. */
const ASK_HERE = "Goose's server isn't answering here, so a plain keyword rule reads your words in this browser. Nothing is saved.";
/** R-12: the same note while she is offline (live mode "offline"): the network is the cause, not the server. */
const ASK_OFFLINE = `${OFFLINE.title} ${OFFLINE_SAYS.ask}`;

/**
 * `hero` (W-8, the wallet's calm hero): the box under the page's own headline, so no heading of its own (`heading` names
 * the box for a screen reader instead), the `hero` chips under it (one tap asks in their words), and the "I saw it for"
 * field and the dictation line only once there is an answer: the first screen is the box and its chips. The away note
 * waits there too, for the box's first use: the first paint can't know the server is away, so a note drawn on its own
 * pushed the deal and Approve 107 px down under a thumb, and back up when a sleeping API woke (Track F, Nov 4). The slip
 * under Approve (Wallet.tsx, T-4) says it unasked; every answer read here says it too.
 */
export function AskGoose({ limit, heading, market, onVoice, voiceLine, onChips, onWant, onTakeBack, onForgot, forgot, hero }: { limit: string | null; heading?: string; market?: LadderMarket | null; onVoice?: (intent: VoiceIntent | null) => void; voiceLine?: VoiceLine | null; onChips?: (chips: readonly unknown[]) => void; onWant?: (want: WantReply) => void; onTakeBack?: () => string; onForgot?: () => void; forgot?: { key: string; n: number } | null; hero?: readonly string[] }) {
  const form = useRef<HTMLFormElement>(null);
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Item 12: what the last answer was read from, and why the camera couldn't read a photo (typing still works).
  const [from, setFrom] = useState<"words" | "photo">("words");
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // Design B, slice 6: where the server isn't answering, the wallet says how an ask is read here before any ask (read()).
  const live = useLive();
  const [boxUsed, setBoxUsed] = useState(false);
  const [saw, setSaw] = useState<SawState>(SAW_EMPTY);
  const [sawItem, setSawItem] = useState<string | null>(null);
  // The ladder's code comes with the first Ask, as the rule's does (H1: not on the first screen).
  const [lad, setLad] = useState<LadderMod | "failed" | null>(null);
  // What "Hear it" says: the ladder's line for the field as it stands, once there is one (it answers what was asked, and
  // the chips' "under your limit" would contradict "over your $60"), else the chips' own line.
  const got = lad && lad !== "failed" && res && market !== undefined ? answerFor(lad, saw.value, sawItem, res, limit, market) : null;
  const answer = got?.answer ?? null;
  // The ladder's code didn't load, and it would have answered: said, never a silent blank (shared Lesson 8).
  const unloaded = lad === "failed" && res !== null && market !== undefined && wouldAnswer(saw.value, sawItem);
  const spoken = answer ? (lad as LadderMod).ladderSaid(answer) : unloaded ? LADDER_UNLOADED : res?.speak ?? "";

  async function ask(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (words.trim() === "") { document.getElementById("want")?.focus(); return; }
    primeSpeech();
    setError(null);
    // 034: a go-to or the name, answered by the page before anything is sent (web/src/commands.ts).
    const cmd = pageCommand(words);
    if (cmd) {
      setRes(null);
      setPhotoNote(cmd.line);
      if (cmd.kind === "name") setWords("");
      return;
    }
    if (onTakeBack && saidTakeBack(words)) {
      const line = onTakeBack();
      setRes(null);
      setPhotoNote(line);
      say(line);
      return;
    }
    if (onVoice) {
      const intent = voiceIntent(words);
      onVoice(intent);
      if (intent) return;
    }
    setBusy(true);
    const asked = words;
    const got = await read(asked);
    setBusy(false);
    // A failed Ask leaves the field as it was: the shopper's typed price isn't the network's to lose.
    if ("error" in got) { setError(got.error); setRes(null); return; }
    if (got.want) onWant?.(got.want);
    markTried("ask"); // Things to try: an Ask that Goose read (server or browser), never the list's own tap
    setFrom("words");
    setPhotoNote(null);
    // W49c: the chips read steer the next run on this page; a yes keeps the last ones, as the server's session does.
    if (onChips && !keepsLastChips(asked, got.chips)) onChips(got.chips);
    await land(got, () => sawPrefill(sawPrice(asked)));
  }

  // A2: forget the remembered color. The server forgets it first; the chip leaves this answer and the next Go either way
  // it answered, so a tap always takes it off the screen (a failed forget says so, and the chip can be forgotten later).
  async function forgetChip() {
    if (!res?.memory) return;
    const { key } = res.memory;
    const r = await fetch("/api/runs/memory/forget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) }).catch(() => null);
    dropRemembered(res);
    // The × it held is gone: focus goes back to the words box, not to the page's top (review A2 #4).
    box.current?.focus();
    onForgot?.();
    if (!r?.ok) setPhotoNote(r ? FORGET_REFUSED : navigator.onLine ? FORGET_FAILED : FORGET_OFFLINE);
  }
  // Take the remembered chip off this answer and off the next Go, and say so in the status line.
  function dropRemembered(from: Answer) {
    if (!from.memory) return;
    const { color } = from.memory;
    const chips = from.chips.filter((c) => !(c.kind === "attribute" && c.name === "color" && c.value === color));
    setRes({ ...from, chips, speak: from.memory.speak, memory: null });
    onChips?.(chips);
    setPhotoNote(`Forgot ${color}.`);
  }
  // Forgotten in Your wants (one fact or everything): the chip on screen and the next Go drop it too, so a run never
  // carries a color she just forgot, nor pays and teaches it back (review A2 #1).
  useEffect(() => {
    if (forgot && res?.memory && (forgot.key === "all" || forgot.key === res.memory.key)) dropRemembered(res);
    // Only a new forget runs this; the answer it reads is the one on screen then.
  }, [forgot]);

  // Item 12: a photo, read on the server by one vision call and the same F4 check; the tag's price fills "I saw it for"
  // for the shopper to confirm. With no live mode, or the AI off or capped, it says why and the box still works.
  async function snapped(file: File | undefined) {
    if (!file || busy) return;
    primeSpeech();
    setError(null);
    setPhotoNote(null);
    setBusy(true);
    const got = await readPhoto(file);
    setBusy(false);
    if ("error" in got) { setError(got.error); return; }
    if (got.kind === "unavailable") { setPhotoNote(got.say); return; }
    // A miss changes nothing: the chips on screen are still the ones the next Go shops for, and the note says why.
    if (got.miss !== null) { setPhotoNote(got.miss); say(got.miss); return; }
    setFrom("photo");
    markTried("photo"); // Things to try: a photo Goose read
    onChips?.(got.chips);
    // The tag fills an empty field; a price the shopper typed for the same item stays theirs (`sawTag`).
    await land(got, (item) => sawTag(saw, got.tag, sawItem, item));
  }

  /** An answer read (words or a photo): its chips, the price field, then the ladder's line or the chips' own, said. */
  async function land(got: Answer, fresh: (item: string | null) => SawState) {
    setRes(got);
    const item = itemOf(got.chips);
    const next = sawNext(saw, fresh(item), sawItem, item);
    setSaw(next);
    if (item !== null) setSawItem(item);
    if (market === undefined) { say(got.speak); return; }
    const m = lad && lad !== "failed" ? lad : await import("@goose/core/ladder").catch(() => null);
    setLad(m ?? "failed");
    const now = m ? answerFor(m, next.value, item ?? sawItem, got, limit, market)?.answer ?? null : null;
    say(now ? m!.ladderSaid(now) : !m && wouldAnswer(next.value, item ?? sawItem) ? LADDER_UNLOADED : got.speak);
  }

  return (
    <section className={hero ? "askg ahero" : "askg"} aria-labelledby={hero && !heading ? undefined : "ask-h"} aria-label={hero && !heading ? "Ask Goose" : undefined}>
      {/* W-8: in the hero the heading is the box's own visible label (it carries the shopper's name when they gave one). */}
      {hero ? heading ? <label htmlFor="want" id="ask-h" className="ahlabel">{heading}</label> : null : heading ? <><p className="kicker">Ask Goose</p><h2 id="ask-h">{heading}</h2></> : <h2 id="ask-h">Ask Goose</h2>}
      <form ref={form} className={heading ? "askrow dk-glass" : "askrow stack dk-glass"} onSubmit={ask} autoComplete="off">
        {/* A box that wraps, not a one-line input: a long want stays readable at 390 px (scripts/overflow.ts). Enter asks. */}
        <textarea ref={box} id="want" aria-label={hero && heading ? undefined : "What should Goose find?"} rows={2} value={words} onFocus={() => setBoxUsed(true)} onChange={(e) => setWords(e.target.value)} maxLength={MAX_ASK_CHARS} enterKeyHint="go" placeholder="e.g. a black kettle like mine"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
        {/* On the wallet (`heading`) the button stays solid teal while the box is empty, and an empty ask puts you in the
            box: a faded button read as broken there (A3 visual review). The current home keeps its disabled state. */}
        <button className="btn" disabled={busy || (!heading && words.trim() === "")} aria-busy={busy || undefined}>{busy ? "Reading…" : "Ask"}</button>
        {/* Item 12: the phone's camera from the page itself (a file picker on a desktop). A native label opens the input, so
            no script clicks anything on this page (test/voice.test.ts); the input stays focusable for the keyboard. */}
        <input id="snap" className="snapin" type="file" accept="image/*" capture="environment" disabled={busy} aria-label="Snap a photo for Goose to read" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void snapped(f); }} />
        <label htmlFor="snap" className="btn ghost snap" aria-hidden="true">Snap it</label>
      </form>
      {/* W-8: one tap asks in the chip's words, as typing them and pressing Ask would (never a run, never a payment). */}
      {hero && !res && !voiceLine && (
        <ul className="wchips" aria-label="Try asking">
          {hero.map((c) => <li key={c}><button type="button" className="wchip" disabled={busy} onClick={() => { if (busy) return; setWords(c); box.current?.focus({ preventScroll: true }); requestAnimationFrame(() => form.current?.requestSubmit()); }}>{c}</button></li>)}
        </ul>
      )}
      {/* The away note under the box (an offline state): one short line, the cause. */}
      {heading && (!hero || boxUsed) && (live === "away" || live === "gone" || live === "offline") && <p className="aaway">{live === "offline" ? ASK_OFFLINE : ASK_HERE}</p>}
      {(!hero || res) && <p className="muted small mic">Your keyboard's dictation works here too.</p>}
      {error && <p className="refused" role="alert">{error}</p>}
      {photoNote && <p className="small asked" role="status">{photoNote}</p>}
      {voiceLine && (
        <p className="askdone" role="status" aria-live="polite" data-busy={voiceLine.busy ? "" : undefined}>
          {voiceLine.busy && <span className="askdot" aria-hidden="true" />}{voiceLine.lead && <b>{voiceLine.lead}</b>}{voiceLine.text}{voiceLine.href && <> <a href={voiceLine.href} onClick={voiceLine.onLink}>{voiceLine.link}</a></>}
          {voiceLine.note && <span className="asknote">{voiceLine.note}</span>}
        </p>
      )}
      {res && !voiceLine && (
        <div className="askout" aria-live="polite" data-source={res.source}>
          <ul className="gchips" aria-label={from === "photo" ? "What Goose read from your photo" : "What Goose read from your words"}>
            {res.chips.map((c) => <li key={`${c.kind}:${c.value}`} className="gchip" data-kind={c.kind} data-over={c.kind === "limit" && answer?.layer === "over-budget" ? "" : undefined} data-remembered={isRemembered(res, c) ? "" : undefined}>
              {chipWords(c, notShoppedYet(res.chips) === null && runEntry(res.chips) === RUN_ENTRY ? limit : null, answer?.layer === "over-budget")}
              {/* A2: memory's chip says where it came from, and one tap forgets it (and takes it off the next Go). */}
              {isRemembered(res, c) && <> <span className="gfrom">({FROM_YOUR_WEEK})</span> <button type="button" className="gforget" onClick={() => void forgetChip()} aria-label={`Forget ${c.value}, ${FROM_YOUR_WEEK}`}>×</button></>}
            </li>)}
            <li className="fict">from a fictional catalog</li>
          </ul>
          {res.want && <p className="small wsaved" role="status" data-saved={res.want.saved ? "" : undefined}>{res.want.words}</p>}
          <p className="small">{CHIPS_IN_RUNS}</p>
          {/* Which reader ran, one tap away: it is a fact about this answer, not the answer (visual review). */}
          <details className="how readby"><summary>How Goose read this</summary><p className="small">{res.label}</p></details>
          {res.refused > 0 && <p className="small refused">Code refused {res.refused === 1 ? "1 chip" : `${res.refused} chips`}: {res.reasons.join("; ")}.</p>}
          {res.settingsOnly && <p className="small asked">{SETTINGS_ONLY}</p>}
          {canSpeak() && !answer && !unloaded && <p className="small"><button type="button" className="linkish" onClick={() => say(spoken)}>Hear it again</button> <span className="muted">“{spoken}”</span></p>}
        </div>
      )}
      {(!hero || res || saw.value !== "") && <SawField saw={saw} onChange={setSaw} settingsShown={res?.settingsOnly ?? false} />}
      {got && lad && lad !== "failed" && market !== undefined && <Ladder answer={got.answer} from={got.from} only={lad.ONLY_CHECKOUT} onHear={canSpeak() ? () => say(spoken) : null} />}
      {unloaded && <p className="small refused" role="alert">{LADDER_UNLOADED}</p>}
    </section>
  );
}

type LadderMod = typeof import("@goose/core/ladder");
/** The page's line under the box (item 10): what it's doing ("busy", with a dot), then where to look. */
export type VoiceLine = { text: string; lead?: string; note?: string; busy?: boolean; href?: string; link?: string; onLink?: () => void };

/** Said when the ladder's code didn't load but would have answered. */
const LADDER_UNLOADED = "Goose's check of other sellers didn't load. Reload the page to try again.";
/** The entries the ladder reads (the kettle, the jackets): `LADDER_IDS`, without loading the ladder's code to know them. */
const laddered = (item: string | null) => item !== null && item.startsWith("item:") && LADDER_IDS.includes(item.slice(5));
const wouldAnswer = (value: string, item: string | null) => laddered(item) && sawField(value).kind === "one";

/** A limit the page holds as words, in cents; one it can't read is no limit (`NO_LIMIT` says so), never a blank section. */
function limitCents(limit: string | null): Cents | null {
  if (limit === null) return null;
  try { return toCents(limit); } catch { return null; }
}

/**
 * The ladder's answer for the field as it stands, and what it compared, or null: only for an entry the ladder reads,
 * only for a price in the field. The kettle is held to the page's limit; a jacket to its own category's, as the server
 * read it for this browser (`AskResult.itemLimit`), else none, and the answer says the limit wasn't read. A jacket's
 * listings must come in every option the Ask named (its color and size chips).
 */
function answerFor(m: LadderMod, value: string, item: string | null, res: Answer, limit: string | null, market: LadderMarket | null) {
  const f = sawField(value);
  if (!laddered(item) || f.kind !== "one") return null;
  const id = item!.slice(5);
  if (id === m.LADDER_ITEM) return m.ladderFor(id, f.cents, limitCents(limit), market);
  const asked = Object.fromEntries(res.chips.flatMap((c) => (c.kind === "attribute" ? [[c.name, c.value]] : [])));
  return m.ladderFor(id, f.cents, limitCents(res.itemLimit ?? null), market, asked);
}

/**
 * The set-aside pile first (Joshua, Thu Nov 5 1:30 PM, §1a: "Checked N listings. Set aside M:", each with its reason,
 * then the pick): its count line, the sellers the Watcher refused (layer 1), names bold, with 9.1's line muted under
 * them; then the answer, with what it compared and its own "Hear it" in the same card. Fixed words from code.
 */
function Ladder({ answer, from, only, onHear }: { answer: NonNullable<ReturnType<typeof answerFor>>["answer"]; from: string; only: string; onHear: (() => void) | null }) {
  const refused = answer.refused.filter((r) => r !== only);
  return (
    <div className="ladder" aria-live="polite" data-layer={answer.layer}>
      <div className="ladno">
        {[answer.pile, ...refused].map((r) => { const cut = r.indexOf(": "); return <p key={r} className="small refused">{cut < 0 ? r : <><b>{r.slice(0, cut)}</b>{r.slice(cut)}</>}</p>; })}
        {refused[0] && <p className="small muted">{only}</p>}
      </div>
      <div className="ladans">
        <p className="ladline">{answer.line}</p>
        <p className="small muted ladfrom">{from}</p>
        {onHear && <button type="button" className="linkish ladhear" onClick={onHear}>Hear it</button>}
      </div>
      {/* Layer 5: a look-alike for less, labeled similar and never the same item, last, as `ladderSaid` says it. */}
      {answer.similar && <p className="small ladsim">{answer.similar}</p>}
    </div>
  );
}

/** The item an Ask named, for `sawNext`: its catalog item, else its category, else none. */
function itemOf(chips: readonly Chip[]): string | null {
  const c = chips.find((x) => x.kind === "item") ?? chips.find((x) => x.kind === "category");
  return c ? `${c.kind}:${c.value}` : null;
}

/** The "I saw it for $X" field: the amount to fix, or the prices to pick from, and fixed words. Never sent anywhere. */
function SawField({ saw, onChange, settingsShown }: { saw: SawState; onChange: (s: SawState) => void; settingsShown: boolean }) {
  // Checked when the shopper leaves the box, not on each key: "54." on the way to "54.99" is still typing.
  const [left, setLeft] = useState(false);
  const wrong = left && sawField(saw.value).kind === "not-a-price";
  const pick = (c: Cents) => { setLeft(false); onChange({ ...saw, value: fromCents(c), choices: [], note: null }); };
  return (
    <div className="saw">
      {/* The × sits beside the label, not in it, so the box's name stays "I saw it for" (optional). */}
      <div className="sawrow">
        <label htmlFor="saw">{SAW_LABEL} <span className="muted">(optional)</span></label>
        <span className="sawbox" onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) document.getElementById("saw")?.focus(); }}><span aria-hidden="true">$</span>
          <input id="saw" inputMode="decimal" autoComplete="off" value={saw.value} maxLength={12} placeholder={saw.choices.length > 0 ? "" : "54.99"} aria-describedby="saw-why"
            aria-invalid={wrong} onBlur={() => { setLeft(true); const f = sawField(saw.value); if (f.kind === "one") onChange({ ...saw, value: fromCents(f.cents) }); }} onChange={(e) => { setLeft(false); onChange({ ...saw, value: e.target.value, choices: [], note: null }); }} />
          {/* Always in the box, hidden while it's empty, so the box keeps its width when × appears (visual review). */}
          <button type="button" className="sawx" aria-label="Clear the price" hidden={saw.value === ""} onClick={() => { setLeft(false); onChange({ ...saw, value: "", choices: [], note: null }); document.getElementById("saw")?.focus(); }}>×</button>
        </span>
      </div>
      {saw.choices.length > 0 && (
        <div className="sawpick" role="group" aria-label={saw.note === "maybe" ? SAW_MAYBE : SAW_WHICH}>
          <p className="small">{saw.note === "maybe" ? SAW_MAYBE : SAW_WHICH}</p>
          {saw.choices.map((c) => <button key={c} type="button" onClick={() => pick(c)}>{sawShown(c)}</button>)}
        </div>
      )}
      {saw.note === "spoken" && <p className="small asked">{SAW_SPOKEN}</p>}
      {saw.note === "not-a-price" && <p className="small asked">{SAW_NOT_A_PRICE}</p>}
      {wrong && saw.note !== "not-a-price" && <p className="small refused" role="alert">{SAW_TYPE_A_PRICE}</p>}
      {saw.limitWords && !settingsShown && <p className="small asked">{SETTINGS_ONLY}</p>}
      <p className="small muted" id="saw-why">{SAW_ONLY}</p>
    </div>
  );
}

// R-13 (never claim beyond the code): offline (live mode "offline", or navigator.onLine false when a call failed) the
// cause the code saw is her network, so the photo note, the ask's label and a want's line say "You're offline, so …".
const offNow = (s: LiveState) => s === "offline" || !navigator.onLine;
const photoOff = (offline: boolean): PhotoAnswer => (offline ? { kind: "unavailable", why: "offline", say: PHOTO_OFF.offline } : { kind: "unavailable", why: "away", say: PHOTO_OFF.away });

/** A photo, read by the server's one vision call when live mode answers; with no live mode, the reason (no rule reads an image). */
async function readPhoto(file: File): Promise<PhotoAnswer | { error: string }> {
  const known = await liveKnown();
  if (known !== "up") return photoOff(offNow(known));
  const photo = await import("./snap.ts").then((m) => m.photoData(file)).catch(() => null);
  if (!photo) return { error: "That file couldn't be read as a photo. Try another, or type it." };
  const r = await fetch("/api/runs/photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(photo) }).catch(() => null);
  if (!r) { liveAway(); return photoOff(!navigator.onLine); }
  const body = (await r.json().catch(() => null)) as (PhotoAnswer & { error?: string }) | null;
  if (!r.ok || !body || body.error) return { error: typeof body?.error === "string" ? body.error : "Goose couldn't read that photo just now. Nothing changed." };
  return body;
}

/** The server when live mode answers; the same rule and F4 check in the browser when it doesn't (H1), or past the server's caps (429). */
async function read(words: string): Promise<Answer | { error: string }> {
  // Read in the browser, nothing is saved: an ask to save says so (the server isn't answering, or its asks are used up).
  const inBrowser = (why: "away" | "offline" | "capped") => Promise.all([import("@goose/core/ask"), import("@goose/core/wants")])
    .then(async ([m, w]): Promise<Answer> => { const r = await m.askInBrowser(words, why); return w.saveIntent(words) ? { ...r, want: { saved: false, words: why === "capped" ? w.WANT_CAPPED : why === "offline" ? w.WANT_OFFLINE : w.WANT_NEEDS_SERVER } } : r; })
    // A chunk that can't load offline is her network too: no Reload offered (it can't work until she's back).
    .catch(() => ({ error: navigator.onLine ? "Goose couldn't load here. Reload the page to try again." : `${OFFLINE.title} ${OFFLINE.line}` }));
  const known = await liveKnown();
  if (known !== "up") return inBrowser(offNow(known) ? "offline" : "away");
  const r = await fetch("/api/runs/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ words }) }).catch(() => null);
  if (!r) { liveAway(); return inBrowser(navigator.onLine ? "away" : "offline"); }
  if (r.status === 429) return inBrowser("capped");
  const body = (await r.json().catch(() => null)) as (Answer & { error?: string }) | null;
  if (!r.ok || !body || body.error) return { error: typeof body?.error === "string" ? body.error : "Goose couldn't read that just now. Nothing changed." };
  return body;
}
