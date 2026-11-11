// Joshua's opening (Oct 30, 3:00 AM): a jewelry case at night; the case light comes on, about 1.5 s in all.
// 1. First paint (index.html, before any script): velvet, the egg centred as a near-black silhouette, one hairline.
// 2. Loading is the light. Each real step lifts it: the Desk's code arriving, its two fonts, the egg's picture, the live
//    three.js egg's code (or its failure: then the picture is the egg). A rim of gold first, then the full shine; the hairline
//    fills cream into gold in step. No percent, no spinner, no timer standing in for loading.
// 3. Loaded: the egg glides to its hero spot, its shadow a few frames behind, and its warm light comes up on the velvet
//    around it as it goes (tokens.css, --egg-light: keyed on html.dk-gliding, so it needs nothing here).
// 4. The hairline stretches into the nav's own, under contents that are already resting there.
// 5. The gold sheen crosses the headline as the egg passes. Then stillness.
// The words come first (Round 2's design judge; S2-3): the headline and the bar's contents fade in as soon as the Desk
// has mounted and their two faces are in (words(): html.dk-words), on a desktop well before the egg lights; the egg and
// the line then draw in behind them. On a phone the egg rises through the headline's place, so there the headline still
// waits for the glide (desk.css); the bar's contents don't.
// Hard cap: the glide starts by GLIDE_BY whatever has loaded (the egg finishes lighting in place), so the hero is up by
// about 1.4 s (HERO_BY); a Desk that arrives later than that skips the glide. The cap is on the page's clock, so a glide
// that a long task held starts shorter, or not at all (opening-clock.ts). The cap governs the opening's own length, not
// the network: on the phone drill (1.6 Mbps) the Desk's code lands at ~1.73 s and the hero shows the moment it mounts
// (skipIfLate), ~1.8 s; no constant here can move that (brand.md section 7). Any tap, key or scroll skips to the finished
// hero. The live egg's WebGL setup is one long task (560-640 ms in headless Chromium), so it waits until the opening
// is still (whenStill); until then the egg is its still picture, the same render.
// Once per session; index.html never starts it under reduced motion or on PayPal's return.
import { END_PAD, GLIDE_BY, glideMs } from "./opening-clock.ts";

const SHEEN_AT = 0.4, HOLD_MS = 120; // ms; SHEEN_AT: share of the glide
const LIGHT = [0.3, 0.55, 0.8, 1]; // the light after each real step: a rim first, then the full shine

const html = document.documentElement;

/** Whether this visit plays the opening (index.html decided, before the first paint). */
export const opening = () => html.classList.contains("dk-opening");
/** Too late to glide: the Desk (or its egg) arrived after the opening's cap, so the hero shows at once. */
const late = () => performance.now() > GLIDE_BY + 200;
const finish = () => { html.classList.remove("dk-opening", "dk-gliding", "dk-words"); html.classList.add("dk-opened", "dk-skip"); settle(); };

// Work that would stall the opening (the live egg's WebGL setup) waits here until the page is still: the glide has
// landed and its sheen has crossed the headline, or the shopper skipped. No opening: it runs at once.
let still = !opening();
const waiting: (() => void)[] = [];
function settle() { still = true; waiting.splice(0).forEach((f) => f()); }
/** Runs `f` once the opening is still (at once if it is, or there is none). Returns a cancel. */
export function whenStill(f: () => void): () => void {
  if (still) { f(); return () => {}; }
  waiting.push(f);
  return () => { const i = waiting.indexOf(f); if (i >= 0) waiting.splice(i, 1); };
}

/** The opening belongs to the landing's hero. A link straight into a room (`?desk=1#wants`, `#week`, `#settings`, every
 *  menu link from the back room) or a Desk that mounted without the hero egg goes straight there: nothing would ever
 *  play the opening, and the case would sit dark until index.html's 6 s safety (Design Director crit #1, item 7). */
const elsewhere = () => location.hash.length > 1 || !document.querySelector(".dk-hero .dk-egg");

/** The Desk has mounted (before its first paint): a slow load (a phone on a slow network) or a route that isn't the
 *  landing's hero skips the opening there, without waiting on the egg's own chunk to arrive and skip it. On time, the
 *  words start: the hero egg's own chunk is held back by React for a beat, and the words don't wait on it. */
export function skipIfLate() {
  if (!opening()) return;
  if (late() || elsewhere()) finish(); else words();
}

/** The words first: once the headline's and the bar's faces are in (or by GLIDE_BY, whichever is first: a face that is
 *  still on its way then swaps in at the fade's start, as it did when the words waited for the glide), the headline and
 *  the bar's contents fade in (desk.css, html.dk-words). The line under the headline, the Ask box and the chips stay
 *  with the glide: the case's egg stands over their place until it carries it off. */
let wordsAsked = false;
function words() {
  if (wordsAsked) return;
  wordsAsked = true;
  const faces = [".dk-hero h1", ".dk-nav-in .gg"].map((sel) => document.querySelector(sel)).filter((el): el is Element => !!el).map((el) => {
    const s = getComputedStyle(el);
    return document.fonts.load(s.font || `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`).then(() => {}, () => {});
  });
  const by = new Promise<void>((ok) => setTimeout(ok, Math.max(0, GLIDE_BY - performance.now())));
  void Promise.race([Promise.all(faces).then(() => {}), by]).then(() => { if (opening()) html.classList.add("dk-words"); });
}

/** A clip-path for the full-window case with a hole around each element's text (its glyph run, not its block), so
 *  what the case draws never crosses those words. "none" when there is nothing to keep clear. */
function clipAround(els: Iterable<Element>, pad = 6): string {
  const holes: string[] = [];
  for (const el of els) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) holes.push(`M${(r.left - pad).toFixed(1)} ${(r.top - pad).toFixed(1)}h${(r.width + 2 * pad).toFixed(1)}v${(r.height + 2 * pad).toFixed(1)}h${(-r.width - 2 * pad).toFixed(1)}Z`);
  }
  return holes.length ? `path(evenodd, "M0 0H${innerWidth}V${innerHeight}H0Z${holes.join("")}")` : "none";
}

const steps = new Set<string>();
let onStep: (() => void) | null = null;
/** A real loading step finished (the live egg reports "egg" here when its code arrives, or fails to). */
export function loaded(step: "code" | "fonts" | "still" | "egg") {
  if (steps.has(step)) return;
  steps.add(step);
  onStep?.();
}

/** Plays the opening over the Desk that has just mounted. Returns a cleanup. */
export function playOpening(): () => void {
  if (!opening()) { settle(); return () => {}; }
  try { sessionStorage.setItem("gg-opened", "1"); } catch { /* a private window: it may play again */ }
  const box = document.getElementById("dk-case");
  const line = box?.querySelector("i") as HTMLElement | null;
  const egg = document.querySelector<HTMLElement>(".dk-hero .dk-egg");
  const body = egg?.querySelector<HTMLElement>(".dk-egg-body");
  const shadow = egg?.querySelector<HTMLElement>(".dk-egg-shadow");
  const nav = document.querySelector<HTMLElement>(".dk-intro");
  const timers: number[] = [];
  const later = (f: () => void, ms: number) => { timers.push(window.setTimeout(f, ms)); };
  let done = false;

  const end = () => {
    if (done) return;
    done = true;
    removeEventListener("pointerdown", skip, true); removeEventListener("keydown", skip, true);
    removeEventListener("wheel", skip, true); removeEventListener("touchmove", skip, true);
    html.classList.remove("dk-opening", "dk-gliding", "dk-words");
    html.classList.add("dk-opened");
  };
  // Any tap, key or scroll: the finished hero at once (the egg keeps lighting in place if it hasn't finished).
  const skip = () => {
    timers.forEach(clearTimeout);
    if (egg) { egg.classList.remove("dk-lighting"); egg.style.removeProperty("--lit"); }
    for (const el of [body, shadow, line]) if (el) { el.style.transition = "none"; el.style.transform = ""; }
    html.classList.add("dk-skip");
    end();
    settle();
  };
  if (!box || !line || !egg || !body || !nav || late()) { skip(); return () => {}; }
  addEventListener("pointerdown", skip, true); addEventListener("keydown", skip, true);
  addEventListener("wheel", skip, true); addEventListener("touchmove", skip, true);

  // Stand the hero egg exactly where the case's silhouette is (same outline, so the swap is invisible), dark. The
  // shadow moves as if it were part of the egg (scaled about the egg's centre), so it can trail it separately.
  const from = box.querySelector("svg")!.getBoundingClientRect(), to = body.getBoundingClientRect();
  const cx = to.left + to.width / 2, cy = to.top + to.height / 2, s = from.width / to.width;
  const place = `translate3d(${(from.left + from.width / 2 - cx).toFixed(1)}px, ${(from.top + from.height / 2 - cy).toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
  body.style.transform = place;
  if (shadow) {
    const r = shadow.getBoundingClientRect();
    shadow.style.transformOrigin = `${(cx - r.left).toFixed(1)}px ${(cy - r.top).toFixed(1)}px`;
    shadow.style.transform = place;
  }
  // Dark first, then the class that eases --lit: set together, it would ease down from its initial 1.
  egg.style.setProperty("--lit", "0");
  void getComputedStyle(egg).getPropertyValue("--lit");
  egg.classList.add("dk-lighting");
  html.classList.add("dk-handed");

  let lit = 0, glided = false;
  const light = () => {
    lit = LIGHT[Math.min(LIGHT.length, steps.size) - 1] ?? 0;
    egg.style.setProperty("--lit", String(lit));
    line.style.setProperty("--l", String(lit));
    if (lit >= 1) {
      // The egg is fully lit: the mask comes off once its last rise has finished.
      later(() => { egg.classList.remove("dk-lighting"); egg.style.removeProperty("--lit"); }, 480);
      if (!glided) later(glide, 480 + HOLD_MS);
    }
  };
  onStep = light;
  requestAnimationFrame(() => { loaded("code"); light(); });
  void document.fonts.ready.then(() => loaded("fonts"));
  const still = body.querySelector<HTMLImageElement>(".dk-egg-still");
  void (still ? still.decode() : Promise.resolve()).then(() => loaded("still"), () => loaded("still"));
  later(glide, Math.max(0, GLIDE_BY - performance.now()));

  function glide() {
    if (glided || done || !body || !line || !nav) return;
    glided = true;
    // On time, the full glide; held by a long task, a shorter one that still lands by the cap; too late, none.
    const t = performance.now(), ms = glideMs(t);
    if (!ms) { skip(); return; }
    html.classList.add("dk-gliding");
    const go = `transform ${ms}ms var(--spring)`;
    body.style.transition = go; body.style.transform = "";
    // The shadow trails the egg by a few frames.
    if (shadow) { shadow.style.transition = `transform ${ms + 20}ms var(--spring) 20ms`; shadow.style.transform = ""; }
    // The hairline stretches into the nav's bottom hairline, edge to edge, under the bar's contents (already resting
    // there since the words). Its centring translateX(-50%) (index.html) stays first in the list, so the move lands
    // exactly on the nav's line and eases from where the line rests.
    const a = line.getBoundingClientRect(), b = nav.getBoundingClientRect();
    line.style.transition = `${go}, background-color ${ms}ms var(--spring)`;
    line.style.transform = `translateX(-50%) translate(${(b.left - a.left).toFixed(1)}px, ${(b.top - a.top).toFixed(1)}px) scaleX(${(b.width / a.width).toFixed(3)})`;
    line.classList.add("dk-to-nav");
    // Round 3's design judge: on its way up the line crossed the headline (~100 ms through "Nothing is paid" at 1440).
    // The case is a layer over the page, so it can't pass under the words by z-order; it is clipped around them
    // instead (each line's own glyph run, a few px clear), so it reads as passing behind the headline.
    if (box) box.style.clipPath = clipAround(document.querySelectorAll(".dk-hero h1 .dk-mask > span"));
    later(() => html.classList.add("dk-sheen"), ms * SHEEN_AT);
    // The sheen ends (a phone starts it later); then the page is still.
    later(() => { html.classList.remove("dk-sheen"); settle(); }, ms * SHEEN_AT + 1600);
    later(() => { end(); for (const el of [body, shadow, line]) if (el) el.style.transition = ""; }, ms + END_PAD);
  }

  // Unmounted mid-opening: nothing is left playing, so nothing waits on it.
  return () => { timers.forEach(clearTimeout); onStep = null; settle(); };
}
