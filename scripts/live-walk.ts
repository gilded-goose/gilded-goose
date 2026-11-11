/// <reference lib="dom" />
// The judge path on the live site, after every push (Lead-12 and R, Fri Nov 6). GET ONLY, so it's safe on live: every request to
// the site that isn't GET or HEAD is aborted before it leaves and fails the walk; nothing is clicked. Third-party requests (PayPal's
// own Pay Later script posts to PayPal on every visit, for every visitor) pass and are listed.
//   node scripts/live-walk.ts [https://gilded-goose.onrender.com]     exit 1 on any FAIL
// What it walks, at 390 and 1440: the landing's first load and full scroll against the live pins below, RealMarket's range read
// from the accessibility tree, every tour stop (its subject on screen, its pill's Next), the ledger's and Studio's first paint,
// and no console error, 4xx or 5xx anywhere.
//
// The live pins (measured on live 63750e36, Fri Nov 6 11:49Z): desk-walk's pins (1375/1366, 1421/1412, 1472/1463) are read on a
// keyless seat, which never draws what live draws with Studio, PayPal's sandbox and the scammer AI on. A judge on live reads
// "See it live in AG Studio ›" (+6), "In PayPal sandbox" for "Practice payments on this server" (-2), and after a scroll the
// scammer AI's invitation (+36) and the AI reader chip's live words for its seat-only "off" words (-3 when measured; the
// chip's words are core/src/view/layers.ts's, so read them there): +4 on first load, +37 scrolled. These pins
// are those measured numbers, so they only tighten: live can't grow unseen. Whether judges' real counts stand or get trimmed
// is the DD's ruling (Lead-12's DD list); lower these when live shrinks, never raise them (core/test/landing-calm.test.ts).
// The clock: read at today's 05:30 UTC, the first hour of core's longest greeting, as desk-walk does, so any hour reads the same.
//
// What grew (Lead-12): a landing FAIL names the lines that weren't on live when the pins were measured, each with its words and
// the element that draws it, so nobody has to run a diff. scripts/live-walk-lines.json keeps a hash of every calm line per read
// (hashes, not the words, so the landing's copy isn't duplicated where the claims and word checks would read it as new copy).
// Lower a pin, then re-measure it the same day:  node scripts/live-walk.ts <url> --write-lines
import "./route-closed.ts"; // a route mid-request when its page closes ends quietly, nothing else does
import { readFileSync, writeFileSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright";
import { TOUR } from "@goose/core/tour";
import { greeting } from "../core/src/view/name.ts";

const ARGS = process.argv.slice(2);
const WRITE_LINES = ARGS.includes("--write-lines");
const BASE = (ARGS.find((a) => !a.startsWith("--")) ?? "https://gilded-goose.onrender.com").replace(/\/$/, "");
const HOST = new URL(BASE).host;
const LIVE_FIRST_CALM = { 1440: 1379, 390: 1370 } as const;
const LIVE_FIRST_PAGE = { 1440: 1425, 390: 1416 } as const;
const LIVE_SCROLLED_CALM = { 1440: 1509, 390: 1500 } as const;
const LIVE_WORDS = 139; // desk-walk's cap on the live counter and feed: the most they can draw
const SIZES = [{ width: 390, height: 844 }, { width: 1440, height: 900 }] as const;

const W = (t: string) => t.split(/\s+/).filter((x) => /[\p{L}\d]/u.test(x)).length;
const GREETING_HOUR = Array.from({ length: 24 }, (_, h) => h).reduce((b, h) => (W(greeting(h, null)) > W(greeting(b, null)) ? h : b), 0);
const fixedNow = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), GREETING_HOUR, 30); };
const STUDIO = '[data-studio-layer="shown"] .st-studio[data-ready="1"]';

let fails = 0, passes = 0;
const rec = (item: string, ok: boolean, note: string) => { if (ok) passes++; else fails++; console.log(`${ok ? "PASS" : "FAIL"} ${item}: ${note}`); };

interface Guard { errors: string[]; stopped: string[]; theirs: string[]; failed: string[] }
async function guarded(ctx: BrowserContext): Promise<Guard> {
  const g: Guard = { errors: [], stopped: [], theirs: [], failed: [] };
  await ctx.route("**/*", async (r) => {
    const q = r.request(), u = new URL(q.url());
    if (q.method() === "GET" || q.method() === "HEAD") return r.continue();
    if (u.host !== HOST) { g.theirs.push(`${q.method()} ${u.host}${u.pathname}`); return r.continue(); }
    g.stopped.push(`${q.method()} ${u.pathname}`);
    return r.abort();
  });
  ctx.on("console", (m) => { if (m.type() === "error") g.errors.push(m.text().slice(0, 200)); });
  ctx.on("weberror", (e) => g.errors.push(`thrown: ${String(e.error()).slice(0, 200)}`));
  ctx.on("response", (r) => { if (r.status() >= 400 && new URL(r.url()).host === HOST) g.failed.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  return g;
}
const clean = (g: Guard) => g.errors.length + g.failed.length + g.stopped.length === 0;
const tail = (g: Guard) => `console errors ${g.errors.length}, 4xx/5xx ${g.failed.length}, non-GET stopped ${g.stopped.length}${clean(g) ? "" : ` [${[...g.errors, ...g.failed, ...g.stopped].join(" | ")}]`}${g.theirs.length ? `; third-party let through: ${[...new Set(g.theirs)].join(", ")}` : ""}`;

// The same reader as desk-walk: calm is the page minus the live counter and feed. calmLines is that same calm, line by line.
const landingRead = (p: Page) => p.evaluate(() => {
  const W = (t: string) => t.split(/\s+/).filter((x) => /[\p{L}\d]/u.test(x)).length;
  const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter((l) => W(l) > 0);
  const liveEls = [...document.querySelectorAll<HTMLElement>(".ds-ch-count, .ds-ch-feed")];
  const live = liveEls.reduce((s, e) => s + W(e.innerText), 0);
  const page = W(document.body.innerText);
  const calmLines = lines(document.body.innerText);
  for (const l of liveEls.flatMap((e) => lines(e.innerText))) { const i = calmLines.indexOf(l); if (i >= 0) calmLines.splice(i, 1); }
  return { page, live, calm: page - live, calmLines, numbered: document.querySelectorAll(".ds .ds-n").length,
    counter: document.querySelector<HTMLElement>(".ds-ch-count")?.dataset.tried ?? "blank", greet: document.querySelector<HTMLElement>(".vg-line")?.innerText ?? "(none)" };
});

// Which element draws a line: the smallest element whose text holds it, inside its nearest section.
const nameLines = (p: Page, want: string[]) => p.evaluate((want: string[]) => {
  const label = (e: Element) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${[...e.classList].filter((c) => !/^(ds-in|dk-in|ds-sec)$/.test(c)).slice(0, 2).map((c) => "." + c).join("")}`;
  const all = [...document.body.querySelectorAll<HTMLElement>("*")].filter((e) => e.offsetParent !== null || e.getClientRects().length);
  return want.map((l) => {
    const holders = all.filter((e) => e.innerText?.includes(l));
    const leaf = holders.reduce<HTMLElement | null>((b, e) => (!b || e.innerText.length <= b.innerText.length ? e : b), null);
    const sec = leaf?.closest("section, header, footer, nav, aside, .dk-hero");
    return leaf ? (sec && sec !== leaf ? `${label(sec)} > ${label(leaf)}` : label(leaf)) : "(not found)";
  });
}, want);

// FNV-1a, 32 bits: enough to tell a line that was there from one that wasn't.
const hash = (s: string) => { let h = 0x811c9dc5; for (const c of new TextEncoder().encode(s)) h = Math.imul(h ^ c, 0x01000193) >>> 0; return h.toString(16).padStart(8, "0"); };
const LINES_FILE = new URL("./live-walk-lines.json", import.meta.url);
type LinesFile = { measured: string; reads: Record<string, { calm: number; lines: string[] }> };
const linesBase: LinesFile | null = (() => { try { return JSON.parse(readFileSync(LINES_FILE, "utf8")) as LinesFile; } catch { return null; } })();
const linesNow: LinesFile["reads"] = {};
// What grew against the measured read: each new line with its words and its element; and the words of lines now gone.
// changed: the lines differ from the measured ones at all, even at the same total (a reword), which a PASS reports as CHANGED.
async function grew(p: Page, read: string, calmLines: string[]): Promise<{ note: string; changed: boolean }> {
  linesNow[read] = { calm: calmLines.reduce((s, l) => s + W(l), 0), lines: calmLines.map(hash).sort() };
  const base = linesBase?.reads[read]?.lines;
  if (!base) return { note: "; what grew: no measured lines for this read (scripts/live-walk-lines.json)", changed: false };
  const left = new Map<string, number>(); for (const h of base) left.set(h, (left.get(h) ?? 0) + 1);
  const added: string[] = [];
  for (const l of calmLines) { const h = hash(l), k = left.get(h) ?? 0; if (k) left.set(h, k - 1); else added.push(l); }
  const gone = [...left.values()].reduce((s, k) => s + k, 0);
  const changed = added.length + gone > 0;
  if (!added.length) return { note: `; what grew vs ${linesBase!.measured}: no new line (${gone} line${gone === 1 ? "" : "s"} gone)`, changed };
  const where = await nameLines(p, added);
  const shown = added.map((l, i) => `+${W(l)} ${where[i]} "${l.length > 70 ? l.slice(0, 67) + "..." : l}"`);
  return { note: `; what grew vs ${linesBase!.measured}: ${added.reduce((s, l) => s + W(l), 0)} words in ${added.length} new line${added.length === 1 ? "" : "s"}, ${gone} line${gone === 1 ? "" : "s"} gone: ${shown.slice(0, 8).join("; ")}${shown.length > 8 ? `; and ${shown.length - 8} more` : ""}`, changed };
}
// A reword at the same count passes the pins, but no promise's words change without Joshua (Lead-12, Nov 6): a warning
// Lead reads, never a FAIL (flip if the Q says so). It names the new lines, as a FAIL does.
let changes = 0;
const changedLine = (item: string, note: string) => { changes++; console.log(`CHANGED ${item}: same or fewer words, different lines${note}`); };

const browser = await chromium.launch();
const health = await fetch(`${BASE}/api/health`).then((r) => r.json() as Promise<{ commit?: string }>, () => ({ commit: undefined }));
console.log(`live-walk ${BASE} at ${health.commit?.slice(0, 8) ?? "(no commit)"}, ${new Date().toISOString()} (UTC hour ${new Date().getUTCHours()}); landing clock ${String(GREETING_HOUR).padStart(2, "0")}:30 UTC`);

for (const size of SIZES) {
  const w = size.width;
  { // The landing, first load and a slow full scroll, then RealMarket's range.
    const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, reducedMotion: "reduce", timezoneId: "UTC" });
    const g = await guarded(ctx); const p = await ctx.newPage();
    await p.clock.install({ time: fixedNow() });
    const res = await p.goto(`${BASE}/?desk=1`, { waitUntil: "networkidle", timeout: 60_000 });
    await p.waitForTimeout(2500);
    const n = await landingRead(p);
    // The whole-page pin holds only while the counter is blank (tries on the server add live words); calm always holds.
    const pageOk = n.counter !== "blank" || n.page <= LIVE_FIRST_PAGE[w];
    const firstOk = res?.status() === 200 && n.numbered === 6 && n.calm <= LIVE_FIRST_CALM[w] && pageOk && n.live <= LIVE_WORDS;
    const { note: firstGrew, changed: firstChanged } = await grew(p, `${w} first`, n.calmLines);
    rec(`${w} landing first load`, firstOk,
      `calm ${n.calm}/${LIVE_FIRST_CALM[w]}, page ${n.page}/${LIVE_FIRST_PAGE[w]}${n.counter === "blank" ? "" : ` (n/a: counter "${n.counter}")`}, live ${n.live}/${LIVE_WORDS}, sections ${n.numbered}/6, greeting "${n.greet}"${firstOk ? "" : firstGrew}`);
    if (firstOk && firstChanged) changedLine(`${w} landing first load`, firstGrew);
    for (let i = 0; i < 80; i++) {
      const end = await p.evaluate(() => { scrollBy(0, Math.round(innerHeight * 0.8)); return scrollY + innerHeight >= document.documentElement.scrollHeight - 2; });
      await p.waitForTimeout(150);
      if (end) break;
    }
    await p.waitForLoadState("networkidle").catch(() => {});
    await p.waitForTimeout(2500);
    const s = await landingRead(p);
    const scrolledOk = s.calm <= LIVE_SCROLLED_CALM[w] && s.live <= LIVE_WORDS;
    const { note: scrolledGrew, changed: scrolledChanged } = await grew(p, `${w} scrolled`, s.calmLines);
    rec(`${w} landing scrolled`, scrolledOk, `calm ${s.calm}/${LIVE_SCROLLED_CALM[w]}, page ${s.page}, live ${s.live}/${LIVE_WORDS}${scrolledOk ? "" : scrolledGrew}`);
    if (scrolledOk && scrolledChanged) changedLine(`${w} landing scrolled`, scrolledGrew);
    // The dash is CSS with alternative text " to ", so the text has none and a screen reader hears "to".
    const span = p.locator(".c3-span").first();
    const ax = (await span.count()) ? await span.ariaSnapshot().catch((e) => `aria error ${String(e).slice(0, 80)}`) : "(no .c3-span)";
    rec(`${w} RealMarket range (a11y)`, /\$[\d,]+\.\d\d to \$[\d,]+\.\d\d/.test(ax), JSON.stringify(ax.replace(/\s+/g, " ").slice(0, 100)));
    rec(`${w} landing console`, clean(g), tail(g));
    await ctx.close();
  }
  // Every tour stop as the tour enters it: its index in sessionStorage, its subject on screen, the pill's Next naming the next stop.
  for (const [i, stop] of TOUR.entries()) {
    if (!stop.href) continue;
    const next = TOUR[i + 1];
    const ctx = await browser.newContext({ viewport: size });
    const g = await guarded(ctx);
    // Init scripts run in every frame, PayPal's sandboxed ones too, where sessionStorage throws: only ours, and never throw.
    await ctx.addInitScript(([n, host]: [number, string]) => { try { if (location.host !== host || sessionStorage.getItem("zz-walk")) return; sessionStorage.setItem("zz-walk", "1"); sessionStorage.setItem("goose_tour_at", String(n)); } catch { /* not ours */ } }, [i, HOST] as [number, string]);
    const p = await ctx.newPage();
    const t0 = Date.now();
    const res = await p.goto(`${BASE}/${stop.href}`, { waitUntil: "load", timeout: 60_000 }).catch(() => null);
    const sel = (w < 768 ? stop.subject?.phone : stop.subject?.wide) ?? [];
    let seen = 0;
    for (const s of sel) if (await p.locator(s).first().waitFor({ state: "visible", timeout: stop.id === "ledger" ? 60_000 : 30_000 }).then(() => true, () => false)) seen++;
    const ms = Date.now() - t0;
    const words = await p.locator(".tp .tp-next").first().waitFor({ timeout: 8000 }).then(async () => (await p.locator(".tp .tp-next").first().innerText()).replace(/\s+/g, " ").trim(), () => "");
    await p.waitForTimeout(1500);
    rec(`${w} tour ${i + 1} ${stop.id}`, res?.status() === 200 && seen === sel.length && (next ? words.includes(next.name) : words !== "") && clean(g),
      `${res?.status() ?? "no response"}, subject ${seen}/${sel.length} in ${(ms / 1000).toFixed(1)} s, pill "${words || "none"}"; ${tail(g)}`);
    await ctx.close();
  }
  // The ledger's and Studio's first paint: the words the first HTML paints, then when the live page takes over.
  // ?ledger=full is a grid at 1440 and cards on a phone (licence-expiry-walk.ts), so the phone waits for its words.
  for (const [name, path, ready] of [["ledger, the tour's door", "/?desk=ledger", STUDIO], ["ledger, every decision", "/?ledger=full", w < 768 ? "" : ".lg-grid .ag-row"], ["studio", "/?desk=studio", STUDIO]] as const) {
    const ctx = await browser.newContext({ viewport: size });
    const g = await guarded(ctx); const p = await ctx.newPage();
    const t0 = Date.now();
    const res = await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const first = await p.evaluate(() => ({ words: document.body.innerText.split(/\s+/).filter((x) => /[\p{L}\d]/u.test(x)).length, h: (document.querySelector("h1, h2") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 60) ?? "" }));
    const took = ready === ""
      ? await p.waitForFunction(() => document.body.innerText.split(/\s+/).filter((x) => /[\p{L}\d]/u.test(x)).length > 200, null, { timeout: 60_000 }).then(() => true, () => false)
      : await p.locator(ready).first().waitFor({ state: "attached", timeout: 60_000 }).then(() => true, () => false);
    const ms = Date.now() - t0;
    const fcp = await p.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? -1);
    await p.waitForTimeout(1500);
    rec(`${w} ${name} first paint`, res?.status() === 200 && first.words > 0 && took && clean(g),
      `${res?.status()}, ${first.words} words at first paint ("${first.h}"), FCP ${Math.round(fcp)} ms, live page ${took ? `in ${(ms / 1000).toFixed(1)} s` : "never (60 s)"}; ${tail(g)}`);
    await ctx.close();
  }
}
await browser.close();
if (WRITE_LINES) {
  writeFileSync(LINES_FILE, JSON.stringify({ measured: `${health.commit?.slice(0, 8) ?? "(no commit)"} at ${new Date().toISOString().slice(0, 16)}Z`, reads: linesNow }, null, 1) + "\n");
  console.log(`live-walk: wrote ${Object.keys(linesNow).length} reads' line hashes to scripts/live-walk-lines.json`);
}
console.log(`live-walk: ${passes} PASS, ${fails} FAIL${changes ? `, ${changes} CHANGED (words differ from the measured lines; Lead reads them)` : ""}`);
process.exit(fails ? 1 : 0);
