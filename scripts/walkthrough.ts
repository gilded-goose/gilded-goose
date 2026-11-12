/// <reference lib="dom" />
// The walkthrough recorder (launch checklist §8: "A recorded walkthrough of the live site at 1440 and at 390"; Track WT
// for Lead-10). One continuous Playwright video per take, telling the site's story top down at a calm pace:
//
//   1. the landing: the Desk hero, then a smooth scroll through every story section;
//   2. a run: a chip asks Goose, "Shop for this", the deal card, the seller Goose set aside and its "Why?" sheet (held
//      ~2 s on --scrim), and Approve (never pressed);
//   3. "Everything Goose does", then each room in turn: How it works, Behind the scenes, Try to trick Goose, The haggle,
//      Proof, the wallet (`?wallet=1#approve`; its judge sheet when drawn) and safe.html, and Limits in code;
//   4. the end: the landing's close.
//
//   node scripts/walkthrough.ts <baseUrl> [outDir]                       1440 dark and 390 dark (add 1440-light by --takes)
//   node scripts/walkthrough.ts https://gilded-goose.onrender.com --takes 1440-dark,390-dark
//   WALKTHROUGH_OUT=/somewhere node scripts/walkthrough.ts http://localhost:8790
//
// outDir (argv, else WALKTHROUGH_OUT, else <tmpdir>/goose-walkthrough/<host>-<time>) must be outside the repo: the
// script refuses a folder inside it. It writes, per take, `walkthrough-<take>.webm`, `walkthrough-<take>.json` (each
// step's URL, its offset in the video in seconds, and whether its expected heading was found) and `stills/<take>-NN.png`
// (one still per step, to check the take without a video player); plus `summary.json` over every take.
//
// It is a smoke test too: it exits 1 when any expected heading is missing, or any console error or uncaught page error
// fires, on any take. A step that misses still records the rest of the walk, so one miss shows every other one too.
//
// Safety: nothing here pays. It never presses Approve (the run's or the wallet's), never opens PayPal and never types
// a login. Locally run the server with PAYMENT=fake. The run uses the Desk's first chip, a recorded week's item.
//
// Render's free instance sleeps: before any take it polls `/api/health` (up to 4 min, unrecorded), and each step waits
// up to 2 min for its heading, so a page that shows "Goose's server is waking up." first is waited out, never failed;
// the step logs `waking: true` when it saw that line. If the run's ask or market comes back as the Desk's own failure
// (a just-woken server can answer /api/health before its first market call), the walk presses "Try again" (a read,
// never a payment) up to 4 times and notes it on the step.
//
// Each step logs `t` (seconds into the video when the step began) and `shown` (when its heading was on screen).

import { chromium, type BrowserContext, type Locator, type Page } from "playwright";
import { mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, isAbsolute } from "node:path";

const ROOT = realpathSync(new URL("..", import.meta.url).pathname);

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]!.startsWith("--")));
const baseArg = positional[0];
if (!baseArg || !/^https?:\/\//.test(baseArg)) {
  console.error("usage: node scripts/walkthrough.ts <baseUrl> [outDir] [--takes 1440-dark,390-dark,1440-light]");
  process.exit(2);
}
const BASE = baseArg.replace(/\/+$/, "") + "/";
const LIVE = !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(BASE);

/** The output folder, never inside the repo (this script is run from it, and its videos are tens of MB). */
function outDirOf(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const raw = positional[1] ?? process.env.WALKTHROUGH_OUT ?? join(tmpdir(), "goose-walkthrough", `${new URL(BASE).hostname}-${stamp}`);
  const abs = resolve(raw);
  mkdirSync(abs, { recursive: true });
  const real = realpathSync(abs);
  const rel = relative(ROOT, real);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    console.error(`walkthrough: refusing to write into the repo (${real}); pass a folder outside ${ROOT}`);
    process.exit(2);
  }
  return real;
}
const OUT = outDirOf();

interface TakeSpec { id: string; width: number; height: number; phone: boolean; scheme: "dark" | "light" }
const ALL_TAKES: readonly TakeSpec[] = [
  { id: "1440-dark", width: 1440, height: 900, phone: false, scheme: "dark" },
  { id: "390-dark", width: 390, height: 844, phone: true, scheme: "dark" },
  { id: "1440-light", width: 1440, height: 900, phone: false, scheme: "light" },
];
const wanted = flag("--takes")?.split(",");
/** By default the two dark takes: the site draws the same dark palettes under a light scheme (measured at stack 91: the
 *  light take's stills of How it works, Try to trick Goose and safe.html are byte-identical to the dark's), so
 *  `1440-light` runs only when asked for. */
const TAKES = ALL_TAKES.filter((t) => (wanted ? wanted.includes(t.id) : t.scheme === "dark"));
if (!TAKES.length) { console.error(`walkthrough: no take matches --takes ${wanted?.join(",")} (have ${ALL_TAKES.map((t) => t.id).join(", ")})`); process.exit(2); }

/** How long a step waits for its heading: long on live, where a page can arrive while Render wakes. */
const READY_MS = LIVE ? 120_000 : 30_000;
const WAKING = /Goose's server is waking up|Goose’s server is waking up/;

interface Step { n: number; name: string; url: string; t: number; shown: number | null; expected: string; found: boolean; via?: string; waking?: boolean; note?: string }
interface TakeLog { take: string; base: string; width: number; height: number; scheme: string; startedAt: string; seconds: number; steps: Step[]; errors: string[]; video: string; pass: boolean }

// ---- one take -------------------------------------------------------------------------------------------------------

class Walk {
  readonly steps: Step[] = [];
  readonly errors: string[] = [];
  readonly t0 = Date.now();
  page!: Page;
  spec: TakeSpec;
  constructor(spec: TakeSpec) { this.spec = spec; }

  get narrow(): boolean { return this.spec.width <= 720; }
  at(): number { return Math.round((Date.now() - this.t0) / 100) / 10; }
  hold(s: number): Promise<void> { return this.page.waitForTimeout(s * 1000); }

  /** A step: waits for `expect` (up to READY_MS), logs whether it came, and stills the screen. */
  async step(name: string, expected: string, expect: Locator, extra: Partial<Step> = {}, timeout = READY_MS): Promise<boolean> {
    const n = this.steps.length + 1;
    const t = this.at();
    let waking = false;
    const seen = expect.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
    // Note a waking line while the step waits (it's a state the page is allowed to pass through, never a failure).
    const watch = (async () => {
      for (let i = 0; i < timeout / 1000; i++) {
        if (await this.page.getByText(WAKING).first().isVisible().catch(() => false)) { waking = true; return; }
        if (await Promise.race([seen, this.page.waitForTimeout(1000).then(() => null)]) !== null) return;
      }
    })();
    const found = await seen;
    await watch;
    const s: Step = { n, name, url: this.page.url(), t, shown: found ? this.at() : null, expected, found, ...extra };
    if (waking) s.waking = true;
    this.steps.push(s);
    console.log(`  ${String(n).padStart(2)} ${t.toFixed(1).padStart(6)} s  ${found ? "ok  " : "MISS"} ${name}${extra.via ? ` (${extra.via})` : ""}${waking ? " [waking seen]" : ""}`);
    // A sheet or menu is "visible" at frame 0 of its fade-in, so the still waits (<= 0.8 s) for finite animations to end.
    await this.page.evaluate(() => Promise.race([
      Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity).map((a) => a.finished.catch(() => {}))),
      new Promise((r) => setTimeout(r, 800)),
    ])).catch(() => {});
    await this.page.screenshot({ path: join(OUT, "stills",`${this.spec.id}-${String(n).padStart(2, "0")}.png`) }).catch(() => {});
    return found;
  }

  /** Scrolls smoothly so `l`'s top sits `offset` px under the window's top (an instant jump reads badly on video). */
  async glide(l: Locator, offset = 96, ms = 1400): Promise<void> {
    if (!(await l.first().count())) return;
    await l.first().evaluate((el, [off, dur]) => new Promise<void>((done) => {
      const from = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const to = Math.max(0, Math.min(el.getBoundingClientRect().top + window.scrollY - off, max));
      const t0 = performance.now();
      const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
      const tick = (now: number) => { const t = Math.min(1, (now - t0) / dur); window.scrollTo(0, from + (to - from) * ease(t)); if (t < 1) requestAnimationFrame(tick); else done(); };
      requestAnimationFrame(tick);
    }), [offset, ms] as const).catch(() => {});
    await this.page.waitForTimeout(200);
  }

  /** Scrolls smoothly to the top of the page. */
  async top(ms = 900): Promise<void> {
    await this.page.evaluate((dur) => new Promise<void>((done) => {
      const from = window.scrollY, t0 = performance.now();
      const tick = (now: number) => { const t = Math.min(1, (now - t0) / dur); window.scrollTo(0, from * (1 - t * t * (3 - 2 * t))); if (t < 1) requestAnimationFrame(tick); else done(); };
      requestAnimationFrame(tick);
    }), ms).catch(() => {});
  }

  /** Scrolls smoothly down by a fraction of the window's height. */
  async by(frac: number, ms = 1000): Promise<void> {
    await this.page.evaluate(([f, dur]) => new Promise<void>((done) => {
      const from = window.scrollY;
      const to = Math.min(from + window.innerHeight * f, document.documentElement.scrollHeight - window.innerHeight);
      const t0 = performance.now();
      const tick = (now: number) => { const t = Math.min(1, (now - t0) / dur); window.scrollTo(0, from + (to - from) * t * t * (3 - 2 * t)); if (t < 1) requestAnimationFrame(tick); else done(); };
      requestAnimationFrame(tick);
    }), [frac, ms] as const).catch(() => {});
  }

  /** Scrolls a scrolling box (the phone's menu sheet) to its foot, smoothly. */
  async glideInside(l: Locator, ms: number): Promise<void> {
    await l.evaluate((el, dur) => new Promise<void>((done) => {
      const to = el.scrollHeight - el.clientHeight, t0 = performance.now();
      if (to <= 0) return done();
      const tick = (now: number) => { const t = Math.min(1, (now - t0) / dur); el.scrollTop = to * t * t * (3 - 2 * t); if (t < 1) requestAnimationFrame(tick); else done(); };
      requestAnimationFrame(tick);
    }), ms).catch(() => {});
  }

  async goto(path: string): Promise<void> {
    await this.page.goto(new URL(path, BASE).href, { waitUntil: "domcontentloaded", timeout: READY_MS + 60_000 });
    await this.page.waitForLoadState("load", { timeout: READY_MS }).catch(() => {});
  }

  /** Waits for `target`; while the Desk shows its own failure with "Try again" instead (a just-woken Render answers
   *  /api/health before its first market call does), presses Try again, up to 4 times, 5 s apart. "Try again" re-sends
   *  a read (the ask or the market); it never pays. Returns how many times it pressed. */
  async past(target: Locator): Promise<number> {
    const again = this.page.getByRole("button", { name: /^Try again/ });
    let tries = 0;
    const until = Date.now() + READY_MS;
    while (Date.now() < until) {
      const which = await Promise.race([
        target.first().waitFor({ state: "visible", timeout: READY_MS }).then(() => "target", () => "none"),
        again.first().waitFor({ state: "visible", timeout: READY_MS }).then(() => "again", () => "none"),
      ]);
      if (which !== "again" || tries >= 4) return tries;
      tries++;
      await this.hold(5);
      await again.first().click({ timeout: 10_000 }).catch(() => {});
      await this.hold(0.5);
    }
    return tries;
  }

  /** How long a room's step waits: the full time on the room's own address, 5 s when the site sent the address
   *  elsewhere (a build without that room canonicalizes `?desk=how` to the Desk), so a missing room costs seconds. */
  wait(path: string): number {
    const want = new URL(path, BASE).searchParams, got = new URL(this.page.url()).searchParams;
    return [...want].every(([k, v]) => got.get(k) === v) ? READY_MS : 5_000;
  }

  menuButton(): Locator { return this.page.locator("button.gm-btn:visible").first(); }
  menuPanel(): Locator { return this.page.getByRole("dialog", { name: "Everything Goose does" }); }

  /** Opens "Everything Goose does" from the bar this page draws. False when the page has no menu button. */
  async openMenu(): Promise<boolean> {
    const btn = this.menuButton();
    if (!(await btn.waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false))) return false;
    await this.top(600);
    await btn.click({ timeout: 10_000 });
    return this.menuPanel().waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false);
  }

  /** Visits a room: through the menu when it lists the room (`ids`, its menu ids), else by its address. */
  async room(ids: readonly string[], path: string): Promise<string> {
    if (await this.openMenu()) {
      const panel = this.menuPanel();
      for (const id of ids) {
        const item = panel.locator(`a.gm-item[data-item="${id}"]`).first();
        if (await item.count()) {
          await this.hold(0.6);
          await item.scrollIntoViewIfNeeded().catch(() => {});
          await item.hover().catch(() => {});
          await this.hold(0.4);
          const from = this.page.url();
          await item.click({ timeout: 10_000 });
          await this.page.waitForLoadState("load", { timeout: READY_MS }).catch(() => {});
          // A menu link must reach its room's page. One that lands elsewhere (a bare `?desk=…` href followed from
          // /safe.html stays on /safe.html) is a site bug: it fails the take, and the walk goes on by the address.
          const want = new URL(path, BASE).pathname;
          const got = new URL(this.page.url()).pathname;
          if (got !== want) {
            this.errors.push(`menu item "${id}" on ${new URL(from).pathname} went to ${new URL(this.page.url()).pathname}${new URL(this.page.url()).search}, not ${want}${new URL(path, BASE).search}`);
            await this.goto(path);
            return `menu: ${id} landed off-page; then address: ${path}`;
          }
          return `menu: ${id}`;
        }
      }
      await this.page.keyboard.press("Escape");
      await this.hold(0.3);
    }
    await this.goto(path);
    return `address: ${path}`;
  }
}

/** The story, in order. Each room holds ~2–4 s a screen and glides between its sections. */
async function story(w: Walk): Promise<void> {
  const p = w.page;
  const heading = (name: RegExp) => p.getByRole("heading", { name });
  const off = w.narrow ? 72 : 96;

  // 1. The landing: the hero, then each story section in turn.
  await w.goto("./?desk=1");
  await w.step("The landing: the Desk hero", "h1 “Goose can't be fooled into paying.”", heading(/^Goose can't be fooled into paying/));
  await w.hold(3);
  const sections = p.locator("section[data-story]");
  const count = await sections.count();
  for (let i = 0; i < count; i++) {
    const sec = sections.nth(i);
    if (!(await sec.isVisible().catch(() => false))) continue;
    await w.glide(sec, w.narrow ? 64 : 88, 1100);
    await w.hold(w.narrow ? 1.4 : 1.8);
    // A section much taller than the window (a phone's long lists) gets a second look further down.
    const tall = await sec.evaluate((el) => el.getBoundingClientRect().height > window.innerHeight * 1.6).catch(() => false);
    if (tall) { await w.by(0.75, 900); await w.hold(w.narrow ? 1 : 1.4); }
  }
  await w.step(`The landing's story: ${count} sections`, "the close’s heading", p.locator("#ds-close-h"), { note: `${count} story sections scrolled` });
  await w.hold(0.8);

  // 2. A run, from the first chip. Approve is shown, never pressed.
  await w.top(1300);
  await w.hold(0.6);
  const chip = p.locator(".dk-chip-row button").first();
  const chipText = (await chip.textContent().catch(() => null))?.trim() ?? "";
  await w.step("The chips under the Ask box", "a chip", chip, { note: chipText });
  await w.hold(1);
  await chip.hover().catch(() => {});
  await w.hold(0.5);
  await chip.click({ timeout: 10_000 }).catch(() => {});
  const shop = p.getByRole("button", { name: /Shop for this/ });
  const asked = await w.past(shop);
  // `past` already waited the full time, so a step whose target still isn't there checks once more, briefly.
  const understood = await w.step("Goose understood the ask", "button “Shop for this”", shop, { note: chipText + (asked ? ` (Try again ×${asked})` : "") }, await shop.first().isVisible() ? READY_MS : 5_000);
  await w.glide(shop, w.narrow ? 360 : 420, 800);
  await w.hold(2);
  await shop.first().click({ timeout: 10_000 }).catch(() => {});
  const approve = p.locator("button.dk-approve");
  // Once the run's first step misses, the rest of the run is logged as missed at once (not 2 min each on live).
  const shopped = understood ? await w.past(approve) : 0;
  const runWait = understood && await approve.first().isVisible() ? READY_MS : 3_000;
  const dealt = await w.step("The run: the deal card", "the deal card’s Approve", approve, shopped ? { note: `Try again ×${shopped}` } : {}, runWait);
  await w.hold(0.8);
  const aside = p.getByText(/Goose set .+ aside\./).first();
  await w.glide(aside, w.narrow ? 120 : 140, 1100);
  const tail = dealt ? READY_MS : 3_000;
  await w.step("The run: the seller Goose set aside", "“Goose set … aside.”", aside, {}, tail);
  await w.hold(1.6);
  // "Why?" opens the Desk's sheet (Desk.tsx `dk-sheet`, read-only) over `.dk-scrim`, the live surface on --scrim: held
  // ~2 s so the DD can judge the backdrop from the take (Lead-10). The wallet's own judge sheet no longer renders.
  // By its name: from stack 126 "Change my words" wears .dk-why-btn too (Desk.tsx).
  const why = p.getByRole("button", { name: "Why?", exact: true }).first();
  await why.click({ timeout: tail }).catch(() => {});
  await w.step("The run: why Goose set it aside (the sheet on --scrim)", "the sheet “Why Goose set … aside”", p.getByRole("dialog", { name: /^Why Goose set .+ aside/ }), {}, tail === READY_MS ? 10_000 : tail);
  await w.hold(2.2);
  await p.keyboard.press("Escape");
  await w.hold(0.6);
  await w.glide(approve, w.narrow ? 380 : 420, 1100);
  await approve.first().hover().catch(() => {});
  await w.step("The run: Approve, not pressed", "Approve in view", approve, { note: (await approve.first().textContent({ timeout: 2_000 }).catch(() => ""))?.trim() ?? "" }, tail);
  await w.hold(2.4);

  // 3. The menu, then each room.
  await w.openMenu();
  await w.step("Everything Goose does", "the menu dialog", w.menuPanel());
  await w.hold(2.4);
  if (w.narrow) { await w.glideInside(w.menuPanel(), 2200); await w.hold(0.6); }
  await p.keyboard.press("Escape");
  await w.hold(0.4);

  let via = await w.room(["how"], "./?desk=how");
  await w.step("How it works", "h1 “How it works”", heading(/^How it works$/), { via }, w.wait("./?desk=how"));
  await w.hold(2.4);
  if (w.narrow) { await w.by(0.8, 1200); await w.hold(1.8); }
  else { await w.hold(1.2); }

  via = await w.room(["ledger"], "./?desk=ledger");
  await w.step("Behind the scenes", "h1 “Behind the scenes”", heading(/^Behind the scenes$/), { via }, w.wait("./?desk=ledger"));
  await w.hold(1.6);
  await w.glide(p.locator("#lx-story-q"), off, 1200);
  // The week's chart is a lazy chunk: the step waits for its canvas, so a loading line is never what the take holds on.
  await w.step("Behind the scenes: the week's chart", "the week chart’s canvas", p.locator(".lx-chart-canvas canvas"));
  await w.hold(2.6);
  await w.glide(p.locator("#lx-panel-h"), off, 1200);
  await w.hold(2.6);

  via = await w.room(["trick"], "./?desk=1#challenge");
  await w.step("Try to trick Goose", "h2 “Try to trick Goose.”", heading(/^Try to trick Goose/), { via }, w.wait("./?desk=1#challenge"));
  await w.hold(2.6);
  await w.glide(p.locator("#ds-ch-note"), off, 1200);
  await w.hold(2.2);

  via = await w.room(["haggle"], "./?desk=haggle");
  await w.step("The haggle", "h1 “The haggle”", heading(/^The haggle$/), { via }, w.wait("./?desk=haggle"));
  await w.hold(1.6);
  await w.glide(p.locator("#hg-chart-h"), off, 1100);
  await w.step("The haggle: the price ladder", "the ladder’s canvas", p.locator(".hg-canvas canvas"));
  await w.hold(2.4);
  await w.glide(p.locator("#hg-talk-h"), off, 1100);
  await w.hold(2.2);

  via = await w.room(["proof"], "./?desk=proof");
  await w.step("Proof", "h1 “Proof”", heading(/^Proof$/), { via }, w.wait("./?desk=proof"));
  await w.hold(2.2);
  for (const id of ["#pf-blind", "#pf-money", "#pf-attacks"]) { await w.glide(p.locator(id), off, 1200); await w.hold(2.2); }

  via = await w.room(["approve"], "./?wallet=1#approve");
  await w.step("The wallet: Approve in PayPal (not pressed)", "the wallet’s #approve", p.locator("#approve"), { via }, w.wait("./?wallet=1#approve"));
  await w.hold(2.8);
  await w.top(1200);
  await w.hold(1.2);
  // "Judge? Start here" is the bar's link to the tour (the wallet's judge sheet was deleted in stack 118, W-8). At 390 the
  // bar folds it away (the phone's Menu holds the tour), so there's nothing to show there.
  const link = p.locator("header a.dk-judge:visible").first();
  if (await link.count()) {
    await link.hover({ timeout: 3_000 }).catch(() => {});
    await w.step("The wallet: “Judge? Start here” (a link to the tour)", "the bar’s “Judge? Start here”", link, {}, 5_000);
    await w.hold(1.2);
  }

  await w.goto("./safe.html");
  await w.step("See how it keeps you safe (safe.html)", "h1 “See how it keeps you safe.”", heading(/^See how it keeps you safe/), { via: "address: ./safe.html" });
  await w.hold(2.4);
  const safeH2 = p.locator("main h2");
  const h2s = Math.min(await safeH2.count(), 4);
  for (let i = 1; i < h2s; i++) { await w.glide(safeH2.nth(i), off, 1100); await w.hold(1.8); }

  via = await w.room(["limits"], "./?desk=1#settings");
  await w.step("Settings: Limits in code", "the pane “Limits in code”", heading(/^Limits in code$/), { via }, w.wait("./?desk=1#settings"));
  await w.hold(3);

  // 4. The end: the landing's close.
  await w.goto("./?desk=1");
  await w.step("The end: back on the landing", "h1 “Goose can't be fooled into paying.”", heading(/^Goose can't be fooled into paying/));
  await w.hold(1);
  await w.glide(p.locator("section.ds-close"), w.narrow ? 56 : 88, 2200);
  await w.step("The end card: the landing's close", "the close’s heading", p.locator("#ds-close-h"));
  await w.hold(3.5);
}

async function warm(): Promise<void> {
  const until = Date.now() + 240_000;
  let tries = 0;
  for (;;) {
    tries++;
    const ok = await fetch(new URL("api/health", BASE), { signal: AbortSignal.timeout(30_000) }).then((r) => r.ok, () => false);
    if (ok) { if (tries > 1) console.log(`  the server answered after ${tries} tries`); return; }
    if (Date.now() > until) { console.log("  the server never answered /api/health in 4 min; recording anyway (each step still waits for its heading)"); return; }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function record(spec: TakeSpec): Promise<TakeLog> {
  const browser = await chromium.launch();
  let ctx: BrowserContext | null = null;
  const startedAt = new Date().toISOString();
  const size = { width: spec.width, height: spec.height };
  const w = new Walk(spec);
  let storyEnd: number | null = null;
  const raw = join(OUT, `.raw-${spec.id}`);
  const video = join(OUT, `walkthrough-${spec.id}.webm`);
  try {
    ctx = await browser.newContext({
      viewport: size, deviceScaleFactor: 1, colorScheme: spec.scheme, isMobile: spec.phone, hasTouch: spec.phone,
      recordVideo: { dir: raw, size },
    });
    const page = await ctx.newPage();
    w.page = page;
    page.on("console", (m) => { if (m.type() === "error") w.errors.push(`console at ${w.at()} s on ${page.url()}: ${m.text()}${m.location().url ? ` (${m.location().url}:${m.location().lineNumber})` : ""}`); });
    page.on("pageerror", (e) => w.errors.push(`pageerror at ${w.at()} s on ${page.url()}: ${e.message}`));
    // Nothing on this walk pays: a navigation to PayPal is stopped before it leaves, and fails the take.
    await ctx.route(/paypal\.com\/(checkoutnow|webapps|signin|agreements)/, (r) => { w.errors.push(`blocked a PayPal navigation: ${r.request().url()}`); return r.abort(); });
    await story(w);
    storyEnd = w.at();
  } catch (e) {
    w.errors.push(`walk stopped: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  } finally {
    const v = w.page?.video();
    await ctx?.close();
    if (v) { await v.saveAs(video).catch((e) => w.errors.push(`video not saved: ${e}`)); }
    await browser.close();
    rmSync(raw, { recursive: true, force: true });
  }
  // The video's length: the walk's end (the page's close and the video's save come after the last frame).
  const seconds = storyEnd ?? w.at();
  const log: TakeLog = {
    take: spec.id, base: BASE, width: spec.width, height: spec.height, scheme: spec.scheme, startedAt, seconds,
    steps: w.steps, errors: w.errors, video, pass: w.steps.length > 0 && w.steps.every((s) => s.found) && w.errors.length === 0,
  };
  writeFileSync(join(OUT, `walkthrough-${spec.id}.json`), JSON.stringify(log, null, 2) + "\n");
  return log;
}

mkdirSync(join(OUT, "stills"), { recursive: true });
console.log(`walkthrough ${BASE} → ${OUT}`);
await warm();
const logs: TakeLog[] = [];
for (const spec of TAKES) {
  console.log(`take ${spec.id} (${spec.width}×${spec.height}, DPR 1, ${spec.scheme})`);
  const log = await record(spec);
  logs.push(log);
  for (const e of log.errors) console.log(`  ERROR ${e}`);
  console.log(`  ${log.pass ? "PASS" : "FAIL"}: ${log.seconds} s, ${log.steps.length} steps, ${log.steps.filter((s) => !s.found).length} missed, ${log.errors.length} errors → ${log.video}`);
}
const tmp = join(OUT, "summary.json.tmp");
writeFileSync(tmp, JSON.stringify(logs.map(({ take, seconds, steps, errors, pass, video }) => ({ take, seconds, steps: steps.length, missed: steps.filter((s) => !s.found).map((s) => s.name), errors: errors.length, pass, video })), null, 2) + "\n");
renameSync(tmp, join(OUT, "summary.json"));
const failed = logs.filter((l) => !l.pass);
console.log(failed.length ? `FAIL: ${failed.map((l) => l.take).join(", ")}` : `PASS: ${logs.length} take${logs.length === 1 ? "" : "s"}, every heading found, zero console and page errors.`);
process.exit(failed.length ? 1 : 0);
