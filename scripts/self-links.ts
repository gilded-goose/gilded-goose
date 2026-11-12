/// <reference lib="dom" />
// The live walk for core/test/self-links.test.ts: on every route, at 1440 and 390, a visible link (not marked
// aria-current) that opens the page it's on. The brand lockup (a.gg) is skipped: the logo going home is the web's
// convention on every page, the home page too. Usage: node scripts/self-links.ts <url>; exits 1 on any self-link.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:8835";
const PAGES = ["/", "/?desk=1", "/?desk=wallet", "/?desk=ledger&studio=force", "/?desk=studio&studio=force", "/?desk=how", "/?desk=builders", "/?desk=system", "/?desk=proof", "/?desk=tour", "/?desk=haggle", "/?market=1", "/?desk=list"];
const page = (u: URL) => { const q = new URLSearchParams(u.search); q.delete("studio"); let d = q.get("desk"); if (d === "studio") q.set("desk", "ledger"); return u.pathname + "?" + [...q].sort().map(([k, v]) => `${k}=${v}`).join("&"); };
const b = await chromium.launch();
let n = 0;
for (const w of [1440, 390]) for (const p of PAGES) {
  const pg = await b.newPage({ viewport: { width: w, height: 900 } });
  await pg.goto(base + p, { waitUntil: "load" }); await pg.waitForTimeout(2500);
  const links = await pg.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].filter((a) => a.getClientRects().length && !a.closest("[aria-hidden=true],[inert]") && !a.matches("a.gg")).map((a) => ({ href: a.href, cur: a.getAttribute("aria-current"), text: (a.textContent ?? "").trim().slice(0, 40) })));
  const here = page(new URL(base + p));
  for (const l of links) { const u = new URL(l.href); if (u.origin !== new URL(base).origin || u.hash) continue; if (page(u) === here && !l.cur) { n++; console.log(`SELF ${w} ${p}: "${l.text}" -> ${u.search}`); } }
  await pg.close();
}
await b.close();
console.log(`self-links: ${n}`);
process.exit(n ? 1 : 0);
