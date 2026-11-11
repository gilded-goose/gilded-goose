// Usage: [ENGINE=chromium|webkit] [MODE=desk|phone] [RUNS=3] [BUDGET_MS=1000] [ROOMS_ONLY=1] [ONLY=/?desk=studio,/?desk=ledger] [AS_LIVE_MS=500] node scripts/cold-routes.ts [base-url]
// AS_LIVE_MS: a local server answers instantly and says "fake", so a line waiting on /api/health passes here and fails on
// live (the wallet's password warning, Nov 4: 2.9 s on live, green here). This holds every /api/ call back that long and has
// health say what live says.
// Joshua (Nov 3): "verify every route loads cold in under 1 s". Every route, in a fresh browser context each run (no cache,
// no cookies), at desktop on the machine's own network and on a phone (390, 1.6 Mbps / 150 ms, 4x CPU). Prints the median
// first byte, first paint and largest paint, plus console errors and failed requests. Exits 1 if any route's median largest
// paint (a hash room's too, and its head on screen) is over budget or any run has an error, so "cold" is a number and not a feeling.
//
// This proves a cold BROWSER. A cold SERVER is a separate question: run it as the first request after 20+ idle minutes, and
// read the first run's first byte. Reads pages only; it never posts a try, so it can't move the counter.
//
// Each room's own largest paint (Lead-12, Fri Nov 6, judge-path speed): the browser's LCP is the page's, not the room's, and it
// only reports something larger than before, so a cover or a hero can stand in for a room that's still coming. For #challenge
// and every room the tour opens (TOUR's own href and subject), each frame notes when every element in the room's section first
// shows in the window; the room's largest one on screen at the end gives "room LCP": when it showed. ROOM_LCP_PINS are
// measured on a local seat of 570df989 (Fri Nov 6), so they only tighten (core/test/cold-routes-pins.test.ts); a row
// over its pin fails. The phone row is a MODEL on this Mac (390, 1.6 Mbps / 150 ms, 4x CPU), not a phone, and says so.
// Judge the pins only on a quiet Mac: `sh scripts/heavy-lock.sh node scripts/cold-routes.ts <seat>`. Beside a build, #challenge
// read 580 ms on desk against 473 under the lock.
//
// ENGINE=webkit (Track P, Fri Nov 6) runs the same rows, rooms and verdict in Safari's engine: the phone is the iPhone 13
// profile at 390x844, the desk Desktop Safari at 1440x900. WebKit has no CDP, so it can't take the phone's network and CPU
// throttle: its numbers are a Mac's, never a phone's, and each mode's header says which profile it used (Lead-12). ROOM_LCP_PINS
// are Chromium's, measured throttled, so under WebKit each room's own largest paint is printed, never judged against them;
// a room never seen still fails. Every engine fails a row on a write to the site: this only reads.
import "./route-closed.ts"; // a route mid-request when its page closes ends quietly, nothing else does
import { chromium, devices, webkit } from "playwright";
import { TOUR } from "@goose/core/tour";

const BASE = (process.argv[2] ?? "https://gilded-goose.onrender.com").replace(/\/$/, "");
const RUNS = Number(process.env.RUNS ?? 3);
const BUDGET = Number(process.env.BUDGET_MS ?? 1000);
const AS_LIVE_MS = Number(process.env.AS_LIVE_MS ?? 0);
// The same list as scripts/postdeploy-check.ts ROUTES.
const ROUTES = ["/", "/?wallet=1", "/?wallet=0", "/?desk=1", "/?market=1", "/?desk=haggle", "/?desk=ledger", "/?desk=studio",
  "/?desk=proof", "/?desk=tour", "/safe.html", "/?desk=system", "/?desk=how", "/?desk=builders", "/?desk=list"];
// A hash room (a11y and speed panel, Round 5): the page has no hero to paint for these, so each is also timed until the
// room's head is on screen, and the budget reads both that and its largest paint (until Nov 6 only the head). "Try to
// break it" is #challenge. The head first shows on the room's cover (prerender.ts), so each row also gives when the room
// itself took over ("room's own"): the budget must not hide a long wait behind a painted head. And the two heads must be
// one head: the same words, and the cover's in the place the room's lands (`STEP_PX`, else the row fails).
const STEP_PX = 12;
const ROOMS: Record<string, string> = {
  "/?desk=1#challenge": "#ds-ch-h",
  "/?desk=1#after": "#ap-room-h",
  "/?desk=1#wants": ".dk-work .dk-pane-h",
  "/?desk=1#week": ".dk-work .dk-pane-h",
  "/?desk=1#settings": ".dk-work .dk-pane-h",
};
// Behind the scenes (Joshua's AG Grid message, item 4): its largest paint is the first lines the build draws, so that number
// can't say when the board itself came, a lazy chunk on either page. Each row also gives when the board's own markup took
// its room ("board landed") and when it holds the record's own counts ("board counted"). Community's board and the Studio
// dashboard are both read, so the same line holds the day the key lands. Printed beside the row; never found fails.
const BOARDS: Record<string, { landed: string; counted: string; dashboard?: string }> = {};
for (const route of ["/?desk=studio", "/?desk=ledger", "/?desk=studio&studio=force"]) BOARDS[route] = { // force: the real Studio. Its first paint is only on a licensed build, so drill it on GOOSE_FLIP_REHEARSAL=1 until a key lands
  landed: '[data-board="fallback"], [data-board="shell"]',
  counted: '[data-board="fallback"] .tb-line[data-tried]:not([data-tried=""]), [data-board="shell"] .tb-line[data-tried]:not([data-tried=""])',
  // STUDIO_LIT=1, on a flip build: the plain addresses are the real Studio too, and that's what every visitor's phone pays.
  ...(route.includes("force") || process.env.STUDIO_LIT ? { dashboard: '[data-studio-layer="shown"] .st-studio[data-ready="1"]' } : {}),
};
// AG Grid item 4 (Joshua, Nov 4): the board's own arrival has a budget, not only a reading; measured quiet, 044 has the runs.
// Forced Studio only, with the record's count already on the shell: the dashboard behind it, ready to take over. Measured quiet on the drill (Nov 4).
// Well under Shell.tsx's 15 s safety timer past the chunk's arrival, so a "placed" signal that dies fails here instead of reading as a slow load (it read 25.8 s on the phone).
const DASHBOARD_BUDGET = { phone: Number(process.env.DASHBOARD_PHONE_MS ?? 13000), desk: Number(process.env.DASHBOARD_DESK_MS ?? 1500) };
const BOARD_BUDGET = { phone: Number(process.env.BOARD_PHONE_MS ?? 3200), desk: Number(process.env.BOARD_DESK_MS ?? 1000) };
// Every room the tour opens, by the tour's own subject; #challenge is the trick stop's. Its section is the room.
const ROOM_SUBJECT: Record<string, { desk: readonly string[]; phone: readonly string[] }> = {};
for (const s of TOUR) if (s.href) ROOM_SUBJECT[`/${s.href}`] ??= { desk: s.subject.wide, phone: s.subject.phone };
const TOUR_ROUTES = Object.keys(ROOM_SUBJECT);
// Measured on a local seat of 570df989 (Fri Nov 6, 15:10Z, heavy lock): the higher of two RUNS=5 medians, plus 5%, rounded
// up to 50 ms. Lower when a room gets faster (MEASURE_PINS=1 prints the medians); never raise.
// #watcher, #ask, #talk and the list: re-measured on a local seat of this branch (Fri Nov 6, ~20:30Z, heavy lock, two RUNS=5
// passes) once those three hashes took the landing's own first paint (web/prerender.ts LANDING_HASHES) and the list painted early.
// #challenge and #wants: R's phone table on 639afb1e (Fri Nov 6), once the head started their reads and the cover drew the
// room (3300 → 1000 for #wants). #challenge's phone is 3400 → 650: the head, first on the cover, once R's c4a62ca4 credits the
// cover against where the room lands (it renders at y 666 under the cover first): medians 494 (R, push 19) and 547 (F, 18f
// with c4a62ca4, worst of five 570), pinned at R's table's 650 so a slow seat doesn't read noise as a regression (Lead-12,
// Nov 6). Never apart from c4a62ca4: under the first-sighting credit this room reads ~2070.
const ROOM_LCP_PINS: Record<string, { desk: number; phone: number }> = {
  "/?desk=1#challenge": { desk: 500, phone: 650 },
  "/?desk=1#after": { desk: 200, phone: 2250 },
  "/?desk=1#wants": { desk: 400, phone: 1000 },
  "/?desk=1#settings": { desk: 400, phone: 3100 },
  "/?desk=1#watcher": { desk: 150, phone: 650 },
  "/?wallet=1#approve": { desk: 200, phone: 2900 },
  "/?desk=1#ask": { desk: 150, phone: 650 },
  "/?desk=1#talk": { desk: 100, phone: 600 },
  "/?desk=haggle": { desk: 550, phone: 2400 },
  "/?desk=list": { desk: 100, phone: 650 },
  "/?desk=ledger": { desk: 250, phone: 3100 },
  "/?desk=proof": { desk: 50, phone: 650 },
};
const only = process.env.ONLY?.split(",");
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

const SAFARI = process.env.ENGINE === "webkit";
const browser = await (SAFARI ? webkit : chromium).launch();
const PROFILE = SAFARI
  ? { desk: `WebKit ${browser.version()}, Desktop Safari UA, 1440x900, unthrottled: a Mac's number`, phone: `WebKit ${browser.version()}, iPhone 13 UA, 390x844, UNTHROTTLED (WebKit has no CDP): a Mac's number, not a phone's` }
  : { desk: "1440x900, this Mac's network and CPU", phone: "a phone MODEL on this Mac: 390x844 @3x, 1.6 Mbps / 150 ms, 4x CPU" };
let bad = 0;
const measured: Record<string, { desk: number; phone: number }> = {};
for (const mode of (process.env.MODE ? [process.env.MODE] : ["desk", "phone"]) as ("desk" | "phone")[]) {
  console.log(`\n${mode} (${PROFILE[mode]}): route, first byte / first paint / largest paint in ms (median of ${RUNS}), first run's first byte`);
  const rooms = [...new Set([...Object.keys(ROOMS), ...TOUR_ROUTES])];
  for (const route of only ?? (process.env.ROOMS_ONLY ? rooms : [...new Set([...ROUTES, ...rooms])])) {
    const head = ROOMS[route];
    const board = BOARDS[route];
    const subject = ROOM_SUBJECT[route]?.[mode];
    const rows: { ttfb: number; fcp: number; lcp: number; el: string; js: number; kb: number; room: number; own: number; step: number; words: string; landed: number; counted: number; dashboard: number; roomLcp: number; roomEl: string }[] = [];
    const errs = new Set<string>();
    for (let i = 0; i < RUNS; i++) {
      const ctx = await browser.newContext(SAFARI
        ? { ...devices[mode === "phone" ? "iPhone 13" : "Desktop Safari"], viewport: mode === "phone" ? { width: 390, height: 844 } : { width: 1440, height: 900 } }
        : mode === "phone"
          ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
          : { viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      page.on("console", (m) => { if (m.type() === "error") errs.add(m.text().slice(0, 120)); });
      page.on("pageerror", (e) => errs.add(`pageerror ${e.message.slice(0, 120)}`));
      page.on("response", (r) => { if (r.status() >= 400) errs.add(`${r.status()} ${r.url()}`); });
      // Read-only, watched, not routed: a route on every request would slow the very loads this times. A write fails the row.
      page.on("request", (r) => { if (!["GET", "HEAD"].includes(r.method()) && r.url().startsWith(BASE)) errs.add(`a ${r.method()} to ${r.url()}: this walk only reads`); });
      if (mode === "phone" && !SAFARI) {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      }
      if (AS_LIVE_MS) await page.route(/\/api\//, async (r) => {
        await new Promise((x) => setTimeout(x, AS_LIVE_MS));
        if (!/\/api\/health/.test(r.request().url())) return r.continue();
        const res = await r.fetch();
        await r.fulfill({ json: { ...(await res.json()), payment: "sandbox" } });
      });
      await page.addInitScript(() => {
        const w = window as unknown as { __lcp: number; __lcpEl: string };
        w.__lcp = 0; w.__lcpEl = "";
        try { new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { startTime: number; element?: Element; size: number }[]) { w.__lcp = e.startTime; w.__lcpEl = `${e.element?.tagName ?? "?"}.${String(e.element?.className ?? "").slice(0, 28)} ${Math.round(e.size)}px²`; } }).observe({ type: "largest-contentful-paint", buffered: true }); } catch { /* no LCP here */ }
      });
      // Each frame: when a head is first in the window and can be seen, and when it's the room's own with the cover gone.
      // Never found reads as 0, and fails below.
      if (head) await page.addInitScript((sel: string) => {
        const w = window as unknown as { __roomAt: number; __own: number; __step: number; __words: string };
        w.__roomAt = 0; w.__own = 0; w.__step = 0; w.__words = "";
        const seen = (h: Element | null) => {
          const r = h?.getBoundingClientRect();
          return h && r && r.height > 0 && r.top >= 0 && r.top < innerHeight && h.checkVisibility({ opacityProperty: true, visibilityProperty: true }) ? r : null;
        };
        let cover: { top: number; left: number; text: string } | null = null;
        const look = () => {
          const painted = document.querySelector("#dk-room-first .dk-pane-h");
          const pr = seen(painted);
          if (pr) cover = { top: pr.top, left: pr.left, text: painted!.textContent ?? "" };
          const own = document.querySelector(`#root ${sel}`);
          const or = seen(own);
          if ((pr || or) && !w.__roomAt) w.__roomAt = performance.now();
          if (or && !document.getElementById("dk-room-first")) {
            w.__own = performance.now();
            if (cover) { w.__step = Math.max(Math.abs(or.top - cover.top), Math.abs(or.left - cover.left)); if (cover.text !== own!.textContent) w.__words = `${cover.text} / ${own!.textContent}`; }
            return;
          }
          requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      }, head);
      // The room's own largest paint: each frame, every element of the room's section that holds its own text or is an image,
      // with the time it first showed in the window. Seen ones are skipped; node stops the loop once the page has settled.
      // The cover (#dk-room-first, prerender.ts) paints a room's copy before the room does (F, Nov 6: #challenge's counter lines).
      // Its copy counts as the room's paint only if the text is the room's and its box is where the room's lands (STEP_PX),
      // the head's own rule above; so each cover element keeps when it first showed, its text and its last box.
      if (subject) await page.addInitScript((sel: string) => {
        type Box = { top: number; left: number; width: number; height: number };
        const w = window as unknown as { __roomSeen: Map<Element, { at: number; box: Box; text: string }>; __coverSeen: Map<Element, { at: number; text: string; box: Box }>; __roomStop: boolean };
        w.__roomSeen = new Map(); w.__coverSeen = new Map(); w.__roomStop = false;
        const MEDIA = /^(IMG|SVG|CANVAS|VIDEO|PICTURE)$/i;
        const paints = (e: Element) => MEDIA.test(e.tagName) || [...e.childNodes].some((n) => n.nodeType === 3 && /\S/.test(n.textContent ?? ""));
        const shown = (e: Element): Box | null => {
          const b = e.getBoundingClientRect();
          return b.width * b.height > 0 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth && e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) ? { top: b.top, left: b.left, width: b.width, height: b.height } : null;
        };
        const look = () => {
          if (w.__roomStop) return;
          const now = performance.now();
          for (const e of document.querySelectorAll("#dk-room-first *")) {
            const box = paints(e) ? shown(e) : null;
            if (box) w.__coverSeen.set(e, { at: w.__coverSeen.get(e)?.at ?? now, text: (e.textContent ?? "").trim(), box });
          }
          const roots = [...new Set([...document.querySelectorAll(sel)].filter((s) => !s.closest("#dk-room-first")).map((s) => s.closest("section, .dk-work, main") ?? s))];
          for (const r of roots) for (const e of [r, ...r.querySelectorAll("*")]) {
            if (w.__roomSeen.has(e) || !paints(e)) continue;
            const box = shown(e);
            if (box) w.__roomSeen.set(e, { at: now, box, text: (e.textContent ?? "").trim() });
          }
          requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      }, subject.join(", "));
      if (board) await page.addInitScript((b: { landed: string; counted: string; dashboard?: string }) => {
        const w = window as unknown as { __landed: number; __counted: number; __dashboard: number };
        w.__landed = 0; w.__counted = 0; w.__dashboard = 0;
        const look = () => {
          if (!w.__landed && document.querySelector(b.landed)) w.__landed = performance.now();
          if (!w.__counted && document.querySelector(b.counted)) w.__counted = performance.now();
          if (b.dashboard && !w.__dashboard && document.querySelector(b.dashboard)) w.__dashboard = performance.now();
          if (!w.__counted || (b.dashboard && !w.__dashboard)) requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      }, board);
      await page.goto(BASE + route, { waitUntil: "load", timeout: 90_000 });
      if (head) await page.waitForFunction(() => (window as unknown as { __own: number }).__own > 0, undefined, { timeout: 30_000 }).catch(() => errs.add(`the room's head (${head}) never came on screen`));
      if (board) await page.waitForFunction(() => (window as unknown as { __counted: number }).__counted > 0, undefined, { timeout: 30_000 }).catch(() => errs.add("the board never held the record's counts"));
      if (board?.dashboard) await page.waitForFunction(() => (window as unknown as { __dashboard: number }).__dashboard > 0, undefined, { timeout: 45_000 }).catch(() => errs.add("the dashboard never took over"));
      if (subject) await page.locator(subject.join(", ")).first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => errs.add(`the room's subject (${subject.join(", ")}) never came on screen`));
      await page.waitForTimeout(AS_LIVE_MS ? 4000 : 1500);
      // The room's largest element on screen now (its text's own box, as LCP measures text), and when it first showed.
      const roomRead = subject ? await page.evaluate((stepPx: number) => {
        type Box = { top: number; left: number; width: number; height: number };
        const w = window as unknown as { __roomSeen: Map<Element, { at: number; box: Box; text: string }>; __coverSeen: Map<Element, { at: number; text: string; box: Box }>; __roomStop: boolean };
        w.__roomStop = true;
        let best: { at: number; area: number; el: Element | null; box: Box | null } = { at: 0, area: 0, el: null, box: null };
        for (const [e, { at, box }] of w.__roomSeen) {
          if (!e.isConnected || !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
          const range = document.createRange(); range.selectNodeContents(e);
          const b = /^(IMG|SVG|CANVAS|VIDEO|PICTURE)$/i.test(e.tagName) ? e.getBoundingClientRect() : range.getBoundingClientRect();
          const area = Math.max(0, Math.min(b.right, innerWidth) - Math.max(b.left, 0)) * Math.max(0, Math.min(b.bottom, innerHeight) - Math.max(b.top, 0));
          if (area > best.area) best = { at, area, el: e, box };
        }
        if (!best.el) return { roomLcp: 0, roomEl: "" };
        const e = best.el, label = `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.classList[0] ? "." + e.classList[0] : ""} ${Math.round(best.area)}px²`;
        // The same words, painted earlier on the cover in the same box (within STEP_PX on every edge), are the room's paint.
        // "The same box" is where the room's element has landed now, not where it was first seen: since push 17 the Challenge
        // renders under the cover at y 666 before the Desk lifts it to y 107 (F, Nov 6), and no reader ever sees that frame.
        const r = e.getBoundingClientRect(), landed: Box = { top: r.top, left: r.left, width: r.width, height: r.height };
        const text = (e.textContent ?? "").trim(), near = (a: Box, b: Box) => [a.top - b.top, a.left - b.left, a.width - b.width, a.height - b.height].every((d) => Math.abs(d) <= stepPx);
        // The page's own first paint counts the same way: a prerendered node (the landing's, for `#ask`, `#talk`, `#watcher`) that
        // React replaced with the same words in the same box was on screen first (R, Nov 6: #ask's words at 544 ms, the
        // replacement at ~1400). Only a replaced node: one still connected is the room's own and already in the race above.
        const replaced = [...w.__roomSeen.entries()].filter(([n]) => !n.isConnected).map(([, v]) => v);
        const early = [...w.__coverSeen.values(), ...replaced].filter((c) => text && c.text === text && near(c.box, landed) && c.at < best.at).sort((a, b) => a.at - b.at)[0];
        const from = early && replaced.includes(early as (typeof replaced)[number]) ? "first paint" : "cover";
        return early ? { roomLcp: Math.round(early.at), roomEl: `${label}, first on the ${from} (room's own ${Math.round(best.at)})` } : { roomLcp: Math.round(best.at), roomEl: label };
      }, STEP_PX) : { roomLcp: 0, roomEl: "" };
      rows.push({ ...roomRead, ...await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
        const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const before = res.filter((r) => r.responseEnd < fcp);
        const w = window as unknown as { __roomAt?: number; __own?: number; __step?: number; __words?: string; __landed?: number; __counted?: number; __dashboard?: number };
        return { room: Math.round(w.__roomAt ?? 0), own: Math.round(w.__own ?? 0), step: Math.round(w.__step ?? 0), words: w.__words ?? "", landed: Math.round(w.__landed ?? 0), counted: Math.round(w.__counted ?? 0), dashboard: Math.round(w.__dashboard ?? 0), ttfb: Math.round(nav.responseStart), fcp: Math.round(fcp), lcp: Math.round((window as unknown as { __lcp: number }).__lcp), el: (window as unknown as { __lcpEl: string }).__lcpEl,
          js: res.filter((r) => r.initiatorType === "script").length, kb: Math.round(before.reduce((n, r) => n + r.transferSize, nav.transferSize) / 1024) };
      }) });
      await ctx.close();
    }
    const first = rows[0]!;
    const lcp = median(rows.map((r) => r.lcp));
    const room = median(rows.map((r) => r.room));
    const own = median(rows.map((r) => r.own));
    const step = Math.max(...rows.map((r) => r.step));
    for (const r of rows) if (r.words) errs.add(`the cover's head and the room's differ: ${r.words}`);
    if (step > STEP_PX) errs.add(`the head moved ${step} px when the room took over`);
    const counted = median(rows.map((r) => r.counted));
    if (board && !(counted > 0 && counted <= BOARD_BUDGET[mode])) errs.add(`the board held the record's count at ${counted} ms, over its ${BOARD_BUDGET[mode]} ms`);
    const dashboard = median(rows.map((r) => r.dashboard));
    // The median hides a bad run, and a 17,177 ms one stood unexplained (Nov 5), so the worst is always printed beside it. The budget stays on the median.
    if (board) console.log(`     ${route}: worst of ${RUNS}, board counted ${Math.max(...rows.map((r) => r.counted))} ms, dashboard ${Math.max(...rows.map((r) => r.dashboard))} ms`);
    if (board?.dashboard && !(dashboard > 0 && dashboard <= DASHBOARD_BUDGET[mode])) errs.add(`the dashboard took over at ${dashboard} ms, over its ${DASHBOARD_BUDGET[mode]} ms`);
    // The room's own largest paint against its pin: never seen fails, and so does a room with no pin (MEASURE_PINS=1 prints them).
    const roomLcp = median(rows.map((r) => r.roomLcp));
    const pin = SAFARI ? undefined : ROOM_LCP_PINS[route]?.[mode]; // Chromium's, measured throttled: printed in WebKit, not judged
    if (subject) {
      (measured[route] ??= { desk: 0, phone: 0 })[mode] = roomLcp;
      if (!(roomLcp > 0)) errs.add(`the room's largest paint was never seen (${subject.join(", ")})`);
      else if (pin === undefined) { if (!process.env.MEASURE_PINS && !SAFARI) errs.add(`room LCP ${roomLcp} ms has no pin`); }
      else if (!(roomLcp <= pin)) errs.add(`room LCP ${roomLcp} ms, over its pin ${pin} ms (${rows[Math.floor(rows.length / 2)]?.roomEl ?? ""})`);
    }
    // Every row is judged on its own largest paint, a hash room's too, and a hash room's head must also be on screen in
    // budget (Lead-12, Nov 6; F's catch): judged on the head alone, #challenge read "ok" at 560 ms while its counter, the largest thing
    // on its screen, came at 2.9 s on live. A number that isn't one fails: NaN > 1000 is false, and it read "ok".
    const over = !(lcp <= BUDGET) || (head !== undefined && !(room <= BUDGET));
    if (over || errs.size) bad++;
    if (subject) console.log(`     ${route}: room LCP ${roomLcp}${SAFARI ? " (Chromium's pins not applied)" : pin === undefined ? " (no pin)" : `/${pin}`} ms, worst ${Math.max(...rows.map((r) => r.roomLcp))}, largest ${rows.find((r) => r.roomLcp === roomLcp)?.roomEl ?? "?"}`);
    console.log(`${over ? "OVER" : "ok  "} ${route.padEnd(16)} ${String(median(rows.map((r) => r.ttfb))).padStart(5)} / ${String(median(rows.map((r) => r.fcp))).padStart(5)} / ${String(lcp).padStart(5)}   first ${first.ttfb}  ${first.kb} KB before first paint, ${first.js} scripts, largest ${first.el}${errs.size ? `  ERRORS: ${[...errs].join(" | ")}` : ""}${head ? `   room's head ${room}, room's own ${own}, step ${step} px` : ""}${board ? `   board landed ${median(rows.map((r) => r.landed))}, board counted ${median(rows.map((r) => r.counted))}${board.dashboard ? `, dashboard ${dashboard}` : ""}` : ""}`);
  }
}
await browser.close();
const engine = SAFARI ? " (WebKit, unthrottled)" : "";
if (process.env.MEASURE_PINS) console.log(`\nmeasured room LCP medians${engine}, ms:\n${Object.entries(measured).map(([r, m]) => `  "${r}": { desk: ${m.desk}, phone: ${m.phone} },`).join("\n")}`);
console.log(bad ? `\ncold-routes${engine}: ${bad} route/mode rows over ${BUDGET} ms or with errors` : `\ncold-routes${engine}: every route under ${BUDGET} ms, no errors`);
process.exit(bad ? 1 : 0);
