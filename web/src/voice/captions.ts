// Track V (042, Joshua's mandate item 4: "captions always, mute toggle"): every line Goose says shows its words just
// under the page's header while it plays, with the mute toggle beside them. Loaded by web/src/speech.ts with the first line
// said (its own chunk; never at first paint). Plain DOM, no React, so any page that speaks gets it without a change.
//
// - The words: a visible line (hidden from screen readers) and a separate, always-present polite live region that
//   screen readers announce, so the announcement isn't lost when the bar appears in the same moment.
// - The toggle: a real button with `aria-pressed` (pressed = muted), 44 px tall, focus ring of its own; the choice is
//   kept in this browser (speech.ts `MUTE_KEY`) and kept in step across tabs.
// - The bar stays while the line plays, then 2.5 s more; while the pointer or keyboard focus is on it, it stays.
// - Motion: one 200 ms fade and 4 px drop in; none at all with reduced motion (captions.css).
// - Nothing here sends anything: no request, no URL, no log.

import "./captions.css";
import { MUTE_KEY, isMuted, onMuted, setMuted } from "../speech.ts";

const LINGER_MS = 2500;
/** A live region newer than this gets its first words after it, not in the same moment it appears. */
const FRESH_MS = 300;
let builtAt = 0;
const ICON_ON = '<path d="M4 9.5h3l4.5-4v13L7 14.5H4z"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11"/>';
const ICON_OFF = '<path d="M4 9.5h3l4.5-4v13L7 14.5H4z"/><path d="m15.5 9.5 5 5m0-5-5 5"/>';

let bar: HTMLDivElement | null = null;
let words: HTMLParagraphElement;
let live: HTMLParagraphElement;
let btn: HTMLButtonElement;
let icon: SVGSVGElement;
let timer = 0;
let playing = false;
let held = false;

function paint(): void {
  const m = isMuted();
  btn.setAttribute("aria-pressed", String(m));
  icon.innerHTML = m ? ICON_OFF : ICON_ON;
  bar!.dataset.muted = m ? "1" : "";
}

function build(): void {
  bar = document.createElement("div");
  bar.className = "gv-cap";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Goose's voice");
  bar.hidden = true;
  btn = document.createElement("button");
  btn.type = "button";
  btn.className = "gv-mute";
  icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = "Mute";
  btn.append(icon, label);
  btn.addEventListener("click", () => setMuted(!isMuted()));
  words = document.createElement("p");
  words.className = "gv-words";
  words.setAttribute("aria-hidden", "true");
  bar.append(btn, words);
  live = document.createElement("p");
  live.className = "gv-live";
  live.setAttribute("role", "status");
  const stay = () => { held = true; clearTimeout(timer); };
  const go = () => { held = false; if (!playing) later(); };
  bar.addEventListener("pointerenter", stay);
  bar.addEventListener("pointerleave", go);
  bar.addEventListener("focusin", stay);
  bar.addEventListener("focusout", (e) => { if (!bar!.contains(e.relatedTarget as Node | null)) go(); });
  onMuted(paint);
  addEventListener("storage", (e) => { if (e.key === MUTE_KEY || e.key === null) paint(); });
  // The bar sits over the page's header: when keyboard focus moves to something it covers, it steps aside.
  document.addEventListener("focusin", (e) => {
    const t = e.target as Element | null;
    if (!bar || bar.hidden || !t || bar.contains(t) || !t.getBoundingClientRect) return;
    const a = bar.getBoundingClientRect(), b = t.getBoundingClientRect();
    if (b.left < a.right && b.right > a.left && b.top < a.bottom && b.bottom > a.top) hide();
  });
  document.body.append(bar, live);
  addEventListener("scroll", clearSoon, { passive: true });
  addEventListener("resize", clearSoon, { passive: true });
  new MutationObserver(clearSoon).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-landed"] });
  builtAt = performance.now();
  paint();
}

function hide(): void { if (bar) { bar.hidden = true; bar.classList.remove("gv-in"); } }

/** Round 6b, the design review's B1 (Fri Nov 6): the bar never sits over a run that has landed (`[data-landed]`, Desk.tsx).
 *  On a phone it sat over TixQuack's gift-card note and its "Read as data" label, the one screen the product exists for. While
 *  it would cover one it steps aside, unseen (Mute too, which Settings also holds); the words still reach a screen reader
 *  through the live region, and the card itself says them. Read when a line starts, as the page scrolls and when a run lands. */
function clear(): void {
  if (!bar || bar.hidden) return;
  const a = bar.getBoundingClientRect();
  const over = [...document.querySelectorAll("[data-landed]")].some((el) => {
    const b = el.getBoundingClientRect();
    return b.left < a.right && b.right > a.left && b.top < a.bottom && b.bottom > a.top;
  });
  bar.toggleAttribute("data-aside", over);
}
let clearing = 0;
const clearSoon = () => { if (bar && !bar.hidden && !clearing) clearing = requestAnimationFrame(() => { clearing = 0; clear(); }); };

/** The header is never covered (Design Director, crit 2): its links fill the top row (the brand, the menu, the views,
 *  "Judge?"), so at every width the bar sits just under the page's top header. With no header at the top (none, or
 *  scrolled away) it keeps captions.css's own `top`. */
function place(): void {
  let top = "";
  for (const h of document.querySelectorAll("header")) {
    const r = h.getBoundingClientRect();
    if (r.height > 0 && r.top <= 1 && r.bottom > 0 && r.bottom < innerHeight * 0.4) { top = `${Math.round(r.bottom + 8)}px`; break; }
  }
  bar!.style.top = top;
}

/** Another live region on the page already holds the line (the wallet's own voice line): it's announced once, there. */
function saidElsewhere(line: string): boolean {
  for (const el of document.querySelectorAll('[role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]')) {
    if (el !== live && !bar!.contains(el) && el.textContent?.includes(line)) return true;
  }
  return false;
}

/** Puts the bar and its empty live region on the page ahead of the first line (called from the first tap). */
export function ready(): void { if (!bar) build(); }

function later(): void {
  clearTimeout(timer);
  timer = window.setTimeout(() => { if (!held) hide(); }, LINGER_MS);
}

/** Shows a line's words (and announces them) as it starts. */
export function show(line: string): void {
  if (!bar) build();
  clearTimeout(timer);
  playing = true;
  words.textContent = line;
  // Emptied first, so a repeated line is announced again. A region only just added to the page waits a moment, so the
  // screen reader has seen it empty before the words land; a line the page's own live region already holds isn't
  // announced twice.
  live.textContent = "";
  const fill = () => { if (words.textContent === line && !saidElsewhere(line)) live.textContent = line; };
  const wait = Math.max(0, FRESH_MS - (performance.now() - builtAt));
  if (wait) setTimeout(fill, wait); else requestAnimationFrame(fill);
  if (bar!.hidden) {
    place();
    bar!.hidden = false;
    requestAnimationFrame(() => bar?.classList.add("gv-in"));
  }
  clear();
  paint();
}

/** The line finished (or was cut off): the words stay a moment, then go. */
export function ended(): void {
  playing = false;
  if (!held) later();
}
