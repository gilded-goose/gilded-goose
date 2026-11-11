// Track C's word probe for docs/launch/surface-words.md: visible words per route, on the first screen and the whole page,
// at 1440x900 and 390x844 (DPR 1, reduced motion), plus the run's deal card and Behind the scenes' header.
// Serve a build first (VITE_WALLET=1 corepack pnpm --filter @goose/web build, then the server on your port with
// PAYMENT=fake BUYER=rule, because the run needs /api), then:
//
//   node docs/launch/word-count.mjs http://localhost:4197 > words.json
//
// First screen: words in visible text nodes that touch the viewport (the nav included). Page: words in body.innerText.
// `first` counts only what a person can see: Track P (Nov 4) stopped it counting screen-reader-only text, text clipped
// away and text under a see-through ancestor, which had the run's first screen at 263 words on a page of 154.
// `firstRaw` is the old rule, kept so numbers read before Nov 4 can still be compared.
// A word is a whitespace-separated run holding a letter or a digit (the same rule as scripts/check-claims.ts `words`).
import { chromium } from "playwright";

const BASE = (process.argv[2] ?? "http://localhost:4197").replace(/\/$/, "");
const ROUTES = [
  ["/", "root"], ["/?wallet=1", "wallet"], ["/?wallet=0", "classic"], ["/?desk=1", "desk"], ["/?market=1", "market"],
  ["/?desk=haggle", "haggle"], ["/?desk=ledger", "ledger"], ["/?desk=studio", "studio"], ["/?desk=proof", "proof"],
  ["/?desk=tour", "tour"], ["/safe.html", "safe"], ["/?desk=system", "system"], ["/?desk=how", "how"], ["/no-such-page", "404"],
];
const count = () => {
  const W = (t) => t.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
  const unseen = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const c = getComputedStyle(e);
      if (+c.opacity === 0) return true;
      if (/inset\(50%\)/.test(c.clipPath) || c.clip === "rect(0px, 0px, 0px, 0px)") return true;
      if (c.overflow !== "visible") { const r = e.getBoundingClientRect(); if (r.width <= 1 || r.height <= 1) return true; }
    }
    return false;
  };
  let first = 0, firstRaw = 0;
  const texts = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    if (el.closest("[hidden],.sr-only,.visually-hidden")) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    const rects = [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
    if (rects.some((x) => x.bottom > 0 && x.top < innerHeight && x.right > 0 && x.left < innerWidth)) { firstRaw += W(n.textContent ?? ""); if (unseen(el)) continue; first += W(n.textContent ?? ""); texts.push(n.textContent ?? ""); }
  }
  return { first, firstRaw, page: W(document.body.innerText), firstText: texts.join(" ").replace(/\s+/g, " ") };
};
const one = (s) => {
  const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length);
  if (!e) return null;
  const W = (t) => t.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
  return { sel: s, words: W(e.innerText), text: e.innerText.replace(/\s+/g, " ") };
};
const out = {};
const browser = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  for (const [path, name] of ROUTES) {
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2500);
      out[`${name}@${w}`] = { ...(await page.evaluate(count)), url: page.url() };
      if (name === "ledger" || name === "studio") out[`${name}-header@${w}`] = await page.evaluate(one, ".lx-hero");
    } catch (e) { out[`${name}@${w}`] = { err: String(e).slice(0, 200) }; }
    await page.close();
  }
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + "/?desk=1", { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Ask for anything" }).first().fill("A Marsh Lights ticket under $90");
    await page.getByRole("button", { name: "Ask Goose" }).first().click();
    await page.getByRole("button", { name: /Shop for this/ }).click({ timeout: 20000 });
    await page.locator("button.dk-approve", { hasText: /Approve \$/ }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(4000);
    out[`run@${w}`] = await page.evaluate(count);
    out[`run-deal-card@${w}`] = await page.evaluate(one, ".dk-deal2");
    await page.locator(".dk-deal2").scrollIntoViewIfNeeded();
    out[`run-deal-in-view@${w}`] = await page.evaluate(count);
  } catch (e) { out[`run@${w}`] = { err: String(e).slice(0, 300) }; }
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
