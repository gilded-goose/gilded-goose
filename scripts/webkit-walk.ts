/// <reference lib="dom" />
// Track P (Lead-12, Fri Nov 6): the judge's path in WebKit, Safari's engine, after every push. Many judges open the site
// on an iPhone, and every other walk runs Chromium only.
//
//   node scripts/webkit-walk.ts [baseUrl] [stills-dir]     (or: corepack pnpm postdeploy:webkit [baseUrl])
//   ... --control    breaks what the walk checks (the pill, stop 02's ask, the note box, one write): it must come back red
//
// Default base is the live site. It reads live, so it is a post-push walk, never a ci-local step. Once per machine:
// `corepack pnpm exec playwright install webkit` (a free download from Playwright's CDN).
//
// GET-only by construction: a route aborts every request to the base's origin that isn't GET or HEAD, and any such
// attempt fails the walk. It presses nothing but the menu and the tour's own buttons: never Send to Goose, never
// Approve, never "Start with the demo list". PayPal's own scripts and frames load as they would in a judge's Safari.
// The challenge's counter is read before and after, and printed.
//
// Two passes: the iPhone 13 profile (Safari's iOS user agent, touch) at 390x844, and Desktop Safari at 1440x900.
//   - menu: the menu lists the stops.
//   - trick: the judge's first move, timed from a cold / : Menu, then Try to trick Goose, until the note box is in view
//     and takes focus (it must within TRICK_MS). Where the section sits under the Ask box is printed, not failed: the
//     judges' steps say where to find it, and their words are pinned by judge-path.test.ts.
//   - range: on the landing, the real-price range's dash keeps its spoken name " to " (`content: "–" / " to "`), which
//     an engine without CSS alt text drops.
//   - 01 to 12, each stop of the tour: the pill names the stop, sits wholly inside the window, fully opaque; no text
//     in the window is still under 0.2 opacity once every animation has finished (a fade that never ran); stop 02's
//     waiting ask shows its end (a box shows its start, so "under $90" once read "under $9" at 390).
//   - every row: no console error or page error from our own origin (a third-party frame's lines print, never fail).
//   - cold: every route and hash room in the launch checklist, cold, at 390 in WebKit, by R's own measure
//     (`ENGINE=webkit MODE=phone node scripts/cold-routes.ts`: the same rows, rooms and verdict as Chromium's): every
//     largest paint and every hash room's head within 1 s, no error, no write. Each room's own largest paint is printed
//     beside it, not held to Chromium's pins (those are throttled numbers). Unthrottled, since WebKit has no CDP: a Mac's
//     number with an iPhone's user agent, never a phone's. --skip-cold skips it.
// Exits 1 with every FAIL row; 2 when WebKit isn't installed. With --control it exits 0 only when every row the control
// breaks went red.

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { devices, webkit, type Browser, type Page } from "playwright";

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? "https://gilded-goose.onrender.com/").replace(/\/?$/, "/");
const origin = new URL(base).origin;
const control = args.includes("--control");
const stills = args.find((a) => !/^https?:\/\//.test(a) && !a.startsWith("--"));
if (stills) mkdirSync(stills, { recursive: true });
const STOPS = 12;
const TRICK_MS = 3000; // measured 0.9–1.4 s on live 11d551e9 in WebKit and Chromium at 390 (Nov 6)

// The control's breakage, one per check: a half-faded pill, a hidden note box. Stop 02's ask is scrolled back to its start.
const CONTROL_CSS = ".tp { opacity: 0.5 !important; } #ds-ch-note { visibility: hidden !important; }";

const rows: { tag: string; at: string; ok: boolean; notes: string[] }[] = [];
const writes: string[] = [];
const row = (tag: string, at: string, ok: boolean, notes: string[]) => rows.push({ tag, at, ok, notes });
const counter = async () => { try { return JSON.stringify((await (await fetch(`${base}api/challenge`)).json()).counts); } catch { return "(unread)"; } };

/** Load, then every animation finished (at most 5 s), then a beat: what a judge sees once the page has arrived. */
async function settle(page: Page) {
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(1200);
  await page.evaluate(() => Promise.race([Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))), new Promise((r) => setTimeout(r, 5000))]));
  await page.waitForTimeout(500);
}

const openMenu = (page: Page) => page.locator("button:visible").filter({ hasText: /Menu|Everything Goose does/ }).first().click();

async function walk(browser: Browser, tag: string, phone: boolean) {
  const ctx = await browser.newContext({ ...(phone ? devices["iPhone 13"] : devices["Desktop Safari"]), viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, colorScheme: "dark" });
  await ctx.route("**/*", (r) => {
    const q = r.request();
    if (new URL(q.url()).origin === origin && q.method() !== "GET" && q.method() !== "HEAD") { writes.push(`${tag} ${q.method()} ${q.url()}`); return r.abort(); }
    return r.continue();
  });
  if (control) await ctx.addInitScript((css) => addEventListener("DOMContentLoaded", () => document.head.append(Object.assign(document.createElement("style"), { textContent: css }))), CONTROL_CSS);
  const page = await ctx.newPage();
  const ours: string[] = [], theirs: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const at = m.location()?.url ?? "";
    (at === "" || at.startsWith(origin) ? ours : theirs).push(`${m.text().slice(0, 140)}${at ? ` @ ${at.slice(0, 80)}` : ""}`);
  });
  page.on("pageerror", (e) => ours.push(`page error: ${String(e.message).slice(0, 140)}`));
  const errorNotes = () => { const n = [...ours.map((e) => `error: ${e}`), ...theirs.map((e) => `third-party frame (not failed): ${e}`)]; const bad = ours.length > 0; ours.length = 0; theirs.length = 0; return { n, bad }; };
  const still = async (name: string) => { if (stills) await page.screenshot({ path: `${stills}/${tag}-${name}.png`, scale: "css" }); };

  // The menu, from the tour page's bar.
  await page.goto(`${base}?desk=tour`); await settle(page);
  await openMenu(page);
  await page.waitForTimeout(1200);
  const items = await page.evaluate(() => [...document.querySelectorAll("a, button")].filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && getComputedStyle(e).visibility !== "hidden"; }).map((e) => (e.textContent ?? "").trim()));
  await still("menu");
  const missing = ["Try to trick Goose", "The Watcher", "Approve in PayPal", "Ask Goose", "Limits in code", "The haggle"].filter((w) => !items.some((t) => t.includes(w)));
  { const e = errorNotes(); row(tag, "menu", !missing.length && !e.bad, [`${items.length} items in view`, ...(missing.length ? [`missing: ${missing.join(", ")}`] : []), ...e.n]); }
  await page.keyboard.press("Escape");

  // The judge's first move, from a cold landing: Menu, then Try to trick Goose (the menu's own item; the landing's end
  // card has a link with the same words, under the open menu), until the note box is in view and takes focus.
  {
    await page.goto(`${base}?desk=1`, { waitUntil: "load" }); // the Desk's landing: since the root swap "/" is the white site
    const t0 = Date.now();
    await openMenu(page);
    await page.locator(".gm-root a, .gm-root button").filter({ hasText: "Try to trick Goose" }).first().click();
    const ready = await page.waitForFunction(() => {
      const b = document.querySelector<HTMLTextAreaElement>("#ds-ch-note");
      if (!b || b.disabled) return false;
      const r = b.getBoundingClientRect();
      if (!(r.height > 0 && r.top >= 0 && r.top < innerHeight - 40)) return false; // its first lines on screen, ready for a tap
      b.focus({ preventScroll: true });
      return document.activeElement === b;
    }, null, { timeout: TRICK_MS * 3, polling: 50 }).then(() => true, () => false);
    const ms = Date.now() - t0;
    await still("trick");
    const where = await page.evaluate(() => {
      const y = (e: Element | null) => (e ? Math.round(e.getBoundingClientRect().top + scrollY) : null);
      const ask = y(document.querySelector('input[aria-label="Ask for anything"]')), h = y(document.querySelector("#ds-ch-h"));
      const between = ask === null || h === null ? [] : [...document.querySelectorAll("main h2")].filter((e) => { const t = y(e)!; return t > ask && t < h; }).map((e) => (e.textContent ?? "").trim().slice(0, 24));
      return `the section is ${h === null || ask === null ? "?" : Math.round((h - ask) / innerHeight * 10) / 10} screens under the Ask box${between.length ? `, after ${between.join(" / ")}` : ""}`;
    });
    const e = errorNotes();
    const ok = ready && ms <= TRICK_MS && !e.bad;
    row(tag, "trick", ok, [ready ? `Menu → note box in view and focused in ${ms} ms${ms > TRICK_MS ? ` (over ${TRICK_MS})` : ""}` : `the note box never came into view with focus (${ms} ms)`, where, ...e.n]);
    if (control) await page.evaluate((u) => fetch(u, { method: "DELETE" }).catch(() => null), `${base}api/health?webkit-walk-control=1`);
  }

  // The landing's real-price range: it draws as it scrolls into view.
  await page.goto(`${base}?desk=1`); await settle(page);
  for (let y = 0; y < 12_000 && !(await page.locator(".c3-to").count()); y += 600) { await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(250); }
  const range = await page.evaluate(() => { const to = document.querySelector(".c3-to"); return to ? { content: getComputedStyle(to, "::before").content, words: (to.parentElement?.textContent ?? "").trim() } : null; });
  {
    const e = errorNotes();
    // After Dec 25 11:10 UTC the recorded prices pass their window and the panel isn't drawn (docs/video-kit/README.md, Dates).
    if (!range) row(tag, "range", !e.bad, ["no real-price range on the landing (expected only after Dec 25 11:10 UTC)", ...e.n]);
    else row(tag, "range", / to /.test(range.content) && !e.bad, [/ to /.test(range.content) ? `"${range.words}" keeps its " to "` : `the dash lost its " to " (content ${range.content})`, ...e.n]);
  }

  // The tour, by the pill's own Next.
  await page.goto(`${base}?desk=tour`); await settle(page);
  await page.locator(".tr-stage .tr-next-go").click();
  for (let i = 1; i <= STOPS; i++) {
    const n = String(i).padStart(2, "0");
    await page.locator(".tp").waitFor({ timeout: 30_000 });
    await settle(page);
    const m = await page.evaluate((broken) => {
      const tp = document.querySelector(".tp") as HTMLElement;
      const b = tp.getBoundingClientRect();
      let o = 1; for (let e: HTMLElement | null = tp; e; e = e.parentElement) o *= +getComputedStyle(e).opacity;
      const ghosts = [...document.querySelectorAll("main *")]
        .filter((e) => e.children.length === 0 && (e.textContent ?? "").trim().length > 2)
        .filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.bottom > 0 && r.top < innerHeight; })
        .filter((e) => { let v = 1; for (let x: Element | null = e; x; x = x.parentElement) v *= +getComputedStyle(x).opacity; return v < 0.2; })
        .map((e) => (e.textContent ?? "").trim().slice(0, 40));
      const ask = document.querySelector<HTMLInputElement>('input[aria-label="Ask for anything"]');
      if (ask && broken) ask.scrollLeft = 0;
      return { label: tp.innerText.replace(/\s+/g, " ").trim(), top: b.top, bottom: b.bottom, left: b.left, right: b.right, o, w: innerWidth, h: innerHeight, ghosts, ask: ask ? { v: ask.value, left: ask.scrollLeft, cw: ask.clientWidth, sw: ask.scrollWidth } : null };
    }, control);
    await still(n);
    const notes = [`pill ${Math.round(m.top)}-${Math.round(m.bottom)} x${Math.round(m.left)}-${Math.round(m.right)}`];
    let ok = true;
    const no = (why: string) => { ok = false; notes.push(why); };
    if (!m.label.includes(n)) no(`the pill says "${m.label.slice(0, 60)}"`);
    if (m.top < -0.5 || m.bottom > m.h + 0.5 || m.left < -0.5 || m.right > m.w + 0.5) no("the pill reaches outside the window");
    if (m.o < 0.99) no(`the pill's opacity is ${m.o.toFixed(2)}`);
    if (m.ghosts.length) no(`still invisible after the fades: ${m.ghosts.slice(0, 4).join(" | ")}`);
    if (i === 2) {
      if (!m.ask?.v) no("no ask waits in the box");
      else if (m.ask.left + m.ask.cw < m.ask.sw - 1) no(`the ask's end is cut: "${m.ask.v}", ${m.ask.sw - m.ask.left - m.ask.cw} px past the box`);
      else notes.push(`ask's end in view: "${m.ask.v}"`);
    }
    const e = errorNotes();
    if (e.bad) ok = false;
    row(tag, n, ok, [...notes, ...e.n]);
    if (i < STOPS) { await page.locator(".tp .tp-next").click(); await page.waitForTimeout(800); }
  }
  await ctx.close();
}

let browser: Browser;
try { browser = await webkit.launch(); } catch (e) {
  console.error(`webkit-walk: WebKit isn't installed. Run: corepack pnpm exec playwright install webkit\n  (${String(e).split("\n")[0]})`);
  process.exit(2);
}
const before = await counter();
console.log(`webkit-walk: WebKit ${browser.version()} on ${base}, GET-only${control ? ", CONTROL (every check below is broken on purpose)" : ""}`);
try {
  await walk(browser, "webkit-390", true);
  await walk(browser, "webkit-1440", false);
} finally { await browser.close(); }
// Every route cold, by the same code Chromium's numbers come from, so the two engines' rows line up.
let coldLines = "";
if (!control && !args.includes("--skip-cold")) {
  const cold = spawnSync(process.execPath, [new URL("./cold-routes.ts", import.meta.url).pathname, base], { env: { ...process.env, ENGINE: "webkit", MODE: "phone" }, encoding: "utf8" });
  coldLines = `${cold.stdout ?? ""}${cold.stderr ?? ""}`.trim();
  const over = coldLines.split("\n").filter((l) => /^OVER|ERRORS:/.test(l)).map((l) => l.replace(/\s+/g, " ").slice(0, 120));
  row("webkit-390", "cold", cold.status === 0, [cold.status === 0 ? "every route's largest paint and room head within 1 s, room LCP printed (WebKit, iPhone 13 UA, unthrottled: a Mac's number)" : `cold-routes exit ${cold.status}: ${over.join(" | ") || "see its lines below"}`]);
}
const after = await counter();
row("all", "writes", writes.length === 0, writes.length ? [`a page tried to write to ${origin} (aborted): ${writes.join(" | ")}`] : [`no request to ${origin} but GET and HEAD`]);
console.log(rows.map((r) => `${r.tag}\t${r.at}\t${r.ok ? "PASS" : "FAIL"}\t${r.notes.join(" · ")}`).join("\n"));
if (coldLines) console.log(`\n${coldLines}\n`);
console.log(`counter before ${before}, after ${after}`);
const fails = rows.filter((r) => !r.ok).length;
if (control) {
  // Every tour stop (a half-faded pill), both trick rows (a hidden note box) and the write guard must be red.
  const meant = rows.filter((r) => /^\d\d$|^trick$|^writes$/.test(r.at));
  const green = meant.filter((r) => r.ok).map((r) => `${r.tag} ${r.at}`);
  console.log(green.length ? `WEBKIT WALK CONTROL FAIL: ${green.length} broken row(s) stayed green, so the walk can't see them: ${green.join(", ")}` : `webkit-walk control: OK (all ${meant.length} broken rows went red)`);
  process.exit(green.length ? 1 : 0);
}
console.log(fails ? `WEBKIT WALK FAIL: ${fails} row(s)` : `webkit-walk: OK (menu, the trick path, range and ${STOPS} stops at 390x844 and 1440x900${coldLines ? ", every route cold at 390" : ""})`);
process.exit(fails ? 1 : 0);
