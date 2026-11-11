// Usage: node scripts/run-landing.ts [seat-url]   (a LOCAL seat: sh scripts/check-bundle.sh, then sh scripts/seat-server.sh 8801)
// Round 6b, the design review's B1 (Track P, Fri Nov 6): on a phone the run landed with TixQuack's gift-card note cut through by
// the bar's edge and Goose's caption pill over what was left of it, the one screen the product exists for. The class rule for any
// landed card at phone width: no line of ink is cut by the bar, every line of the deal card is inside the frame, and no line of the
// landed run sits under the caption pill. Read line by line (each text line's own box), in Chromium and WebKit, at 390 by 844 and
// 390 by 667, with and without motion, from the moment Approve arrives until the caption has had time to go. It never presses
// Approve, and it refuses anything but a local seat (the run's presses count on live). Exits 1 on any FAIL.
import { chromium, webkit, type Page } from "playwright";

const base = (process.argv[2] ?? "http://localhost:8801").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) { console.error(`run-landing: a local seat only, not ${base}`); process.exit(2); }

interface Read { y: number; foot: number; frame: number; cut: string[]; outside: string[]; covered: string[]; pill: boolean; lines: number }

/** Every visible line of text in the run, by its own box: which the bar's edge cuts, which of the card's are outside the frame,
 *  and which sit under the caption pill while it shows. */
const read = (page: Page) => page.evaluate((): Read => {
  const bars = document.querySelectorAll("header.dk-nav");
  const pin = document.querySelector<HTMLElement>(".sm-pin");
  const foot = (bars[bars.length - 1]?.getBoundingClientRect().bottom ?? 0) + (pin && getComputedStyle(pin).opacity !== "0" && getComputedStyle(pin).display !== "none" ? pin.offsetHeight : 0);
  const cap = document.querySelector<HTMLElement>(".gv-cap");
  const capShows = !!cap && !cap.hidden && getComputedStyle(cap).visibility !== "hidden" && Number(getComputedStyle(cap).opacity) > 0;
  const p = capShows ? cap!.getBoundingClientRect() : null;
  const grid = document.querySelector(".dk[data-app] .dk-live-grid"), card = document.querySelector(".dk-right");
  const out: Read = { y: Math.round(scrollY), foot: Math.round(foot), frame: innerHeight, cut: [], outside: [], covered: [], pill: capShows, lines: 0 };
  if (!grid) return out;
  // A block split by the bar: some of its lines under the bar, some below it (at 844 the note's first lines were under the bar
  // and its last line and label below, with no single line cut). The run's blocks: its heading, each seller's row, the card.
  const split = new Map<Element, { above: boolean; below: boolean; name: string }>();
  const walk = document.createTreeWalker(grid, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement!, s = getComputedStyle(el);
    if (!n.textContent?.trim() || s.visibility === "hidden" || el.closest("[data-wait], [hidden]") || el.checkVisibility?.({ opacityProperty: true }) === false) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    for (const b of r.getClientRects()) {
      if (b.width < 1 || b.height < 1) continue;
      out.lines++;
      const what = `"${n.textContent.trim().slice(0, 40)}" ${Math.round(b.top)}-${Math.round(b.bottom)}`;
      if (b.top < foot - 1 && b.bottom > foot + 1) out.cut.push(what);
      const block = el.closest(".dk-live-head, .dk-fr, .dk-right");
      if (block) {
        const s = split.get(block) ?? { above: false, below: false, name: (block.textContent ?? "").trim().slice(0, 30) };
        if (b.top < foot - 1) s.above = true;
        if (b.bottom > foot + 1) s.below = true;
        split.set(block, s);
      }
      if (card?.contains(n) && (b.top < foot - 1 || b.bottom > innerHeight + 1)) out.outside.push(what);
      if (p && b.left < p.right && b.right > p.left && b.top < p.bottom && b.bottom > p.top) out.covered.push(what);
    }
  }
  for (const s of split.values()) if (s.above && s.below) out.cut.push(`the block "${s.name}…" is split, part under the bar`);
  return out;
});

let fails = 0;
for (const [name, type] of [["chromium", chromium], ["webkit", webkit]] as const) {
  const browser = await type.launch();
  for (const height of [844, 667]) for (const motion of ["reduce", "no-preference"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height }, isMobile: name === "chromium", hasTouch: true, reducedMotion: motion, colorScheme: "dark" });
    await ctx.route("**/*", (r) => (/\/api\/(runs\/[^/]+\/approve|approve|pay)/.test(r.request().url()) ? r.abort() : r.continue())); // never an approval
    const page = await ctx.newPage();
    await page.goto(`${base}/?desk=1`, { waitUntil: "load" });
    const box = page.getByRole("textbox").first();
    await box.click(); // her first tap: what lets Goose speak, and so what draws the caption pill
    await box.fill("A Marsh Lights ticket under $90");
    await page.getByRole("button", { name: "Ask Goose" }).click();
    await page.getByRole("button", { name: "Shop for this" }).click();
    await page.locator(".dk-deal2 .dk-approve").first().waitFor({ timeout: 30_000 });
    // From Approve's arrival until the caption's line has played and lingered: every read must hold, not only the last.
    const t0 = Date.now(), tag = `${name.padEnd(8)} 390x${height} ${motion.padEnd(13)}`;
    let last: Read | null = null, prev = -1, bad = new Set<string>(), pillSeen = false;
    while (Date.now() - t0 < 6000) {
      await page.waitForTimeout(150);
      const m = await read(page);
      pillSeen ||= m.pill;
      for (const c of m.covered) bad.add(`under the pill: ${c}`);
      // The bar's cut and the frame are judged once the landing's scroll has stopped (a smooth scroll passes through cuts).
      if (m.y === prev) last = m;
      prev = m.y;
    }
    const capBuilt = await page.locator(".gv-cap").count();
    if (!last) bad.add("the page never came to rest");
    else {
      for (const c of last.cut) bad.add(`cut by the bar's edge (${last.foot}): ${c}`);
      for (const c of last.outside) bad.add(`the card's line outside the frame (${last.foot} to ${last.frame}): ${c}`);
      if (last.lines < 10) bad.add(`only ${last.lines} lines read, so little was measured`);
    }
    if (!capBuilt) bad.add("the caption bar never came, so the pill was not measured");
    console.log(`${bad.size ? "FAIL" : "PASS"}  ${tag} landed at ${last?.y ?? "?"}, ${last?.lines ?? 0} lines; the pill ${pillSeen ? "showed" : "never showed over it (stepped aside)"}${capBuilt ? "" : " (no caption bar)"}`);
    for (const b of [...bad].slice(0, 8)) console.log(`      ${b}`);
    if (bad.size) fails++;
    await page.screenshot({ path: `${process.env.STILLS ?? "/tmp"}/run-landing-${name}-390x${height}-${motion}.png` }).catch(() => {});
    await ctx.close();
  }
  await browser.close();
}
console.log(fails ? `\nrun-landing: ${fails} FAIL` : "\nrun-landing: OK, the run lands with no line cut, the whole card in the frame and nothing under the caption pill");
process.exit(fails ? 1 : 0);
