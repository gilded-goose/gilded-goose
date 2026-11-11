// Usage: node scripts/board-faults.ts [seat-url] [route]   (a LOCAL seat: sh scripts/seat-server.sh 8801, after a build)
// The board's counter under the faults a real network has (Lead-12 and Track P, Fri Nov 6). On live, one WebKit load in 13
// kept the ledger board at "Reading the record…" past 30 s: one /api/challenge answer that stalled, with no error and no
// status, and the board waited on it for good. And a lost board chunk left no counter at all. Each fault here is injected
// in the browser, in WebKit and Chromium at 390x844, and the counter must end on a number or on the named failure, never
// blank and never "Reading" for good. GET-only: anything else to the seat is aborted. Exits 1 on any FAIL.
// Refuses a live address: it's a seat's check, and a fault on live would only be a judge's bad load.
import { chromium, webkit, type Page } from "playwright";
import { BOARD_LOADING, BOARD_UNAVAILABLE } from "../web/src/studio/board-first-words.ts";

const base = (process.argv[2] ?? "http://localhost:8801").replace(/\/$/, "");
const route = process.argv[3] ?? "/?desk=ledger";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) { console.error(`board-faults: a local seat only, not ${base}`); process.exit(2); }

type Act = "hang" | "abort" | "503" | "ok";
type End = "number" | "named";
// `at`: when the counter must have ended, ms after the page starts: two bounded reads (6 s each) and room to draw.
const FAULTS: { name: string; on: (url: string, n: number) => Act; end: End; at: number }[] = [
  { name: "no fault", on: () => "ok", end: "number", at: 5000 },
  { name: "the record's answer stalls once, then answers", on: (u, n) => (/\/api\/challenge/.test(u) && n === 1 ? "hang" : "ok"), end: "number", at: 10_000 },
  { name: "the record's answer stalls every time", on: (u) => (/\/api\/challenge/.test(u) ? "hang" : "ok"), end: "named", at: 15_000 },
  { name: "the record's answer is aborted every time", on: (u) => (/\/api\/challenge/.test(u) ? "abort" : "ok"), end: "named", at: 5000 },
  { name: "the record answers 503 once, then answers", on: (u, n) => (/\/api\/challenge/.test(u) && n === 1 ? "503" : "ok"), end: "number", at: 10_000 },
  { name: "the board's chunk is lost", on: (u) => (/\/assets\/ThreatBoard-[^/]*\.js$/.test(u) ? "abort" : "ok"), end: "named", at: 5000 },
];

/** Every counter line on the page, as "<board mark>: <text> [tried]"; none at all reads as blank. */
const counters = (page: Page) => page.evaluate(() => [...document.querySelectorAll(".tb-line")].map((l) => ({
  mark: l.closest("[data-board]")?.getAttribute("data-board") ?? "?",
  text: (l.textContent ?? "").trim(),
  tried: l.getAttribute("data-tried"),
})));

let fails = 0;
for (const [name, type] of [["webkit", webkit], ["chromium", chromium]] as const) {
  const browser = await type.launch().catch(() => null);
  if (!browser) { console.error(`board-faults: ${name} isn't installed (corepack pnpm exec playwright install ${name})`); process.exit(2); }
  for (const f of FAULTS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    let n = 0;
    await ctx.route("**/*", async (r) => {
      const q = r.request();
      if (q.method() !== "GET" && q.method() !== "HEAD") return r.abort();
      if (/\/api\/challenge/.test(q.url())) n++;
      const act = f.on(q.url(), n);
      if (act === "hang") return; // never answered: a stall, not an error
      if (act === "abort") return r.abort("failed");
      if (act === "503") return r.fulfill({ status: 503, body: "" });
      return r.continue();
    });
    const page = await ctx.newPage();
    const t0 = Date.now();
    void page.goto(base + route, { waitUntil: "commit" }).catch(() => {});
    // Read every 250 ms until `at`: a blank moment after the first paint fails as surely as a bad end.
    let blank = 0, last: Awaited<ReturnType<typeof counters>> = [];
    while (Date.now() - t0 < f.at) {
      await page.waitForTimeout(250);
      last = await counters(page).catch(() => []);
      if (Date.now() - t0 > 1500 && last.length === 0) blank++;
    }
    const shown = last.map((c) => c.text);
    const numbered = last.some((c) => c.tried !== null && c.tried !== "");
    // "named": the failure's own line, or the record's words when the early answer brought them (the held lines carry no data-tried).
    const ended = f.end === "number" ? numbered : shown.some((t) => t === BOARD_UNAVAILABLE) || numbered || last.some((c) => c.mark === "held" && c.text !== "" && c.text !== BOARD_LOADING);
    const stuck = shown.every((t) => t === BOARD_LOADING);
    const ok = blank === 0 && last.length > 0 && ended && !stuck;
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(8)} ${f.name.padEnd(46)} at ${f.at / 1000} s: ${last.map((c) => `${c.mark}: "${c.text}"`).join(" ") || "NO COUNTER"}${blank ? `  (blank ${blank}x)` : ""}  (asked the record ${n}x)`);
    await ctx.close();
  }
  await browser.close();
}
console.log(fails ? `\nboard-faults: ${fails} FAIL` : "\nboard-faults: OK, the counter ends on a number or a named failure under every fault, never blank");
process.exit(fails ? 1 : 0);
