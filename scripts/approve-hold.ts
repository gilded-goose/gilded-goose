// Approve must not move when Goose's read lands on the deal card (DD, Nov 4). The Desk holds the chip's space while its
// chunk loads. This delays the chunk (blocking it proves nothing: a failed chunk draws null, with no held space), reads
// Approve's place, lets the chunk land and reads it again, at both widths. It also fails if the chip wraps past one line.
// Then it opens each fold on the card (Goose's read, Before you approve, what happens after the tap): Approve has to be
// wholly in the frame with the fold open, and the fold's own top still below the bar (Lead-10, Nov 4; Track T saw Approve cut
// off at 1440). And the run's end on a phone (Round 5, the DD's B1): with no scroll of her own, the whole card's top sits under the
// bar with Approve wholly in the frame, at 844 and at 667 (Safari's bars), with and without motion; at 568 Approve wins over the
// card's top; and her own scroll during the run is never pulled back. It never presses Approve.
//   node scripts/approve-hold.ts [url] [stills-dir]   default http://localhost:8823; deal-*.png, deal-read-*.png when a dir is given
export {};
const url = (process.argv[2] ?? "http://localhost:8823").replace(/\/$/, "");
const stills = process.argv[3];
const { chromium } = await import(`${process.cwd()}/node_modules/playwright/index.mjs`);
const browser = await chromium.launch();
let failed = false;
for (const width of [390, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: "dark", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  let release = () => {};
  const held = new Promise<void>((ok) => { release = ok; });
  await page.route(/\/Read-[^/]*\.(js|css)/, async (r: { continue(): Promise<void> }) => { await held; await r.continue(); });
  await page.goto(`${url}/?desk=1`, { waitUntil: "load" });
  await page.getByRole("textbox").first().fill("A kettle under $60");
  await page.getByRole("button", { name: "Ask Goose" }).click();
  await page.getByRole("button", { name: "Shop for this" }).click();
  const approve = page.getByRole("button", { name: /^Approve/ }).first();
  await approve.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  const place = () => approve.evaluate((e: Element) => Math.round((e.getBoundingClientRect().top + scrollY) * 10) / 10);
  const before = await place();
  const early = await page.locator(".gr").count();
  release();
  await page.locator(".gr").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
  const after = await place();
  const lines = await page.locator(".gr summary").evaluate((s: Element) => Math.round(s.getBoundingClientRect().height / 44));
  const moved = Math.round((after - before) * 10) / 10;
  console.log(`${width}: Approve at ${before} with the space held, ${after} with the chip; moved ${moved}; chip lines ${lines}`);
  if (early) { console.error(`${width}: the chip drew before its chunk was let through, so nothing was measured`); failed = true; }
  if (moved !== 0) { console.error(`${width}: Approve moved ${moved} px when the chip landed: fix the fallback's minHeight in web/src/desk/Desk.tsx`); failed = true; }
  if (lines !== 1) { console.error(`${width}: the chip takes ${lines} lines, not 1`); failed = true; }
  if (stills) {
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); scrollTo(0, 0); });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${stills}/deal-${width}.png`, fullPage: true });
  }
  // Approve in the frame with a fold open, from the top of the card and at the frame's two sizes. A short laptop too.
  const startsOpen: boolean[] = await page.evaluate(() => [...document.querySelectorAll<HTMLDetailsElement>(".dk-deal2 details")].map((d) => d.open));
  for (const height of width === 390 ? [844] : [900, 780]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((open: boolean[]) => { document.querySelectorAll<HTMLDetailsElement>(".dk-deal2 details").forEach((d, n) => { d.open = open[n]!; }); scrollTo(0, 0); }, startsOpen);
    await page.waitForTimeout(100);
    const folds = await page.locator(".dk-deal2 details").count();
    if (folds < 2) { console.error(`${width}x${height}: only ${folds} folds on the card, so little was measured`); failed = true; }
    // One at a time from how the card arrives, then a round that leaves each open, so the last is measured with all of them open.
    const order = [...Array(folds).keys(), ...Array(folds).keys()];
    for (const [step, i] of order.entries()) {
      const stack = step >= folds;
      const fold = page.locator(".dk-deal2 details").nth(i);
      const summary = fold.locator("summary").first();
      // "What happens after your tap" starts open: close it first, since this measures the opening.
      if (await fold.evaluate((d: Element) => (d as HTMLDetailsElement).open)) { await summary.click(); await page.waitForTimeout(100); }
      // The fold pinned just under the bar, the hard start. Not on a short laptop: there, what's open can't all fit under the
      // bar, and the fold's own top wins over Approve, since you just asked to read it. From where the page sits, it fits.
      if (height !== 780) await page.evaluate((n: number) => { document.querySelectorAll(".dk-deal2 details")[n]!.scrollIntoView({ block: "start" }); scrollBy(0, -80); }, i);
      await summary.click();
      await page.waitForTimeout(250);
      const m = await page.evaluate((n: number) => {
        const a = document.querySelector(".dk-deal2 .dk-approve")!.getBoundingClientRect();
        const f = document.querySelectorAll(".dk-deal2 details")[n]!;
        // Two headers in the page: the first paint's stays at 0 once the app has drawn. The last is the sticky bar; a phone's deal pin sits under it.
        const bars = document.querySelectorAll("header.dk-nav");
        return { open: (f as HTMLDetailsElement).open, bottom: Math.round(a.bottom), top: Math.round(a.top), frame: innerHeight, foldTop: Math.round(f.getBoundingClientRect().top), bar: Math.round(Math.max(bars[bars.length - 1]?.getBoundingClientRect().bottom ?? 0, document.querySelector(".sm-pin")?.getBoundingClientRect().bottom ?? 0)) };
      }, i);
      const name = (await summary.innerText()).split("\n")[0];
      console.log(`${width}x${height} "${name}" open${stack ? " (the others stay open)" : ""}: Approve ${m.top} to ${m.bottom} of ${m.frame}; the fold's top ${m.foldTop}, the bar's foot ${m.bar}`);
      if (!m.open) { console.error(`${width}x${height} "${name}": the click didn't open it`); failed = true; }
      if (m.bottom > m.frame || m.top < m.bar) { console.error(`${width}x${height} "${name}": Approve isn't wholly in the frame`); failed = true; }
      if (m.foldTop < m.bar) { console.error(`${width}x${height} "${name}": the fold just opened went under the bar`); failed = true; }
      if (stills && !stack && i === 0 && height !== 780) await page.screenshot({ path: `${stills}/deal-read-${width}.png` });
      if (stills && !stack && i === 1 && height !== 780) await page.screenshot({ path: `${stills}/deal-before-${width}.png` });
      if (!stack && !startsOpen[i]) { await summary.click(); await page.waitForTimeout(100); }
    }
  }
  await ctx.close();
}
const shop = async (height: number, motion: string) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height }, colorScheme: "dark", reducedMotion: motion });
  const page = await ctx.newPage();
  await page.goto(`${url}/?desk=1`, { waitUntil: "load" });
  await page.getByRole("textbox").first().fill("A Marsh Lights ticket under $90");
  await page.getByRole("button", { name: "Ask Goose" }).click();
  await page.getByRole("button", { name: "Shop for this" }).click();
  return { ctx, page };
};
for (const height of [844, 667, 568]) for (const motion of ["reduce", "no-preference"]) {
  const { ctx, page } = await shop(height, motion);
  await page.locator(".dk-deal2 .dk-approve").first().waitFor({ timeout: 25_000 });
  await page.waitForTimeout(motion === "reduce" ? 500 : 1500);
  const m = await page.evaluate(() => {
    const a = document.querySelector(".dk-deal2 .dk-approve")!.getBoundingClientRect(), c = document.querySelector(".dk-right")!.getBoundingClientRect();
    const bars = document.querySelectorAll("header.dk-nav");
    const pin = document.querySelector(".sm-pin") as HTMLElement | null;
    const bar = (bars[bars.length - 1]?.getBoundingClientRect().bottom ?? 0) + (pin && getComputedStyle(pin).opacity !== "0" ? pin.offsetHeight : 0);
    return { top: Math.round(a.top), bottom: Math.round(a.bottom), card: Math.round(c.top), bar: Math.round(bar), frame: innerHeight };
  });
  console.log(`390x${height} ${motion}, the run's end: Approve ${m.top} to ${m.bottom} of ${m.frame}; the card's top ${m.card}, the bars' foot ${m.bar}`);
  if (m.bottom > m.frame || m.top < m.bar) { console.error(`390x${height} ${motion}: the run ended with Approve out of the frame`); failed = true; }
  if (height >= 667 && m.card < m.bar) { console.error(`390x${height} ${motion}: the card's top went under the bar`); failed = true; }
  if (stills && motion === "reduce") await page.screenshot({ path: `${stills}/deal-end-390x${height}.png` });
  await ctx.close();
}
{
  // Her scroll wins. With motion, the run takes long enough to scroll during it.
  const { ctx, page } = await shop(844, "no-preference");
  await page.locator(".dk-feed, .dk-runhead").first().waitFor({ timeout: 25_000 });
  await page.waitForTimeout(900);
  const done = await page.locator(".dk-deal2 .dk-approve").count();
  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(300);
  const hers = await page.evaluate(() => Math.round(scrollY));
  await page.locator(".dk-deal2 .dk-approve").first().waitFor({ timeout: 25_000 });
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => Math.round(scrollY));
  console.log(`390x844, her scroll during the run: at ${hers}, after the run at ${after}${done ? " (the run had already ended)" : ""}`);
  if (!done && Math.abs(after - hers) > 2) { console.error(`the run's end pulled her from ${hers} to ${after}`); failed = true; }
  await ctx.close();
}
await browser.close();
if (failed) process.exit(1);
console.log("approve-hold: OK (Approve moves 0 px at 390 and 1440, the chip on one line, stays in the frame with any fold open, and the run's end on a phone shows it)");
