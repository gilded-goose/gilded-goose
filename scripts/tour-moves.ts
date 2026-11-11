// The tour's moves (S1-13 part 5, Lead-10's follow-ups), at DPR 1 against a running server:
//   focus  - after a tour move by the pill's Next (keyboard), focus is on the stop's own page, never in the pill or on a
//            rail, and wears either no ring (a heading the page focused: desk.css's `.dk h2:focus`) or the one shared
//            ring (2 px solid, offset 3 px). At 390, stop 05 must land focus on its target ("Limits in code").
//   rapid  - Next as fast as Playwright can click, through every stop, at 1440 and 390, then the same with reduced motion:
//            one pill at the end, on the last stop and its page; no scroll after the page has settled (no double
//            scroll); no console error.
//   air    - safe.html at 1440 with each stop's pill (the tour followed off the page): no text line within --s-1 (8 px)
//            of the pill, by its box (a line box holds its ink, so the box rule is the stricter); a control case, a
//            line placed 4 px above the pill, must come back red.
// Usage: node scripts/tour-moves.ts http://localhost:8787 [out-dir] [focus|rapid|air|headings ...]
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { TOUR } from "@goose/core/tour";

const base = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "");
const out = process.argv[3] ?? "/tmp/s1-13/tour-moves";
const modes = process.argv.slice(4).length ? process.argv.slice(4) : ["focus", "rapid", "air"];
mkdirSync(out, { recursive: true });
const rows: string[] = [];
const fails: string[] = [];
const fail = (m: string) => { fails.push(m); };
const AT = "goose_tour_at"; // web/src/tour/follow.ts
const open = TOUR.filter((s) => s.href);
const pad = (n: number) => String(n).padStart(2, "0");

/** The focused element after a move: where it is and the ring it draws. */
const focusOf = (p: Page) => p.evaluate(() => {
  const a = document.activeElement as HTMLElement | null;
  const cs = a ? getComputedStyle(a) : null;
  return {
    tag: a ? `${a.tagName.toLowerCase()}.${String(a.className).split(" ")[0]}` : "none",
    text: (a?.textContent ?? "").trim().slice(0, 30),
    body: !a || a === document.body,
    inPill: !!a?.closest(".tp"),
    rail: !!a?.closest("[class*='rail']"),
    fv: !!a?.matches(":focus-visible"),
    ring: cs ? { style: cs.outlineStyle, width: cs.outlineWidth, offset: cs.outlineOffset } : null,
    heading: !!a?.matches("h1, h2, h3, h4, [role='heading']"),
    title: document.title,
  };
});

async function startTour(browser: Browser, w: number, h: number, reduced: boolean) {
  const phone = w <= 720;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 140)); });
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));
  await page.goto(`${base}/?desk=tour`);
  await page.locator(".tr-stage .tr-next-go").click();
  await page.locator(".tp").waitFor({ timeout: 20_000 });
  return { ctx, page, errors };
}

/** The DD's rule (08:40): a heading that takes focus by script (tabindex="-1") never rings, on any route. After a real
 *  Tab (so the browser is in keyboard mode and :focus-visible applies), each drawn h1-h4 with tabindex="-1" is focused
 *  and its outline read. The pane headings open with their rooms, so the Desk's are reached by their menu addresses. */
const HEADING_ROUTES = ["/?desk=tour", "/?desk=1", "/?desk=1#wants", "/?desk=1#settings", "/?desk=1#week", "/?desk=1#after", "/?desk=ledger", "/?desk=proof", "/?desk=haggle", "/?desk=how", "/?desk=system", "/?wallet=1", "/?wallet=0", "/?market=1", "/safe.html", "/404.html"];
async function headingsPass(browser: Browser) {
  let seen = 0;
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await ctx.addInitScript(() => { try { sessionStorage.setItem("gg-opened", "1"); } catch { /* fine */ } });
    const page = await ctx.newPage();
    for (const route of HEADING_ROUTES) {
      await page.goto(base + route, { waitUntil: "load" });
      await page.waitForTimeout(1200);
      await page.keyboard.press("Tab");
      const found = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("h1[tabindex='-1'], h2[tabindex='-1'], h3[tabindex='-1'], h4[tabindex='-1']")]
        .filter((e) => e.getClientRects().length > 0).map((e) => {
          e.focus({ preventScroll: true });
          const c = getComputedStyle(e);
          return { what: `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]} "${(e.textContent ?? "").trim().slice(0, 28)}"`, fv: e.matches(":focus-visible"), ring: c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0 ? `${c.outlineStyle} ${c.outlineWidth}` : "" };
        }));
      seen += found.length;
      const rung = found.filter((x) => x.ring);
      for (const x of rung) fail(`${w} ${route}: ${x.what} rings (${x.ring}) when focused`);
      rows.push(["headings", `${w}`, route, `${found.length} focusable heading(s)`, found.map((x) => `${x.what}${x.fv ? " fv" : ""}${x.ring ? ` RING ${x.ring}` : ""}`).join("; ") || "-", rung.length ? "FAIL" : "OK"].join("\t"));
    }
    await ctx.close();
  }
  if (seen < 5) fail(`headings: only ${seen} focusable headings found, so the pass proves little`);
}

/** Item 1: each move by the pill's Next from the keyboard. */
async function focusPass(browser: Browser, w: number, h: number) {
  const { ctx, page, errors } = await startTour(browser, w, h, true);
  for (let i = 0; i < open.length; i++) {
    await page.waitForTimeout(2600);
    const n = pad(TOUR.indexOf(open[i]!) + 1);
    if (i > 0) {
      const f = await focusOf(page);
      const ring = f.ring && f.ring.style !== "none" ? `${f.ring.style} ${f.ring.width} off ${f.ring.offset}` : "no ring";
      const shared = !f.ring || f.ring.style === "none" || (f.ring.style === "solid" && f.ring.width === "2px" && f.ring.offset === "3px");
      let verdict = "OK";
      if (f.inPill) verdict = "FAIL: focus stayed in the pill";
      else if (f.rail) verdict = "FAIL: focus on a rail";
      else if (!shared) verdict = `FAIL: another ring (${ring})`;
      else if (w <= 720 && open[i]!.id === "limits" && !/Limits in code/.test(f.text)) verdict = `FAIL: stop 05 focus not on its target ("${f.text}")`;
      // The DD (08:40): a heading the tour focuses shows no ring. And what a screen reader says on the move: the focused
      // element's role and name from the accessibility tree (a new page announces its title).
      else if (f.heading && ring !== "no ring") verdict = `FAIL: a focused heading wears a ring (${ring})`;
      const said = f.body ? `page "${f.title}"` : (await page.locator(":focus").ariaSnapshot().catch(() => "")).split("\n")[0]!.replace(/^- /, "").slice(0, 60);
      if (verdict === "OK" && !(f.body ? f.title.trim() : /"[^"]+"/.test(said))) verdict = `FAIL: a silent focus move (${said || "no name"})`;
      // Lead-10 (stop 03): the site's name alone tells her nothing about where the move went; each move says its stop.
      if (verdict === "OK" && said === `page "Gilded Goose"`) verdict = `FAIL: the move says only the site's name (${said})`;
      if (verdict !== "OK") fail(`${w} ${n} ${open[i]!.id}: ${verdict}`);
      rows.push(["focus", `${w}x${h}`, n, open[i]!.id, f.body ? "body (a new page)" : `${f.tag} "${f.text}"`, `focus-visible=${f.fv}`, ring, `says ${said}`, verdict].join("\t"));
      if (w <= 720 && open[i]!.id === "limits") await page.screenshot({ path: `${out}/focus-${w}-stop${n}.png` });
    }
    if (i === open.length - 1) break;
    await page.locator(".tp .tp-next").focus();
    await page.keyboard.press("Enter");
    await page.waitForLoadState("load");
    await page.locator(".tp").waitFor({ timeout: 20_000 });
  }
  if (errors.length) fail(`focus ${w}: console ${errors.join(" | ")}`);
  await ctx.close();
}

/** The settle: scroll sampled every 100 ms for 4 s; once still for 500 ms, any later move is a second scroll. */
async function settle(page: Page) {
  const ys: number[] = [];
  for (let k = 0; k < 40; k++) { ys.push(await page.evaluate(() => Math.round(scrollY))); await page.waitForTimeout(100); }
  let still = 0, second = false;
  for (let k = 1; k < ys.length; k++) { if (ys[k] === ys[k - 1]) still++; else { if (still >= 5) second = true; still = 0; } }
  return { ys, second };
}

/** The rapid pass's own red control: a scroll 1.5 s after the page settled, and a console error, must both be caught. */
async function rapidControl(browser: Browser) {
  const { ctx, page, errors } = await startTour(browser, 1440, 900, true);
  await page.waitForTimeout(2600);
  await page.evaluate(() => { setTimeout(() => scrollBy(0, 40), 1500); console.error("control: a console error"); });
  const { second } = await settle(page);
  const caught = second && errors.some((e) => /control: a console error/.test(e));
  rows.push(["rapid", "control", "a scroll 1.5 s after the settle, and a console error", `second scroll=${second}`, `console=${errors.length}`, caught ? "red, as it must be" : "FAIL: read clear"].join("\t"));
  if (!caught) fail("rapid control: a late scroll or a console error went unseen, so the rapid pass can't fail");
  await ctx.close();
}

/** Item 2: Next as fast as it can be clicked, then a still settle. */
async function rapidPass(browser: Browser, w: number, h: number, reduced: boolean) {
  const tag = `${w}x${h}${reduced ? " reduced" : ""}`;
  const { ctx, page, errors } = await startTour(browser, w, h, reduced);
  const t0 = Date.now();
  let clicks = 0;
  for (let i = 0; i < open.length - 1; i++) {
    await page.locator(".tp .tp-next").click({ timeout: 20_000 });
    clicks++;
  }
  const ms = Date.now() - t0;
  await page.waitForLoadState("load");
  const { ys, second } = await settle(page);
  const end = await page.evaluate(() => {
    const pills = [...document.querySelectorAll<HTMLElement>(".tp")];
    const shown = pills.filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden");
    return { n: pills.length, shown: shown.length, text: shown[0]?.innerText.replace(/\s+/g, " ").slice(0, 60) ?? "", at: sessionStorage.getItem("goose_tour_at"), url: location.search + location.hash };
  });
  const last = open[open.length - 1]!, lastN = pad(TOUR.indexOf(last) + 1);
  const onLast = end.at === String(TOUR.indexOf(last)) && new RegExp(`\\b${lastN}\\b`).test(end.text);
  const want = new URL(last.href, `${base}/`), got = new URL(end.url, `${base}/`);
  const page_ = want.search === got.search;
  let verdict = "OK";
  if (end.n !== 1 || end.shown !== 1) verdict = `FAIL: ${end.n} pills, ${end.shown} shown`;
  else if (!onLast) verdict = `FAIL: stuck strip ("${end.text}", at=${end.at})`;
  else if (!page_) verdict = `FAIL: on ${end.url}, not ${last.href}`;
  else if (second) verdict = "FAIL: a second scroll after the page settled";
  else if (errors.length) verdict = `FAIL: console ${errors.join(" | ")}`;
  if (verdict !== "OK") fail(`rapid ${tag}: ${verdict}`);
  rows.push(["rapid", tag, `${clicks} Nexts in ${ms} ms`, `pill "${end.text}"`, `page ${end.url}`, `scroll ${ys[0]}→${ys[ys.length - 1]}${second ? " (second scroll)" : ""}`, `console ${errors.length}`, verdict].join("\t"));
  await page.screenshot({ path: `${out}/rapid-${w}${reduced ? "-reduced" : ""}.png` });
  await ctx.close();
}

/** Item 3: the nearest text box to the pill on safe.html (gap: the larger of the side and vertical distances). */
const nearest = (p: Page) => p.evaluate(() => {
  const nav = document.querySelector<HTMLElement>(".tp");
  if (!nav) return null;
  const t = nav.getBoundingClientRect();
  let near: { text: string; gap: number; box: number[] } | null = null;
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest(".tp") || !(n.textContent ?? "").trim()) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const q of rg.getClientRects()) {
      if (q.width < 2 || q.height < 2) continue;
      const dx = Math.max(t.left - q.right, q.left - t.right), dy = Math.max(t.top - q.bottom, q.top - t.bottom);
      const g = Math.max(dx, dy); // negative: the line overlaps the pill
      if (!near || g < near.gap) near = { text: (n.textContent ?? "").trim().slice(0, 36), gap: Math.round(g * 10) / 10, box: [q.left, q.top, q.right, q.bottom].map(Math.round) };
    }
  }
  return { slot: nav.dataset.slot ?? "", rise: nav.style.getPropertyValue("--tp-rise") || "0px", pill: [t.left, t.top, t.right, t.bottom].map(Math.round), near };
});

async function airPass(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  for (let at = 0; at < TOUR.length; at++) {
    if (!TOUR[at]!.href) continue;
    const page = await ctx.newPage();
    await page.goto(`${base}/safe.html`);
    await page.evaluate(([k, v]) => sessionStorage.setItem(k!, v!), [AT, String(at)]);
    await page.reload(); await page.waitForLoadState("load"); await page.waitForTimeout(3200);
    const m = await nearest(page);
    const n = pad(at + 1);
    let verdict = "OK";
    if (!m) verdict = "FAIL: no pill";
    else if (m.near && m.near.gap < 8) verdict = `FAIL: "${m.near.text}" ${m.near.gap} px from the pill (< --s-1)`;
    if (verdict !== "OK") fail(`air safe.html 1440 pill ${n}: ${verdict}`);
    rows.push(["air", "1440x900 safe.html", `pill of ${n}`, m ? `slot=${m.slot} rise=${m.rise} pill=${m.pill.join(",")}` : "", m?.near ? `nearest "${m.near.text}" ${m.near.gap} px @${m.near.box.join(",")}` : "", verdict].join("\t"));
    if (verdict !== "OK" || at === 0) await page.screenshot({ path: `${out}/air-safe-1440-pill${n}.png` });
    await page.close();
  }
  // Control: a line of text 4 px above the pill must read red.
  const page = await ctx.newPage();
  await page.goto(`${base}/safe.html`);
  await page.evaluate(([k]) => sessionStorage.setItem(k!, "0"), [AT]);
  await page.reload(); await page.waitForLoadState("load"); await page.waitForTimeout(3200);
  await page.evaluate(() => {
    const t = document.querySelector(".tp")!.getBoundingClientRect();
    const d = document.createElement("div");
    d.textContent = "control line, 4 px above the pill";
    d.style.cssText = `position:fixed;left:${Math.round(t.left + 20)}px;top:${Math.round(t.top - 4 - 18)}px;height:18px;line-height:18px;font-size:14px;color:#f4eadc;z-index:5`;
    document.body.append(d);
  });
  const c = await nearest(page);
  const red = !!c?.near && c.near.gap < 8;
  rows.push(["air", "control", "a line 4 px above the pill", c?.near ? `nearest "${c.near.text}" ${c.near.gap} px` : "", red ? "red, as it must be" : "FAIL: read clear"].join("\t"));
  if (!red) fail("air control: a line 4 px above the pill read clear, so the air test can't fail");
  await page.close();
  await ctx.close();
}

const browser = await chromium.launch();
try {
  if (modes.includes("headings")) await headingsPass(browser);
  if (modes.includes("focus")) { await focusPass(browser, 390, 844); await focusPass(browser, 1440, 900); }
  if (modes.includes("rapid")) await rapidControl(browser);
  if (modes.includes("rapid")) for (const reduced of [false, true]) { await rapidPass(browser, 1440, 900, reduced); await rapidPass(browser, 390, 844, reduced); }
  if (modes.includes("air")) await airPass(browser);
} finally { await browser.close(); }
writeFileSync(`${out}/tour-moves.tsv`, rows.join("\n") + "\n");
console.log(rows.join("\n"));
if (fails.length) { console.log(`TOUR MOVES FAIL:\n- ${fails.join("\n- ")}`); process.exit(1); }
console.log(`tour-moves: OK (${modes.join(", ")})`);
