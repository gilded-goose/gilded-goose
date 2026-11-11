// S1-13 part 3 (the DD, Sat Oct 31 06:00, brand.md §6): the open menu wears its room's glass. In the back room (Behind the
// scenes, AG Studio, Proof: the bar's data-room="back") the sheet and the panel are Midnight glass on Midnight's opaque
// page, never Velvet's; on the Desk they stay Velvet (the control). A fill test, sheet against page: with the menu's
// contents and the egg's light hidden (light, not fill), the sheet's median colour at DPR 1. Midnight's glass is its own
// page at 55% (tokens.css), so in the back room the fill must be within 3 of Midnight's --page-solid on every channel.
// Velvet's glass is its card at 55% (lighter than its page by design), so the control asks only that the Desk's fill
// sits nearer Velvet's page than Midnight's. Either way the menu's root must compute its room's tokens.
//   node scripts/menu-glass.ts [base] [out]   (a PAYMENT=fake server, e.g. http://localhost:8787)
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";

const base = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "");
const out = process.argv[3] ?? "/tmp/s1-13/menu-glass";
mkdirSync(out, { recursive: true });

const ROUTES = [
  { path: "/?desk=ledger", room: "midnight" }, { path: "/?desk=studio", room: "midnight" }, { path: "/?desk=proof", room: "midnight" },
  { path: "/?desk=1", room: "velvet" }, // the control: the Desk's menu stays Velvet
] as const;
const SOLID = { midnight: "#151013", velvet: "#2c1520" } as const;
const hex = (c: readonly number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** The median colour of a clip, read at DPR 1. */
async function median(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  const png = await page.screenshot({ clip });
  return page.evaluate(async (data) => {
    const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    return [0, 1, 2].map((k) => { const v: number[] = []; for (let i = k; i < d.length; i += 4) v.push(d[i]!); v.sort((a, z) => a - z); return v[v.length >> 1]!; });
  }, png.toString("base64"));
}

const rows: string[] = [["width", "route", "room", "gm-root data-glass", "--page-solid on the menu", "bar", "sheet fill", "expected", "max diff", "ok"].join("\t")];
const fails: string[] = [];
const browser = await chromium.launch();
try {
  for (const [w, h] of [[390, 844], [1440, 900]] as const) {
    for (const r of ROUTES) {
      const phone = w <= 720;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone, colorScheme: "dark", reducedMotion: "reduce" });
      await ctx.addInitScript(() => { try { sessionStorage.setItem("gg-opened", "1"); } catch { /* fine */ } });
      const page = await ctx.newPage();
      await page.goto(base + r.path, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      const btn = page.locator("header.gn .gm-btn").filter({ visible: true }).first();
      await btn.click();
      await page.locator(".gm-panel").waitFor();
      await page.waitForTimeout(500);
      const tag = `${w}-${r.path.replace(/[^a-z0-9]+/gi, "_")}`;
      await page.screenshot({ path: `${out}/${tag}-open.png` });
      const facts = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>(".gm-root")!, cs = getComputedStyle(root);
        const p = document.querySelector(".gm-panel")!.getBoundingClientRect();
        // The drawn bar (a page may carry a 0 px twin drawn first: LESSONS).
        const bar = [...document.querySelectorAll("header.gn")].find((e) => e.getBoundingClientRect().height > 0);
        return { glass: root.dataset.glass ?? "", solid: cs.getPropertyValue("--page-solid").trim(), bar: bar ? getComputedStyle(bar).backgroundColor : "", panel: { x: p.left, y: p.top, w: p.width, h: p.height } };
      });
      // The fill alone: the menu's words and the egg's light hidden.
      await page.addStyleTag({ content: ".gm-panel > * { visibility: hidden !important; } .gm-root { --egg-light: linear-gradient(transparent, transparent) !important; }" });
      await page.waitForTimeout(150);
      const inset = 24, p = facts.panel;
      const clip = { x: Math.round(p.x + inset), y: Math.round(p.y + inset), width: Math.round(Math.min(p.w, w - p.x) - 2 * inset), height: Math.round(Math.min(p.h, h - p.y) - 2 * inset) };
      const fill = await median(page, clip);
      const far = (room: keyof typeof SOLID) => Math.max(...fill.map((v, i) => Math.abs(v - rgb(SOLID[room])[i]!)));
      const diff = far(r.room);
      const wantGlass = r.room === "midnight" ? "midnight" : "";
      const near = r.room === "midnight" ? diff <= 3 : diff < far("midnight");
      const ok = near && facts.glass === wantGlass && facts.solid.toLowerCase() === SOLID[r.room];
      if (!ok) fails.push(`${w} ${r.path}: the open menu's fill is ${hex(fill)} (max diff ${diff} from ${r.room}'s ${SOLID[r.room]}, ${far("midnight")} from Midnight's), data-glass="${facts.glass}", --page-solid ${facts.solid}`);
      rows.push([w, r.path, r.room, facts.glass || "-", facts.solid, facts.bar, hex(fill), SOLID[r.room], diff, ok ? "OK" : "FAIL"].join("\t"));
      await ctx.close();
    }
  }
} finally { await browser.close(); }
writeFileSync(`${out}/menu-glass.tsv`, rows.join("\n") + "\n");
console.log(rows.join("\n"));
if (fails.length) { console.error(`menu-glass: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log("menu-glass: OK (the back room's menu is Midnight glass on Midnight's page at 390 and 1440; the Desk's stays Velvet)");
