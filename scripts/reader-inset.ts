// Track S, push 18g: the Desk reader line's text starts where its card's text starts, at 390 and 1440, on a run that set a
// seller aside (one box) and on a run with no deal (a card that stands alone); on a phone's one box it keeps the box's
// bottom gap instead of hugging the edge; and every other status line in the run's right column sits inside the card's
// inset too (the sweep). It hugged the card's border at 390 when it shipped (reader-390.png, Nov 6).
//   sh scripts/check-bundle.sh && sh scripts/seat-server.sh 8815 &   then   node scripts/reader-inset.ts http://localhost:8815
// Local seats only, keyless: the line under test is the code-only one. Exits 1 on any miss.
// A module, so its top-level awaits typecheck (server's tsconfig reads scripts/: TS1375 without this, 18g's red run).
export {};
const url = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^http:\/\/localhost:\d+$/.test(url)) throw new Error("reader-inset: local seats only (http://localhost:PORT)");
const { chromium } = await import(`${process.cwd()}/node_modules/playwright/index.mjs`);
const browser = await chromium.launch();
const ASKS = [["one box: a seller set aside", "A Marsh Lights ticket under $90"], ["a card alone: no deal", "A Marsh Lights ticket under $20"]] as const;
let bad = 0;
for (const [w, h] of [[390, 844], [1440, 900]] as const) for (const [kind, ask] of ASKS) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${url}/?desk=1`);
  await page.getByRole("textbox").first().fill(ask);
  await page.getByRole("button", { name: "Ask Goose" }).click();
  await page.getByRole("button", { name: /Shop for this/ }).click();
  await page.locator(".dk-reader").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const textLeft = (el: Element) => { const r = document.createRange(); r.selectNodeContents(el); return r.getClientRects()[0]?.left ?? NaN; };
    const textBottom = (el: Element) => { const r = document.createRange(); r.selectNodeContents(el); const rs = r.getClientRects(); return rs[rs.length - 1]?.bottom ?? NaN; };
    const right = document.querySelector(".dk-right")!;
    const card = right.querySelector(".dk-deal2")!;
    const reader = right.querySelector(".dk-reader")!;
    const one = right.classList.contains("dk-one");
    const s = getComputedStyle(right);
    const inset = textLeft(card.querySelector(".dk-eyebrow")!);
    // The sweep: any other status line drawn in the right column, against the card's text edge (never left of it).
    const strays = [...right.querySelectorAll('[role="status"]')].flatMap((st) => [...st.querySelectorAll("p, b, span, div")]
      .filter((e) => e.children.length === 0 && (e.textContent ?? "").trim() && e.getClientRects().length && !e.closest(".dk-reader"))
      .filter((e) => textLeft(e) < inset - 0.5).map((e) => `${e.className || e.tagName}: "${(e.textContent ?? "").trim().slice(0, 40)}" at ${Math.round(textLeft(e))}`));
    return { one, nodeal: card.classList.contains("dk-nodeal"), readerLeft: textLeft(reader), inset,
      bottomGap: right.getBoundingClientRect().bottom - parseFloat(s.borderBottomWidth) - textBottom(reader), border: parseFloat(s.borderBottomWidth), strays };
  });
  const misses: string[] = [];
  if (Math.abs(m.readerLeft - m.inset) > 0.5) misses.push(`text starts at ${Math.round(m.readerLeft)}, the card's at ${Math.round(m.inset)}`);
  if (m.one && m.border > 0 && m.bottomGap < 16 - 0.5) misses.push(`${Math.round(m.bottomGap)} px above the box's bottom edge, under the --s-2 (16 px) gap`);
  for (const s of m.strays) misses.push(`status line outside the card's inset: ${s}`);
  if (kind.startsWith("one") !== m.one) misses.push(`expected ${kind}, the run drew ${m.one ? "one box" : m.nodeal ? "no deal" : "a deal card alone"}`);
  if (misses.length) bad++;
  console.log(`${misses.length ? "FAIL" : "ok  "} ${w} ${kind}: text ${Math.round(m.readerLeft)} = card ${Math.round(m.inset)}, ${Math.round(m.bottomGap)} px to the edge${misses.length ? ` — ${misses.join("; ")}` : ""}`);
  await page.close();
}
await browser.close();
console.log(bad ? `reader-inset: FAIL, ${bad} of ${ASKS.length * 2} layouts` : `reader-inset: OK, the reader line starts at its card's text edge in all ${ASKS.length * 2} layouts, and no status line in the right column sits outside it`);
process.exit(bad ? 1 : 0);
