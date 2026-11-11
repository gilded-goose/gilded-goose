/// <reference lib="dom" />
// The real ping, walked in a browser (THE PING level 1 (b), Track F): a real watch's read during the visit, at or under her
// price, pings once with her own row's words, and a tap lands focus on her row in Watching. It needs no Channel3 key and
// spends no read: it stubs window.Notification (so it records instead of showing) and adds one real row to this page's own
// GET /api/runs/wants answer. Also: the home route loads no ping chunk, a reload doesn't ping the same read twice, and an
// old read or one over her price never pings. Run against a local build: node scripts/ping-real.ts <url>
import "./route-closed.ts"; // a route mid-request when its page closes ends quietly, nothing else does
import { chromium, type Page } from "playwright";
import { pingWhen } from "../core/src/ask/real-ping.ts";
const base = process.argv[2] ?? "http://localhost:8836";
const b = await chromium.launch();
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "ok  " : "FAIL"} ${m}`); if (!c) fails++; };
const ZONE = "America/Los_Angeles"; // the page says the read's time in her zone: pin it so the walk can say it too
const READ = Date.now() + 60_000; // one read, fixed: a reload must see the same read
const row = (o: Record<string, unknown>) => ({ productId: "p1", domain: "store.example", item: "Steel kettle", target: 9000, best: { total: 8499, at: "store.example" }, pinged: true, checkedAt: READ, status: "Pinged: $84.99 at store.example is $5.01 under your $90.00.", when: "Real price at store.example, just now", ...o });
async function open(ctxRow: Record<string, unknown> | null, w = 1440) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, timezoneId: ZONE });
  await ctx.addInitScript(() => {
    const got: { title: string; body: string; tag: string; n: { onclick: null | (() => void) } }[] = [];
    (window as unknown as { __pings: typeof got }).__pings = got;
    class N { static permission = "granted"; static requestPermission = async () => "granted"; onclick: null | (() => void) = null; constructor(title: string, o: { body: string; tag: string }) { got.push({ title, body: o.body, tag: o.tag, n: this }); } close() {} }
    (window as unknown as { Notification: unknown }).Notification = N;
  });
  const reqs: string[] = [];
  const pg = await ctx.newPage();
  pg.on("request", (r) => reqs.push(new URL(r.url()).pathname));
  if (ctxRow) await pg.route("**/api/runs/wants", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(); const j = await res.json(); j.real = [row(ctxRow)];
    await route.fulfill({ response: res, json: j });
  });
  return { ctx, pg, reqs };
}
const pings = (pg: Page) => pg.evaluate(() => (window as unknown as { __pings: { title: string; body: string; tag: string }[] }).__pings.map(({ title, body, tag }) => ({ title, body, tag })));

// 0. The home route never loads the watcher.
{ const { ctx, pg, reqs } = await open({});
  await pg.goto(base + "/?desk=1", { waitUntil: "load" }); await pg.waitForTimeout(2500);
  ok(!reqs.some((p) => /real-watcher|ping-notify/.test(p)), "home: no ping chunk loaded");
  await ctx.close(); }
// A. A read during the visit, under her price: one ping, her own words; a tap lands on her row.
for (const w of [1440, 390]) {
  const { ctx, pg, reqs } = await open({}, w);
  await pg.goto(base + "/?desk=1#wants", { waitUntil: "load" });
  await pg.waitForSelector('[data-real="p1@store.example"]', { timeout: 10000 });
  await pg.waitForFunction(() => (window as unknown as { __pings: unknown[] }).__pings.length > 0, null, { timeout: 8000 }).catch(() => {});
  const p = await pings(pg);
  ok(p.length === 1, `${w} A: one ping (${p.length})`);
  ok(p[0]?.title === "Goose · price alert", `${w} A: title "${p[0]?.title}"`);
  ok(p[0]?.body === `Steel kettle at store.example was $84.99 when checked on ${pingWhen(READ, ZONE)}, under your $90.00 price. Tap to review.`, `${w} A: body "${p[0]?.body}"`);
  ok(reqs.some((r) => /real-watcher/.test(r)), `${w} A: watcher came as its own chunk`);
  await pg.evaluate(() => window.scrollTo(0, 0));
  await pg.evaluate(() => (window as unknown as { __pings: { n: { onclick: () => void } }[] }).__pings[0]!.n.onclick());
  await pg.waitForTimeout(600);
  const f = await pg.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.real ?? document.activeElement?.tagName);
  ok(f === "p1@store.example", `${w} A: tap focuses her row (${f})`);
  // B. The same tab, reloaded: that read already pinged.
  await pg.reload({ waitUntil: "load" }); await pg.waitForSelector("[data-real]"); await pg.waitForTimeout(2500);
  ok((await pings(pg)).length === 0, `${w} B: reload, no second ping`);
  await ctx.close();
}
// C. A read from before the visit, D. over her price, E. right at it.
for (const [name, o, want] of [["C old read", { checkedAt: Date.now() - 86_400_000 }, 0], ["D over", { best: { total: 9100, at: "store.example" }, pinged: false }, 0], ["E right at", { best: { total: 9000, at: "store.example" } }, 1]] as const) {
  const { ctx, pg } = await open(o);
  await pg.goto(base + "/?desk=1#wants", { waitUntil: "load" }); await pg.waitForSelector("[data-real]"); await pg.waitForTimeout(2500);
  const p = await pings(pg);
  ok(p.length === want, `${name}: ${p.length} ping(s)${p[0] ? ` "${p[0].body}"` : ""}`);
  await ctx.close();
}
await b.close();
console.log(fails ? `ping e2e: ${fails} FAILED` : "ping e2e: all ok");
process.exit(fails ? 1 : 0);
