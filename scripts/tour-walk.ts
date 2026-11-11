/// <reference lib="dom" />
// tour_walk (S1, Fri Oct 30; Joshua's item 1): walks the judge tour (`?desk=tour`) in a real browser at 1440 and 390,
// against a server started with PAYMENT=fake (the fake tap stands in for PayPal's; no key, no money), and times the
// site's own waits: the tour loading, then for each open stop the press of its button until the feature is ready, and
// Back to the tour until its list is there again. The Watcher stop waits for the whole run (the scam seller set aside);
// the pay stop waits for the wallet's Approve, then presses it and waits for the paid return (the fake tap; the real
// sandbox login is the shopper's and not counted). Writes docs/fixtures/tour-walk.json, which the claims row
// `s1-tour-time` sums: these waits plus the stated look per stop (TOUR_LOOK_S) make "about 3 minutes".
//
//   node scripts/tour-walk.ts [url]   default http://localhost:8823 (PAYMENT=fake, WEB_URL the same origin, web/dist built)

import { writeFileSync } from "node:fs";
import { chromium, devices, type Page } from "playwright";
import { TOUR_OPEN } from "@goose/core/tour";

const url = (process.argv[2] ?? "http://localhost:8823/").replace(/\/?$/, "/");
function fail(m: string): never { console.error(`TOUR WALK FAIL: ${m}`); process.exit(1); }
const health = await fetch(`${url}api/health`).then((r) => r.json() as Promise<{ payment?: string }>).catch(() => null);
if (health?.payment !== "fake") fail(`${url} isn't a PAYMENT=fake server (payment: ${health?.payment ?? "no answer"})`);

/** What "ready" means for each stop: the feature on screen, usable. */
const READY: Record<string, (p: Page) => Promise<unknown>> = {
  ask: (p) => p.getByRole("textbox", { name: "Ask for anything" }).first().waitFor(),
  // S1-4: the Watcher's ask waits in the box until the visitor's tap; the walk taps Ask and Shop, as a visitor would.
  watcher: async (p) => {
    await p.getByRole("button", { name: "Ask Goose" }).first().click();
    await p.getByRole("button", { name: /Shop for this/ }).click({ timeout: 20_000 });
    await p.locator(".dk-protect h3", { hasText: "Goose set" }).waitFor({ timeout: 30_000 });
  },
  trick: (p) => p.locator("#ds-ch-note").waitFor({ timeout: 20_000 }),
  haggle: (p) => p.locator("#hg-h").waitFor({ timeout: 20_000 }),
  limits: (p) => p.locator("#dk-set-h").waitFor(),
  pay: (p) => p.getByRole("button", { name: /approve/i }).first().waitFor({ timeout: 20_000 }),
  after: (p) => p.locator(".ap-h").waitFor(),
  talk: (p) => p.getByRole("textbox", { name: "Ask for anything" }).first().waitFor(),
  wants: (p) => p.locator("#dk-wants-h").waitFor(),
  list: (p) => p.locator(".xl-total").first().waitFor(),
  ledger: (p) => p.locator("#sl-h, [data-studio-layer=\"shown\"] #st-h").first().waitFor({ timeout: 20_000 }), // the Community ledger, or the page live serves
  proof: (p) => p.locator("#pf-h").waitFor({ timeout: 20_000 }),
};
for (const s of TOUR_OPEN) if (!READY[s.id]) fail(`no ready check for the open stop "${s.id}"`);

const secs = (t0: number) => Math.round((performance.now() - t0) / 100) / 10;
const out: Record<string, { stop: string; open: number; back: number }[] & { load?: number }> = {};
const loads: Record<string, number> = {};
const browser = await chromium.launch();
try {
  for (const size of ["1440", "390"] as const) {
    const ctx = size === "390" ? await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }) : await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let t = performance.now();
    await page.goto(`${url}?desk=tour`);
    await page.locator(".tr-stage").waitFor();
    loads[size] = secs(t);
    const rows: { stop: string; open: number; back: number }[] = [];
    for (const s of TOUR_OPEN) {
      t = performance.now();
      // S1-4: the stepper shows the next stop not yet seen, with its one filled button.
      const on = (await page.locator("#tr-stage-h").textContent())?.trim();
      if (on !== s.name) fail(`${size}: the stepper shows "${on}", not the next stop "${s.name}"`);
      await page.locator(".tr-stage .tr-next-go").click();
      await READY[s.id]!(page);
      let open = secs(t);
      if (s.id === "pay") {
        // The shopper's tap on Approve, then the return from the (fake) PayPal page: the waits around the login.
        const t2 = performance.now();
        await page.getByRole("button", { name: /approve/i }).first().click();
        await page.waitForURL(/run=[0-9a-f]{12}/, { timeout: 30_000 });
        await page.waitForLoadState("networkidle");
        open = Math.round((open + secs(t2)) * 10) / 10;
      }
      t = performance.now();
      await page.goto(`${url}?desk=tour`); // Back, as many steps as the stop took: the tour's own address is the same wait
      await page.locator(".tr-stage").waitFor();
      rows.push({ stop: s.id, open, back: secs(t) });
      const seen = await page.locator(".tr-stop.tr-done").count();
      if (seen !== rows.length) fail(`${size}: ${seen} stops ticked after ${rows.length} opened`);
    }
    if (errors.length) fail(`${size}: page errors: ${errors.join(" | ")}`);
    out[size] = rows;
    await ctx.close();
  }
} finally { await browser.close(); }

const total = (size: string) => Math.round((loads[size]! + out[size]!.reduce((a, r) => a + r.open + r.back, 0)) * 10) / 10;
const file = {
  source: `scripts/tour-walk.ts against ${url} (PAYMENT=fake), ${new Date().toISOString().slice(0, 10)}: seconds from each press to the feature being ready, and back to the tour. The site's own waits only: the look at each stop is the stated allowance (TOUR_LOOK_S), and PayPal's sandbox login is not counted.`,
  load: loads,
  at1440: out["1440"],
  at390: out["390"],
  waits: { at1440: total("1440"), at390: total("390") },
};
writeFileSync(new URL("../docs/fixtures/tour-walk.json", import.meta.url), `${JSON.stringify(file, null, 2)}\n`);
console.log(`tour walk: waits ${file.waits.at1440} s at 1440, ${file.waits.at390} s at 390`);
