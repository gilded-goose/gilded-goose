// The two-minute check after Joshua adds AG Studio's key (Joshua, Nov 4 5:03 PM, 2d; docs/guild/ag-keys-landed.md). Read-only: it opens pages
// and clicks nothing that writes, so it is safe on live.
//   node scripts/keys-landed.ts https://gilded-goose.onrender.com
//   KEYS=none node scripts/keys-landed.ts <url>   the same walk with no key in the build: Community, cleanly
//   HANDOVER=only node scripts/keys-landed.ts <url>   only the walk across the shell's handover (needs no build on disk)
// A visitor must never see AG's mark.
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, type Page } from "playwright";
import { bundles } from "./ratchet.ts";
import { licenceEnds } from "../core/src/view/studio-gate.ts";
import { TOUR } from "../core/src/view/tour.ts";

const BASE = (process.argv[2] ?? "").replace(/\/$/, "");
if (!BASE) { console.error("usage: node scripts/keys-landed.ts <url>"); process.exit(2); }
const EXPECT_LIT = process.env.KEYS !== "none";
let bad = 0;
const check = (ok: boolean, what: string) => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };
const LICENCE = /License Key Not Found|Invalid License|Incompatible License|License Expired|Trial Period Expired|Enterprise License|Studio .* License|For Trial Use Only/i;

// goose.test stands in for a public host on a local build: `KEYS=none node scripts/keys-landed.ts http://goose.test:<port>`.
const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP goose.test 127.0.0.1"] });

// Every route's bytes on what's live. CI builds with no key, so the ratchet can't see a licensed page, and whoever holds this
// check can't build with keys. A key changes the page and the hash of every file that holds the licence's facts, so a name from
// the disk's build won't find them: this takes which files make up each route from this SHA's build on disk, by name without the
// hash, and measures each one as live serves it. Q's ruling, Nov 4: the ratchet's line holds on a licensed build too; no override,
// no raised limit. Q ruled on desk; classic and wallet are the tightest under the flip, so all are read.
// `BYTES=only` stops after these rows.
if (process.env.HANDOVER !== "only") try {
  const limits = JSON.parse(readFileSync(new URL("../docs/guild/ratchet.json", import.meta.url), "utf8")) as { limits: Record<string, number>; bundleToleranceBytes: number };
  const body = async (file: string) => { const r = await fetch(`${BASE}/${file}`); if (!r.ok) throw new Error(`${file}: ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
  const NAME = /assets\/[\w.-]+\.(?:js|css)/g;
  const page = await body("");
  // Live's own list of files: the page's, then whatever each of its scripts names, followed to the end.
  const liveSize = new Map<string, number>();
  let wave = [...new Set(page.toString("utf8").match(NAME) ?? [])];
  while (wave.length) {
    const texts = await Promise.all(wave.map(async (f) => { const b = await body(f); liveSize.set(f, b.length); return f.endsWith(".js") ? b.toString("utf8") : ""; }));
    const named = texts.flatMap((t) => [...t.matchAll(/(?:assets\/)?([\w.-]+-[\w-]{8}\.(?:js|css))/g)].map((m) => `assets/${m[1]}`));
    wave = [...new Set(named)].filter((f) => !liveSize.has(f));
    wave = (await Promise.all(wave.map(async (f) => ((await fetch(`${BASE}/${f}`, { method: "HEAD" })).ok ? f : "")))).filter(Boolean);
  }
  const stem = (f: string) => f.replace(/-[\w-]{8}(\.\w+)$/, "$1");
  const liveByStem = new Map<string, string[]>();
  for (const f of liveSize.keys()) liveByStem.set(stem(f), [...(liveByStem.get(stem(f)) ?? []), f]);
  const { files } = bundles();
  const dist = new URL("../web/dist/", import.meta.url);
  // Vite can give two chunks one stem: all of them pair by size, smallest with smallest, so one is never counted twice.
  const allDisk = new Map<string, string[]>();
  for (const n of readdirSync(new URL("assets/", dist))) if (/\.(?:js|css)$/.test(n)) { const f = `assets/${n}`; allDisk.set(stem(f), [...(allDisk.get(stem(f)) ?? []), f]); }
  const onLive = new Map<string, number>();
  for (const [s, disk] of allDisk) {
    const live = liveByStem.get(s) ?? [];
    if (live.length !== disk.length) { if (Object.values(files).flat().some((f) => stem(f) === s)) throw new Error(`live has ${live.length} ${s} and this build ${disk.length}: this isn't the live SHA's build, so check it out and run the web build`); continue; }
    const bySize = (xs: string[], size: (x: string) => number) => [...xs].sort((a, b) => size(a) - size(b));
    const liveSorted = bySize(live, (f) => liveSize.get(f)!);
    bySize(disk, (f) => readFileSync(new URL(f, dist)).length).forEach((f, i) => onLive.set(f, liveSize.get(liveSorted[i]!)!));
  }
  for (const [metric, limit] of Object.entries(limits.limits).filter(([k]) => k.startsWith("bundle."))) {
    const line = limit + limits.bundleToleranceBytes;
    const value = files[metric]!.reduce((sum, f) => sum + (f === "index.html" ? page.length : onLive.get(f)!), 0);
    check(value <= line, `${metric} ${value}, line ${line}: ${value <= line ? `${line - value} B of room` : `${value - line} B over. Keys stay in, the flip waits, no override or raised limit; Track F cuts ${value - line} B that day; still red after 2 hours goes to Q`}`);
  }
} catch (e) { check(false, `bundles unread: ${(e as Error).message}`); }
if (process.env.BYTES === "only") { await browser.close(); process.exit(bad ? 1 : 0); }
async function open(path: string, width: number, height: number) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  const banner: string[] = [];
  page.on("console", (m) => { const t = m.text(); if (LICENCE.test(t)) banner.push(t.slice(0, 120)); else if (m.type() === "error" && !/Failed to load resource/.test(t)) errors.push(t.slice(0, 200)); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  await page.goto(BASE + path, { waitUntil: "load" });
  return { ctx, page, errors, banner };
}
const marks = (page: Page) => page.evaluate(() => ({
  // Only one a visitor could see: AG keeps a hidden mark element in the grid (`ag-hidden`) on a good key too.
  mark: [...document.querySelectorAll<HTMLElement>(".ag-watermark, [class*='watermark']")].filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden").length,
  words: /For Trial Use Only/i.test(document.body.innerText),
}));

// Across the handover. CI builds with no key, so `?desk=ledger` there is the Community ledger: one bar, no shell, nothing to lose. Live's
// page draws a shell and then replaces it with Studio, and whatever the shell held goes with it unless someone carries it (Track T found
// the tour's pill gone at stop 10, Nov 5). Studio's chunk is held back here so these are the same test every time, not a race. GET only.
async function shellHeld(width: number, height: number, tourAt?: number) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.route("**/*", async (r) => {
    const m = r.request().method();
    if (m !== "GET" && m !== "HEAD") return r.abort();
    if (/assets\/Studio-[\w-]+\.js/.test(r.request().url())) await new Promise((go) => setTimeout(go, 6000));
    return r.continue();
  });
  if (tourAt !== undefined) await ctx.addInitScript((at) => { sessionStorage.setItem("goose_tour_at", String(at)); }, tourAt);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?desk=ledger`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".st-shell", { timeout: 30_000 });
  await page.waitForTimeout(1000); // the page's own first second: a tap before React adopts the first paint is another question
  const swapped = (timeout = 60_000) => page.waitForFunction(() => document.querySelector('[data-studio-layer="shown"]') && !document.querySelector(".st-shell"), undefined, { timeout }).then(() => page.waitForTimeout(500));
  const focus = () => page.evaluate(() => { const a = document.activeElement as HTMLElement | null; return a && a !== document.body ? `${a.tagName} ${(a.textContent ?? "").trim().slice(0, 30)}` : "body"; });
  return { ctx, page, swapped, focus };
}
if (EXPECT_LIT) {
  const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
  const stop = TOUR.findIndex((s) => s.id === "ledger");
  for (const [w, h, name] of [[1440, 900, "wide"], [390, 844, "phone"]] as const) {
    {
      const s = await shellHeld(w, h, stop);
      await s.swapped();
      await s.page.waitForTimeout(800);
      const pill = await s.page.evaluate(() => { const on = [...document.querySelectorAll(".tp")].filter((e) => e.getClientRects().length > 0); return { n: on.length, next: (on[0]?.querySelector(".tp-next")?.textContent ?? "").trim() }; });
      check(pill.n === 1 && pill.next.length > 0, `${name} the tour's pill outlives the handover: ${pill.n} drawn, Next says "${pill.next}"`);
      await s.ctx.close();
    }
    {
      const s = await shellHeld(w, h);
      await s.page.locator(".gm-btn:visible").first().click();
      await s.page.waitForSelector(".gm-panel", { timeout: 10_000 }).catch(() => {});
      const open = await s.page.locator(".gm-btn[aria-expanded='true']").count();
      await s.page.waitForTimeout(8000); // Studio's chunk has come and could have taken over by now
      const still = await s.page.evaluate(() => ({ shell: !!document.querySelector(".st-shell"), panel: [...document.querySelectorAll(".gm-panel")].filter((e) => e.getClientRects().length > 0).length }));
      check(open === 1 && still.shell && still.panel === 1, `${name} a menu left open stays open: ${JSON.stringify({ open, ...still })}`);
      await s.page.keyboard.press("Escape");
      await s.swapped().catch(() => {});
      const after = await s.page.evaluate(() => ({ shell: !!document.querySelector(".st-shell"), layer: document.querySelector("[data-studio-layer]")?.getAttribute("data-studio-layer") }));
      const at = await s.focus();
      check(!after.shell && after.layer === "shown" && /Everything Goose does|Menu/.test(at), `${name} closing it lets Studio take over, focus on the menu button: ${JSON.stringify(after)}, ${at}`);
      await s.ctx.close();
    }
    {
      const s = await shellHeld(w, h);
      for (let i = 0; i < 3; i++) await s.page.keyboard.press("Tab");
      const before = await s.focus();
      await s.swapped();
      const after = await s.focus();
      check(before !== "body" && after === before, `${name} focus stays on the same control: ${before} -> ${after}`);
      await s.ctx.close();
    }
    {
      const s = await shellHeld(w, h);
      await s.page.evaluate(() => scrollTo(0, 400));
      await s.page.waitForTimeout(200);
      await s.swapped();
      const y = await s.page.evaluate(() => Math.round(scrollY));
      check(Math.abs(y - 400) <= 1, `${name} the scroll holds: 400 -> ${y}`);
      await s.page.evaluate(axeSource);
      const v = await s.page.evaluate(() => (window as unknown as { axe: { run: (d: Document, o: object) => Promise<{ violations: { id: string }[] }> } }).axe.run(document, { resultTypes: ["violations"] }).then((r) => r.violations.map((x) => x.id)));
      check(v.length === 0, `${name} axe on Studio itself, which CI's walk of this address never meets: ${v.join(", ") || "0 violations"}`);
      const raw = await s.page.evaluate(() => [...document.querySelectorAll("select")].filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).appearance !== "none").map((e) => e.getAttribute("aria-label")));
      check(raw.length === 0, `${name} no raw browser control on Studio (design-holds' rule): ${raw.join(", ") || "none"}`);
      await s.ctx.close();
    }
  }
}
if (EXPECT_LIT) {
  // Edit mode narrows the canvas, and the frames were fitted for the wide page: no card's words may be cut off, with the Data panel shut or open.
  const s = await shellHeld(1440, 1000);
  await s.swapped();
  await s.page.getByRole("button", { name: /edit this view/i }).click();
  await s.page.waitForSelector('.st-studio[data-mode="edit"]', { timeout: 15_000 });
  const cut = () => s.page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".st-studio .st-card[data-widget-id]")].filter((c) => !c.classList.contains("st-every") && c.scrollHeight > c.clientHeight + 1).map((c) => `${c.dataset.widgetId} by ${c.scrollHeight - c.clientHeight} px`));
  await s.page.waitForTimeout(1500);
  const shut = await cut();
  check(shut.length === 0, `edit mode, panels shut: no card cut off (${shut.join(", ") || "none"})`);
  await s.page.getByRole("button", { name: /^data$/i }).or(s.page.getByRole("tab", { name: /^data$/i })).first().click().catch(() => {});
  await s.page.locator("text=/^Data$/").first().click().catch(() => {});
  await s.page.waitForTimeout(1500);
  const open = await cut();
  check(open.length === 0, `edit mode, Data open: no card cut off (${open.join(", ") || "none"})`);
  await s.ctx.close();
}
if (process.env.HANDOVER === "only") { await browser.close(); console.log(bad ? `\nkeys-landed handover: ${bad} failed` : "\nkeys-landed handover: all ok"); process.exit(bad ? 1 : 0); }

for (const [w, h, name] of [[1440, 900, "wide"], [390, 844, "phone"]] as const) {
  // What every visitor opens: the two plain addresses, then the one the DD and the AG judge seat score.
  for (const address of ["/?desk=ledger", "/?desk=studio", "/?desk=studio&studio=force"]) {
    const st = await open(address, w, h);
    await st.page.waitForSelector('.st-studio[data-ready="1"]', { timeout: EXPECT_LIT ? 60_000 : 12_000, state: "attached" }).catch(() => {});
    await st.page.waitForTimeout(2000);
    await st.page.evaluate(() => document.querySelector(".tb-tries")?.scrollIntoView());
    await st.page.waitForTimeout(4000);
    const sm = await marks(st.page);
    const lit = await st.page.evaluate(() => ({
      studio: document.querySelectorAll("[class*='ag-studio']").length,
      ledger: document.querySelectorAll(".lx-main").length,
      route: document.documentElement.getAttribute("data-first-route"),
    }));
    check(sm.mark === 0 && !sm.words, `${name} ${address}: no AG mark`);
    check(st.banner.length === 0, `${name} ${address}: no licence line in the console (${st.banner[0] ?? "none"})`);
    check(st.errors.length === 0, `${name} ${address}: zero console errors${st.errors[0] ? `: ${st.errors[0]}` : ""}`);
    if (EXPECT_LIT) check(lit.studio > 0 && lit.ledger === 0, `${name} ${address}: AG Studio (${lit.studio} elements), so the key is good`);
    // A public host with no key: nobody can type their way to AG's mark, and every address is the Community ledger.
    else if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(BASE).hostname)) check(lit.studio === 0 && lit.route === null && lit.ledger === 1, `${name} ${address}, with no key: the Community ledger, no Studio paint`);
    await st.ctx.close();
  }
}
// The trial's real last day, from the date AG's own manager printed at the build. Only date-shaped words can match, so a key can
// never reach this log. Past that moment the gate is shut for every visitor, whatever the page was built with.
{
  const dates = await browser.newPage();
  const js: Promise<string>[] = [];
  dates.on("response", (r) => { if (/\/assets\/.*\.js$/.test(r.url())) js.push(r.text().catch(() => "")); });
  await dates.goto(`${BASE}/?desk=studio`, { waitUntil: "load" });
  await dates.waitForTimeout(5000);
  const text = (await Promise.all(js)).join("\n");
  const printed = /expiry:"(\d{1,2} [A-Z][a-z]+ \d{4})"/.exec(text)?.[1];
  const ends = printed ? licenceEnds(printed) : null;
  console.log(ends === null ? "NOTE the Studio key: no printed date on this build" : `ok   the Studio key prints ${printed}: off for everyone from ${new Date(ends).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "full", timeStyle: "short" })} PT`);
  await dates.close();
}
await browser.close();
console.log(bad ? `\nkeys-landed: ${bad} failed` : "\nkeys-landed: all ok. Next: the DD and the AG judge seat score the real Studio, phone and desktop.");
process.exit(bad ? 1 : 0);
