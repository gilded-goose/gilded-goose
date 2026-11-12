/// <reference lib="dom" />
// Track DK (068): the Desk's calm hero and the deal card at half the words, measured, with stills for the DD.
// Counts the words a visitor can see (rendered text only: no screen-reader-only text, nothing in a closed "Before you
// approve", nothing held undrawn) on the hero and on the run's deal card at done, at 1440×900 and 390×844 (DPR 1, dark,
// reduced motion so each state is its finished frame), and, with --assert, holds the DK rules:
//   - the hero has no "Tell Goose your name" or "Mute Goose"; both are in Limits in code, two taps from the hero;
//   - the greeting is one short line, "Hello" between 00:00 and 04:59 (a fixed clock at 02:30 and 21:00);
//   - the run page draws no left rail (.dk-rail) at any width;
//   - every "Why?" and chevron row (Before you approve, What happens after your tap) on the run is a 44 px target;
//   - each section within its budget (C, lower wins), none bigger at 390 than at 1440; every Desk state is the kit's;
//   - at the run's landing no control sits under the bar or the phone's bottom rail.
// usage (server on 8786 serving web/dist): node scripts/dk-desk-probe.ts http://localhost:8786/ <out-dir> <tag> [--assert]
import { chromium, devices, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [base = "http://localhost:8786/", out = "dk-shots", tag = "now"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const strict = process.argv.includes("--assert");
mkdirSync(out, { recursive: true });
let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };

/** The words drawn inside `sel` (each text node whose box is drawn, visible and not clipped to 1 px), and its lines. */
/** `screen`: count only what is drawn in the first screen (between the pinned bar and the phone's bottom rail), the bar,
 *  menu, rail and tour strip not counted (brand.md §10.3's word budgets). */
const words = (page: Page, sel: string, screen = false) => page.evaluate(([sel, screen]) => {
  const root = document.querySelector(sel);
  const pinned = (e: Element | null) => !!e && /sticky|fixed/.test(getComputedStyle(e).position) && e.getBoundingClientRect().height > 0;
  const top = screen ? ([...document.querySelectorAll(".gn.dk-nav")].find(pinned)?.getBoundingClientRect().bottom ?? 0) : -Infinity;
  const bottom = screen ? ([...document.querySelectorAll(".gn-rail")].find(pinned)?.getBoundingClientRect().top ?? innerHeight) : Infinity;
  if (!root) return { n: -1, lines: [] as string[] };
  const op = (e: Element | null) => { let o = 1; for (let n = e; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  const shown = (e: Element | null): boolean => {
    for (let n = e; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n), r = n.getBoundingClientRect();
      if (s.display === "none" || s.visibility !== "visible") return false;
      if ((r.width <= 2 || r.height <= 2) && s.overflow !== "visible") return false;
      if (s.clipPath === "inset(50%)") return false;
    }
    return op(e) > 0.05;
  };
  const lines: string[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    const s = (t.textContent ?? "").trim();
    if (!s || !shown(t.parentElement)) continue;
    const rg = document.createRange(); rg.selectNodeContents(t);
    if (![...rg.getClientRects()].some((q) => q.width > 1 && q.height > 1 && q.bottom > top + 1 && q.top < bottom - 1)) continue;
    if (t.parentElement?.closest(".gn, .gn-rail, .gm-panel, .tp, footer")) continue;
    // A closed <details> draws only its summary.
    const det = t.parentElement?.closest("details");
    if (det && !det.open && !t.parentElement?.closest("summary")) continue;
    lines.push(s.replace(/\s+/g, " "));
  }
  const n = lines.join(" ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return { n, lines };
}, [sel, screen] as const);
/** brand.md §10.3's budgets for DK's screens, reconciled with C's surface-words.md (lower wins: the deal card 50). The DD's
 *  check 2 ruling: each section is gated at both widths and none says more at 390 than at 1440; the run's first screen is
 *  gated at 1440 only; at 390, where a phone fills to the fold, its count is reported, not gated. */
const BUDGET = { hero: 40, deal: 50, understood: 60, run1440: 120 } as const;
/** Each section's count per width, compared once both widths ran. */
const bySection: Record<string, Partial<Record<"1440" | "390", number>>> = {};
const note = (sec: string, size: "1440" | "390", n: number) => { (bySection[sec] ??= {})[size] = n; };

/** Controls (buttons, links, fields, summaries) drawn in the viewport whose box crosses the pinned bar or the bottom rail. */
const underChrome = (page: Page) => page.evaluate(() => {
  const pinned = (e: Element | null) => !!e && /sticky|fixed/.test(getComputedStyle(e).position) && e.getBoundingClientRect().height > 0;
  const bar = [...document.querySelectorAll(".gn.dk-nav")].find(pinned)?.getBoundingClientRect();
  const rail = [...document.querySelectorAll(".gn-rail")].find(pinned)?.getBoundingClientRect();
  const hits: string[] = [];
  for (const el of document.querySelectorAll(".dk-wrap main *, main.dk-wrap *")) {
    if (!el.matches("button, a[href], input, select, summary") || el.closest(".gn, .gn-rail")) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 2 || r.bottom <= 0 || r.top >= innerHeight || getComputedStyle(el).visibility !== "visible") continue;
    // Cut by an edge, half shown: across the bar's foot or the rail's top. Wholly behind the sticky bar (92% frosted) is the
    // same as scrolled away (S1-13: the bar sticks on a phone too, and the run lands with the Ask box behind it).
    const across = (y: number | undefined) => y !== undefined && r.top < y - 0.5 && r.bottom > y + 0.5;
    if (across(bar?.bottom) || across(rail?.top)) hits.push(`${el.tagName.toLowerCase()} “${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 40)}” ${Math.round(r.top)}–${Math.round(r.bottom)}`);
  }
  return hits;
});

const result: Record<string, unknown> = { tag, base };
const browser = await chromium.launch();
for (const size of ["1440", "390"] as const) {
  const phone = size === "390";
  const vp = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const make = async (hour: number, name: string | null) => {
    const ctx = await browser.newContext({ ...(phone ? devices["iPhone 13"] : {}), viewport: vp, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "reduce", timezoneId: "America/Los_Angeles" });
    if (name) await ctx.addInitScript((n) => { try { localStorage.setItem("gg-name-v1", n); } catch { /* blocked */ } }, name);
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(`2026-10-31T${String(hour).padStart(2, "0")}:30:00-07:00`));
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    return { ctx, page, errors };
  };

  // The hero, evening, no name (the stills), then with a name, then after midnight.
  {
    const { ctx, page, errors } = await make(21, null);
    await page.goto(`${base}?desk=1`);
    await page.locator(".dk-hero .vg-line").waitFor();
    await page.waitForTimeout(1200);
    const hero = await words(page, ".dk-hero-copy"), heroDD = await words(page, ".dk-hero");
    const greet = await page.locator(".dk-hero .vg-line").innerText();
    result[`hero-${size}`] = hero; result[`hero-dd-${size}`] = heroDD; result[`greeting-21h-${size}`] = greet;
    console.log(`hero ${size}: ${hero.n} words (.dk-hero ${heroDD.n})`, JSON.stringify(heroDD.lines));
    note("hero", size, heroDD.n);
    if (strict) check(heroDD.n <= BUDGET.hero, `${size} hero (.dk-hero): ${heroDD.n} words (budget ≤ ${BUDGET.hero}, brand.md §10.3)`);
    await page.screenshot({ path: join(out, `desk-hero-${size}-${tag}.png`) });
    if (strict) {
      check(!(await page.getByText("Tell Goose your name").isVisible().catch(() => false)), `${size} hero: no “Tell Goose your name”`);
      check(!(await page.locator(".dk-hero").getByText(/Mute Goose/).isVisible().catch(() => false)), `${size} hero: no “Mute Goose”`);
      check(/^Good evening\.?$/.test(greet.trim()), `${size} greeting at 21:30 is one short line: “${greet}”`);
      check((await underChrome(page)).length === 0, `${size} hero landing: no control under the bar or rail ${JSON.stringify(await underChrome(page))}`);
      // Two taps from the hero: the menu, then Limits in code; the voice and name rows are there, 44 px each.
      await page.getByRole("button", { name: /Everything Goose does|^Menu$/ }).first().click(); // S1-13: the button reads "Menu" on a phone
      await page.locator('.gm-panel a[data-item="limits"]').click();
      await page.locator(".gm-scrim").waitFor({ state: "detached" });
      const mute = page.getByRole("button", { name: /^(Mute|Unmute) Goose$/ }), tell = page.getByRole("button", { name: "Tell Goose your name" });
      await mute.waitFor({ timeout: 5000 }).catch(() => undefined);
      const mh = (await mute.boundingBox().catch(() => null))?.height ?? 0, th = (await tell.boundingBox().catch(() => null))?.height ?? 0;
      check(mh >= 44 && th >= 44, `${size} Limits in code (2 taps): Mute Goose ${mh}px, Tell Goose your name ${th}px (≥ 44)`);
      await tell.click();
      await page.getByLabel("What should Goose call you?").fill("Joshua");
      await page.getByRole("button", { name: "Save" }).click();
      check(await page.getByText(/Goose calls you Joshua/).isVisible(), `${size} the name saves from Limits in code`);
      await page.screenshot({ path: join(out, `desk-settings-voice-${size}-${tag}.png`) });
    }
    check(errors.length === 0, `${size} hero: 0 console errors ${JSON.stringify(errors)}`);
    await ctx.close();
  }
  {
    const { ctx, page } = await make(21, "Joshua");
    await page.goto(`${base}?desk=1`);
    await page.locator(".dk-hero .vg-line").waitFor();
    await page.waitForTimeout(800);
    const hero = await words(page, ".dk-hero-copy");
    result[`hero-named-${size}`] = hero;
    console.log(`hero (named) ${size}: ${hero.n} words`);
    await page.screenshot({ path: join(out, `desk-hero-named-${size}-${tag}.png`) });
    await ctx.close();
  }
  {
    const { ctx, page } = await make(2, "Joshua");
    await page.goto(`${base}?desk=1`);
    const greet = await page.locator(".dk-hero .vg-line").innerText();
    result[`greeting-02h-${size}`] = greet;
    console.log(`greeting at 02:30 ${size}: “${greet}”`);
    if (strict) check(greet.trim() === "Hello, Joshua.", `${size} greeting at 02:30 says “Hello, Joshua.”: “${greet}”`);
    await ctx.close();
  }

  // The run: the first chip, Shop for this, done.
  {
    const { ctx, page, errors } = await make(21, null);
    await page.goto(`${base}?desk=1`);
    await page.getByRole("button", { name: "A Marsh Lights ticket under $90" }).click();
    await page.locator(".dk-s-ut .dk-ut").waitFor();
    await page.waitForTimeout(600);
    const ut = await words(page, ".dk-s-ut");
    result[`understood-${size}`] = ut;
    console.log(`understood card ${size}: ${ut.n} words`, JSON.stringify(ut.lines));
    await page.screenshot({ path: join(out, `desk-understood-${size}-${tag}.png`) });
    note("understood", size, ut.n);
    if (strict) check(ut.n <= BUDGET.understood, `${size} understood card: ${ut.n} words (budget ≤ ${BUDGET.understood})`);
    await page.getByRole("button", { name: /Shop for this/ }).click();
    await page.locator(".dk-deal2.dk-final").waitFor({ timeout: 15000 });
    await page.waitForTimeout(1500);
    const right = await words(page, ".dk-live-grid .dk-right"), card = await words(page, ".dk-live-grid .dk-deal2");
    const first = await words(page, "main", true);
    result[`deal-column-${size}`] = right; result[`deal-card-${size}`] = card; result[`run-first-screen-${size}`] = first;
    console.log(`deal column ${size}: ${right.n} words; card alone ${card.n}`, JSON.stringify(right.lines));
    console.log(`run first screen ${size}: ${first.n} words`, JSON.stringify(first.lines));
    note("deal", size, card.n);
    if (strict) {
      check(card.n <= BUDGET.deal, `${size} deal card (.dk-deal2): ${card.n} words (budget ≤ ${BUDGET.deal})`);
      if (phone) console.log(`  (reported, not gated) 390 run first screen, to the fold: ${first.n} words`);
      else check(first.n <= BUDGET.run1440, `${size} run first screen: ${first.n} words (budget ≤ ${BUDGET.run1440})`);
    }
    await page.screenshot({ path: join(out, `desk-deal-${size}-${tag}.png`) });
    // The landing as the run left it: read before an element screenshot scrolls the page (the bar sticks on a phone too).
    if (strict) {
      const under = await underChrome(page);
      check(under.length === 0, `${size} run landing: no control under the bar or rail ${JSON.stringify(under)}`);
    }
    await page.locator(".dk-live-grid .dk-right").screenshot({ path: join(out, `desk-deal-card-${size}-${tag}.png`) });
    await page.screenshot({ path: join(out, `desk-run-full-${size}-${tag}.png`), fullPage: true });
    if (strict) {
      check(await page.locator(".dk-rail").count() === 0, `${size} run: no left rail (.dk-rail)`);
      const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".dk-live-grid .dk-why-btn, .dk-live-grid .dk-before > summary")]
        .filter((e) => e.getClientRects().length > 0).map((e) => [e.textContent?.trim().slice(0, 30), Math.round(e.getBoundingClientRect().height), Math.round(e.getBoundingClientRect().width)] as const).filter(([, h, w]) => h < 44 || w < 44));
      check(small.length === 0, `${size} run: every Why? and chevron row (Before you approve, What happens after your tap) is ≥ 44 px ${JSON.stringify(small)}`);
      const why = page.locator(".dk-live-grid .dk-right .dk-why-btn").first();
      const wb = await why.boundingBox();
      check(!!wb && wb.height >= 44, `${size} deal card “Why?” target ${wb ? `${Math.round(wb.width)}×${Math.round(wb.height)}` : "missing"}`);
      if (wb) {
        await why.scrollIntoViewIfNeeded();
        await why.focus();
        const fb = (await why.boundingBox())!;
        await page.screenshot({ path: join(out, `desk-why-target-${size}-${tag}.png`), clip: { x: Math.max(0, fb.x - 48), y: Math.max(0, fb.y - 48), width: Math.min(vp.width - Math.max(0, fb.x - 48), fb.width + 240), height: fb.height + 96 } });
      }
      // Every explanation is one tap away and still says its honesty line.
      check(await page.locator(".tl-how, .dk-planted, .dk-was-line").count() === 0 && await page.locator(".dk-mat .dk-pr .dk-was").count() === 0, `${size} run: no “How this works”, no footnote, no struck price on the card's face`);
      check(await page.locator(".dk-live-grid .tl-fold[open] .tl-steps").count() === 1, `${size} “What happens after your tap”: a chevron row, open, its steps on the face`);
      // DK part 9 (the DD's nit at 390): each connector sits between two words in the flow, 8 px clear either side (16 px
      // rule: a word starts 32 px into its step), and no step wears "Before you approve"'s gold bullet. A first step
      // starts at 0, or 14 px after a done step's 6 px dot.
      const ticks = await page.locator(".dk-live-grid .tl-fold .tl-step").evaluateAll((lis) => lis.map((li, i) => {
        const b = getComputedStyle(li, "::before");
        return { i, at: Math.round(li.querySelector(".tl-word")!.getBoundingClientRect().left - li.getBoundingClientRect().left), pos: b.position };
      }));
      check(ticks.length === 3 && ticks.every((t) => t.pos !== "absolute" && (t.i === 0 ? t.at === 0 || t.at === 14 : t.at === 32)), `${size} the steps ahead: each word clear of its connector ${JSON.stringify(ticks)}`);
      await page.locator(".dk-live-grid .dk-before:not(.tl-fold) > summary").click();
      check(await page.locator(".dk-live-grid .dk-before:not(.tl-fold)[open] li").count() > 0, `${size} “Before you approve” opens in one tap`);
      check(await page.locator(".dk-live-grid .dk-before:not(.tl-fold)[open] li", { hasText: "Goose waited." }).count() === 1, `${size} the day-1 price and “Goose waited.” are in “Before you approve”`);
      await page.screenshot({ path: join(out, `desk-deal-before-open-${size}-${tag}.png`) });
    }
    check(errors.length === 0, `${size} run: 0 console errors ${JSON.stringify(errors)}`);
    // Overflow (no horizontal scroll).
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(wide <= 0, `${size} run: no horizontal scroll (${wide}px over)`);
    await ctx.close();
  }
  // A room opened from the menu (the rail's old job) shows without a rail, its heading focused.
  if (strict) {
    const { ctx, page } = await make(21, null);
    await page.goto(`${base}?desk=1#wants`);
    await page.getByRole("heading", { name: "Your wants" }).waitFor();
    await page.waitForTimeout(300);
    check(await page.locator(".dk-rail").count() === 0, `${size} Your wants (from the menu's hash): no left rail`);
    check(await page.evaluate(() => document.activeElement?.textContent?.trim() === "Your wants"), `${size} Your wants: its heading has focus`);
    await page.screenshot({ path: join(out, `desk-wants-${size}-${tag}.png`) });
    await ctx.close();
  }
  // Every Desk state (item 5), each from a mocked server answer: what the run says when shopping fails, and a pane's
  // loading, empty and failed reads. Each is one block (core's TROUBLE words), and a cap offers no Try again.
  if (strict) {
    const shopFails: [string, string, ((p: Page) => Promise<unknown>) | null, boolean][] = [
      ["away", "Goose couldn't load this.", (p) => p.route("**/api/runs/market/ask", (r) => r.abort()), true],
      ["waking", "Goose's server is waking up.", (p) => p.route("**/api/runs/market/ask", (r) => r.fulfill({ status: 503, contentType: "text/html", body: "<p>waking</p>" })), true],
      ["capped", "That's today's limit from here.", (p) => p.route("**/api/runs/market/ask", (r) => r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ kind: "failed", reason: "Today's made-up markets from here are used up. Nothing changed.", cap: "ask-ip" }) })), false],
      ["error", "Goose couldn't load this.", (p) => p.route("**/api/runs/market/ask", (r) => r.fulfill({ status: 500, contentType: "text/plain", body: "Internal Server Error" })), true],
      ["offline", "You're offline.", null, false],
    ];
    for (const [kind, title, mock, retry] of shopFails) {
      const { ctx, page, errors } = await make(21, null);
      let asks = 0;
      page.on("request", (q) => { if (q.url().includes("/api/runs/market/ask")) asks++; });
      if (mock) await mock(page);
      await page.goto(`${base}?desk=1`);
      await page.getByRole("button", { name: "A Marsh Lights ticket under $90" }).click();
      const shop = page.getByRole("button", { name: /Shop for this/ });
      await shop.waitFor();
      if (!mock) await ctx.setOffline(true);
      await shop.click();
      // DK part 8: the failure is said under her ask, which stays the title.
      const h = page.locator(".dk-s-wait .dk-s-why");
      const asked = (await page.locator(".dk-s-wait h1").innerText().catch(() => "")).trim();
      await page.locator(".dk-s-wait .dk-live.dk-done").waitFor({ timeout: 8000 }).catch(() => undefined);
      await page.locator(".dk-s-wait .st-note-action").first().waitFor({ timeout: 3000 }).catch(() => undefined); // the kit's pill is its own chunk
      const got = (await h.innerText().catch(() => "")).trim();
      const again = await page.locator(".dk-s-wait").getByRole("button", { name: "Try again" }).count();
      check(got === title && (again > 0) === retry, `${size} shop fails (${kind}): “${got}”, Try again ${again > 0 ? "shown" : "none"}`);
      const head = (await page.locator(".dk-s-wait h1").innerText().catch(() => "")).trim();
      check(head === "A Marsh Lights ticket under $90", `${size} shop fails (${kind}): the title stays her ask, “${head}” (asking: “${asked}”)`);
      // DK part 9 (the DD: the capped frame was a dead end): every terminal state has exactly one way forward. A cap's
      // is the recorded week, which needs no fresh market; offline's is its own ask again once back online, said in its
      // line, so it draws no control (checked below).
      const ways = await ((sel: string) => page.locator(sel).locator("a, button").evaluateAll((els) => els.map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim())))(".dk-s-wait");
      const want = kind === "offline" ? [] : kind === "capped" ? ["Watch the recorded week ›"] : ["Try again"];
      check(JSON.stringify(ways) === JSON.stringify(want), `${size} shop fails (${kind}): exactly one way forward ${JSON.stringify(ways)} (want ${JSON.stringify(want)})`);
      await page.screenshot({ path: join(out, `desk-state-${kind}-${size}-${tag}.png`) });
      // The failed fetch itself is the browser's console line, not the page's; anything else counts.
      // The DD (check 2 b): "Nothing changed" is said once, by the status line.
      const said = (await page.locator(".dk-s-wait").innerText()).match(/nothing changed/gi)?.length ?? 0;
      check(said <= 1, `${size} shop fails (${kind}): “Nothing changed” said ${said} time(s)`);
      if (kind === "offline") {
        // §10.9: no button; the ask goes again by itself once the browser is back online, and its line says so.
        const line = (await page.locator(".dk-s-wait .dk-fiction").innerText().catch(() => "")).trim();
        check(/once you're back\.$/.test(line), `${size} shop fails (offline): its line names its way forward, “${line}”`);
        await ctx.setOffline(false);
        const back = await page.locator(".dk-deal2").first().waitFor({ timeout: 15000 }).then(() => true, () => false);
        check(back, `${size} shop fails (offline): asked again by itself once back online`);
      }
      if (kind === "capped") {
        // The DD (part 2 nit 1): the head says "from here", so the cause doesn't say it again.
        const cause = (await page.locator(".dk-s-wait .dk-fiction").innerText().catch(() => "")).trim();
        const here = (await page.locator(".dk-s-wait").innerText()).match(/from here/g)?.length ?? 0;
        check(cause === "Today's made-up markets are used up." && here === 1, `${size} shop fails (capped): cause “${cause}”, “from here” ${here} time(s)`);
        // The send arrow doesn't invite another doomed ask while the cap is on screen (Decided by default: it dims).
        const dim = await page.locator(".dk-go").first().isDisabled().catch(() => false) && await page.locator(".dk-go").first().getAttribute("data-off").catch(() => null) === "cap";
        await page.locator(".dk-ask input").first().press("Enter").catch(() => undefined);
        await page.waitForTimeout(300);
        const stays = await page.locator(".dk-s-wait .dk-live.dk-done").count() === 1;
        check(stays, `${size} shop fails (capped): Enter in the box ${stays ? "sends nothing" : "LEFT THE CAP FOR A NEW ASK"}`);
        // The DD on part 9's default: only the words that hit the cap dim it. Once she edits them it lights again, since
        // words that name a recorded item still shop under the cap; her own words back light it (dim) again.
        const box = page.locator(".dk-ask input").first();
        await box.fill("A kettle under $60");
        const lit = await page.locator(".dk-go").first().isEnabled().catch(() => false) && await page.locator(".dk-go").first().getAttribute("data-off").catch(() => "x") === null;
        await box.fill("A Marsh Lights ticket under $90");
        const again = await page.locator(".dk-go").first().isDisabled().catch(() => false);
        check(lit && again, `${size} shop fails (capped): new words light the arrow ${lit ? "yes" : "NO"}, her capped words dim it again ${again ? "yes" : "NO"}`);
        const sent = asks;
        const way = page.locator(".dk-s-wait a.st-note-action");
        const href = await way.getAttribute("href").catch(() => null);
        check(dim && href === "/?desk=haggle", `${size} shop fails (capped): the arrow ${dim ? "dims" : "STAYS LIT"}, the way forward goes to ${href}`);
        if (href) await way.click();
        const week = await page.getByText("Recorded demo week, no money moved").first().waitFor({ timeout: 10000 }).then(() => true, () => false);
        check(week && asks === sent, `${size} shop fails (capped): “Watch the recorded week” lands on the recorded week ${week ? "shown" : "MISSING"}, ${asks - sent} more ask(s)`);
      }
      if (kind === "waking") {
        // The DD (part 2 nit 2): a failed request's block never says "fills in", and the page-wide line stands down.
        const fills = (await page.locator("body").innerText()).match(/fills in/gi)?.length ?? 0;
        check(fills === 0, `${size} shop fails (waking): “fills in” shown ${fills} time(s) with no request pending`);
        // Try again fires one request, never two: two clicks in one task (before React can re-render) send one ask.
        // DK part 7: that one ask then asks again quietly (web/src/desk/api.ts QUIET_WAITS_MS, 1 s then 3 s), so it is
        // counted before the first wait ends, and once more when Try again is back: one chain of three, never two (six).
        const before = asks;
        await page.evaluate(() => { const b = [...document.querySelectorAll<HTMLButtonElement>(".dk-s-wait button")].find((x) => x.textContent === "Try again"); b?.click(); b?.click(); });
        await page.waitForTimeout(800);
        check(asks - before === 1, `${size} shop fails (waking): Try again clicked twice in one task sent ${asks - before} ask(s) at once`);
        await page.locator(".dk-s-wait").getByRole("button", { name: "Try again" }).waitFor({ timeout: 10000 }).catch(() => undefined);
        check(asks - before === 3, `${size} shop fails (waking): ${asks - before} ask(s) in all, one quiet chain of three`);
      }
      const own = errors.filter((e) => !/Failed to load resource|net::ERR/.test(e));
      check(own.length === 0, `${size} shop fails (${kind}): 0 page errors ${JSON.stringify(own)}`);
      await ctx.close();
    }
    // DK-12 (the DD's ruling, Oct 31; lesson 47): back online, the Desk asks again by itself only her unchanged words, and
    // once per return. Every understand or market ask the page tries to send is counted in the page (offline ones too).
    // DK-13 (the DD, seat 2, Oct 31: one way forward per terminal Desk state): back online with her new words in the box,
    // the block no longer says "You're offline."; a failed Shop gets the kit's one Try again (her press, the bubble's
    // words, her box kept), a failed ask none (her box and lit arrow are the way). Nothing sends by itself (lesson 47).
    for (const flow of ["changed", "same", "twice", "shop"] as const) {
      const { ctx, page, errors } = await make(21, null);
      await ctx.addInitScript(() => {
        const w = window as unknown as { __sent: string[] }; w.__sent = [];
        const f = window.fetch.bind(window);
        window.fetch = (i, o) => { const u = typeof i === "string" ? i : i instanceof URL ? i.href : i.url; if (/\/api\/runs\/market\/(understand|ask)\b/.test(u)) w.__sent.push(`${u} ${typeof o?.body === "string" ? o.body : ""}`); return f(i, o); };
      });
      const sent = () => page.evaluate(() => (window as unknown as { __sent: string[] }).__sent.length);
      const sentList = () => page.evaluate(() => (window as unknown as { __sent: string[] }).__sent);
      await page.goto(`${base}?desk=1`);
      const box = page.locator(".dk-ask input").first();
      await box.waitFor();
      // Her page has finished loading (its idle chunks too) before the network drops, as a shopper's would have.
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2500);
      if (flow === "shop") {
        // Read online, then the Shop fails offline.
        await page.getByRole("button", { name: "A Marsh Lights ticket under $90" }).click();
        const shop = page.getByRole("button", { name: /Shop for this/ });
        await shop.waitFor();
        await ctx.setOffline(true);
        await shop.click();
      } else {
        await ctx.setOffline(true);
        await box.fill("A kettle under $60");
        await box.press("Enter");
      }
      await page.locator(".dk-s-wait .dk-live.dk-done").waitFor({ timeout: 8000 }).catch(() => undefined);
      const first = await sent();
      const controls = () => page.locator(".dk-s-wait").locator("button, a").allInnerTexts().then((t) => t.map((x) => x.trim()));
      if (flow === "changed" || flow === "shop") {
        await page.locator(".dk-ask input").first().fill("A teapot under $40");
        // Her new words aren't asked by themselves, so the line no longer promises it (the kit's own offline line).
        const line = (await page.locator(".dk-s-wait .dk-fiction").innerText().catch(() => "")).trim();
        check(line === "What's on screen stays.", `${size} offline, new words typed (${flow}): the line promises nothing she didn't ask, “${line}”`);
        await ctx.setOffline(false);
        await page.waitForTimeout(1500);
        await page.locator(".dk-s-wait .st-note-action").first().waitFor({ timeout: 3000 }).catch(() => undefined); // the kit's pill is its own chunk
        const more = (await sent()) - first, kept = await page.locator(".dk-ask input").first().inputValue();
        check(more === 0 && kept === "A teapot under $40", `${size} offline, new words typed, back online (${flow}): ${more} request(s) sent by themselves (want 0), the box keeps “${kept}”`);
        const title = (await page.locator(".dk-s-wait .dk-s-why").innerText().catch(() => "")).trim();
        check(title === "That didn't go through while you were offline.", `${size} offline, new words typed, back online (${flow}): the block's title is “${title}” (not “You're offline.”)`);
        const ways = await controls();
        if (flow === "changed") {
          check(first === 1 && ways.length === 0, `${size} failed ask, back online with new words: ${ways.length} control(s) in the block (want 0: her box and arrow) ${JSON.stringify(ways)}`);
        } else {
          check(ways.length === 1 && ways[0] === "Try again", `${size} failed Shop, back online with new words: the block's controls ${JSON.stringify(ways)} (want exactly ["Try again"])`);
          const before = await sent();
          await page.locator(".dk-s-wait").getByRole("button", { name: "Try again" }).click({ timeout: 3000 }).catch(() => undefined);
          await page.waitForTimeout(1500);
          const after = (await sentList()).slice(before);
          const shops = after.filter((u) => /\/api\/runs\/market\/ask\b/.test(u));
          const bubble = shops.length === 1 && !!shops[0]?.includes("A Marsh Lights ticket under $90");
          const keptAfter = await page.locator(".dk-ask input").first().inputValue();
          check(after.length === 1 && bubble, `${size} failed Shop, Try again pressed: ${after.length} request(s), the bubble's words in one shop ${bubble ? "yes" : "NO"} ${JSON.stringify(after.map((u) => u.replace(/^.*\/api/, "/api")))}`);
          check(keptAfter === "A teapot under $40", `${size} failed Shop, Try again pressed: the box keeps “${keptAfter}”`);
        }
      } else if (flow === "same") {
        await ctx.setOffline(false);
        await page.waitForTimeout(1500);
        const more = (await sent()) - first;
        check(first === 1 && more === 1, `${size} offline, words unchanged, back online: asked again ${more} time(s) (want 1)`);
      } else {
        // A flapping network: two online events in one task, before React re-renders, still send one request.
        await page.evaluate(() => { dispatchEvent(new Event("online")); dispatchEvent(new Event("online")); });
        await page.waitForTimeout(800);
        const more = (await sent()) - first;
        check(first === 1 && more <= 1, `${size} offline, two online events at once: ${more} request(s) sent (want at most 1)`);
      }
      const own = errors.filter((e) => !/Failed to load resource|net::ERR/.test(e));
      check(own.length === 0, `${size} offline re-ask (${flow}): 0 page errors ${JSON.stringify(own)}`);
      await ctx.close();
    }
    // The server waking under her pending ask (the DD, part 2 nit 2): the block says it fills in when it answers, with no
    // button, said once (R's page-wide line stands down); a sleeping server is one quiet for 14 minutes (waking.ts), so
    // the page's clock jumps 15 minutes before the ask, and the ask is held 4.5 s (the block shows after 2 s).
    {
      const { ctx, page, errors } = await make(21, null);
      await page.clock.install();
      await page.route("**/api/runs/market/ask", async (r) => { await new Promise((ok) => setTimeout(ok, 4500)); await r.fulfill({ status: 503, contentType: "text/html", body: "<p>waking</p>" }).catch(() => undefined); });
      await page.goto(`${base}?desk=1`);
      await page.getByRole("button", { name: "A Marsh Lights ticket under $90" }).click();
      const shop = page.getByRole("button", { name: /Shop for this/ });
      await shop.waitFor();
      await page.clock.fastForward("15:00");
      await shop.click();
      const pending = page.locator(".dk-s-wait .st-note[data-kind=waking]");
      const shown = await pending.getByText("This fills in when it answers.").waitFor({ timeout: 4000 }).then(() => true, () => false);
      await page.waitForTimeout(500); // its Enter, after 400 ms
      const buttons = await page.locator(".dk-s-wait button").count();
      const strip = await page.locator(".st-strip").evaluate((e) => getComputedStyle(e).display !== "none" && !(e as HTMLElement).hidden).catch(() => false);
      const said = (await page.locator("body").innerText()).match(/waking up/gi)?.length ?? 0;
      check(shown && buttons === 0 && !strip && said === 1, `${size} waking, ask pending: “This fills in when it answers.”, ${buttons} button(s), page-wide line ${strip ? "SHOWN" : "stood down"}, “waking up” said ${said} time(s)`);
      await page.screenshot({ path: join(out, `desk-state-waking-pending-${size}-${tag}.png`) });
      // DK part 7: three tries, each held 4.5 s, with 1 s and 3 s between them (QUIET_WAITS_MS), before the failure shows.
      await page.locator(".dk-s-wait .dk-live.dk-done").waitFor({ timeout: 25000 }).catch(() => undefined);
      await page.locator(".dk-s-wait .st-note-action").first().waitFor({ timeout: 3000 }).catch(() => undefined);
      const fills = (await page.locator("body").innerText()).match(/fills in/gi)?.length ?? 0;
      const again = await page.locator(".dk-s-wait").getByRole("button", { name: "Try again" }).count();
      check(fills === 0 && again === 1, `${size} waking, ask failed: Try again ${again}, “fills in” ${fills} time(s)`);
      const own = errors.filter((e) => !/Failed to load resource|net::ERR/.test(e));
      check(own.length === 0, `${size} waking pending: 0 page errors ${JSON.stringify(own)}`);
      await ctx.close();
    }
    // DK part 8 (the DD on quiet-failed-390, a dead end): a failed shop keeps her ask as the title and her words in the
    // box, says the failure under the title with "Nothing changed" as the marker, and offers Try again even while the
    // states kit's chunk hasn't loaded (held here, never answered). Try again asks the same read again with the same
    // words and sends nothing that could spend: no cart, want, limit, Approve or payment.
    {
      const { ctx, page, errors } = await make(21, null);
      const sent: string[] = [];
      let down = true;
      page.on("request", (q) => { if (q.url().includes("/api/") && !q.url().includes("/api/health")) sent.push(`${q.method()} ${new URL(q.url()).pathname} ${q.postData() ?? ""}`); });
      // The hold must hold something: the route counts the requests it held, and the case fails at 0 (a renamed chunk
      // would otherwise pass with the kit loaded). DK_KIT_CHUNK points it elsewhere for the red control.
      let held = 0;
      await page.route(process.env.DK_KIT_CHUNK ?? "**/assets/DeskState-*.js", () => { held++; });
      await page.route("**/api/runs/market/ask", (r) => (down ? r.abort() : r.continue()));
      await page.goto(`${base}?desk=1`);
      await page.getByRole("button", { name: "A Marsh Lights ticket under $90" }).click();
      const shop = page.getByRole("button", { name: /Shop for this/ });
      await shop.waitFor();
      await shop.click();
      await page.locator(".dk-s-wait .dk-live.dk-done").waitFor({ timeout: 15000 }).catch(() => undefined);
      const head = (await page.locator(".dk-s-wait h1").innerText().catch(() => "")).trim();
      const marker = (await page.locator(".dk-s-wait .dk-live").innerText().catch(() => "")).trim();
      const what = (await page.locator(".dk-s-wait .dk-s-why").innerText().catch(() => "")).trim();
      const box = await page.locator(".dk-ask input:visible").first().inputValue().catch(() => "");
      const again = page.locator(".dk-s-wait").getByRole("button", { name: "Try again" });
      const n = await again.count();
      check(held > 0 && head === "A Marsh Lights ticket under $90" && marker === "Nothing changed" && what === "Goose couldn't load this." && box === "A Marsh Lights ticket under $90" && n === 1,
        `${size} shop failed, kit held (${held} request(s) held): title “${head}”, marker “${marker}”, body “${what}”, box “${box}”, Try again ${n}`);
      await page.screenshot({ path: join(out, `desk-state-failed-kit-held-${size}-${tag}.png`) });
      const failedAsk = sent.filter((x) => x.includes("/api/runs/market/ask")).at(-1);
      const from = sent.length;
      down = false;
      if (n) await again.click();
      const ran = await page.locator(".dk-deal2").first().waitFor({ timeout: 15000 }).then(() => true, () => false);
      const after = sent.slice(from);
      const spends = after.filter((x) => /^POST \S*(cart|want|limit|approve|complete_payment|capture|order)/i.test(x));
      check(n === 1 && after[0] === failedAsk && spends.length === 0 && ran,
        `${size} shop failed: Try again sent ${JSON.stringify(after.slice(0, 2))} (the failed ask: ${JSON.stringify(failedAsk)}), ${spends.length} spending call(s), the market ${ran ? "came" : "did not come"}`);
      const own = errors.filter((e) => !/Failed to load resource|net::ERR/.test(e));
      check(own.length === 0, `${size} shop failed, kit held: 0 page errors ${JSON.stringify(own)}`);
      await ctx.close();
    }
    // No market for her words (the reword case): its action puts her words back in the Ask box and focuses it (check 2 f).
    {
      const { ctx, page } = await make(21, null);
      // The market maker's own failure (MARKET_FAILED, a 500 that asks her to reword).
      await page.route("**/api/runs/market/ask", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ kind: "failed", reason: "Goose couldn't build a market for that; try rewording." }) }));
      await page.goto(`${base}?desk=1`);
      await page.getByRole("button", { name: "A Marsh Lights ticket under $90" }).click();
      await page.getByRole("button", { name: /Shop for this/ }).click();
      await page.locator(".dk-s-wait .dk-live.dk-done").waitFor({ timeout: 8000 }).catch(() => undefined);
      await page.locator(".dk-s-wait .st-note-action").first().waitFor({ timeout: 3000 }).catch(() => undefined); // the kit's pill is its own chunk
      const change = page.locator(".dk-s-wait").getByRole("button", { name: "Change my words" });
      const has = await change.count() === 1 && await page.locator(".dk-s-wait").getByRole("button", { name: "Try again" }).count() === 0;
      const ways = await ((sel: string) => page.locator(sel).locator("a, button").evaluateAll((els) => els.map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim())))(".dk-s-wait");
      check(JSON.stringify(ways) === '["Change my words"]', `${size} no market: exactly one way forward ${JSON.stringify(ways)}`);
      if (has) await change.click();
      await page.waitForTimeout(400);
      const focused = await page.evaluate(() => { const a = document.activeElement as HTMLInputElement | null; return a?.tagName === "INPUT" ? a.value : null; });
      check(has && focused === "A Marsh Lights ticket under $90", `${size} no market: “Change my words” focuses the Ask box with her words (${JSON.stringify(focused)})`);
      await page.screenshot({ path: join(out, `desk-state-reword-${size}-${tag}.png`) });
      await ctx.close();
    }
    // A pane: loading (held 1.5 s: the line shows after 400 ms), then empty (Your wants with nothing saved).
    {
      const { ctx, page } = await make(21, null);
      await page.route("**/api/runs/wants", async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ wants: [], limits: [] }) }); });
      await page.goto(`${base}?desk=1#wants`);
      await page.getByText("Goose is loading this.").waitFor({ timeout: 3000 }).catch(() => undefined);
      await page.waitForTimeout(500); // the kit's block fades in after 400 ms
      check(await page.getByText("Goose is loading this.").isVisible(), `${size} Your wants loading: one quiet line after 400 ms`);
      await page.screenshot({ path: join(out, `desk-state-loading-${size}-${tag}.png`) });
      await page.getByText("No wants yet.").waitFor({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(500);
      const open = page.locator(".dk-pane .st-note").getByRole("button", { name: "Ask Goose", exact: true });
      const ob = await open.boundingBox().catch(() => null);
      check(!!ob && ob.height >= 44, `${size} Your wants empty: one block, “Ask Goose” ${ob ? Math.round(ob.height) : 0}px`);
      // The DD (part 2 nit 4): its title is the kit's title (--display 400 at --t-h3: 24 px, 20 at ≤720).
      const t = await page.getByText("No wants yet.").evaluate((e) => { const c = getComputedStyle(e); return { cls: e.className, size: c.fontSize, weight: c.fontWeight, face: c.fontFamily.split(",")[0] }; }).catch(() => null);
      const want = size === "390" ? "20px" : "24px";
      check(!!t && t.cls === "st-note-title" && t.size === want && t.weight === "400", `${size} Your wants empty: title ${JSON.stringify(t)} (want st-note-title, ${want}, 400)`);
      await page.screenshot({ path: join(out, `desk-state-empty-${size}-${tag}.png`) });
      // The DD (part 2 nit 3): Ask Goose opens the Ask box with focus in it.
      if (ob) await open.click();
      await page.waitForTimeout(400);
      const inBox = await page.evaluate(() => { const a = document.activeElement; return a?.tagName === "INPUT" && !!a.closest(".dk-ask"); });
      check(inBox, `${size} Your wants empty: “Ask Goose” focuses the Ask box`);
      await ctx.close();
    }
    // A pane whose read is capped says so, not "nothing saved".
    {
      const { ctx, page } = await make(21, null);
      await page.route("**/api/runs/wants", (r) => r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "capped" }) }));
      await page.goto(`${base}?desk=1#wants`);
      await page.getByText("That's today's limit from here.").waitFor({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(500);
      check(await page.getByText("That's today's limit from here.").isVisible() && !(await page.getByText("No wants yet.").isVisible()), `${size} Your wants capped: the cap, never “No wants yet.”`);
      const ways = await ((sel: string) => page.locator(sel).locator("a, button").evaluateAll((els) => els.map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim())))(".dk-pane .st-note");
      const href = await page.locator(".dk-pane .st-note a").first().getAttribute("href").catch(() => null);
      check(JSON.stringify(ways) === '["Watch the recorded week ›"]' && href === "/?desk=haggle", `${size} Your wants capped: exactly one way forward ${JSON.stringify(ways)} to ${href}`);
      await page.screenshot({ path: join(out, `desk-state-pane-capped-${size}-${tag}.png`) });
      await ctx.close();
    }
  }
}
await browser.close();
// The DD's check 2: no section says more at 390 than at 1440.
for (const [sec, n] of Object.entries(bySection)) {
  console.log(`${sec}: ${n["1440"]} at 1440, ${n["390"]} at 390`);
  if (strict && n["1440"] !== undefined && n["390"] !== undefined) check(n["390"] <= n["1440"], `${sec}: ${n["390"]} words at 390, not more than ${n["1440"]} at 1440`);
}
result["by-section"] = bySection;
writeFileSync(join(out, `words-${tag}.json`), JSON.stringify(result, null, 2));
console.log(failed ? `${failed} FAIL` : "all ok");
process.exit(strict && failed ? 1 : 0);
