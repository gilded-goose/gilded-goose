// "Verify an order" (#/verify on the white site), in a real browser against a built server on the practice rail
// (PAYMENT=fake: sh scripts/seat-server.sh), at a phone's and a desktop's width. It pays one practice order and runs one
// price-swap order through the server's own routes, then reads both back on the page as a stranger would: by typing the
// order id and pressing Enter. It checks the three headlines (approved, created but never approved, does not match), the one
// "not found" for every miss, the keyboard, axe, nothing sideways, and no console error. The page itself only ever sends GETs.
//   OUT=/dir node scripts/verify-walk.ts [base]     default http://localhost:8840/
import { existsSync, readFileSync } from "node:fs";
import { chromium, type APIRequestContext } from "playwright";
import { localOnly } from "./not-live.ts";

// It starts runs and presses Approve, so it runs against a server on this machine only (scripts/not-live.ts), and only on the practice rail (below).
const base = localOnly(process.argv[2] ?? "http://localhost:8840/").replace(/\/?$/, "/");
const origin = base.replace(/\/$/, "");
const AXE = process.env.AXE ?? new URL("../node_modules/axe-core/axe.min.js", import.meta.url).pathname;
const MATCH = "This order was approved for exactly this cart";
const CREATED = "This order was created for exactly this cart. Goose never saw it approved at this build's stand-in for PayPal.";
const MISMATCH = "This order does not match the approved cart";
const MISSING = "No order with that id is on record here.";
let bad = 0;
const fail = (m: string) => { bad++; console.log(`  FAIL ${m}`); };
const ok = (m: string) => console.log(`  ok   ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const health = await (await fetch(`${origin}/api/health`)).json() as { payment?: string };
if (health.payment !== "fake") { console.log(`verify-walk: REFUSED, ${origin} isn't on the practice rail (payment: ${health.payment}). This walk presses Approve.`); process.exit(2); }

/** One practice order through the server's own routes, as the shop does it: start, Approve, the stand-in's tap, the return. */
async function order(api: APIRequestContext, body: Record<string, unknown>, tap = true): Promise<{ orderId: string; total: string }> {
  const post = (path: string, data: unknown) => api.post(`${origin}${path}`, { data, headers: { "content-type": "application/json", origin } });
  const { runId } = await (await post("/api/runs", body)).json() as { runId: string };
  type View = { done: boolean; bound: { orderId: string | null; total: string } | null };
  let v = await (await api.get(`${origin}/api/runs/${runId}`)).json() as View;
  for (let i = 0; i < 200 && !v.done; i++) { await sleep(50); v = await (await api.get(`${origin}/api/runs/${runId}`)).json() as View; }
  const { approveUrl } = await (await post(`/api/runs/${runId}/approve`, {})).json() as { approveUrl: string };
  if (tap) await api.get(approveUrl); // the stand-in's tap, then the return, followed to the page it lands on
  v = await (await api.get(`${origin}/api/runs/${runId}`)).json() as View;
  if (!v.bound?.orderId) throw new Error(`run ${runId} has no order`);
  return { orderId: v.bound.orderId, total: v.bound.total };
}

const browser = await chromium.launch();
for (const [w, h] of [[390, 844], [1440, 900]] as const) {
  const where = String(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce", ...(w < 768 ? { hasTouch: true, isMobile: true } : {}) });
  const page = await ctx.newPage();
  const errors: string[] = [];
  const sent: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => { if (r.url().includes("/api/verify")) sent.push(`${r.method()} ${new URL(r.url()).pathname}`); });

  // The orders are another browser's: the page reads them with no cookie of theirs.
  const shopper = await browser.newContext();
  const paid = await order(shopper.request, { seed: 1, pace: false });
  const swap = await order(shopper.request, { seed: 1, pace: false, replayOnly: true, swap: true });
  await shopper.close();
  // A third browser makes an order and never taps at the payment page: created, not approved.
  const idle = await browser.newContext();
  const untapped = await order(idle.request, { seed: 1, pace: false }, false);
  await idle.close();

  // Reached from Proof and from the footer, never typed.
  await page.goto(`${base}#/proof`, { waitUntil: "load" });
  const fromProof = page.locator('.pr a[href="#/verify"]').first();
  await fromProof.waitFor({ timeout: 30_000 });
  if (!(await page.locator('.footer a[href="#/verify"]').count())) fail(`${where}: the footer has no link to the page`); else ok(`${where}: the footer links to it`);
  await fromProof.click();
  await page.waitForSelector(".vf h1", { timeout: 30_000 });
  if ((await page.locator(".vf h1").textContent()) !== "Verify an order") fail(`${where}: h1 reads ${await page.locator(".vf h1").textContent()}`); else ok(`${where}: Proof links to it`);
  if (await page.locator(".vf-result > *").count()) fail(`${where}: the page shows a result before anything was asked`);

  const ask = async (id: string) => {
    const input = page.locator("#vf-id");
    await input.fill(id);
    await input.press("Enter");
    await page.waitForFunction(() => document.querySelector(".vf-result h2") !== null && !document.querySelector(".vf-result")!.textContent!.startsWith("Checking"), null, { timeout: 15_000 });
    return page.evaluate(() => ({ head: document.querySelector(".vf-result h2")?.textContent ?? "", text: document.querySelector(".vf-result")?.textContent ?? "", verdict: document.querySelector<HTMLElement>(".vf-verdict")?.dataset["verdict"] ?? null, html: document.querySelector(".vf-result")?.innerHTML ?? "" }));
  };

  // The keyboard alone gets from the top of the page to the field.
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) { await page.keyboard.press("Tab"); reached = await page.evaluate(() => document.activeElement?.id === "vf-id"); }
  if (!reached) fail(`${where}: Tab never reaches the order id field`); else ok(`${where}: the field is reachable by keyboard`);
  const named = await page.evaluate(() => ({ field: (document.querySelector("#vf-id") as HTMLInputElement).labels?.[0]?.textContent ?? "", button: document.querySelector(".vf-form button")?.textContent ?? "", live: document.querySelector(".vf-result")?.getAttribute("aria-live") }));
  if (named.field !== "Order id" || named.button !== "Verify" || named.live !== "polite") fail(`${where}: names read ${JSON.stringify(named)}`); else ok(`${where}: the field, the button and the result are named`);

  const good = await ask(paid.orderId);
  if (good.head !== MATCH || good.verdict !== "match") fail(`${where}: a paid order reads "${good.head}"`); else ok(`${where}: a paid order: "${MATCH}"`);
  for (const must of ["Practice · not a PayPal order, no money", "(fictional)", paid.orderId, `$${paid.total}`, "Fingerprint in the order's custom_id", "The payment was taken.", "No refund on record.", " UTC", "As read at "]) if (!good.text.includes(must)) fail(`${where}: the paid order's record lacks "${must}"`);
  if (/sandbox · test money/.test(good.text)) fail(`${where}: a practice order is labelled as PayPal sandbox`);
  const prints = await page.evaluate(() => [...document.querySelectorAll(".vf-facts code")].map((c) => c.textContent ?? "").filter((t) => /^[0-9a-f]{32}$/.test(t)));
  if (prints.length !== 3 || new Set(prints).size !== 1) fail(`${where}: a matching order shows ${prints.length} fingerprints, ${new Set(prints).size} different`); else ok(`${where}: its three fingerprints are one`);
  if (process.env.OUT) await page.screenshot({ path: `${process.env.OUT}/verify-match-${w}.png`, fullPage: true });

  const made = await ask(untapped.orderId);
  const card = await page.locator("#vf-cart").textContent();
  if (made.head !== CREATED || card !== "The cart this order was created for" || /approved for exactly|shopper approved/.test(made.text)) fail(`${where}: an order nobody tapped reads "${made.head}" over "${card}"`); else ok(`${where}: an untapped order: "${CREATED}"`);
  if (!made.text.includes("Not seen approved")) fail(`${where}: an untapped order shows an approval time`);

  const changed = await ask(swap.orderId);
  if (changed.head !== MISMATCH || changed.verdict !== "mismatch") fail(`${where}: a price-swapped order reads "${changed.head}"`); else ok(`${where}: a price-swapped order: "${MISMATCH}"`);
  if (!changed.text.includes("The hold was released. Nothing was charged.")) fail(`${where}: the swapped order's rows don't say the hold was released`);
  if (process.env.OUT) await page.screenshot({ path: `${process.env.OUT}/verify-mismatch-${w}.png`, fullPage: true });

  // Every miss is one answer, and what was typed is printed as text, never as markup.
  for (const id of ["FAKE-9999", "5O190127TN364715T", "<img src=x onerror=alert(1)>", "../../api/health"]) {
    const miss = await ask(id);
    if (miss.head !== "Not found" || !miss.text.includes(MISSING)) fail(`${where}: "${id}" reads "${miss.head}"`);
    if (/<img|onerror/i.test(miss.html)) fail(`${where}: what was typed reached the page as markup`);
  }
  ok(`${where}: every miss reads the same "Not found"`);

  // No example ids: one line on how to get an id, one pointing to Proof, and the page says who can read what.
  const about = await page.evaluate(() => ({ examples: document.querySelectorAll(".vf-example").length, text: document.querySelector(".vf")?.textContent ?? "", small: [...document.querySelectorAll(".vf-form button, #vf-id")].filter((el) => el.getBoundingClientRect().height < 44).length, limit: /spending limit/i.test(document.querySelector(".vf-result")?.textContent ?? "") }));
  if (about.examples || /[0-9A-Z]{17}/.test(about.text.replace("5O190127TN364715T", ""))) fail(`${where}: the page offers an example id`);
  for (const must of ["Pay for a cart in Shop with a sandbox buyer and paste the receipt's order id.", "Anyone with an order's id can read this page: the item, seller, total, times and payment steps.", "Read only: it can't pay, refund or change an order."]) if (!about.text.includes(must)) fail(`${where}: the page lacks "${must}"`);
  if (about.small) fail(`${where}: ${about.small} controls under 44px`);
  if (about.limit) fail(`${where}: a result shows a spending limit`);
  ok(`${where}: no example ids; it says how to get one and who can read what`);

  // "#/verify#<id>" opens with that order looked up.
  await page.goto(`${base}#/verify#${paid.orderId}`, { waitUntil: "load" });
  await page.waitForSelector(".vf-verdict", { timeout: 15_000 }).catch(() => {});
  if ((await page.locator(".vf-verdict h2").textContent().catch(() => "")) !== MATCH) fail(`${where}: #/verify#<id> didn't open the order`); else ok(`${where}: a link with the id opens the order`);

  const r = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide: [...document.querySelectorAll(".vf *")].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).length }));
  if (r.over > 0 || r.wide > 0) fail(`${where}: ${r.over}px sideways, ${r.wide} elements past the edge`); else ok(`${where}: nothing sideways`);
  if (existsSync(AXE)) {
    await page.evaluate(readFileSync(AXE, "utf8"));
    const v = await page.evaluate(async () => (await (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: { id: string; nodes: unknown[] }[] }> } }).axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "best-practice"] })).violations.map((x) => `${x.id} (${x.nodes.length})`));
    if (v.length) fail(`${where}: axe ${v.join(", ")}`); else ok(`${where}: axe 0`);
  } else fail(`${where}: no axe at ${AXE}`);
  const others = sent.filter((s) => !s.startsWith("GET /api/verify/"));
  if (others.length || sent.length === 0) fail(`${where}: the page sent ${others.join(", ") || "nothing"}`); else ok(`${where}: the page sent ${sent.length} GETs and nothing else to /api/verify`);
  if (errors.length) fail(`${where}: ${errors.slice(0, 2).join(" | ").slice(0, 300)}`); else ok(`${where}: no console or page errors`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `verify-walk FAIL: ${bad}` : "verify-walk ok");
process.exit(bad ? 1 : 0);
