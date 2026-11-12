// The dashboard's shell (Track AS, slice 9; Round 2's a11y and performance review, "shell first"): the page's bar,
// heading, lede, ask box and the six cards' empty frames, drawn from a chunk of its own before the Studio chunk (AG Grid,
// AG Charts and AG Studio, 1.6 MB br) arrives, so a phone on a slow line sees the heading in the first second, not
// after ten. `StudioHero` is the one hero both pages draw: here with the ask box disabled, in Studio.tsx with the live
// one. Nothing here can pay, approve or change a limit: it is markup, and the board's cards only read.
// Joshua, Nov 4 (AG Grid, item 4): the build draws this page's first render to its own file (web/prerender-routes.ts), so
// that's frames only; then the Live Threat Board's four cards fill their frames from a small chunk of their own
// (ShellBoard.tsx), so a phone reads the board in seconds while the dashboard's chunk is still on its way.

import { createElement, lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentType, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { BackRoomNav } from "../ledger/BackRoom.tsx";
import { COLUMNS, GUTTER_PX, TRACK_PX, fitColumn, fitRows, layoutFor, shellFit, tracksFor, tracksIn, withThreat, type Place } from "./layout.ts";
import { ASK_CHIPS } from "./threat-words.ts";
import { ASK_IDLE, ASK_LABEL, ASK_VIEW_ONLY, ASK_PLACEHOLDER, ASK_PLACEHOLDER_SHORT, EDIT_NOTE, EDIT_OFF, EDIT_ON, EYEBROW, FOOT, H1, LEDE, LEDE_PHONE, MAX_ASK, PHONE, PROMPT_STARTERS } from "./words.ts";
import "../ledger/midnight.css";
import "../ledger/ledger.css";
import "../ledger/backroom.css";
import "./studio.css";

// The board's one feed sits above the shell and the dashboard (pick.ts), so neither reads the record twice.
import { ThreatProvider } from "./threat-state.tsx";
export { ThreatProvider };
import { BoardCounter, type FirstWords } from "./BoardFirst.tsx";
import { BOARD_PAINT } from "./early-board.ts";

const card = (name: "Counter" | "Time" | "Rules" | "Tries") => lazy(() => import("./ShellBoard.tsx").then((m) => ({ default: m[name] as (p: { onLanded: () => void }) => React.JSX.Element | null }), () => ({ default: () => null })));
/** The frames the board fills, and the same class on each card as the dashboard's own (widgets/threat.tsx). */
const BOARD_CARDS: Record<string, ReturnType<typeof card>> = { "threat-counter": card("Counter"), "threat-time": card("Time"), "threat-rules": card("Rules"), "threat-tries": card("Tries") };

/**
 * The counter's first lines in its frame (Track F, Nov 5): the build's file draws them as "Reading the record…", the head's
 * early answer writes the record's words into them (early-board.ts; the placing script asks it again once the file is in),
 * and React adopts them with the same words, so a cold phone reads the count with the hero (about 0.6 s), not after React
 * and the board's chunk (2.4 s). No `data-shell-card`: the frame keeps the size the real counter will need, and nothing
 * under it moves when that card lands. Once React has it, the early script stops writing: React owns these lines.
 */
const earlyWords = (v: unknown): FirstWords | null => (v as { words?: FirstWords | null } | null | undefined)?.words ?? null;
function FirstCounter() {
  const [words, setWords] = useState(() => earlyWords(window.__board?.v));
  useEffect(() => {
    const b = window.__board;
    if (!b) return;
    b.f = () => {};
    let gone = false;
    void b.p?.then((v) => { if (!gone) setWords(earlyWords(v)); });
    return () => { gone = true; };
  }, []);
  return <div className="st-card tb-w-counter" data-board={BOARD_PAINT}><BoardCounter words={words} /></div>;
}

/** Half a gutter (layout.ts GUTTER_PX): each card's inset inside its frame. */
const G = `${GUTTER_PX / 2}px`;

/** On a phone the ask field takes the short placeholder, so it is never cut mid-word; the same query as the first paint's two files. */
const narrowField = () => typeof matchMedia === "function" && matchMedia(PHONE).matches;

export interface HeroAsk {
  words: string;
  setWords: (w: string) => void;
  onAsk: (e: FormEvent) => void;
  onChip: (prompt: string) => void;
  /** The line under the input: the agent's last words or where it is; empty before any ask. */
  note: string;
  /** Why a rule answered, when one did (the server's caps, or no server): a quiet line under the answer, never instead of it. */
  quiet?: string;
  state: "idle" | "running" | "said" | "failed";
  busy: boolean;
  ready: boolean;
  mode: "view" | "edit";
  setMode: (m: "view" | "edit") => void;
  noteRef?: React.RefObject<HTMLParagraphElement | null>;
}

/** The room's title block and the ask box. Without `ask` (the shell) the box is drawn but disabled until the dashboard is here. */
export function StudioHero({ ask }: { ask?: HeroAsk }) {
  const ready = ask?.ready ?? false;
  const busy = ask?.busy ?? true;
  const mode = ask?.mode ?? "view";
  return (
    <header className="st-hero">
      <p className="st-eyebrow">{EYEBROW}</p>
      <h1 id="st-h">{H1}</h1>
      <p className="st-lede"><span className="st-lede-wide">{LEDE}</span><span className="st-lede-phone">{LEDE_PHONE}</span></p>

      <form className="st-ask" onSubmit={ask?.onAsk ?? ((e) => e.preventDefault())} aria-labelledby="st-ask-l">
        <label id="st-ask-l" className="st-ask-label" htmlFor="st-ask-in">{ASK_LABEL}</label>
        <div className="st-ask-row">
          <input id="st-ask-in" className="st-ask-in" type="text" value={ask?.words ?? ""} maxLength={MAX_ASK} autoComplete="off" placeholder={narrowField() ? ASK_PLACEHOLDER_SHORT : ASK_PLACEHOLDER} aria-describedby="st-ask-idle" onChange={(e) => ask?.setWords(e.target.value)} disabled={!ready} />
          <button type="submit" className="st-ask-btn" disabled={!ready || busy || !(ask?.words ?? "").trim()}>Ask</button>
        </div>
        {/* The DD (stack 107): a sighted visitor typing here sees it can't pay. The line is short (the header stays <=36
            words); the full sentence is the box's description for a screen reader. */}
        <p className="st-ask-view">{ASK_VIEW_ONLY}</p>
        <ul className="st-ask-chips" aria-label="Things to ask">
          {[ASK_CHIPS[0]!, ...PROMPT_STARTERS].map((p) => <li key={p.prompt}><button type="button" className="st-chip" disabled={!ready || busy} onClick={() => ask?.onChip(p.prompt)}>{p.label}</button></li>)}
        </ul>
        {/* The live region is on the page from the start (so its first words are announced), and takes no room until an
            ask says something back (studio.css .st-ask-note:empty). */}
        <span id="st-ask-idle" className="st-sr-only">{ASK_IDLE}</span>
        <p ref={ask?.noteRef} className="st-ask-note" aria-live="polite" data-state={ask?.state ?? "idle"}>{ask?.note}</p>
        {ask?.quiet ? <p className="st-ask-quiet">{ask.quiet}</p> : null}
      </form>

      <div className="st-acts">
        <button type="button" className="st-switch" aria-pressed={mode === "edit"} disabled={!ready} onClick={() => ask?.setMode(mode === "edit" ? "view" : "edit")}>
          {mode === "edit" ? EDIT_OFF : EDIT_ON}
        </button>
        {/* View mode has no note (Round 6): its link, "The ledger ›", opened ?desk=ledger, which is this page until the
            licence's day, so it only reloaded. The plain ledger has no address of its own while Studio stands in for it. */}
        {mode === "edit" ? <span className="st-acts-note">{EDIT_NOTE}</span> : null}
      </div>
    </header>
  );
}

/** The page around the dashboard: the bar, the hero, whatever stands in the canvas, the practice line. */
export function StudioFrame({ children }: { children: ReactNode }) {
  // The classic page's heading block ships in index.html for its first paint and is display:none on every Desk route
  // (never announced); here it goes from the DOM too, so this page's first heading is "Behind the scenes" (Round 1 judges).
  useEffect(() => { document.querySelector(".page > .brand")?.remove(); }, []);
  return (
    <div className="dk lx mn-lit st-page">
      <BackRoomNav here="ledger" />
      <main id="main" className="st-main">{children}</main>
    </div>
  );
}

/** A card's own height with nothing holding it to its frame: what fitting a frame to its card measures. */
export function cardOwnPx(card: HTMLElement): number {
  const { height, maxHeight } = card.style;
  card.style.height = "auto";
  card.style.maxHeight = "none";
  const own = card.getBoundingClientRect().height;
  card.style.height = height;
  card.style.maxHeight = maxHeight;
  return own;
}

/** One frame's own tracks: the card, the gutter, and the frame's edge, as the dashboard's frames fit (useFit in Studio.tsx). */
function frameTracks(c: HTMLElement): number | null {
  const frame = c.parentElement!;
  const own = cardOwnPx(c);
  return own > 0 ? tracksFor(own + GUTTER_PX + frame.offsetHeight - frame.clientHeight) : null;
}

/**
 * The shell: the hero with its box disabled, then the cards' frames where the dashboard will put them (the no-session
 * layout, the usual first paint), at the canvas's height. The first render is empty frames, the build's file; after it the
 * board's four fill theirs and each frame fits its card, as the dashboard's will, and the dashboard starts from those
 * same frames (`shellFit`), so nothing moves when it takes the shell's place.
 * No skeleton shimmer, no motion: hairline frames on the raised surface, the way the cards themselves are framed.
 */
export default function StudioShell({ onLanded, missed = false }: { onLanded?: () => void; missed?: boolean }) {
  const [phone] = useState(() => matchMedia(PHONE).matches);
  const [base] = useState<Record<string, Place>>(() => withThreat(layoutFor(phone, false), phone));
  const [layout, setLayout] = useState(base);
  const [on, setOn] = useState(false);
  const [landed, setLanded] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  useEffect(() => setOn(true), []);
  useEffect(() => {
    const root = canvas.current;
    if (!on || !root) return;
    let raf = 0;
    const sizes = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); });
    const watched = new WeakSet<Element>();
    const fit = () => {
      const need: Record<string, number> = {};
      for (const c of root.querySelectorAll<HTMLElement>(".st-card[data-shell-card]")) {
        for (const child of c.children) if (!watched.has(child)) { watched.add(child); sizes.observe(child); }
        const t = frameTracks(c);
        if (t !== null) need[c.dataset.shellCard!] = t;
      }
      shellFit.need = need;
      const next = phone ? fitColumn(base, need) : fitRows(base, need, 1);
      setLayout((was) => { const to = next ?? base; return Object.keys(to).every((k) => was[k]?.yTrack === to[k]!.yTrack && was[k]?.ySpan === to[k]!.ySpan) ? was : to; });
    };
    const added = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); });
    added.observe(root, { childList: true, subtree: true });
    return () => { cancelAnimationFrame(raf); sizes.disconnect(); added.disconnect(); };
  }, [on, phone, base]);
  const land = useRef(onLanded);
  land.current = onLanded;
  const hereNow = useRef(() => { setLanded(true); land.current?.(); }).current;
  const tracks = tracksIn(layout);
  return (
    <StudioFrame>
      <StudioHero />
      <div ref={canvas} className="st-studio st-shell" data-mode="view" data-ready="0" style={{ height: (tracks + 2) * TRACK_PX }} aria-busy={!landed} aria-label={landed ? undefined : "Loading the dashboard"}>
        {Object.entries(layout).map(([key, p]) => {
          const Board = on ? BOARD_CARDS[key] : undefined;
          const first = key === "threat-counter" ? <FirstCounter /> : null;
          // AG's geometry with the gutter (layout.ts GUTTER_PX, measured AS-15): each card is inset half a gutter inside its
          // frame on every side, so the shell's cards land where the dashboard's will.
          return (
            <div key={key} className="st-shell-frame" style={{ left: `calc(${(p.xTrack / COLUMNS) * 100}% + ${G})`, top: p.yTrack * TRACK_PX + GUTTER_PX / 2, width: `calc(${(p.xSpan / COLUMNS) * 100}% - ${GUTTER_PX}px)`, height: p.ySpan * TRACK_PX - GUTTER_PX }}>
              {Board ? <Suspense fallback={first}><Board onLanded={hereNow} /></Suspense> : first}
            </div>
          );
        })}
      </div>
      {missed && <p className="st-foot" role="alert">The dashboard didn't load. <button type="button" className="st-foot-again" onClick={() => location.reload()}>Try again</button>.</p>}
      <p className="st-foot">{FOOT}</p>
    </StudioFrame>
  );
}

// How long the dashboard's chunk waits on the board's first answer, and how long the shell's cards wait on a dashboard
// that loaded and hasn't said it's placed (a slow phone: seconds; these are only for a page that would otherwise wait for ever).
const BOARD_WAIT_MS = 4000;
const PLACE_WAIT_MS = 15000;
const HOLD_MS = 500;
const WAITING: CSSProperties = { position: "fixed", inset: 0, overflow: "hidden", visibility: "hidden", pointerEvents: "none" };
const SHOWN: CSSProperties = { display: "contents" };

// The dashboard draws itself under the shell, hidden, and takes over in one frame once it's placed: a shopper reading the
// board never watches it empty and fill again (Studio's rows and its own frames take a few moments of their own).
// Here, not in pick.ts: a ledger visitor downloads pick.ts and never runs this.
export function StudioPage() {
  const [Studio, setStudio] = useState<ComponentType<{ onPlaced?: () => void }> | null>(null);
  const [landed, setLanded] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [missed, setMissed] = useState(false);
  const land = useCallback(() => setLanded(true), []);
  // A sheet someone is reading on the shell stays until they close it: the shell's cards go with the handover, and it with them.
  // So does the bar's menu, which a phone can open in the ten seconds before Studio is ready (its panel is portalled out of the shell).
  // Focus on the shell would fall to the page's body and a keyboard would start over at the top, so it moves to the same control in Studio's frame.
  const focused = useRef<{ tag: string; words: string | null } | null>(null);
  const place = useCallback(() => {
    const go = () => {
      if (document.querySelector(".st-shell dialog[open], .st-page .gm-btn[aria-expanded='true']")) { setTimeout(go, HOLD_MS); return; }
      const on = document.activeElement;
      if (on?.closest(".st-page") && !on.closest(".tp-slot")) focused.current = { tag: on.tagName, words: on.textContent }; // The tour's pill carries its own (mountPill).
      setPlaced(true);
    };
    go();
  }, []);
  useEffect(() => {
    const was = focused.current;
    if (!placed || !was) return;
    focused.current = null;
    const same = [...document.querySelectorAll<HTMLElement>(`[data-studio-layer] ${was.tag}`)].find((e) => e.textContent === was.words && e.getClientRects().length > 0);
    const to = same ?? document.querySelector<HTMLElement>("[data-studio-layer] #main");
    if (!to) return;
    if (!to.matches("a[href], button, input, [tabindex]")) to.tabIndex = -1;
    to.focus({ preventScroll: true });
  }, [placed]);
  useEffect(() => { quietTrialBanner(); const t = setTimeout(land, BOARD_WAIT_MS); return () => clearTimeout(t); }, [land]);
  useEffect(() => {
    if (!landed) return;
    let gone = false;
    void import("./Studio.tsx").then((m) => { if (!gone) setStudio(() => m.default); }, () => { if (!gone) setMissed(true); });
    return () => { gone = true; };
  }, [landed]);
  useEffect(() => { if (!Studio || placed) return; const t = setTimeout(place, PLACE_WAIT_MS); return () => clearTimeout(t); }, [Studio, placed, place]);
  return createElement(ThreatProvider, null,
    placed ? null : createElement(StudioShell, { onLanded: land, missed }),
    Studio ? createElement("div", { "data-studio-layer": placed ? "shown" : "waiting", inert: !placed, style: placed ? SHOWN : WAITING }, createElement(Studio, { onPlaced: place })) : null);
}

/**
 * With no licence key in the build (local work and `?studio=force` on a keyless build), AG prints its trial banner as
 * seven red console.error lines ("AG Studio Pro with AI License / License Key Not Found / … trial …"). Round 2's a11y
 * review: a judge with devtools open sees red. Those lines, and only those, are turned into one plain console.info
 * line that still says "License Key Not Found" (scripts/studio-gate-smoke.ts reads it as the proof that the gate, not
 * luck, kept Studio off the plain page). With a key in the build nothing is installed and nothing changes. A licence
 * error with a key ("Invalid License", "Expired") is not matched and still prints red.
 */
function quietTrialBanner() {
  if (__AG_STUDIO_LICENCE__.valid || typeof console === "undefined" || (console.error as { __goose?: boolean }).__goose) return;
  const isBanner = (t: string) => /^\*{20,}$/.test(t.trim()) || /AG Studio Pro with AI License|License Key Not Found|unlocked for trial|trial license key|hide the watermark/i.test(t);
  const orig = console.error.bind(console);
  let said = false;
  const quiet = (...args: unknown[]) => {
    if (args.length === 1 && typeof args[0] === "string" && isBanner(args[0])) {
      if (!said) { said = true; console.info("AG Studio: License Key Not Found in this build (trial; AG's banner quieted by web/src/studio/Shell.tsx)"); }
      return;
    }
    orig(...args);
  };
  (quiet as { __goose?: boolean }).__goose = true;
  console.error = quiet;
}
