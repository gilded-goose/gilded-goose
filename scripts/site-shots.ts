// Screenshots of the new site (plan Task 1). Full-page PNGs at each width into ../goose-studio/shots/site/, named
// <route>-<width>[-reduced][-<open>].png. Exits 1 on any console error or uncaught page error, and when the page
// scrolls sideways (the 320px rule); other spills are printed as warnings from scripts/overflow.ts.
//   node scripts/site-shots.ts <route|all> [--base http://localhost:5174] [--widths 320,390,1440] [--reduced] [--open menu|judge]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { overflow } from "./overflow.ts";

const ROUTES = ["home", "shop", "under-the-hood", "proof", "builders"] as const;
type Route = (typeof ROUTES)[number];

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
const which = args[0] && !args[0].startsWith("--") ? args[0] : "home";
const routes: Route[] = which === "all" ? [...ROUTES] : ROUTES.includes(which as Route) ? [which as Route] : [];
if (!routes.length) {
  console.error(`site-shots: unknown route "${which}" (one of ${ROUTES.join(", ")}, or all)`);
  process.exit(2);
}
const base = (flag("base") ?? "http://localhost:5174").replace(/\/$/, "");
const widths = (flag("widths") ?? "390,1440").split(",").map(Number).filter((n) => n > 0);
const reduced = args.includes("--reduced");
const open = flag("open");
if (open && open !== "menu" && open !== "judge") {
  console.error(`site-shots: --open takes menu or judge, not "${open}"`);
  process.exit(2);
}

const OUT = resolve(fileURLToPath(new URL("../../goose-studio/shots/site/", import.meta.url)));
mkdirSync(OUT, { recursive: true });

const hashOf = (r: Route) => (r === "home" ? "#/" : `#/${r}`);
const problems: string[] = [];
const browser = await chromium.launch();
try {
  for (const route of routes) {
    for (const width of widths) {
      const ctx = await browser.newContext({
        viewport: { width, height: width < 761 ? 844 : 900 },
        deviceScaleFactor: width < 761 ? 2 : 1,
        reducedMotion: reduced ? "reduce" : "no-preference",
        hasTouch: width < 761,
        isMobile: width < 761,
      });
      const page = await ctx.newPage();
      const tag = `${route}@${width}${reduced ? " reduced" : ""}`;
      page.on("console", (m) => { if (m.type() === "error") problems.push(`${tag}: console error: ${m.text()}`); });
      page.on("pageerror", (e) => problems.push(`${tag}: page error: ${e.message}`));
      await page.goto(`${base}/goose.html${hashOf(route)}`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      // The server's first answer, then a settle for the stamps' strike and any enter transitions.
      await page.waitForTimeout(900);
      if (open) {
        const button = open === "judge" ? page.getByRole("button", { name: "Judge in 60 seconds" }).first() : page.getByRole("button", { name: "Menu" });
        if (await button.isVisible()) {
          await button.click();
          await page.waitForTimeout(500);
        } else {
          console.log(`  ${tag}: no visible ${open} button at this width; skipped`);
          await ctx.close();
          continue;
        }
      }
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (sideways > 0) problems.push(`${tag}: the page scrolls sideways by ${sideways}px`);
      for (const w of await overflow(page)) console.log(`  warning ${tag}: ${w}`);
      const file = resolve(OUT, `${route}-${width}${reduced ? "-reduced" : ""}${open ? `-${open}` : ""}.png`);
      await page.screenshot({ path: file, fullPage: !open });
      console.log(`  wrote ${file}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

if (problems.length) {
  console.error(`site-shots FAIL:\n${problems.map((p) => `  ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("site-shots ok");
