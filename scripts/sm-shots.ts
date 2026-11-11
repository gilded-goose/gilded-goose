/// <reference lib="dom" />
// Track SM: shots (and a 6 s webm) of the run page's set-aside at 1440 and 390, dark, with the DD's proofs:
// the deal card's rect before and after the verdict (must be equal at 1440), a 390 frame while rows 2-3 still arrive
// (nothing below the grown row jumps), the case's words equal the API's fenced `quoted`, replay from the Why sheet.
// SM-3 (Round 2 design judge) adds four states, asserted at both widths: the verdict carries its number (0 ms of "…"
// under "Your money stays put", sampled every frame); at done on a phone the sentence is said once (the pin steps aside
// once the card's own "Your money stays put." is in view); the heading is never under the pin and the finish does not
// scroll again (one scroll for the whole run); the case is the quote and the engraving only (C's line is in the Why sheet).
// SM-5 (Round 3 design judge, fix 1) measures every frame from Shop for this to done + 1 s: "…" in no frame; the price's
// box still from the verdict to done + 1 s; Approve's top never moves once drawn; the right column's opacity 1 after
// the verdict. Each size's frames go to frames-<size>.json beside the shots.
// SM-7 (DD's SM-6 ruling 2): no frame shows a price (the card's or the pin's) whose row has not read clean, the first price
// lands in the frame its row says "Nothing set aside" (the verdict draws the shield line alone), and the pin is never drawn empty.
// usage (server on 8847 serving web/dist): node scripts/sm-shots.ts docs/video/track-sm/after [--video] [--rm] [--ask "words"] [--base http://localhost:8847/]
import { chromium, devices } from "playwright";
import { mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { localOnly } from "./not-live.ts";

const args = process.argv.slice(2);
const out = args[0]!;
const video = args.includes("--video");
const rm = args.includes("--rm");
const ask = args.includes("--ask") ? args[args.indexOf("--ask") + 1]! : "A Marsh Lights ticket under $90";
const base = localOnly(args.includes("--base") ? args[args.indexOf("--base") + 1]! : "http://localhost:8847/");
mkdirSync(out, { recursive: true });
const sfx = rm ? "-rm" : "";
let failed = 0;
const check = (ok: boolean, what: string) => { const soft = what.includes("[reduced motion"); console.log(`${ok ? "ok  " : soft ? "note" : "FAIL"} ${what}`); if (!ok && !soft) failed++; };

const api = await fetch(`${base}api/runs/market/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ words: ask }) }).then((r) => r.json()) as { results: { id: string; quoted: string; watcher: string; said: string[] }[] };
const aside = api.results.find((r) => r.watcher === "refuse")!;

const browser = await chromium.launch();
// 390x667 (a shorter phone, the iPhone SE's height): the deal card is below the fold at the verdict, so the pin stands in
// for it; on 390x844 the card itself stays in view and the pin waits aside.
for (const size of ["1440", "390", "390x667"] as const) {
  const vp = size === "1440" ? { width: 1440, height: 900 } : size === "390" ? { width: 390, height: 844 } : { width: 390, height: 667 };
  const phone = size !== "1440";
  const ctx = await browser.newContext({
    // SM-7: stills at DPR 1 (the DD gates from them; layout is in CSS px either way).
    ...(phone ? devices["iPhone 13"] : {}), deviceScaleFactor: 1, viewport: vp, colorScheme: "dark", reducedMotion: rm ? "reduce" : "no-preference",
    ...(video ? { recordVideo: { dir: out, size: vp } } : {}),
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}?desk=1`);
  const box = page.getByRole("textbox", { name: "Ask for anything" });
  await box.waitFor();
  await box.fill(ask);
  await page.getByRole("button", { name: "Ask Goose" }).first().click();
  await page.getByRole("button", { name: /Shop for this/ }).click();
  const t0 = Date.now();
  // Every frame from here: the deal card's eyebrow and price (text, visibility, document box), the pin's text and
  // opacity, the right column's opacity (the column and the two cards in it), Approve's box, the page's scroll, and
  // which beat the run is at (a row set aside = the verdict; "Checked N listings." = done). SM-5 asserts on these.
  await page.evaluate(() => {
    type F = { t: number; eb: string; ebVis: boolean; big: string; bigVis: boolean; bigBox: number[] | null; pin: string; pinOp: number; pinPr: string; pinEmpty: boolean; y: number; colOp: number; appr: number[] | null; verdict: boolean; done: boolean; protVis: boolean; money: boolean; says: number; empty: string[]; rows: string[]; rowSt: string[]; rightTop: number | null };
    const w = window as unknown as { __sm: F[] };
    w.__sm = [];
    const t0 = performance.now();
    const op = (e: Element | null) => { let o = 1; for (let n = e; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
    const vis = (e: Element | null) => !!e && getComputedStyle(e).visibility === "visible" && op(e) > 0.05;
    // The money in view (the card's price whole between the pin and the rail, or the readable pin's price) and how many
    // times "Your money stays put." is readable on the screen (the pin's line, the card's line).
    const said = () => {
      const rail = innerHeight; // no bottom rail (S1-13): the window's foot
      const pin = document.querySelector(".sm-pin"), pr = pin?.getBoundingClientRect();
      const pinOn = !!pin && !!pr && getComputedStyle(pin).display !== "none" && op(pin) > 0.5 && pr.top >= 0 && pr.bottom <= innerHeight;
      const band = pinOn ? pr!.bottom : 0;
      const inside = (e: Element | null) => { if (!e || !vis(e)) return false; const r = e.getBoundingClientRect(); return r.top >= band - 1 && r.bottom <= rail + 1; };
      const pinStay = pinOn && getComputedStyle(pin!.querySelector(".sm-pin-stay")!).visibility === "visible";
      return { money: inside(document.querySelector(".dk-live-grid .dk-deal2 .dk-big")) || pinOn, says: (pinStay ? 1 : 0) + (inside(document.querySelector(".dk-live-grid .dk-stay")) ? 1 : 0) };
    };
    // SM-6 (Round 4 design judge, "the run opens on empty containers"): a drawn panel (its own border, fill, shadow or
    // backdrop; or the seller list's frame, drawn by its ::before) that stands empty: a vertical stretch inside it of
    // more than EMPTY px that no drawn content covers (text, an svg or img, or a small drawn mark such as a row's
    // initial). Card padding and the gaps between a card's lines are under it; a held line or an empty list area is over.
    const EMPTY = 56;
    const alpha = (c: string) => (c === "transparent" ? 0 : /rgba?\(/.test(c) ? Number(c.match(/[\d.]+/g)![3] ?? 1) : 1);
    const framed = (s: CSSStyleDeclaration) => s.visibility === "visible" && parseFloat(s.opacity) > 0.05 && (alpha(s.backgroundColor) > 0 || s.boxShadow !== "none" || (s.backdropFilter && s.backdropFilter !== "none") || (["Top", "Right", "Bottom", "Left"] as const).some((k) => parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== "none" && alpha(s[`border${k}Color`]) > 0));
    const emptyPanels = (): string[] => {
      const stage = document.querySelector(".dk-stage");
      if (!stage) return [];
      const panels: { el: Element; top: number; bottom: number; name: string }[] = [];
      for (const el of [...stage.querySelectorAll("*")]) {
        const r = el.getBoundingClientRect();
        if (r.height >= 48 && r.width >= 48 && framed(getComputedStyle(el)) && op(el) > 0.05) panels.push({ el, top: r.top, bottom: r.bottom, name: `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}` });
        const b = getComputedStyle(el, "::before");
        if (b.content !== "none" && b.position === "absolute" && framed(b) && op(el) > 0.05) {
          const h = parseFloat(b.height), t = r.top + parseFloat(b.top);
          if (h >= 48) panels.push({ el, top: t, bottom: t + h, name: `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}::before` });
        }
      }
      const out: string[] = [];
      for (const p of panels) {
        const cover: [number, number][] = [];
        const walk = document.createTreeWalker(p.el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (n.nodeType === Node.TEXT_NODE) {
            const par = n.parentElement;
            if (!n.textContent?.trim() || !par || getComputedStyle(par).visibility !== "visible" || op(par) <= 0.05) continue;
            const rg = document.createRange(); rg.selectNodeContents(n);
            for (const q of rg.getClientRects()) if (q.height > 0) cover.push([q.top, q.bottom]);
          } else {
            const e = n as Element, s = getComputedStyle(e), q = e.getBoundingClientRect();
            if (q.height <= 0 || s.visibility !== "visible" || op(e) <= 0.05) continue;
            if (e instanceof SVGSVGElement || e.tagName === "IMG" || (q.height < 48 && framed(s))) cover.push([q.top, q.bottom]);
          }
        }
        cover.sort((a, b) => a[0] - b[0]);
        let at = p.top, gap = 0;
        for (const [a, b] of cover) { if (b <= p.top || a >= p.bottom) continue; gap = Math.max(gap, a - at); at = Math.max(at, b); }
        gap = Math.max(gap, p.bottom - at);
        if (gap > EMPTY) out.push(`${p.name} ${Math.round(gap)}px of ${Math.round(p.bottom - p.top)}`);
      }
      return out;
    };
    // The price each drawn row of the list shows (a held row is not drawn), and the right column's layout top (document
    // coordinates, its own enter's translate taken out).
    // A row counts from the frame it starts to draw (its enter has begun: visible, opacity above 0).
    const drawnRows = () => [...document.querySelectorAll(".dk-live-grid .dk-fr")].filter((e) => getComputedStyle(e).visibility === "visible" && op(e) > 0);
    const rowPrices = () => drawnRows().map((e) => e.querySelector(".dk-price")?.textContent ?? "");
    // SM-7: each drawn row's price and its status line as drawn ("$84.00|Reading its note…", "$84.00|Nothing set aside").
    const rowStatus = () => drawnRows().map((e) => `${e.querySelector(".dk-price")?.textContent ?? ""}|${e.querySelector(".dk-st")?.textContent ?? ""}`);
    // The pin's price, when it is readable (the pin drawn and its price part not held).
    // The pin drawn with no words in it (its band and hairline over nothing).
    const pinEmpty = () => { const p = document.querySelector<HTMLElement>(".sm-pin"); return !!p && getComputedStyle(p).display !== "none" && op(p) > 0.05 && p.innerText.trim() === ""; };
    const pinPrice = () => { const p = document.querySelector(".sm-pin"), d = p?.querySelector(".sm-pin-deal"); return p && d && getComputedStyle(p).display !== "none" && op(p) > 0.05 && getComputedStyle(d).visibility === "visible" ? d.querySelector("b")?.textContent ?? "" : ""; };
    const rightTop = () => {
      const e = document.querySelector(".dk-live-grid .dk-right");
      if (!e) return null;
      const t = getComputedStyle(e).transform;
      return Math.round(e.getBoundingClientRect().top - new DOMMatrixReadOnly(t === "none" ? undefined : t).m42 + scrollY);
    };
    const f = () => {
      const pin = document.querySelector(".sm-pin"), eb = document.querySelector(".dk-deal2 .dk-eyebrow"), big = document.querySelector(".dk-deal2 .dk-big");
      const right = document.querySelector(".dk-live-grid .dk-right"), prot = document.querySelector(".dk-live-grid .dk-protect");
      const b = big?.getBoundingClientRect();
      const ap = [...document.querySelectorAll(".dk-live-grid button.dk-approve")].find((e) => /^Approve \$/.test(e.textContent ?? ""))?.getBoundingClientRect();
      const cols = [right, document.querySelector(".dk-live-grid .dk-deal2"), prot && vis(prot) ? prot : null].filter((e): e is Element => !!e);
      w.__sm.push({ t: performance.now() - t0, eb: eb?.textContent ?? "", ebVis: vis(eb), big: big?.textContent ?? "", bigVis: vis(big),
        bigBox: b ? [Math.round(b.x), Math.round(b.y + scrollY), Math.round(b.width), Math.round(b.height)] : null,
        pin: pin?.textContent ?? "", pinOp: pin ? op(pin) : 0, pinPr: pinPrice(), pinEmpty: pinEmpty(), y: scrollY, colOp: cols.length ? Math.min(...cols.map(op)) : 1,
        appr: ap ? [Math.round(ap.top + scrollY), Math.round(ap.top)] : null,
        verdict: !!document.querySelector(".dk-live-grid .dk-fr.dk-aside"), done: !!document.querySelector(".dk-live-grid .dk-live.dk-done"), protVis: vis(prot), ...said(),
        empty: emptyPanels(), rows: rowPrices(), rowSt: rowStatus(), rightTop: rightTop() });
      if (performance.now() - t0 < 8000) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  // Document coordinates (the stage's own smooth scroll on a phone must not read as a move).
  // SM-5: its layout box (the column's own enter at the run's start is a translate, not a move).
  const rect = (sel: string) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const t = getComputedStyle(e).transform; const m = new DOMMatrixReadOnly(t === "none" ? undefined : t); return [Math.round(r.x - m.m41), Math.round(r.y - m.m42 + scrollY), Math.round(r.width), Math.round(r.height)]; }, sel);
  const rows = () => page.evaluate(() => [...document.querySelectorAll(".dk-live-grid .dk-fr")].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.y + scrollY), Math.round(r.height)]; }));
  // F1: the first row has arrived, its note not yet read
  await page.locator(".dk-live-grid .dk-fr").first().waitFor({ timeout: 30_000 });
  if (phone) await page.waitForTimeout(350); // the stage's own scroll settles before the frame
  const dealBefore = await rect(".dk-right");
  if (!rm) await page.screenshot({ path: join(out, `f1-arrive-${size}${sfx}.png`) });
  // F2: the verdict: the case rises into the row (the one motion)
  const tRow = Date.now() - t0;
  await page.locator(".sm-case").first().waitFor({ timeout: 30_000 });
  const tAside = Date.now() - t0;
  // Session 2 (Round 1 judge): the payoff is said at the verdict, not at done; on the phone the money is pinned in view.
  // SM-7: the eyebrow as drawn (null while the price's block is not drawn: at the verdict the card says its shield line alone).
  const eyebrowAtVerdict = await page.locator(".dk-live-grid .dk-deal2 .dk-eyebrow").first().evaluate((e) => (e as HTMLElement).checkVisibility({ visibilityProperty: true }) ? e.textContent : null);
  // SM-5: the payoff is the protection line at the top of the one card, drawn from the verdict (its place held before).
  const stayAtVerdict = await page.locator(".dk-live-grid .dk-protect").first().evaluate((e) => getComputedStyle(e).visibility === "visible" ? e.textContent : null);
  const doneAtVerdict = (await page.getByText(/^Checked \d+ listings?\./).count()) > 0;
  // The pin steps aside (opacity 0) while the deal card itself is in view, so "shown" means: the pin is readable in the
  // viewport, or the card it stands in for is. `cardIn` says which.
  const pin = () => page.evaluate(() => { const e = document.querySelector(".sm-pin"); if (!e) return null; const r = e.getBoundingClientRect(); const s = getComputedStyle(e); const c = document.querySelector(".dk-live-grid .dk-right")?.getBoundingClientRect(); const cardIn = !!c && c.height > 0 && c.top < innerHeight && c.bottom > 0; const pinIn = s.display !== "none" && Number(s.opacity) > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; return { text: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), pinIn, cardIn, stuck: e.hasAttribute("data-stuck"), shown: pinIn || cardIn }; });
  const pinAtF2 = await pin(); // read the instant the case is there, before the enter settles
  // SM-4 (DD nit 2): the verdict frame is taken at case + 100 ms, while the case rises; on 844 the run finishes ~1 s
  // after the verdict, so a frame after the settle could already be a done frame.
  await page.waitForTimeout(rm ? 0 : 100);
  await page.screenshot({ path: join(out, `f2-verdict-${size}${sfx}.png`) });
  await page.waitForTimeout(rm ? 50 : 350); // the enter is --d-3 400 ms
  const dealAfter = await rect(".dk-right");
  const rowsAtF2 = await rows();
  // SM-7: the card grows down by its price in the frame the next seller's row says "Nothing set aside" (a beat after the verdict).
  await page.locator(".dk-live-grid .dk-deal2 .dk-big").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(rm ? 0 : 100);
  await page.screenshot({ path: join(out, `f2b-priced-${size}${sfx}.png`) });
  // F3: the rows under it arrive; the grown row and everything above it hold their place
  await page.locator(".dk-live-grid .dk-fr").nth(2).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(200);
  const rowsAtF3 = await rows();
  const pinAtF3 = await pin();
  await page.screenshot({ path: join(out, `f3-arriving-${size}${sfx}.png`) });
  // F4: done
  await page.getByText(/^Checked \d+ listings?\./).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(out, `f4-done-${size}${sfx}.png`) });
  if (video) await page.waitForTimeout(1500);
  const pinAtF4 = await pin();
  // SM-5 (Round 3 design judge, fix 1): the four measurements, on every frame from Shop for this to done + 1 s.
  type F = { t: number; eb: string; ebVis: boolean; big: string; bigVis: boolean; bigBox: number[] | null; pin: string; pinOp: number; pinPr: string; pinEmpty: boolean; y: number; colOp: number; appr: number[] | null; verdict: boolean; done: boolean; protVis: boolean; money: boolean; says: number; empty: string[]; rows: string[]; rowSt: string[]; rightTop: number | null };
  const frames = await page.evaluate(() => (window as unknown as { __sm: F[] }).__sm);
  writeFileSync(join(out, `frames-${size}${sfx}.json`), JSON.stringify(frames));
  const flip = frames.findIndex((f) => f.verdict);
  const doneAt = frames.find((f) => f.done)?.t ?? Infinity;
  const win = frames.filter((f, i) => flip >= 0 && i >= flip && f.t <= doneAt + 1000);
  // (1) "…" in no frame: not the big number, not the eyebrow, not a readable pin, from the first frame on.
  const dots = frames.filter((f) => (f.bigVis && f.big.includes("…")) || (f.ebVis && f.eb.includes("…")) || (f.pinOp > 0.05 && f.pin.includes("…")));
  check(dots.length === 0, `${size}: [SM-5 a] "…" in ${dots.length} of ${frames.length} frames${dots.length ? ` (+${Math.round(dots[0]!.t)} → +${Math.round(dots.at(-1)!.t)} ms)` : ""}`);
  // SM-7 (replaces SM-3's "the verdict carries its number"): the verdict's first frame draws the shield line, and a price
  // only if a drawn row already reads clean (in this market none does yet: the card says the line alone).
  const v0 = frames[flip];
  // Read clean: "Nothing set aside" ("Best deal you can trust" at done; a held seller's "Waits for your yes: …" is read too, decided by default).
  const clean = (f: F, p: string) => f.rowSt.some((s) => s === `${p}|Nothing set aside` || s === `${p}|Best deal you can trust` || s.startsWith(`${p}|Waits for your yes`));
  check(!!v0 && v0.protVis && !(v0.bigVis && !clean(v0, v0.big)) && !v0.big.includes("…"), `${size}: [SM-7] the verdict's first frame draws the shield line${v0?.bigVis ? ` over "${v0.eb}" ${v0.big}` : " alone (no price, no eyebrow)"}`);
  // (2) the price's box is still from its first frame to done + 1 s (document coordinates: x, y, height). SM-7: the card
  // grows down by the price a beat after the verdict, so the window starts at the price, not the verdict.
  const priceShown = (f: F) => f.bigVis && /^\$\d/.test(f.big);
  const pFirst = frames.findIndex(priceShown);
  const pwin = frames.filter((f, i) => pFirst >= 0 && i >= pFirst && f.t <= doneAt + 1000);
  const boxes = new Set(pwin.map((f) => (f.bigBox ? `${f.bigBox[0]},${f.bigBox[1]},${f.bigBox[3]}` : "none")));
  check(pwin.length > 0 && boxes.size === 1, `${size}: [SM-5 b] the price's box (x,y,h) from its first frame to done + 1 s: ${[...boxes].join(" → ")} over ${pwin.length} frames`);
  // (3) Approve's top never moves once it is drawn (document and screen).
  const tops = new Set(win.filter((f) => f.appr).map((f) => f.appr!.join("/")));
  const lastTop = frames.filter((f) => f.appr).at(-1)?.appr?.join("/");
  check(tops.size === 1 && [...tops][0] === lastTop, `${size}: [SM-5 c] Approve's top (page/screen) from its first frame to done + 1 s: ${[...tops].join(" → ")}; at the end ${lastTop}`);
  // (4) the right column's opacity (the column and its cards) is 1 in every frame after the verdict.
  const low = win.filter((f) => f.colOp < 0.999);
  check(low.length === 0, `${size}: [SM-5 d] the right column's lowest opacity after the verdict ${Math.min(...win.map((f) => f.colOp)).toFixed(3)} (${low.length} frames under 1)`);
  // (5) from the verdict to done + 1 s the money is in view in every frame, and its sentence is said at most once.
  // (The pin's own arrival fade at the verdict is allowed: once the money is on the screen it never leaves it.)
  const firstMoney = win.findIndex((f) => f.money), lost = firstMoney < 0 ? win : win.slice(firstMoney).filter((f) => !f.money), twice = win.filter((f) => f.says > 1);
  check(firstMoney >= 0 && lost.length === 0 && twice.length === 0, `${size}: [SM-5 e] the price on the screen ${firstMoney < 0 ? "never" : `${Math.round(win[firstMoney]!.t - win[0]!.t)} ms after the verdict`}, then off it in ${lost.length} of ${win.length - Math.max(firstMoney, 0)} frames; "Your money stays put." twice in ${twice.length} of ${win.length}`);
  // SM-3 state 3 (scroll part): after the verdict the page does not scroll again (one scroll for the whole run).
  const yAtFlip = v0?.y ?? 0, moves = new Set(frames.slice(Math.max(0, flip)).map((f) => Math.round(f.y)));
  check(moves.size === 1, `${size}: no scroll from the verdict through done (scrollY ${[...moves].join(" → ")}; ${Math.round(yAtFlip)} at the verdict)`);
  // SM-6 (Round 4 design judge, the run's first second), on every frame from Shop for this to done + 1 s:
  const upto = frames.filter((f) => f.t <= doneAt + 1000);
  // (f) no drawn panel stands empty (an empty glass deal card, an empty bordered list area, a skeleton row).
  const empties = upto.filter((f) => f.empty.length > 0);
  check(empties.length === 0, `${size}: [SM-6 f] frames with an empty drawn panel: ${empties.length} of ${upto.length}${empties.length ? ` (+${Math.round(empties[0]!.t)} → +${Math.round(empties.at(-1)!.t)} ms; first ${JSON.stringify(empties[0]!.empty)})` : ""}`);
  // (g) the card's price is never drawn before a drawn row of the list shows it: per frame, and the first price's lead.
  const orphan = upto.filter((f) => priceShown(f) && !f.rows.includes(f.big));
  const p0 = upto.find(priceShown), r0 = p0 ? upto.find((f) => f.rows.includes(p0.big)) : undefined;
  const lead = p0 && r0 ? Math.round(p0.t - r0.t) : null;
  check(orphan.length === 0 && lead !== null && lead >= 0, `${size}: [SM-6 g] "${p0?.eb}" ${p0?.big} first drawn at +${Math.round(p0?.t ?? -1)} ms, its row at +${Math.round(r0?.t ?? -1)} ms: the price ${lead === null ? "never matched" : lead >= 0 ? `${lead} ms after its row` : `${-lead} ms BEFORE its row`}; frames with a price no drawn row shows: ${orphan.length}`);
  // (h) the right column's layout top never moves once it is in the page (the largest single-frame drop after its first frame).
  const rTops = upto.filter((f) => f.rightTop !== null).map((f) => f.rightTop!);
  let drop = 0, rise = 0;
  for (let i = 1; i < rTops.length; i++) { drop = Math.max(drop, rTops[i]! - rTops[i - 1]!); rise = Math.max(rise, rTops[i - 1]! - rTops[i]!); }
  check(drop === 0 && rise === 0, `${size}: [SM-6 h] the right column's top ${[...new Set(rTops)].join(" → ")} over ${rTops.length} frames: largest single-frame drop ${drop} px, rise ${rise} px`);
  // (i) SM-7 (DD): no frame shows a price (the card's, or the pin's) whose row is not yet "Nothing set aside" ("Best deal" at
  // done), and the first price lands in the very frame its row first reads clean.
  const unread = upto.filter((f) => (priceShown(f) && !clean(f, f.big)) || (f.pinPr !== "" && !clean(f, f.pinPr)));
  const c0 = p0 ? upto.find((f) => clean(f, p0.big)) : undefined;
  const cleanLead = p0 && c0 ? Math.round(p0.t - c0.t) : null;
  const pv = p0 && v0 ? Math.round(p0.t - v0.t) : null;
  check(unread.length === 0 && cleanLead === 0, `${size}: [SM-7 i] frames with a price whose row is not yet "Nothing set aside": ${unread.length} of ${upto.length}${unread.length ? ` (+${Math.round(unread[0]!.t)} ms: ${JSON.stringify(unread[0]!.rowSt)} vs card ${unread[0]!.big} / pin ${unread[0]!.pinPr})` : ""}; the price's first frame +${Math.round(p0?.t ?? -1)} ms, its row's "Nothing set aside" +${Math.round(c0?.t ?? -1)} ms (${cleanLead === 0 ? "same frame" : `${cleanLead} ms apart`}); ${pv} ms after the verdict`);
  // (j) SM-7 (reviewers): the phone's pin is never drawn empty (its price held while the card's own line is in view).
  const blank = upto.filter((f) => f.pinEmpty);
  check(blank.length === 0, `${size}: [SM-7 j] frames with the pin drawn and empty: ${blank.length} of ${upto.length}${blank.length ? ` (+${Math.round(blank[0]!.t)} → +${Math.round(blank.at(-1)!.t)} ms)` : ""}`);
  console.log(`${size}: verdict +${Math.round(v0?.t ?? -1)} ms, done +${Math.round(doneAt)} ms, protection line drawn from +${Math.round(frames.find((f) => f.protVis)?.t ?? -1)} ms`);
  // SM-3 state 4: the case is the quote and the engraving only.
  const caseBox = await page.locator(".sm-case").first().evaluate((e) => ({ h: Math.round(e.getBoundingClientRect().height), kids: [...e.children].map((c) => c.tagName.toLowerCase()) }));
  check(caseBox.kids.join(",") === "blockquote,figcaption", `${size}: the case holds the quote and the engraving only (${caseBox.kids.join(", ")}), ${caseBox.h} px tall`);
  // The DD's two frames (Sat Oct 31): the pin stuck and solid while the deal card is cut by the fold (the finish scroll
  // leaves it so), then fading once the card is scrolled whole into view.
  if (phone) {
    // SM-3 states 2 and 3 at done: "Your money stays put." once on the screen (pin or card head, never both), and the
    // heading whole under the pin's band.
    const atDone = await page.evaluate(() => {
      const box = (s: string) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
      const rail = innerHeight; // no bottom rail (S1-13): the window's foot
      const stay = box(".dk-live-grid .dk-stay"), pinB = box(".sm-pin"), h2 = box(".dk-live-head :is(h1, h2)");
      const pinEl = document.querySelector(".sm-pin")!;
      const pinShown = Number(getComputedStyle(pinEl).opacity) > 0.05 && getComputedStyle(pinEl.querySelector(".sm-pin-stay")!).visibility === "visible";
      const stayShown = !!stay && stay.top >= (pinB?.bottom ?? 0) && stay.bottom <= rail;
      return { pinShown, stayShown, stay, pin: pinB, h2, rail: Math.round(rail) };
    });
    check(!(atDone.pinShown && atDone.stayShown) && (atDone.pinShown || atDone.stayShown), `${size}: at done "Your money stays put." is on the screen once (${JSON.stringify(atDone)}; pin ${atDone.pinShown ? "shown" : "stepped aside"}, the card's head ${atDone.stayShown ? `in view at ${atDone.stay!.top}–${atDone.stay!.bottom}` : "out of view"})`);
    const under = atDone.h2 && atDone.pin ? atDone.h2.top - atDone.pin.bottom : -1;
    check(under >= 0, `${size}: at done the heading's first line is ${under} px under the pin's band (pin ${atDone.pin?.top}–${atDone.pin?.bottom}, heading ${atDone.h2?.top}–${atDone.h2?.bottom})`);
    // The DD's pin frames: stuck and solid once the card and its head have scrolled away above it; stepping aside as the
    // card's head comes back into view.
    if (size === "390x667") {
    await page.evaluate(() => { const c = document.querySelector(".dk-live-grid .dk-deal2")!.getBoundingClientRect(); scrollBy({ top: c.bottom - 120, behavior: "instant" }); });
    await page.waitForTimeout(500);
    const pinAway = await pin();
    check(!!pinAway?.pinIn && pinAway.stuck, `${size}: with the card scrolled away above (its last 120 px left), the pin is stuck and readable: ${JSON.stringify(pinAway)}`);
    await page.screenshot({ path: join(out, `pin-stuck-${size}${sfx}.png`) });
    }
    await page.evaluate(() => document.querySelector(".dk-live-grid .dk-stay")?.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.waitForTimeout(rm ? 300 : 60);
    await page.screenshot({ path: join(out, `pin-fading-${size}${sfx}.png`) });
    await page.waitForTimeout(400);
    const pinAtStay = await page.locator(".sm-pin").evaluate((e) => ({ hidden: e.hasAttribute("data-hidden"), op: getComputedStyle(e).opacity }));
    check(pinAtStay.hidden && pinAtStay.op === "0", `${size}: with the card's own "Your money stays put." in view the pin steps aside: ${JSON.stringify(pinAtStay)}`);
    await page.evaluate(() => document.querySelector(".dk-live-grid .dk-runhead")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(500);
  }
  // proofs
  // Under reduced motion the run is finished at once, so "Your deal" is the right eyebrow there.
  const payoff = rm || doneAtVerdict ? "Your deal" : "Best so far";
  check(!rm && !doneAtVerdict, `${size}: the case rose before the run was done (first row at +${tRow} ms, case at +${tAside} ms, gap ${tAside - tRow} ms; the Watcher reads a row 500 ms after it lands)${rm ? " [reduced motion: finished at once, as designed]" : ""}`);
  // SM-7: at the verdict the card says its shield line alone (no eyebrow, no price: the next seller is still reading);
  // under reduced motion the run is done at once and the card is whole.
  check((payoff === "Your deal" ? (eyebrowAtVerdict ?? "").startsWith(payoff) : eyebrowAtVerdict === null) && /^Goose set .+ aside\. ?Your money stays put\./.test(stayAtVerdict ?? ""), `${size}: at the verdict the card says ${JSON.stringify(stayAtVerdict)}${eyebrowAtVerdict === null ? " alone" : ` over its eyebrow ${JSON.stringify(eyebrowAtVerdict)}`}`);
  if (phone) {
    check(!!pinAtF2?.shown && (!pinAtF2.pinIn || (pinAtF2.text.startsWith("Your money stays put.") && (payoff === "Your deal" ? /your deal \$\d/i.test(pinAtF2.text) : !/best so far|\$\d/i.test(pinAtF2.text))))&& !pinAtF2.text.includes("…"), `${size}: the money's sentence is in view at the verdict (the pin, or the card it stands in for), and the pin names no price before its row reads clean: ${JSON.stringify(pinAtF2)}`);
    // At F2 the stage's own smooth scroll (after Shop for this) may still be settling, so the pin's natural place and its
    // stuck place can differ; from F3 on it is stuck under the nav and never moves.
    check(!!pinAtF3?.shown && !!pinAtF4?.shown && pinAtF3?.top === pinAtF4?.top, `${size}: the money is in view at every frame and the pin holds its stuck place from arrival through done (${pinAtF2?.top} / ${pinAtF3?.top} / ${pinAtF4?.top}); at done the pin reads ${JSON.stringify(pinAtF4?.text)}, stuck ${pinAtF4?.stuck}, card in view ${pinAtF4?.cardIn}, pin readable ${pinAtF4?.pinIn}`);
  } else check(pinAtF2 === null || !pinAtF2.pinIn, `${size}: no pinned line on a wide screen`);
  const approve = await page.evaluate(() => { const e = [...document.querySelectorAll("button")].find((b) => /^Approve \$/.test(b.textContent ?? "")); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight]; });
  console.log(`${size}: Approve's viewport top/bottom after the finish scroll ${JSON.stringify(approve)} (phone rail covers the last 57 px)`);
  const c = page.locator(".sm-case").first();
  const words = (await c.locator("blockquote").textContent())!.replace(/^“|”$/g, "");
  check(words === aside.quoted, `${size}: the case's words are the API's fenced quoted note, exactly (${JSON.stringify(words)})`);
  // SM-6: the run is a beat faster (done ~1 s after the verdict), so "after" can already be done, where the card grows
  // downward only: its place (x, y, width) is the proof; its height is printed.
  check(phone || JSON.stringify(dealBefore?.slice(0, 3)) === JSON.stringify(dealAfter?.slice(0, 3)), `${size}: the deal card's place before ${JSON.stringify(dealBefore)} and after ${JSON.stringify(dealAfter)} the verdict (x, y, width equal; it grows downward only)`);
  check(rowsAtF2[0]![0] === rowsAtF3[0]![0] && rowsAtF2[0]![1] === rowsAtF3[0]![1], `${size}: the set-aside row holds its place and height (${rowsAtF2[0]} → ${rowsAtF3[0]}) while rows 2-3 arrive (${rowsAtF3.length} rows)`);
  const name = await c.evaluate((e) => document.getElementById(e.getAttribute("aria-labelledby")!)?.textContent);
  await c.focus();
  check(name === "Read as data, never as orders" && await c.evaluate((e) => document.activeElement === e), `${size}: the case is focusable and named ${JSON.stringify(name)}`);
  await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  await page.screenshot({ path: join(out, `case-focus-${size}${sfx}.png`) });
  await c.screenshot({ path: join(out, `case-${size}${sfx}.png`) });
  const dot = await c.locator(".sm-label i").evaluate((e) => getComputedStyle(e).backgroundColor);
  const strike = await page.locator(".dk-fr.dk-aside .dk-price").first().evaluate((e) => getComputedStyle(e).color);
  const blur = await c.evaluate((e) => getComputedStyle(e).backdropFilter);
  console.log(`${size}: dot ${dot}, struck price ${strike}, case backdrop-filter ${blur}`);
  // replay from the Why sheet: the sheet closes, the case plays again (a fresh node)
  const caseNode = await c.evaluate((e) => { (e as HTMLElement).dataset.was = "1"; return true; });
  await page.getByRole("button", { name: "Why?" }).first().click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(600); // the sheet's own --d-3 enter
  await page.screenshot({ path: join(out, `why-sheet-${size}${sfx}.png`) });
  check((await page.getByRole("dialog").textContent())!.includes("Code set this seller aside."), `${size}: C's reader line is in the Why sheet`);
  check((await page.locator(".dk-reasons li").first().textContent())!.trim().endsWith("."), `${size}: the Why sheet's first reason ends with a full stop (${JSON.stringify(await page.locator(".dk-reasons li").first().textContent())})`);
  await page.getByRole("button", { name: "Show its words again" }).click();
  await page.waitForTimeout(1000); // the sheet closes and the replay's smooth scroll settles
  // SM-4 (DD nit 1): on a phone the replay never leaves the heading cut under the stuck pin, and the case lands whole
  // between the pin's band and the rail, its top at least the band + --s-3 down (or the run's own landing, if it fits).
  if (phone) {
    const re = await page.evaluate(() => {
      const box = (s: string) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
      const rail = innerHeight; // no bottom rail (S1-13): the window's foot
      return { pin: box(".sm-pin"), h2: box(".dk-live-head :is(h1, h2)"), kase: box(".dk-fr.dk-aside .sm-case"), rail: Math.round(rail), y: Math.round(scrollY) };
    });
    const pb = re.pin?.bottom ?? 0;
    const headOk = !!re.h2 && (re.h2.top >= pb || re.h2.bottom <= pb);
    check(headOk, `${size}: after "Show its words again" the heading is whole under the pin or wholly behind it, never cut (pin ${re.pin?.top}–${pb}, heading ${re.h2?.top}–${re.h2?.bottom}, scrollY ${re.y})`);
    check(!!re.kase && re.kase.top >= pb && re.kase.bottom <= re.rail, `${size}: after the replay the case is whole between the pin and the rail (case ${re.kase?.top}–${re.kase?.bottom}, pin bottom ${pb}, rail ${re.rail})`);
  }
  check(caseNode && (await page.getByRole("dialog").count()) === 0 && (await page.locator(".sm-case").first().evaluate((e) => (e as HTMLElement).dataset.was)) === undefined, `${size}: "Show its words again" closes the sheet and remounts the case`);
  check(await page.locator(".sm-case").first().evaluate((e) => document.activeElement === e), `${size}: after the replay, focus is on the case`);
  await page.screenshot({ path: join(out, `replay-${size}${sfx}.png`) });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check(!overflow, `${size}: no horizontal overflow`);
  check(errors.length === 0, `${size}: console errors ${errors.length}${errors.length ? " " + JSON.stringify(errors.map((e) => e.slice(0, 160))) : ""}`);
  console.log(`${size}: verdict at +${tAside} ms`);
  await ctx.close();
  if (video) {
    const v = readdirSync(out).find((f) => f.endsWith(".webm") && !f.startsWith("sm-"));
    if (v) renameSync(join(out, v), join(out, `sm-${size}${sfx}.webm`));
  }
}
await browser.close();
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
