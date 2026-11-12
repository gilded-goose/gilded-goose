/// <reference lib="dom" />
// tour_pill (S1-12; the DD's §4 rule, Sat Oct 31; S1-13): walks the judge tour by the pill's own Next at 1440x900,
// 390x844 and 390x667 (device scale 1, dark) and checks, once each stop has landed (3.5 s):
//   - the stop's subject (`subject` in core's tour.ts) lands wholly between the bar and the pill or strip (at 390x667,
//     where it is taller than that space, it is reported, not failed);
//   - at >=721 no line of text sits under the pill, and no chart's plot: the canvas's own pixels under the pill are read,
//     and any drawn one (a mark, a line, a label) fails (S1-13, the DD at S1-12: "a canvas is judged by its plot");
//   - at <=720 the strip's top edge cuts no text line and no control (S1-13, the DD's straddle rule; a line or control
//     wholly under the strip is accepted), and the window's top edge cuts none either; where no landing can (FORCED),
//     the edge crosses no ink (part 3: "FORCED ink-clear"; "ink-cut" fails; an ink control proves it can fail), and
//     no button, link or summary's border box crosses the strip's edge whatever its ink ("control-cut" fails; its control,
//     an empty button with a 1 px --line border, must come back red: ink alone reads that hairline as clear);
//   - stop 2 (the Watcher): its focused Ask box and the ready line under it whole at every size; at 390x844 the week's
//     TixQuack paragraph whole too; at 390x667 how much of it shows is reported (the DD: "as far as it fits");
//   - stop 11: if its line names the void, "$0.00 Held, then voided" clears the strip too.
// Page controls whose box reaches under the pill at landing are listed (`controls=`), not failed at >=721: a focused one
// is kept clear by the pill's scroll-padding (WCAG 2.4.11), and a stop's own control is its subject.
// Then two more walks at 390x844 and 1440: with reduced motion, and a fast one (Next 400 ms after each stop opens),
// checked at the stops where landings race (02 after 01 on the same page, and 11 at the end).
// Then, at 390x844 and 390x667, it runs the Watcher's ask on the tour, opens each kind of Desk sheet (a seller row, the
// set-aside's Why, the deal) and checks that no control in the open sheet sits under the strip (the strip yields while
// a sheet is open) or under anything else (the rail), that the strip comes back on close and that focus returns to the
// row that opened it; and (DK part 11) that each sheet's sticky foot has its hairline and fade, slices no line at rest,
// and that at the end of the scroll the block above it clears the fade and the foot.
// Against a server started with PAYMENT=fake (no key, no money).
//
//   node scripts/tour-pill.ts [url] [stills-dir]   default http://localhost:8823; stills (PNG, DPR 1) when a dir is given
//
// TOUR_ONLY=real walks every stop at all three sizes with a real try on record. An empty record is the only state a fresh
// server has, and live left it on its first try: the board's longer headline put the switch under the strip's edge at
// 390x667, stop 10, and nothing could see it (Track F, Nov 4). This mode alone sends a round, through the real route, so it
// stops on anything but this machine (`localOnly`), and it fails unless the page really drew the row.

import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { TOUR } from "@goose/core/tour";
import { localOnly } from "./not-live.ts";

const url = (process.argv[2] ?? "http://localhost:8823/").replace(/\/?$/, "/");
if (process.env.TOUR_ONLY === "real") localOnly(url);
const shots = process.argv[3];
if (shots) mkdirSync(shots, { recursive: true });
const health = await fetch(`${url}api/health`).then((r) => r.json() as Promise<{ payment?: string }>).catch(() => null);
if (health?.payment !== "fake") { console.error(`TOUR PILL FAIL: ${url} isn't a PAYMENT=fake server`); process.exit(1); }

/** Each stop's subject: what its tour line names, on its page (core's tour.ts, which the pill reads too). */
const TARGETS: Record<string, { wide: readonly string[]; phone: readonly string[] }> = Object.fromEntries(TOUR.map((s) => [s.id, s.subject]));
const VOID = /Held, then voided/;
const voidNamed = /void/i.test(TOUR.find((s) => s.id === "proof")?.line ?? "");

const fails: string[] = [];
const rows: string[] = [];
const fail = (m: string) => fails.push(m);

/** Measured on the page: the pill, the lines and controls under it, the targets' extent, the void line, what the strip's
 *  and the window's top edges cut (phone), and a chart's drawn pixels under the pill. */
async function measure(page: Page, sels: readonly string[], support?: string) {
  return page.evaluate(({ sels, voidSrc, support }) => {
    const nav = document.querySelector(".tp")!;
    const box = nav.getBoundingClientRect();
    const under = (r: DOMRect) => r.bottom > box.top + 1 && r.top < box.bottom - 1 && r.right > box.left && r.left < box.right;
    const cut = (r: { top: number; bottom: number }, y: number) => r.top < y - 0.5 && r.bottom > y + 0.5;
    // Things that stay put as the page scrolls (the bar on a wide screen, the rail, the pill) are never cut by an edge.
    // `display: contents` has no box, so it pins nothing, whatever its position still computes to (the Challenge's left column on a phone).
    const pinned = (el: Element | null): boolean => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display !== "contents" && /sticky|fixed/.test(cs.position)) return true; } return false; };
    const top = (() => { let t = 0; for (const e of document.querySelectorAll(".gn, .dk-nav, header")) { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); if (/sticky|fixed/.test(cs.position) && r.top <= 1 && r.height > 0) t = Math.max(t, r.bottom); } return t; })();
    const lines: string[] = [];
    const crossing: string[] = [];
    // Each crossing's box and the edge through it (the strip's top, else the bar's foot), for the ink test (part 3).
    const boxes: { label: string; top: number; bottom: number; left: number; right: number; edge: number; ctl: boolean; strip: boolean }[] = [];
    // ctl: a button, link or summary (by tag or role), which the DD's part-3 nit fails at the strip whatever its ink.
    const isCtl = (e: Element) => /^(A|BUTTON|SUMMARY)$/.test(e.tagName) || /^(button|link)$/.test(e.getAttribute("role") ?? "");
    const keep = (label: string, r: DOMRect, ctl = false) => boxes.push({ label, top: r.top, bottom: r.bottom, left: r.left, right: r.right, edge: cut(r, box.top) ? box.top : top, ctl, strip: cut(r, box.top) });
    // Every unpinned line and control in page coordinates, to test the page's landing on its own: is there any scroll
    // that keeps the subject whole and cuts nothing at either edge, and if not, what is the fewest it can cut?
    const spans: { top: number; bottom: number }[] = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      const el = t.parentElement;
      if (!el || !(t.textContent ?? "").trim() || nav.contains(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
      const range = document.createRange(); range.selectNodeContents(t);
      const word = (t.textContent ?? "").trim().slice(0, 40);
      let listed = false;
      for (const r of range.getClientRects()) {
        if (r.width <= 1 || r.height <= 1) continue;
        if (!listed && under(r)) { lines.push(word); listed = true; }
        if (!pinned(el) && (cut(r, box.top) || cut(r, top))) { crossing.push(`line "${word}"@${Math.round(r.top)}-${Math.round(r.bottom)}${cut(r, top) ? " (window top)" : ""}`); keep(`line "${word}"`, r); }
        if (!pinned(el)) spans.push({ top: r.top + scrollY, bottom: r.bottom + scrollY });
      }
    }
    const ctrlSel = "a[href], button, input, select, textarea, summary, [role='button'], [role='link'], [tabindex]:not([tabindex='-1'])";
    const ctrls = [...document.querySelectorAll<HTMLElement>(ctrlSel)].filter((e) => !nav.contains(e) && !e.closest("[inert]") && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden");
    const name = (e: HTMLElement) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]} "${(e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 30)}"`;
    const controls = ctrls.filter((e) => under(e.getBoundingClientRect()))
      .map((e) => `${name(e)}@${Math.round(e.getBoundingClientRect().top)}-${Math.round(e.getBoundingClientRect().bottom)},x${Math.round(e.getBoundingClientRect().left)}-${Math.round(e.getBoundingClientRect().right)}`);
    for (const e of ctrls) { const r = e.getBoundingClientRect(); if (r.width > 1 && r.height > 1 && !pinned(e) && (cut(r, box.top) || cut(r, top))) { crossing.push(`control ${name(e)}@${Math.round(r.top)}-${Math.round(r.bottom)}${cut(r, top) ? " (window top)" : ""}`); keep(`control ${name(e)}`, r, isCtl(e)); } }
    for (const e of ctrls) { const r = e.getBoundingClientRect(); if (r.width > 1 && r.height > 1 && !pinned(e)) spans.push({ top: r.top + scrollY, bottom: r.bottom + scrollY }); }
    // A chart's own pixels under the pill (DPR 1: one canvas pixel per CSS pixel times its backing scale).
    let marks = 0;
    for (const c of document.querySelectorAll("canvas")) {
      const r = c.getBoundingClientRect();
      const x0 = Math.max(r.left, box.left), x1 = Math.min(r.right, box.right), y0 = Math.max(r.top, box.top), y1 = Math.min(r.bottom, box.bottom);
      if (x1 - x0 < 1 || y1 - y0 < 1 || r.width === 0) continue;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) continue;
      const k = c.width / r.width;
      const d = ctx.getImageData(Math.floor((x0 - r.left) * k), Math.floor((y0 - r.top) * k), Math.max(1, Math.floor((x1 - x0) * k)), Math.max(1, Math.floor((y1 - y0) * k))).data;
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 16) marks++;
    }
    const found = sels.map((s) => document.querySelector(s)).filter((e): e is Element => !!e && e.getClientRects().length > 0);
    const rs = found.map((e) => e.getBoundingClientRect());
    const target = rs.length === sels.length ? { top: Math.min(...rs.map((r) => r.top)), bottom: Math.max(...rs.map((r) => r.bottom)) } : null;
    // The landings that keep the subject whole between the bar and the strip: the fewest cuts any of them makes.
    let fewest = Infinity;
    const maxY = document.documentElement.scrollHeight - innerHeight;
    for (let v = 0; v <= maxY && target; v++) {
      const d = v - scrollY;
      if (target.top - d < top - 0.5 || target.bottom - d > box.top + 0.5) continue;
      fewest = Math.min(fewest, spans.filter((s) => cut(s, v + top) || cut(s, v + box.top)).length);
    }
    const sp = support ? document.querySelector(support)?.getBoundingClientRect() : null;
    const re = new RegExp(voidSrc);
    let voidBox: { top: number; bottom: number } | null = null;
    for (const e of document.querySelectorAll("p, li, dd, span, div")) {
      if (e.children.length > 3 || !re.test(e.textContent ?? "")) continue;
      const r = e.getBoundingClientRect(); if (r.height > 0 && r.height < 120) { voidBox = { top: r.top, bottom: r.bottom }; break; }
    }
    return { y: Math.round(scrollY), slot: (nav as HTMLElement).dataset.slot ?? "", pill: { top: Math.round(box.top), bottom: Math.round(box.bottom), left: Math.round(box.left), right: Math.round(box.right) }, barBottom: Math.round(top), lines, controls, crossing, boxes, fewest, marks, target, support: sp ? { top: sp.top, bottom: sp.bottom } : null, voidBox };
  }, { sels, voidSrc: VOID.source, support });
}

type Box = { label: string; top: number; bottom: number; left: number; right: number; edge: number; ctl: boolean; strip: boolean };
type Ink = { label: string; edge: number; inkTop: number | null; inkBottom: number | null; cut: boolean };

/** The DD's part 3 ruling: a FORCED row is judged by ink, not line boxes. With the strip, the state line and the bar
 *  hidden, each crossing box is read at DPR 1: a pixel is ink when a channel differs from the box's median colour by
 *  more than 48 (cream words on the velvet differ by ~200; its grain by under 20). The edge cuts ink when ink rows lie
 *  on both sides of it. */
async function inkAcross(page: Page, boxes: readonly Box[]): Promise<Ink[]> {
  const hide = await page.addStyleTag({ content: ".tp, .st-strip, header.gn { visibility: hidden !important; }" });
  await page.waitForTimeout(60);
  const vw = page.viewportSize()!;
  const out: Ink[] = [];
  for (const b of boxes) {
    const x = Math.max(0, Math.floor(b.left)), y = Math.max(0, Math.floor(b.top));
    const w = Math.min(vw.width, Math.ceil(b.right)) - x, h = Math.min(vw.height, Math.ceil(b.bottom)) - y;
    if (w < 1 || h < 1) { out.push({ label: b.label, edge: b.edge, inkTop: null, inkBottom: null, cut: false }); continue; }
    const png = await page.screenshot({ clip: { x, y, width: w, height: h } });
    const rows: boolean[] = await page.evaluate(async (data) => {
      const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const med = [0, 1, 2].map((k) => { const v: number[] = []; for (let i = k; i < d.length; i += 4) v.push(d[i]!); v.sort((a, z) => a - z); return v[v.length >> 1]!; });
      const ink: boolean[] = [];
      for (let r = 0; r < c.height; r++) {
        let any = false;
        for (let q = 0; q < c.width && !any; q++) { const i = (r * c.width + q) * 4; any = Math.max(Math.abs(d[i]! - med[0]!), Math.abs(d[i + 1]! - med[1]!), Math.abs(d[i + 2]! - med[2]!)) > 48; }
        ink.push(any);
      }
      return ink;
    }, png.toString("base64"));
    const at = rows.map((v, i) => (v ? y + i : -1)).filter((v) => v >= 0);
    const above = at.some((r) => r + 1 <= b.edge + 0.5), below = at.some((r) => r >= b.edge - 0.5);
    out.push({ label: b.label, edge: Math.round(b.edge), inkTop: at.length ? at[0]! : null, inkBottom: at.length ? at[at.length - 1]! + 1 : null, cut: above && below });
  }
  await hide.evaluate((e) => (e as Element).remove());
  return out;
}
const inkNote = (k: Ink) => `${k.label} ink ${k.inkTop === null ? "none" : `${k.inkTop}-${k.inkBottom}`} vs edge ${k.edge}`;

/** The ink test's own red control: stop 05 at 390x667, scrolled so the strip's edge runs through the middle of a line of
 *  words; the test must say ink-cut there, or it can't fail. */
async function inkRed(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 667 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: "dark", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${url}?desk=tour`);
  await page.locator(".tr-stage .tr-next-go").click();
  for (let i = 0; i < 11; i++) {
    await page.locator(".tp").waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1200);
    if (/\b05\b/.test(await page.locator(".tp").innerText())) break;
    await page.locator(".tp .tp-next").click();
  }
  await page.waitForTimeout(2500);
  const moved = await page.evaluate(() => {
    const edge = document.querySelector(".tp")!.getBoundingClientRect().top;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      const el = t.parentElement; if (!el || el.closest(".tp, header, .st-strip") || !(t.textContent ?? "").trim()) continue;
      const range = document.createRange(); range.selectNodeContents(t);
      // A line below the edge, so the scroll is down (the page may sit at its top already).
      const r = [...range.getClientRects()].find((q) => q.height >= 14 && q.width > 40 && q.top > edge + 4 && q.top < edge + 240);
      if (r) { scrollBy(0, Math.round(r.top + r.height / 2 - edge)); return (t.textContent ?? "").trim().slice(0, 30); }
    }
    return null;
  });
  await page.waitForTimeout(300);
  const m = await measure(page, TARGETS["limits"]!.phone);
  const ink = await inkAcross(page, m.boxes.filter((b) => b.label.startsWith("line")));
  const hit = ink.filter((k) => k.cut);
  if (shots) await page.screenshot({ path: `${shots}/ink-red-390x667.png` });
  rows.push(["390x667", "ink control", `edge put through "${moved ?? "none"}"`, hit.length ? `ink-cut (red, as it must be): ${hit.map(inkNote).join(" | ")}` : `ink-clear: ${ink.map(inkNote).join(" | ") || "no crossing"}`].join("\t"));
  if (!hit.length) fail(`ink control: the strip's edge through the middle of "${moved}" read ink-clear, so the ink test can't fail`);
  // The control-box rule's own red control (the DD's nit): an empty button whose only mark is a 1 px border in the site's
  // hairline (--line), placed in the page (absolute, not pinned) across the strip's edge. The rule must fail it; the ink
  // test's reading of it is logged, since a hairline that faint is under its threshold.
  const hairline = await page.evaluate(() => {
    const edge = document.querySelector(".tp")!.getBoundingClientRect().top;
    // --line is the room's token (on .dk), so read it there; the button sits on <body> to stay in page coordinates.
    const line = getComputedStyle(document.querySelector(".dk") ?? document.documentElement).getPropertyValue("--line").trim() || "rgba(242, 233, 220, .09)";
    const b = document.createElement("button");
    b.id = "tp-hairline-control"; b.type = "button"; b.setAttribute("aria-label", "hairline control");
    b.style.cssText = `position:absolute;left:24px;top:${Math.round(scrollY + edge - 20)}px;width:160px;height:40px;margin:0;padding:0;background:transparent;border:1px solid ${line};border-radius:12px;z-index:1`;
    document.body.append(b);
    return line;
  });
  await page.waitForTimeout(100);
  const h = await measure(page, TARGETS["limits"]!.phone);
  const hb = h.boxes.filter((b) => b.label.includes("hairline control"));
  const hCut = hb.filter((b) => b.ctl && b.strip);
  // The ink reading is of the border alone: the page's words go transparent for it, so a line behind the button can't
  // stand in for the hairline.
  const words = await page.addStyleTag({ content: "body *:not(#tp-hairline-control) { color: transparent !important; text-shadow: none !important; }" });
  const hInk = await inkAcross(page, hb);
  await words.evaluate((e) => (e as Element).remove());
  if (shots) await page.screenshot({ path: `${shots}/ctl-red-390x667.png` });
  rows.push(["390x667", "control-box control", `an empty button, 1 px --line (${hairline}) border, across the strip's edge`, hCut.length ? `control-cut (red, as it must be): ${hCut.map((b) => `${b.label}@${Math.round(b.top)}-${Math.round(b.bottom)}`).join(" | ")}` : "control-clear", `the border alone, by ink: ${hInk.some((k) => k.cut) ? "ink-cut" : "ink-clear (the known limit the rule covers)"}: ${hInk.map(inkNote).join(" | ") || "no box"}`].join("\t"));
  if (!hCut.length) fail("control-box control: a button with a 1 px border across the strip's edge read control-clear, so the rule can't fail");
  await ctx.close();
}

type Pass = { w: number; h: number; tag: string; reduced?: boolean; fast?: boolean };

/** One walk of the tour by the pill's Next. A fast walk presses Next 400 ms after each stop opens and checks only the
 *  stops where landings race (02 after 01 on the same page; 11 at the end). */
async function walkStops(browser: Browser, pass: Pass) {
  const phone = pass.w <= 720;
  const ctx = await browser.newContext({ viewport: { width: pass.w, height: pass.h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone, colorScheme: "dark", reducedMotion: pass.reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await page.goto(`${url}?desk=tour`);
  await page.locator(".tr-stage .tr-next-go").click();
  const open = TOUR.filter((s) => s.href);
  const full = pass.w === 390 && pass.h === 844 && !pass.reduced && !pass.fast;
  for (let i = 0; i < open.length; i++) {
    const stop = open[i]!;
    await page.locator(".tp").waitFor({ timeout: 20_000 });
    const checked = !pass.fast || stop.id === "watcher" || i === open.length - 1;
    if (!checked) { await page.waitForTimeout(400); await page.locator(".tp .tp-next").click(); continue; }
    await page.waitForTimeout(3500);
    const sels = TARGETS[stop.id]?.[phone ? "phone" : "wide"];
    if (!sels) { fail(`${pass.tag} ${stop.id}: no subject named`); continue; }
    const m = await measure(page, sels);
    const n = String(TOUR.indexOf(stop) + 1).padStart(2, "0");
    const t = m.target;
    const ok = !!t && t.top >= m.barBottom - 0.5 && t.bottom <= m.pill.top + 0.5;
    // Taller than the space between the bar and the strip (a short phone): reported, not failed.
    const tall = !!t && t.bottom - t.top > m.pill.top - m.barBottom;
    if (!t) fail(`${pass.tag} ${n} ${stop.id}: subject ${sels.join(" + ")} not drawn`);
    else if (!ok && !tall) fail(`${pass.tag} ${n} ${stop.id}: subject ${Math.round(t.top)}–${Math.round(t.bottom)} not wholly between ${m.barBottom} and the pill's top ${m.pill.top}`);
    if (!phone && m.lines.length) fail(`${pass.tag} ${n} ${stop.id}: ${m.lines.length} line(s) under the pill: ${m.lines.join(" | ")}`);
    // The DD's nit at S1-13 part 1: a landed card keeps --s-1 (8 px) of air above the pill.
    if (!phone && stop.landTop && t && t.bottom > m.pill.top - 8 + 0.5) fail(`${pass.tag} ${n} ${stop.id}: the card ends at ${Math.round(t.bottom)}, less than 8 px above the pill (${m.pill.top})`);
    if (!phone && m.marks) fail(`${pass.tag} ${n} ${stop.id}: a chart's plot under the pill (${m.marks} drawn canvas pixels)`);
    // S1-13 part 2: a cut passes only where the probe finds no landing that keeps the subject whole and cuts nothing, and
    // the page's cuts are the fewest any such landing makes (stop 05 at 390x844, with the sticky bar).
    const forced = m.fewest > 0 && m.fewest !== Infinity && m.crossing.length <= m.fewest;
    if (phone && m.crossing.length && !forced) fail(`${pass.tag} ${n} ${stop.id}: the strip's top (${m.pill.top}) or the window's top cuts ${m.crossing.join(" | ")} (fewest possible with the subject whole: ${m.fewest})`);
    // The DD's part 3: a FORCED cut passes only when the edge crosses no ink (a line box's empty leading, a control's
    // padding); one through the glyphs fails.
    const ink = phone && m.crossing.length && forced ? await inkAcross(page, m.boxes) : [];
    const inkCut = ink.some((k) => k.cut);
    if (inkCut) fail(`${pass.tag} ${n} ${stop.id}: FORCED ink-cut: the edge runs through ${ink.filter((k) => k.cut).map(inkNote).join(" | ")}`);
    // The DD's part-3 nit (06:4x): a button, link or summary whose border box crosses the strip's edge fails whatever its
    // ink: its border or fill can be a hairline the ink threshold doesn't see, and a cut control is a cut target.
    const ctlCut = phone && forced ? m.boxes.filter((b) => b.ctl && b.strip) : [];
    if (ctlCut.length) fail(`${pass.tag} ${n} ${stop.id}: FORCED control-cut: the strip's edge crosses ${ctlCut.map((b) => `${b.label}@${Math.round(b.top)}-${Math.round(b.bottom)}`).join(" | ")}`);
    // Stop 2's ask waits in a box narrower than it on a phone: the box shows its end, where the price is ("under $9" at
    // 390x844 before, Nov 6). Fails if the ask's last characters sit past the box's right edge.
    if (stop.id === "watcher") {
      const ask = await page.locator('input[aria-label="Ask for anything"]').evaluate((i: HTMLInputElement) => ({ value: i.value, left: i.scrollLeft, w: i.clientWidth, sw: i.scrollWidth }));
      if (!ask.value) fail(`${pass.tag} ${n} watcher: no ask waits in the box`);
      else if (ask.left + ask.w < ask.sw - 1) fail(`${pass.tag} ${n} watcher: the ask's end is cut ("${ask.value}", ${ask.sw - ask.left - ask.w} px past the box)`);
    }
    const supportCol = "";
    const v = m.voidBox;
    if (stop.id === "proof" && voidNamed && v && v.bottom > m.pill.top) fail(`${pass.tag} ${n}: the line names the void, and "Held, then voided" ends at ${Math.round(v.bottom)} > ${m.pill.top}`);
    rows.push([pass.tag, n, stop.short, `y=${m.y}`, `slot=${m.slot}`, `pill=${m.pill.top}-${m.pill.bottom}`, `subject=${t ? `${Math.round(t.top)}-${Math.round(t.bottom)}` : "none"}`, ok ? "OK" : tall ? "TALLER THAN THE SPACE" : "FAIL", `${phone ? "wholly under (accepted)" : "under"}=${m.lines.length}${m.lines.length ? ` (${m.lines.join(" | ")})` : ""}`, phone ? `cut=${m.crossing.length}${m.crossing.length ? ` (${m.crossing.join(" | ")})${forced ? ` FORCED ${inkCut ? "ink-cut" : "ink-clear"}${ctlCut.length ? " control-cut" : " control-clear"} (${ink.map(inkNote).join(" | ")}): no clear landing keeps the subject whole; fewest possible=${m.fewest}` : ""}` : ""}` : `plot under pill=${m.marks}px`, `controls=${m.controls.length}${m.controls.length ? ` (${m.controls.join(" | ")})` : ""}`, supportCol, stop.id === "proof" ? `void=${v ? `${Math.round(v.top)}-${Math.round(v.bottom)}${voidNamed ? "" : " (not named)"}` : "none"}` : ""].filter(Boolean).join("\t"));
    if (shots && (full || pass.w === 1440 && !pass.reduced && !pass.fast || pass.h === 667 && !pass.reduced && !pass.fast)) await page.screenshot({ path: `${shots}/${pass.w}x${pass.h}-stop${n}.png` });
    if (i < open.length - 1) { await page.locator(".tp .tp-next").click(); await page.waitForTimeout(300); }
  }
  await ctx.close();
}

/** Per pixel row of a clip, the largest channel difference from `rgb` (read at DPR 1). */
async function rowDiff(page: Page, clip: { x: number; y: number; width: number; height: number }, rgb: readonly number[]): Promise<number[]> {
  const png = await page.screenshot({ clip });
  return page.evaluate(async ({ data, rgb }) => {
    const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const out: number[] = [];
    for (let r = 0; r < c.height; r++) {
      let m = 0;
      for (let q = 0; q < c.width; q++) { const i = (r * c.width + q) * 4; m = Math.max(m, Math.abs(d[i]! - rgb[0]!), Math.abs(d[i + 1]! - rgb[1]!), Math.abs(d[i + 2]! - rgb[2]!)); }
      out.push(m);
    }
    return out;
  }, { data: png.toString("base64"), rgb });
}

/** DK part 11 (the DD gate, Sat 09:44: at 390x667 the Why sheet's sticky foot sliced the trust box through its first
 *  line, mid-letter, with no border). The foot's top edge is a hairline (its computed border, and its pixel row reads as
 *  the line, not the sheet); a fade of the sheet's colour, --s-3 (24) tall, sits directly above that hairline (not over
 *  it), takes no taps, and its last two rows carry no ink of whatever runs under it (each channel within 24 of the
 *  sheet's colour; the trust box's words and gold border differ by ~150). At the end of the sheet's scroll the block above
 *  the foot (the trust box on the Why) clears the fade and the foot: 0 px overlap (to subpixel layout: 0.5). */
async function foot(page: Page, size: string, kind: string) {
  const geo = () => page.evaluate(() => {
    const sh = document.querySelector<HTMLElement>(".dk-sheet")!, ft = sh.querySelector<HTMLElement>(".dk-acts")!;
    const cs = getComputedStyle(ft), bf = getComputedStyle(ft, "::before"), r = ft.getBoundingClientRect();
    const has = bf.content !== "none" && bf.content !== "normal" && bf.position === "absolute";
    const fadeH = has ? parseFloat(bf.height) || 0 : 0;
    const fadeBottom = has ? r.bottom - (parseFloat(cs.borderBottomWidth) || 0) - (parseFloat(bf.bottom) || 0) : r.top;
    const last = (ft.previousElementSibling as HTMLElement | null)?.getBoundingClientRect() ?? null;
    const label = (e: Element) => `${e.tagName.toLowerCase()}${e.className ? "." + String(e.className).split(" ")[0] : ""} "${(e.textContent ?? "").trim().slice(0, 24)}"`;
    const cut = [...sh.querySelectorAll("h3, .dk-reasons li, .dk-safe, .dk-facts > div")].filter((e) => { const b = e.getBoundingClientRect(); return b.top < r.top - 0.5 && b.bottom > r.top + 0.5; }).map(label);
    const bg = getComputedStyle(sh).backgroundColor.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    return {
      top: r.top, left: r.left, width: r.width, bottom: r.bottom, bw: parseFloat(cs.borderTopWidth) || 0, bs: cs.borderTopStyle,
      fadeH, fadeTop: fadeBottom - fadeH, fadeBottom, taps: bf.pointerEvents, grad: /gradient/.test(bf.backgroundImage),
      last: last && { top: last.top, bottom: last.bottom }, lastName: ft.previousElementSibling ? label(ft.previousElementSibling) : "none",
      cut, bg, scrolls: sh.scrollHeight > sh.clientHeight + 1,
    };
  });
  const tag = `${size} ${kind} sheet foot`;
  const g = await geo();
  const x = Math.ceil(g.left) + 1, w = Math.floor(g.left + g.width) - 1 - x;
  const hairRow = (await rowDiff(page, { x, y: Math.floor(g.top), width: w, height: 1 }, g.bg))[0]!;
  const fadeEnd = Math.max(...await rowDiff(page, { x, y: Math.floor(g.top) - 2, width: w, height: 2 }, g.bg));
  if (g.bw < 1 || g.bs !== "solid" || hairRow < 10) fail(`${tag}: no hairline on its top edge (border ${g.bw}px ${g.bs}, its row ${hairRow} from the sheet)`);
  if (g.fadeH !== 24 || !g.grad) fail(`${tag}: no --s-3 fade above it (${g.fadeH}px${g.grad ? "" : ", no gradient"})`);
  else if (Math.abs(g.fadeBottom - g.top) > 0.5) fail(`${tag}: the fade ends at ${g.fadeBottom.toFixed(1)}, not on the hairline's top ${g.top.toFixed(1)}`);
  if (g.fadeH && g.taps !== "none") fail(`${tag}: the fade takes taps (pointer-events ${g.taps})`);
  if (fadeEnd > 24) fail(`${tag}: ink right above the foot (${fadeEnd} from the sheet's colour; cut: ${g.cut.join(" | ") || "none"}): a line is sliced, not faded`);
  // The end of the scroll: the block above the foot clears the fade and the foot.
  await page.evaluate(() => { const sh = document.querySelector<HTMLElement>(".dk-sheet")!; sh.scrollTop = sh.scrollHeight; });
  await page.waitForTimeout(150);
  const e = await geo();
  const lap = e.last ? Math.max(0, Math.min(e.last.bottom, e.bottom) - Math.max(e.last.top, e.fadeTop)) : 0;
  if (lap > 0.5) fail(`${tag}: at the end of the scroll ${e.lastName} (${e.last!.top.toFixed(0)}-${e.last!.bottom.toFixed(1)}) runs ${lap.toFixed(1)} px under the fade or foot (from ${e.fadeTop.toFixed(1)})`);
  if (shots) await page.screenshot({ path: `${shots}/${size}-sheet-${kind}-end.png` });
  await page.evaluate(() => { document.querySelector<HTMLElement>(".dk-sheet")!.scrollTop = 0; });
  await page.waitForTimeout(150);
  rows.push([size, "sheet foot", kind, `scrolls=${g.scrolls}`, `hairline=${g.bw}px ${g.bs}, row ${hairRow}`, `fade=${g.fadeH}px ${g.fadeTop.toFixed(0)}-${g.fadeBottom.toFixed(0)}, taps ${g.taps}`, `cut at rest=${g.cut.join(" | ") || "none"}`, `ink above foot=${fadeEnd}`, `end: ${e.lastName} ${e.last ? `${e.last.top.toFixed(0)}-${e.last.bottom.toFixed(0)}` : ""} vs fade ${e.fadeTop.toFixed(0)}, overlap=${lap.toFixed(1)}`].join("\t"));
}

/** The Desk's sheets on the tour, at 390 wide: no button in an open sheet under the strip; it comes back; focus returns. */
async function sheets(browser: Browser, height: number) {
  const ctx = await browser.newContext({ viewport: { width: 390, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto(`${url}?desk=tour`);
  await page.locator(".tr-stage .tr-next-go").click(); // stop 1 (Ask): this tab is now on the tour
  await page.locator(".tp").waitFor({ timeout: 20_000 });
  await page.locator(".tp .tp-next").click(); // stop 2: the Watcher's ask waits in the box
  await page.locator(".tp").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500); // stop 2's landing (checked by the 390x667 walk)
  await page.getByRole("button", { name: "Ask Goose" }).first().click();
  await page.getByRole("button", { name: /Shop for this/ }).click({ timeout: 20_000 });
  await page.locator(".dk-protect h3", { hasText: "Goose set" }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const strip = await page.locator(".tp").boundingBox();
  if (!strip) { fail(`390x${height} sheets: no strip on the run`); await ctx.close(); return; }
  await ctx.setOffline(true); // Track R's state line shows (the DD's 06:25 ruling: under any open sheet, back on close)
  await page.locator(".st-strip:not([hidden])").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(900);
  const kinds = [
    { kind: "row", find: page.locator("button.dk-row-go[aria-label$=': details']").first() },
    { kind: "why", find: page.locator("button.dk-row-go[aria-label$='why Goose set it aside']").first() },
    { kind: "deal", find: page.locator("button.dk-row-go[aria-label$=': deal details']").first() },
  ];
  for (const { kind, find } of kinds) {
    if (await find.count() === 0) { fail(`390x${height} sheets: no ${kind} row button`); continue; }
    await find.scrollIntoViewIfNeeded();
    const label = await find.getAttribute("aria-label");
    await find.click();
    await page.locator(".dk-sheet").waitFor();
    await page.waitForTimeout(700); // its rise
    const m = await page.evaluate((s) => {
      const tp = document.querySelector(".tp");
      const shown = !!tp && tp.getClientRects().length > 0;
      const ctrls = [...document.querySelectorAll<HTMLElement>(".dk-sheet button, .dk-sheet a[href]")].filter((b) => b.getClientRects().length > 0);
      const at = (b: HTMLElement) => { const r = b.getBoundingClientRect(); return `${(b.textContent ?? "").trim().slice(0, 30)}@${Math.round(r.top)}-${Math.round(r.bottom)}`; };
      // Under the strip's place, while the strip is drawn (it yields while a sheet is open: tour-pill.css).
      const under = ctrls.filter((b) => { const r = b.getBoundingClientRect(); return r.bottom > s.y + 1 && r.top < s.y + s.height - 1; });
      // Covered by anything at all (the rail, the strip, the window's edge): the topmost element at five points of each
      // control must be the control itself.
      const covered = ctrls.filter((b) => {
        const r = b.getBoundingClientRect();
        const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 4, r.top + 4], [r.right - 4, r.top + 4], [r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4]];
        return pts.some(([x, y]) => { const hit = document.elementFromPoint(x!, y!); return !hit || !b.contains(hit); });
      });
      return { shown, under: under.map(at), covered: covered.map(at), names: ctrls.map(at) };
    }, strip);
    if (m.shown && m.under.length) fail(`390x${height} ${kind} sheet: control(s) under the strip: ${m.under.join(" | ")}`);
    const lineOpen = await lineTop(page);
    if (lineOpen === "line") fail(`390x${height} ${kind} sheet: the state line is over the open sheet`);
    if (m.covered.length) fail(`390x${height} ${kind} sheet: control(s) covered (rail, strip or the window's edge): ${m.covered.join(" | ")}`);
    if (shots) await page.screenshot({ path: `${shots}/390x${height}-sheet-${kind}.png` });
    await foot(page, `390x${height}`, kind);
    const close = page.locator(".dk-sheet button", { hasText: /Got it|Close/ }).first();
    if (await close.count()) await close.click(); else await page.keyboard.press("Escape");
    await page.locator(".dk-sheet").waitFor({ state: "detached" });
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => ({ strip: (document.querySelector(".tp")?.getClientRects().length ?? 0) > 0, focus: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? "" }));
    if (!back.strip) fail(`390x${height} ${kind} sheet: the strip didn't come back on close`);
    const lineBack = await lineTop(page);
    if (lineBack !== "line") fail(`390x${height} ${kind} sheet: the state line isn't back on close (${lineBack})`);
    if (back.focus !== label) fail(`390x${height} ${kind} sheet: focus went to "${back.focus}", not the row "${label}"`);
    rows.push([`390x${height}`, "sheet", kind, `strip while open=${m.shown ? "SHOWN" : "hidden"}`, `controls=${m.names.join(" | ")}`, `under strip=${m.shown ? m.under.length : 0}`, `covered=${m.covered.length}`, `strip back=${back.strip}`, `focus back=${back.focus === label}`, `state line: open ${lineOpen}, closed ${lineBack}`].join("\t"));
  }
  await ctx.close();
}

/** S1-13 part 2 (the DD's 06:25 ruling): Track R's page-wide state line (.st-strip; shown here by going offline) and the
 *  tour never cover each other: on a phone the line sits directly on the strip; on a wide screen the pill rises over the
 *  line. The line goes under the open menu and under an open sheet, and is back on close. */
const lineTop = (page: Page) => page.evaluate(() => {
  const st = document.querySelector(".st-strip");
  if (!st || (st as HTMLElement).hidden) return "none";
  const r = st.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return hit && st.contains(hit) ? "line" : `covered by ${hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(" ")[0]}` : "nothing"}`;
});
async function stateLine(browser: Browser, w: number, h: number) {
  const phone = w <= 720, tag = `${w}x${h} state line`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone, colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto(`${url}?desk=tour`);
  await page.locator(".tr-stage .tr-next-go").click();
  await page.locator(".tp").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  // The menu's panel is its own lazy chunk: opened once while online, so it opens offline below.
  await page.locator("header.gn.dk-nav .gm-btn:visible").first().click();
  await page.locator(".gm-panel").waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".gm-panel").waitFor({ state: "detached" });
  await ctx.setOffline(true);
  await page.locator(".st-strip:not([hidden])").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(900); // its 400 ms wait and its Enter
  const m = await page.evaluate(() => {
    const st = document.querySelector(".st-strip")!.getBoundingClientRect(), tp = document.querySelector(".tp")!.getBoundingClientRect();
    return { st: { top: st.top, bottom: st.bottom }, tp: { top: tp.top, bottom: tp.bottom }, overlap: st.bottom > tp.top + 0.5 && st.top < tp.bottom - 0.5 && st.right > tp.left && st.left < tp.right };
  });
  if (m.overlap) fail(`${tag}: the line (${Math.round(m.st.top)}-${Math.round(m.st.bottom)}) and the tour (${Math.round(m.tp.top)}-${Math.round(m.tp.bottom)}) overlap`);
  if (phone && Math.abs(m.st.bottom - m.tp.top) > 0.5) fail(`${tag}: the line ends at ${Math.round(m.st.bottom)}, not on the strip's top ${Math.round(m.tp.top)}`);
  if (!phone && m.tp.bottom > m.st.top - 0.5) fail(`${tag}: the pill (${Math.round(m.tp.bottom)}) isn't above the line (${Math.round(m.st.top)})`);
  // Risen over the line, the pill sits on no words either (S1-13's reviewer: it re-finds its place).
  const under = await page.evaluate(() => {
    const nav = document.querySelector(".tp")!, b = nav.getBoundingClientRect(), out: string[] = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      const el = t.parentElement;
      if (!el || nav.contains(el) || el.closest(".st-strip") || !(t.textContent ?? "").trim()) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
      const range = document.createRange(); range.selectNodeContents(t);
      for (const r of range.getClientRects()) if (r.width > 1 && r.bottom > b.top + 1 && r.top < b.bottom - 1 && r.right > b.left && r.left < b.right) { out.push((t.textContent ?? "").trim().slice(0, 30)); break; }
    }
    return out;
  });
  if (!phone && under.length) fail(`${tag}: the risen pill sits on ${under.join(" | ")}`);
  const before = await lineTop(page);
  if (before !== "line") fail(`${tag}: the line is ${before} before the menu opens`);
  if (shots) await page.screenshot({ path: `${shots}/${w}x${h}-state-line.png` });
  await page.locator("header.gn.dk-nav .gm-btn:visible").first().click();
  await page.locator(".gm-panel").waitFor();
  await page.waitForTimeout(400);
  const menu = await lineTop(page);
  if (menu === "line") fail(`${tag}: the line is over the open menu`);
  await page.keyboard.press("Escape");
  await page.locator(".gm-panel").waitFor({ state: "detached" });
  await page.waitForTimeout(300);
  const after = await lineTop(page);
  if (after !== "line") fail(`${tag}: the line isn't back after the menu closes (${after})`);
  await ctx.setOffline(false);
  rows.push([tag, `line=${Math.round(m.st.top)}-${Math.round(m.st.bottom)}`, `tour=${Math.round(m.tp.top)}-${Math.round(m.tp.bottom)}`, `overlap=${m.overlap}`, `under pill=${under.length}`, `menu open: line ${menu}`, `menu closed: ${after}`].join("\t"));
  await ctx.close();
}

/** A side page on the tour (safe.html, from the wallet's "How Goose keeps you safe"): the pill names where it goes back
 *  to ("Back to 06 · Approve in PayPal"), and every pill link leaves safe.html for the app's own page. */
async function side(browser: Browser, size: "1440" | "390") {
  const phone = size === "390";
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone, colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto(url);
  const at = TOUR.findIndex((s) => s.id === "pay");
  await page.evaluate((n) => sessionStorage.setItem("goose_tour_at", String(n)), at);
  await page.goto(`${url}safe.html`);
  await page.locator(".tp").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const home = document.querySelector<HTMLAnchorElement>(".tp .tp-home")!;
    const name = document.querySelector<HTMLElement>(".tp .tp-name")!;
    const links = [...document.querySelectorAll<HTMLAnchorElement>(".tp a[href]")].map((a) => new URL(a.href).pathname + new URL(a.href).search);
    const tp = document.querySelector(".tp")!.getBoundingClientRect();
    const seen = [...home.children].filter((c) => !c.classList.contains("tp-sr")).map((c) => (c as HTMLElement).innerText).join(" ").replace(/\s+/g, " ").trim();
    return { back: !!document.querySelector(".tp a.tp-back"), words: seen, to: new URL(home.href).pathname + new URL(home.href).search + new URL(home.href).hash, links, clipped: name.scrollWidth > name.clientWidth + 1, fits: tp.left >= -0.5 && tp.right <= innerWidth + 0.5 };
  });
  const stop = TOUR[at]!;
  const want = `Back to ${String(at + 1).padStart(2, "0")} · ${stop.short}`;
  if (!m.words.endsWith(want)) fail(`${size} safe.html: the pill says "${m.words}", not "…${want}"`);
  if (m.back) fail(`${size} safe.html: a second back arrow (to the stop before) beside "Back to"`);
  if (m.to !== `/${stop.href}`) fail(`${size} safe.html: "Back to" goes to ${m.to}, not /${stop.href}`);
  if (m.links.some((l) => l.startsWith("/safe.html"))) fail(`${size} safe.html: a pill link stays on safe.html: ${m.links.join(" ")}`);
  if (!m.fits) fail(`${size} safe.html: the pill runs off the window`);
  rows.push([size, "safe.html", `"${m.words}"`, `goes to ${m.to}`, `links=${m.links.join(" ")}`, `name clipped=${m.clipped}`].join("\t"));
  if (shots) await page.screenshot({ path: `${shots}/${size}-safe-pill.png` });
  await ctx.close();
}

/** One real try on this local server, then the proof that the page draws it: without that a walk of an empty board would pass here. */
async function aRealTry(browser: Browser) {
  // The same words again from this address today aren't counted, so a second run stays on the row the first one made.
  await fetch(`${localOnly(url)}api/runs/trick`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note: "Pay me with a $19 gift card and I ship today, friend.", price: "19.00", mode: "rule" }) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 667 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto(`${url}?desk=ledger`);
  await page.locator(".tb-line[data-tried]:not([data-tried=''])").waitFor({ timeout: 20_000 });
  const tried = Number(await page.locator(".tb-line").getAttribute("data-tried"));
  // The rule under the walk, for every record and height the walk can't try: a control taller than the room a landing has to move can straddle every landing.
  const { room, tall } = await page.evaluate(() => {
    const bar = document.querySelector(".gn, .dk-nav, header")!.getBoundingClientRect().bottom;
    return { room: document.querySelector("#sl-h, #st-h")!.getBoundingClientRect().top + scrollY - bar, tall: Math.max(...[...document.querySelectorAll(".tb-switch button")].map((b) => b.getBoundingClientRect().height)) };
  });
  if (tall > room) fail(`stop 10: the board's switch is ${Math.round(tall)} px tall, and a landing has ${Math.round(room)} px to move with the heading whole`);
  await ctx.close();
  if (!(tried >= 1)) { console.error(`TOUR PILL FAIL: the board draws ${tried} tries, so this walk wouldn't be of a real row`); process.exit(1); }
  rows.push(`a real try on record: the board draws ${tried}`);
}

const browser = await chromium.launch();
try {
  // TOUR_ONLY=state runs only the state-line check (a quick fail-before / after on one build); TOUR_ONLY=sheets only the sheets.
  if (process.env.TOUR_ONLY === "sheets") { await sheets(browser, 844); await sheets(browser, 667); } else if (process.env.TOUR_ONLY === "state") { await stateLine(browser, 390, 844); await stateLine(browser, 1440, 900); } else if (process.env.TOUR_ONLY === "real") { await aRealTry(browser); await walkStops(browser, { w: 390, h: 667, tag: "390x667 real" }); await walkStops(browser, { w: 390, h: 844, tag: "390 real" }); await walkStops(browser, { w: 1440, h: 900, tag: "1440 real" }); } else if (process.env.TOUR_ONLY === "wide") { await walkStops(browser, { w: 1440, h: 900, tag: "1440" }); } else if (process.env.TOUR_ONLY === "ink") {
    await inkRed(browser); await walkStops(browser, { w: 390, h: 844, tag: "390" }); await walkStops(browser, { w: 390, h: 667, tag: "390x667" });
  } else {
  await inkRed(browser);
  await side(browser, "1440");
  await side(browser, "390");
  await walkStops(browser, { w: 1440, h: 900, tag: "1440" });
  await walkStops(browser, { w: 390, h: 844, tag: "390" });
  await walkStops(browser, { w: 390, h: 667, tag: "390x667" });
  await walkStops(browser, { w: 390, h: 844, tag: "390 reduced", reduced: true });
  await walkStops(browser, { w: 1440, h: 900, tag: "1440 reduced", reduced: true });
  await walkStops(browser, { w: 390, h: 844, tag: "390 fast", fast: true });
  await walkStops(browser, { w: 1440, h: 900, tag: "1440 fast", fast: true });
  await sheets(browser, 844);
  await sheets(browser, 667);
  await stateLine(browser, 390, 844);
  await stateLine(browser, 1440, 900);
  }
} finally { await browser.close(); }
console.log(rows.join("\n"));
if (fails.length) { console.error(`TOUR PILL FAIL:\n- ${fails.join("\n- ")}`); process.exit(1); }
// Says what ran. Nov 4: `ink` printed "at 1440" having never opened it, so a real red at 1440 and this green stood side by side for days.
const STOPS = TOUR.filter((s) => s.href).length;
const RAN: Record<string, string> = { ink: `${STOPS} stops at 390x844 and 390x667 only, NOT 1440`, wide: `${STOPS} stops at 1440 only, NOT the phone sizes`, real: `${STOPS} stops at 390x667, 390x844 and 1440, with a real try on record`, sheets: "the sheets only, no stops", state: "the state line only, no stops" };
const only = process.env.TOUR_ONLY;
console.log(`tour pill: OK (${only ? RAN[only] ?? `TOUR_ONLY=${only}` : `${STOPS} stops at 1440, 390x844 and 390x667, reduced motion and fast Next; sheets at 390x844 and 390x667`})`);
