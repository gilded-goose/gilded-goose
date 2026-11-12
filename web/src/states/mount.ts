// Track R: the page-wide states, mounted once per page, after it has loaded (its own lazy chunk, so the first screen
// carries none of it). The states kit's block (brand.md §10.9), standing at the window's foot:
//   - offline: while navigator.onLine is false;
//   - waking: with the vector egg at 40%, while an /api call waits on a sleeping server (waking.ts has the rule); when
//     the server answers, the egg lights to full in one --d-3, then the line leaves by opacity;
//   - lost: a chunk failed to load (Vite's `vite:preloadError`), online or offline: "Part of this page didn't load."
//     and Reload, never an automatic reload, so nothing she typed is lost without her say;
//   - updated: only once a release check confirms a newer release (DD 09:29; not built, so unreachable today).
// Offline wins over everything (the DD, R-11): no state whose action needs the network shows while offline. Then
// lost (it needs her tap), then waking. strip.ts has the rule.
// Plain DOM, no React, so safe.html and the 404 page take it as cheaply as the main page.
//
//   void import("./states/mount.ts").then((m) => m.mountStates());
import "./states.css";
import { LOST, OFFLINE, UPDATED, WAKING, WAKING_FAILED } from "./words.ts";
import { lostChunk, stripKind, type Lost, type Shown } from "./strip.ts";
import { WakeWatch } from "./waking.ts";

let mounted = false;
const clock = { now: () => Date.now(), setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (t: unknown) => clearTimeout(t as number) };
/** The page's one watch on /api calls; surfaces may subscribe (`useWaking` in index.ts). */
export const wake = new WakeWatch(clock);

const isApi = (input: RequestInfo | URL): boolean => {
  try {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
    return u.origin === location.origin && u.pathname.startsWith("/api/");
  } catch { return false; }
};

/** Wraps fetch once, to time same-origin /api calls. The call itself is untouched: same arguments, same promise. */
function watchApi() {
  const real = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const p = real.call(this, input, init);
    if (!isApi(input)) return p;
    const id = wake.started();
    p.then((r) => wake.answered(id, r.status, (r.headers.get("content-type") ?? "").includes("json")), () => wake.failed(id));
    return p;
  };
}

const SVG = "http://www.w3.org/2000/svg";
/** The vector egg (brand.md 10.1) for the waking line, built with DOM methods: one path on one radial gradient. */
function egg(): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "st-egg");
  svg.setAttribute("viewBox", "4.4 2.2 15.2 18.8");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const g = document.createElementNS(SVG, "radialGradient");
  for (const [k, v] of [["id", "st-egg-page"], ["cx", "38%"], ["cy", "30%"], ["r", "78%"]] as const) g.setAttribute(k, v);
  for (const [o, c] of [["0", "#fff3c4"], [".34", "#f0cb62"], [".74", "#b98a1c"], ["1", "#6e4f06"]] as const) {
    const stop = document.createElementNS(SVG, "stop");
    stop.setAttribute("offset", o);
    stop.setAttribute("stop-color", c);
    g.append(stop);
  }
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", "M12 2.2c-4.2 0-7.6 6.3-7.6 11.2a7.6 7.6 0 0 0 15.2 0C19.6 8.5 16.2 2.2 12 2.2Z");
  path.setAttribute("fill", "url(#st-egg-page)");
  svg.append(g, path);
  return svg;
}

const LIT_MS = 400; // --d-3: the egg lights before the line leaves
const LEAVE_MS = 200; // --d-1: the line leaves by opacity

export function mountStates(): void {
  if (mounted) return;
  mounted = true;
  const strip = document.createElement("div");
  strip.className = "st-strip";
  strip.hidden = true;
  const box = document.createElement("div");
  box.className = "st-note";
  const say = document.createElement("p");
  say.className = "st-sr";
  say.setAttribute("role", "status");
  say.setAttribute("aria-live", "polite");
  const el = (tag: string, cls: string) => { const e = document.createElement(tag); e.className = cls; return e; };
  const mark = egg();
  const title = el("p", "st-note-title");
  const line = el("p", "st-note-line");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "st-note-action";
  // Reload for a lost chunk; Try again for a failed wake (the strip can't re-run a page's own calls; a reload re-runs them all).
  button.addEventListener("click", () => location.reload());
  box.append(mark, title, line, button);
  strip.append(box);
  document.body.append(strip, say);

  let lost: Lost | null = null;
  let shown: Shown | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = (ms: number, fn: () => void) => { clearTimeout(timer); timer = setTimeout(fn, ms); };
  const leave = () => {
    strip.dataset.leaving = "";
    say.textContent = "";
    later(LEAVE_MS, () => { strip.hidden = true; delete strip.dataset.leaving; delete box.dataset.lit; shown = null; });
  };
  const draw = () => {
    const kind: Shown | null = stripKind({ online: navigator.onLine, lost, wake: wake.state });
    if (!kind) {
      if (!shown || "leaving" in strip.dataset || "lit" in box.dataset) return;
      // The server answered: the egg lights in one --d-3, then the line leaves as the content fills in.
      if (shown === "waking" || shown === "waking-failed") { box.dataset.lit = ""; later(LIT_MS, leave); } else leave();
      return;
    }
    clearTimeout(timer);
    delete strip.dataset.leaving;
    delete box.dataset.lit;
    // The DD: the waking words follow the request; "fills in" only while one is out ("waking"), never once it failed.
    const words = kind === "updated" ? UPDATED : kind === "lost" ? LOST : kind === "offline" ? OFFLINE : kind === "waking-failed" ? WAKING_FAILED : WAKING;
    const said = "line" in words ? words.line : ""; // "updated" and "lost" have no line: the headline and [Reload] say it
    if (shown !== kind) say.textContent = said ? `${words.title} ${said}` : words.title;
    shown = kind;
    box.dataset.kind = kind;
    title.textContent = words.title;
    line.textContent = said;
    line.hidden = !said;
    mark.style.display = kind === "waking" || kind === "waking-failed" ? "" : "none";
    button.hidden = !("action" in words);
    if ("action" in words) button.textContent = words.action;
    strip.hidden = false;
  };
  addEventListener("online", draw);
  addEventListener("offline", draw);
  // One door to a lost chunk, with no release answer (r-deploy.test.ts): "updated" waits on a release check (strip.ts).
  const chunkLost = () => { lost = lostChunk(lost); };
  addEventListener("vite:preloadError", () => { chunkLost(); draw(); });
  // A part lost before this was mounted (online.ts PartLost marks <html>): its loss is named all the same (Track P, Fri Nov 6).
  if ("partLost" in document.documentElement.dataset) chunkLost();
  wake.subscribe(draw);
  watchApi();
  // The first load's measure: one cheap health ask (GET /api/health has no side effects), only where our server is
  // (not the static mirror under a base path, which has no /api).
  // Its body is read to the end: an unread body keeps the request open (the page never goes network-idle).
  if (import.meta.env.BASE_URL === "/" && navigator.onLine) void fetch("/api/health", { cache: "no-store" }).then((r) => r.arrayBuffer()).catch(() => {});
  draw();
}
