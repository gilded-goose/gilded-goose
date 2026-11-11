// The Challenge's counter against a running server, live included: GETs only, so it can never add to what it reads. The
// counts must equal the fold of the served rows, every row must be exactly the closed-list fields, and the landing must
// say exactly what `challengeWords` makes of those counts (Joshua: "the claims row probes the live counts").
//
//   node scripts/challenge-probe.ts [url]              default http://localhost:8787/
//   node scripts/challenge-probe.ts [url] --api-only   skip the page (no browser)

import { chromium } from "playwright";
import { challengeWords, countsOf, parseAttempt, type ChallengeBoard, type ChallengeCounts } from "@goose/core/attempts";

const args = process.argv.slice(2);
const apiOnly = args.includes("--api-only");
const base = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:8787/").replace(/\/?$/, "/");
const fails: string[] = [];
const fail = (s: string) => { fails.push(s); console.error(`CHALLENGE FAIL ${s}`); };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function board(): Promise<{ b: ChallengeBoard; headers: Headers }> {
  const r = await fetch(`${base}api/challenge`);
  if (!r.ok) throw new Error(`GET /api/challenge answered ${r.status}`);
  return { b: (await r.json()) as ChallengeBoard, headers: r.headers };
}

const { b, headers } = await board();
if (headers.get("cache-control") !== "no-store") fail(`/api/challenge is cacheable: ${headers.get("cache-control")}`);
if (headers.get("set-cookie")) fail("/api/challenge sets a cookie");
if (b.counts === null) {
  if (b.attempts.length) fail("no counts, yet rows were served");
  console.log("the record is unknown: the page must show no number");
} else {
  if (!b.cut && !same(countsOf(b.attempts), b.counts)) fail(`counts ${JSON.stringify(b.counts)} aren't the fold of the rows ${JSON.stringify(countsOf(b.attempts))}`);
  if (b.cut && b.attempts.length >= b.counts.tried) fail("cut, yet every row was served");
  if (b.counts.setAside > b.counts.tried || b.counts.paid > b.counts.tried) fail(`impossible counts ${JSON.stringify(b.counts)}`);
  if (b.counts.paid > 0) fail(`${b.counts.paid} tries got Goose to pay: a bug, and on the record`);
}
for (const row of b.attempts) {
  if (!same(parseAttempt(row), row)) { fail(`a row off the shape: ${JSON.stringify(row)}`); break; }
  if (row.at % 60_000 !== 0) { fail(`a row's time isn't floored to the minute: ${row.at}`); break; }
}
for (let i = 1; i < b.attempts.length; i++) if (b.attempts[i - 1]!.at < b.attempts[i]!.at) { fail("rows aren't newest first"); break; }

const review = await fetch(`${base}api/challenge/review`);
if (review.headers.get("cache-control") !== "no-store") fail("/api/challenge/review is cacheable");
const missed = (await review.json()) as { notes: { note: string; verdict: string }[]; kept: number };
if (missed.notes.some((n) => n.verdict === "set-aside" || /[<>{}[\]`]/.test(n.note))) fail("the review queue holds a set-aside note, or markup");
if (b.counts && missed.kept < missed.notes.length) fail("the review queue is longer than the notes kept");

const status = (await (await fetch(`${base}api/runs/trick`)).json()) as { challenge: ChallengeCounts | null; scammer?: boolean };
// Someone may be trying right now, so the status is only compared to a board read after it.
const later = (await board()).b.counts;
if (status.challenge && later && status.challenge.tried > later.tried) fail(`the status says ${status.challenge.tried}, the board ${later.tried}`);

if (!apiOnly) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const posted: string[] = [];
    page.on("request", (r) => { if (r.method() !== "GET" && new URL(r.url()).pathname.startsWith("/api/")) posted.push(new URL(r.url()).pathname); });
    await page.goto(`${base}#challenge`, { waitUntil: "load" });
    const block = page.locator("#challenge");
    await block.waitFor({ timeout: 30_000 });
    await block.scrollIntoViewIfNeeded();
    const count = block.locator(".ds-ch-count");
    await page.waitForFunction(() => { const c = document.querySelector("#challenge .ds-ch-count"); return !!c && c.hasAttribute("data-tried"); }, undefined, { timeout: 30_000 });
    const tried = await count.getAttribute("data-tried");
    const fresh = (await board()).b.counts;
    if (fresh === null) {
      if (tried !== "unknown") fail(`the record is unknown, yet the page says ${tried}`);
    } else {
      const words = challengeWords(fresh, fresh.byAi > 0); // by the rows, as the landing reads them
      const line = await block.locator(".ds-ch-line").innerText();
      if (Number(tried) === fresh.tried && line !== words.line) fail(`the page says "${line}", the fold says "${words.line}"`);
      if (Number(tried) > fresh.tried) fail(`the page shows ${tried}, the record holds ${fresh.tried}`);
    }
    if (posted.length) fail(`the page sent ${posted.join(", ")} by itself`);
  } finally {
    await browser.close();
  }
}

const shown = b.counts ? `${b.counts.tried} tried, ${b.counts.setAside} set aside, ${b.counts.paid} paid, ${b.attempts.length} rows served` : "no number";
console.log(fails.length ? `challenge-probe: ${fails.length} failed` : `challenge-probe ok: ${shown}`);
process.exit(fails.length ? 1 : 0);
