/// <reference lib="dom" />
// judge_path_end_to_end (Track J, Fri Oct 30; Joshua's item a): the judge's path on the Desk, in a real browser at 1440 and
// 390, against a server started with PAYMENT=fake (the fake tap stands in for PayPal's; no key, no money):
//   Judge? Start here → the judge tour → Behind the scenes (empty; its status line carries "Ask Goose") → ask → the understood card →
//   Shop for this → the run, with the planted seller set aside → Approve $<deal> → (fake PayPal tap) → Paid $<deal>,
//   the same after a reload → "See it behind the scenes" on the paid card → the strip counts what the Desk showed
//   (every seller checked, the planted one skipped, the deal spent) → Proof in one tap.
// Then the wrong turns that must recover: Proof opened directly, a garbage run id (the landing), and a well-formed run id
// the server doesn't have ("Cart not found", never "Waiting on PayPal"). Fails on any page error on our pages.
//
//   node scripts/judge-path.ts [url]   default http://localhost:8788 (PAYMENT=fake, WEB_URL the same origin, web/dist built)

import { chromium, devices, type Page } from "playwright";
import { CART_GONE } from "@goose/core/desk";

const url = (process.argv[2] ?? "http://localhost:8788/").replace(/\/?$/, "/");
function fail(m: string): never { console.error(`JUDGE PATH FAIL: ${m}`); process.exit(1); }
const health = await fetch(`${url}api/health`).then((r) => r.json() as Promise<{ payment?: string; intent?: string }>).catch(() => null);
if (health?.payment !== "fake") fail(`${url} isn't a PAYMENT=fake server (payment: ${health?.payment ?? "no answer"})`);

const browser = await chromium.launch();
try {
  for (const size of ["1440", "390"] as const) {
    const ctx = size === "390" ? await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }) : await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page: Page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/status of 404/.test(m.text())) errors.push(m.text()); });
    const at = (step: string) => { if (errors.length) fail(`${size} ${step}: page errors: ${errors.join(" | ")}`); };

    await page.goto(url, { waitUntil: "networkidle" });
    // S1: "Judge? Start here" opens the judge tour; its "Behind the scenes" stop goes on to the back room as before.
    // The page's static copy of the one nav (index.html, for the classic page) stays in the DOM, hidden, under the Desk's.
    // S1-13: on a phone the bar is lockup · Practice only · Menu (no bottom rail): Menu, then its views row's "Judge tour".
    if (!(await page.locator("a.dk-judge:visible").count())) await page.locator("header.gn .gm-btn:visible").first().click();
    await page.locator(`a.dk-judge:visible, .gm-view[href$="desk=tour"]:visible`).first().click();
    await page.waitForURL(/desk=tour/);
    // S1-4: the tour is a stepper; every stop is one tap away under "All N stops" (S1-6: folded on a phone; beside the
    // stepper on a wide screen, where a stop's row moves the stepper to it and its one filled button opens it).
    if (await page.locator(".tr-side").isVisible()) {
      await page.locator(".tr-side button", { hasText: "Behind the scenes" }).click();
      await page.locator(".tr-next-go", { hasText: "Open" }).click();
    } else {
      await page.locator(".tr-all summary").click();
      await page.locator(".tr-go", { hasText: "Behind the scenes" }).click();
    }
    await page.waitForURL(/desk=ledger/);
    const askLink = page.locator(".lx-status a", { hasText: "Ask Goose" });
    try { await askLink.waitFor({ timeout: 10_000 }); } catch { fail(`${size}: Behind the scenes with no session has no "Ask Goose" in its status line`); }
    if (!(await askLink.isVisible()) || ((await askLink.boundingBox())?.y ?? 9999) > (size === "390" ? 844 : 900)) fail(`${size}: "Ask Goose" is not on the first screen of Behind the scenes`);
    at("judge start");
    await askLink.click();
    await page.waitForURL(/desk=1/);

    await page.getByRole("textbox", { name: "Ask for anything" }).first().fill("A kettle under $60");
    await page.getByRole("button", { name: "Ask Goose" }).first().click();
    await page.getByRole("button", { name: /Shop for this/ }).click({ timeout: 20_000 });
    const approve = page.locator("button.dk-approve", { hasText: /Approve \$/ });
    await approve.waitFor({ timeout: 30_000 });
    const sellers = await page.locator(".dk-feed:not(.dk-ghost) > li").count();
    const aside = await page.locator(".dk-fr.dk-aside").count();
    if (aside !== 1) fail(`${size}: the run set aside ${aside} sellers, not the planted one`);
    if (!(await page.locator(".dk-protect h3").innerText()).startsWith("Goose set")) fail(`${size}: no "Goose set … aside" card`);
    const total = (await approve.innerText()).match(/\$(\d+\.\d\d)/)?.[1] ?? fail(`${size}: the Approve names no amount`);
    if (!(await page.locator(".dk-deal2 .dk-big").innerText()).includes(total)) fail(`${size}: the deal card and its Approve disagree on $${total}`);
    // S1-6 (Round 2 judges' top fix): before the tap, with no fold opened, the deal card shows what happens after it:
    // the steps the server's intent takes (AUTHORIZE: Held, Re-checked, Captured) and that code seals this exact cart.
    const after = page.locator(".dk-deal2 .tl.tl-ahead");
    try { await after.waitFor({ timeout: 10_000 }); } catch { fail(`${size}: the deal card shows no "What happens after your tap" before Approve`); }
    if (await page.locator(".dk-deal2 details[open]").count()) fail(`${size}: a fold on the deal card was open before the check`);
    for (const step of [...(health?.intent === "CAPTURE" ? [] : ["Held"]), "Re-checked", "Captured"]) {
      const s = after.locator(".tl-step", { hasText: step });
      if (!(await s.isVisible())) fail(`${size}: the step "${step}" isn't visible on the deal card before Approve`);
    }
    if (!/code seals this exact cart/.test(await after.innerText())) fail(`${size}: the deal card doesn't say code seals this exact cart at the tap`);
    at("run");

    await approve.click();
    await page.waitForURL(/run=[0-9a-f]{12}/, { timeout: 20_000 });
    const paid = page.locator(".dk-paid :is(h1, h2)");
    for (const pass of ["return", "reload"]) {
      if (pass === "reload") await page.reload({ waitUntil: "networkidle" });
      try { await paid.filter({ hasText: `Paid $${total}` }).waitFor({ timeout: 10_000 }); } catch { fail(`${size} ${pass}: the paid card says "${await paid.innerText()}", not "Paid $${total}"`); }
    }
    at("paid");

    await page.locator(".dk-paid a.dk-linkbtn", { hasText: "See it behind the scenes" }).click();
    await page.waitForURL(/desk=ledger/);
    await page.locator(".lx-status.live").waitFor({ timeout: 10_000 });
    const strip = async (key: string) => (await page.locator(`.lx-strip [data-key="${key}"] dd`).innerText()).trim();
    await page.waitForFunction(() => document.querySelector('.lx-strip [data-key="checked"] dd')?.textContent !== "0", undefined, { timeout: 10_000 }).catch(() => {});
    const keys = await page.locator(".lx-strip [data-key]").evaluateAll((ds) => ds.map((d) => d.getAttribute("data-key")));
    const checkedKey = keys.find((k) => /check/.test(k ?? "")) ?? fail(`${size}: no checked tile in the strip (${keys.join(", ")})`);
    const skippedKey = keys.find((k) => /skip/.test(k ?? "")) ?? fail(`${size}: no skipped tile in the strip`);
    const spentKey = keys.find((k) => /spent/.test(k ?? "")) ?? fail(`${size}: no spent tile in the strip`);
    if ((await strip(checkedKey!)) !== String(sellers)) fail(`${size}: Behind the scenes says ${await strip(checkedKey!)} sellers checked; the Desk showed ${sellers}`);
    if ((await strip(skippedKey!)) !== "1") fail(`${size}: Behind the scenes says ${await strip(skippedKey!)} skipped; the Desk set aside 1`);
    if ((await strip(spentKey!)) !== `$${total}`) fail(`${size}: Behind the scenes says ${await strip(spentKey!)} spent; the Desk paid $${total}`);
    at("behind the scenes");

    await page.getByRole("link", { name: "See the proof" }).click();
    await page.waitForURL(/desk=proof/);
    await page.locator("h1#pf-h").waitFor();
    at("proof");

    // Wrong turns.
    await page.goto(`${url}?desk=proof`, { waitUntil: "networkidle" });
    if ((await page.locator("h1#pf-h").innerText()) !== "Proof") fail(`${size}: ?desk=proof opened directly isn't Proof`);
    await page.goto(`${url}?desk=1&run=zzz`, { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Ask for anything" }).first().waitFor();
    await page.goto(`${url}?desk=1&run=0123456789ab`, { waitUntil: "networkidle" });
    try { await paid.filter({ hasText: CART_GONE.title }).waitFor({ timeout: 10_000 }); } catch { fail(`${size}: an unknown run says "${await paid.innerText()}", not "${CART_GONE.title}"`); }
    at("wrong turns");
    console.log(`ok  ${size}: judge path, $${total}, ${sellers} sellers checked, 1 skipped, Proof one tap away; wrong turns recover`);
    await ctx.close();
  }
} finally { await browser.close(); }
