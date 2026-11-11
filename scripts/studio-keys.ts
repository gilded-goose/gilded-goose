/// <reference lib="dom" />
// Behind the scenes by keyboard (Round 6's accessibility seat, Nov 5: 12 stops no one could see or name, 23 controls out
// of reach). AG Studio's own keyboard model: Tab moves card to card through each card's stop, Enter goes into the card,
// Tab moves among its controls, Escape comes back to the stop. This walks exactly that, with Tab, Enter and Escape only
// (Enter only ever on a card's stop, which opens nothing and pays nothing), at 1440 and 390, and fails when:
//   - a card's stop has no name, or shows no focus line when it has focus;
//   - anything else Tab lands on has no size or can't be seen;
//   - Enter on a card with controls leaves focus on its stop;
//   - a control a mouse can use is never reached.
//   node scripts/studio-keys.ts [url] [--control | --control-inert]   default http://localhost:8835
//   --control takes the names and the line off again; --control-inert takes ag-disabled off the inert chart canvases (AG's
//   Enter then picks the chart's inert proxy and stays put). Each must come back red, or the walk proves nothing.
// Edit mode only (Nov 5, with Track T's plain-tabs.ts): in view mode Tab goes straight through what the cards hold, AG's stops
// held out of the order, and scripts/plain-tabs-walk.ts walks that. Edit mode gives AG's stops back, and this walks them.
// Editing is a desktop thing (the phone has no Edit button), so 1440 only: the phone is view mode, plain-tabs-walk's.
// Last line: "studio-keys: N failed". Exit 1 when N is over 0.

import { chromium, type Page } from "playwright";

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) ?? "http://localhost:8835").replace(/\/$/, "");
const control = args.includes("--control");
const controlInert = args.includes("--control-inert");
const PAGES = ["/?desk=ledger&studio=force", "/?desk=studio&studio=force"];
const SIZES = [{ width: 1440, height: 900 }];
const STOP = "ag-studio-layout-widget-focus-container";
const MAX = 400;
let failed = 0;
const fail = (s: string) => { failed++; console.log(`FAIL ${s}`); };

/** Where focus is: a stable key, whether it's a card's stop, and what a user could see of it. */
// Read focus only after two frames: AG's tab guards and focus moves hand focus on a moment after the key, and that is
// where a person sees it land.
const where = (page: Page) => page.evaluate(async (STOP) => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return null;
  el.closest(".ag-root-wrapper")?.setAttribute("data-reached-grid", "1"); // Tab got into this grid
  el.closest(".ag-tabs-header")?.setAttribute("data-reached-tabs", "1"); // ...or this row of tabs
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const stop = el.classList.contains(STOP);
  const card = stop ? el.closest<HTMLElement>(".ag-studio-layout-widget") : null;
  const frame = card?.querySelector<HTMLElement>(":scope > .ag-studio-layout-widget-container");
  const line = frame ? getComputedStyle(frame) : null;
  return {
    sk: el.dataset.sk ?? null, stop, cardId: card ? String([...document.querySelectorAll(".ag-studio-layout-widget")].indexOf(card)) : null,
    name: (el.getAttribute("aria-label") ?? "").trim(), role: el.getAttribute("role"), described: !!el.getAttribute("aria-describedby"),
    ringed: !!line && line.outlineStyle !== "none" && parseFloat(line.outlineWidth) >= 2,
    sized: r.width >= 1 && r.height >= 1 && cs.visibility !== "hidden" && cs.opacity !== "0",
    what: `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]} "${(el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50)}"`,
  };
}, STOP);

const browser = await chromium.launch();
try {
  for (const path of PAGES) for (const size of SIZES) {
    const tag = `${path} ${size.width}`;
    const page = await browser.newPage({ viewport: size });
    await page.goto(base + path, { waitUntil: "load" });
    const drew = await page.waitForSelector(`.${STOP}`, { state: "attached", timeout: 30_000 }).then(() => true, () => false);
    if (!drew) { fail(`${tag}: Studio never drew its cards`); await page.close(); continue; }
    await page.waitForTimeout(2500);
    // Into edit mode with its own button (a click: the switch is the page's, and nothing in edit mode is saved).
    const editing = await page.locator(".st-switch").click({ timeout: 10_000 }).then(() => page.waitForFunction(() => document.querySelector(".st-studio")?.getAttribute("data-mode") === "edit", null, { timeout: 10_000 })).then(() => true, () => false);
    if (!editing) { fail(`${tag}: couldn't enter edit mode`); await page.close(); continue; }
    await page.waitForTimeout(2500);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    if (control) await page.addStyleTag({ content: `.st-studio .ag-studio-layout-widget-container { outline: none !important; }` }).then(() => page.evaluate((STOP) => { for (const s of document.querySelectorAll(`.${STOP}`)) { s.removeAttribute("aria-label"); s.removeAttribute("role"); } new MutationObserver(() => { for (const s of document.querySelectorAll(`.${STOP}`)) if (s.hasAttribute("aria-label")) s.removeAttribute("aria-label"); }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["aria-label"] }); }, STOP));
    if (controlInert) await page.evaluate(() => { for (const c of document.querySelectorAll(".lx-chart-canvas.ag-disabled")) c.classList.remove("ag-disabled"); });
    // Every control a mouse can use: enabled, with a size, visible, not in an inert or hidden subtree.
    const controls = await page.evaluate(() => {
      const sel = "a[href], button, input, select, textarea, [role=button], [role=tab], [role=link], [role=checkbox], [role=switch], [role=combobox], summary";
      return [...document.querySelectorAll<HTMLElement>(sel)].map((el, i) => {
        el.dataset.sk = String(i);
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        // Not judged, AG's own editing chrome: a card's skeleton drop targets (tabindex -1, for dragging a field on).
        const chrome = !!el.closest(".ag-studio-layout-widget-skeleton");
        const usable = !chrome && r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !(el as HTMLButtonElement).disabled && !el.closest("[inert],[aria-hidden=true]");
        return { i, usable, what: `<${el.tagName.toLowerCase()}> "${(el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50)}"` };
      }).filter((c) => c.usable);
    });
    const reached = new Set<string>();
    const cards = new Set<string>();
    let first: string | null = null, presses = 0;
    while (presses++ < MAX) {
      await page.keyboard.press("Tab");
      const at = await where(page);
      if (!at) continue;
      const key = at.sk ?? (at.stop ? `card:${at.cardId}` : at.what);
      if (first === null) first = key; else if (key === first) break; // came round
      if (at.sk) reached.add(at.sk);
      if (!at.stop) { if (!at.sized) fail(`${tag}: Tab stops on something no one can see: ${at.what}`); continue; }
      if (cards.has(key)) continue;
      cards.add(key);
      if (!at.name || at.role !== "group" || !at.described) fail(`${tag}: a card's stop has no name, role or Enter/Escape sentence (${at.cardId})`);
      if (!at.ringed) fail(`${tag}: card "${at.name || at.cardId}" shows no focus line when its stop has focus`);
      // Into the card: Enter, then Tab among its controls until they come round, then Escape back to the stop.
      await page.keyboard.press("Enter");
      const entered = await where(page);
      const has = await page.evaluate(({ STOP, n }) => { const card = document.querySelectorAll(".ag-studio-layout-widget")[n]; return !!card && [...card.querySelectorAll<HTMLElement>("[data-sk]")].some((c) => !c.classList.contains(STOP)); }, { STOP, n: Number(at.cardId) });
      if (entered?.stop && has) fail(`${tag}: Enter on "${at.name}" doesn't go into the card, though it has controls (focus stays on ${entered.what}, card ${entered.cardId}, entered from card ${at.cardId})`);
      const inside = new Set<string>();
      for (let n = 0; n < 80; n++) {
        const now = await where(page);
        if (!now || now.stop) break;
        const k = now.sk ?? now.what;
        if (inside.has(k)) break;
        inside.add(k);
        if (now.sk) reached.add(now.sk);
        if (!now.sized) fail(`${tag}: inside "${at.name}", Tab stops on something no one can see: ${now.what}`);
        await page.keyboard.press("Tab");
      }
      await page.keyboard.press("Escape");
      const back = await where(page);
      if (!back?.stop) fail(`${tag}: Escape in "${at.name}" didn't come back to the card`);
    }
    // An AG Grid's header filters are reached with the grid's own arrow keys (its keyboard model, the ARIA grid pattern),
    // not with Tab: they count once Tab has reached that grid at all.
    const viaGrid = await page.evaluate((got) => {
      const out: string[] = [];
      for (const grid of document.querySelectorAll(".ag-root-wrapper")) {
        if (!grid.hasAttribute("data-reached-grid") && ![...grid.querySelectorAll<HTMLElement>("[data-sk]")].some((c) => got.includes(c.dataset.sk!))) continue;
        for (const c of grid.querySelectorAll<HTMLElement>(".ag-floating-filter [data-sk]")) out.push(c.dataset.sk!);
      }
      return out;
    }, [...reached]);
    for (const k of viaGrid) reached.add(k);
    // A row of tabs is the same (the ARIA tabs pattern): Tab reaches the row, the arrows move between its tabs.
    const viaTabs = await page.evaluate(() => [...document.querySelectorAll(".ag-tabs-header[data-reached-tabs]")].flatMap((h) => [...h.querySelectorAll<HTMLElement>("[data-sk]")].map((c) => c.dataset.sk!)));
    for (const k of viaTabs) reached.add(k);
    const missed = controls.filter((c) => !reached.has(String(c.i)));
    console.log(`${tag}: ${cards.size} cards, ${controls.length} usable controls, ${reached.size} reached`);
    for (const m of missed) fail(`${tag}: never reached by keyboard: ${m.what}`);
    await page.close();
  }
} finally { await browser.close(); }
console.log(`studio-keys: ${failed} failed`);
process.exit(failed ? 1 : 0);
