// "Recompute it yourself" on Under the hood, walked in a real browser at 1440 and 390: nothing of it is fetched on the
// first load, only as the ledger above it nears the screen; the recorded cart matches; one cent breaks the match and Reset mends it;
// the whole part works from the keyboard; no request leaves the page while it is used, nothing is kept, and the console
// stays clean. axe reads the part, and markup typed into a box shows as text.
//
//   node scripts/fingerprint-walk.ts <base> [shots-dir]     (a server with the web build, e.g. http://localhost:8792)

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

if (!process.argv[2]) { console.error("usage: node scripts/fingerprint-walk.ts <base> [shots-dir]"); process.exit(2); }
const BASE = process.argv[2].replace(/\/$/, ""), SHOTS = process.argv[3];
const vectors = (JSON.parse(readFileSync(new URL("../trust/test/vectors.json", import.meta.url), "utf8")) as { vectors: { name: string; fingerprint: string }[] }).vectors;
const fp = (n: string) => vectors.find((v) => v.name === n)!.fingerprint;
const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
let misses = 0;
const check = (ok: boolean, what: string) => { if (!ok) misses++; console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };

async function walk(width: number, height: number) {
  const at = `${width}px`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce", bypassCSP: true }); // axe goes in inline
  const requests: string[] = [], failed: string[] = [], errors: string[] = [], fromPart: string[] = [], otherWarnings: string[] = [];
  const isPart = (u: string) => /\/assets\/Recompute-[\w-]+\.(js|css)/.test(u);
  page.on("request", (r) => requests.push(r.url()));
  page.on("requestfailed", (r) => failed.push(r.url()));
  // Any error fails, whoever logged it. A warning fails when the part's own chunk logged it; another part's is named, not hidden.
  page.on("console", (m) => {
    const line = `${m.type()}: ${m.text().split("\n")[0]}`;
    if (m.type() === "error") errors.push(line);
    else if (isPart(m.location().url)) fromPart.push(line);
    else if (m.type() === "warning") otherWarnings.push(line);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  // Who asked for each request: the browser's own record of the script that started it (CDP), so "the part sent nothing"
  // is read from the stack, while the page's own ledger stream keeps running beside it.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const askedByPart: string[] = [];
  cdp.on("Network.requestWillBeSent", (e) => {
    const frames: { url: string }[] = [];
    for (let st = e.initiator.stack; st; st = st.parent) frames.push(...st.callFrames);
    if (!isPart(e.request.url) && (isPart(e.initiator.url ?? "") || frames.some((f) => isPart(f.url)))) askedByPart.push(e.request.url);
  });

  await page.goto(`${BASE}/#/under-the-hood`, { waitUntil: "load" });
  await page.waitForSelector("h1:has-text('Under the hood')", { timeout: 30_000 });
  await page.waitForTimeout(2500);
  const isBelow = (u: string) => /\/assets\/Below-[\w-]+\.js/.test(u), isServed = (u: string) => /\/fingerprint-(v0\.txt|vectors\.json)/.test(u);
  check(!requests.some((u) => isPart(u) || isBelow(u) || isServed(u)), `${at}: nothing of the section is fetched with the page (${requests.length} requests on first load; 0 for its chunk, the ledger's wrapper, the recipe or the vectors)`);
  check(await page.locator(".fp").count() === 0, `${at}: the part is not drawn on the first screen`);
  const head = page.locator("h2#hood-recompute-h");
  const kept = () => page.evaluate(() => JSON.stringify([Object.keys(localStorage).sort(), Object.keys(sessionStorage).sort(), document.cookie]));
  const keptBefore = await kept();

  // The section rides the ledger's chunk: it arrives as the ledger nears the screen.
  await page.locator("h2#hood-ledger-h").scrollIntoViewIfNeeded();
  await head.waitFor({ timeout: 30_000 });
  check(await head.innerText() === "Recompute it yourself" && await page.locator("section.hood-next[aria-labelledby='hood-recompute-h']").count() === 1, `${at}: its heading names its section`);
  await head.scrollIntoViewIfNeeded();
  await page.waitForSelector('.fp[data-state="match"]', { timeout: 30_000 });
  const chunk = requests.filter(isPart);
  check(chunk.length === 2, `${at}: scrolling to the ledger fetches its two files (${chunk.map((u) => u.split("/").pop()).join(", ")})`);
  await page.waitForTimeout(1500);
  const quiet = requests.length; // from here on, only the page's own stream may ask for anything
  const pageOwn = new Set(requests.map((u) => new URL(u).pathname));
  const said = () => page.locator(".fp-said").innerText();
  const mine = () => page.locator(".fp-pair > div:first-child .fp-hash").innerText();
  const part = page.locator(".fp");
  const total = part.getByLabel("Total");

  check((await said()).trim() === "Matches the recorded fingerprint", `${at}: the recorded cart matches ("${(await said()).trim()}")`);
  check(await mine() === fp("recorded-week-1"), `${at}: the browser's fingerprint is the recorded week's (${await mine()})`);
  check(await page.locator(".fp .prov[data-kind='recorded']").innerText() === "Recorded", `${at}: it is labelled Recorded`);
  check((await page.locator(".fp-text").innerText()).includes('"47.73","USD","one-off","kettle",null,'), `${at}: the exact text is shown`);
  if (SHOTS) await page.locator("section.hood-next").screenshot({ path: `${SHOTS}/fingerprint-${width}-match.png` });

  await page.getByRole("button", { name: "Add one cent" }).click();
  await page.waitForSelector('.fp[data-state="differ"]');
  check(await total.inputValue() === "47.74" && await mine() === fp("one-cent-more"), `${at}: one cent more gives ${await mine()}`);
  check((await said()).trim() === "Does not match the recorded fingerprint", `${at}: and the match breaks ("${(await said()).trim()}")`);
  const seen = await page.evaluate(() => ["Add one cent", ""].map((name, i) => {
    const el = i === 0 ? [...document.querySelectorAll(".fp .btn")].find((b) => b.textContent === name)! : document.querySelector(".fp-said")!;
    const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight;
  }));
  check(seen.every(Boolean), `${at}: the button pressed and the answer it changed are on screen together`);
  if (SHOTS) await page.locator("section.hood-next").screenshot({ path: `${SHOTS}/fingerprint-${width}-differ.png` });
  await page.getByRole("button", { name: "Reset" }).click();
  await page.waitForSelector('.fp[data-state="match"]');
  check(await total.inputValue() === "47.73", `${at}: Reset puts the cart back and it matches again`);

  // Keyboard only: from the first box, Tab to the total, type a cent more, Tab on to the buttons.
  await part.getByLabel("Item").focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  check(await total.evaluate((el) => el === document.activeElement), `${at}: Tab reaches the total in the recipe's order`);
  const ring = await total.evaluate((el) => { const s = getComputedStyle(el); return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2; });
  check(ring, `${at}: the focused box shows a focus ring`);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("47.74");
  await page.waitForSelector('.fp[data-state="differ"]');
  check(await mine() === fp("one-cent-more"), `${at}: typing 47.74 breaks the match`);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("abc");
  await page.waitForSelector('.fp[data-state="none"]');
  check((await said()).includes("the total must be dollars and cents") && await total.getAttribute("aria-invalid") === "true", `${at}: a total that isn't money gives no fingerprint and says why`);
  check(await page.getByRole("button", { name: "Add one cent" }).isDisabled(), `${at}: and Add one cent waits for a real total`);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("47.73");
  await page.waitForSelector('.fp[data-state="match"]');
  for (let i = 0; i < 12 && !(await page.getByRole("button", { name: "Add one cent" }).evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.waitForSelector('.fp[data-state="differ"]');
  await page.keyboard.press("Tab");
  check(await page.getByRole("button", { name: "Reset" }).evaluate((el) => el === document.activeElement), `${at}: Tab goes from Add one cent to Reset`);
  await page.keyboard.press("Space");
  await page.waitForSelector('.fp[data-state="match"]');
  check(true, `${at}: Enter on Add one cent and Space on Reset work from the keyboard`);

  // Markup typed into a box is text, in the box and in the hashed text.
  await part.getByLabel("Item").fill('<img src=x onerror="window.__fp=1"><b>bold</b>');
  await page.waitForSelector('.fp[data-state="differ"]');
  check(await page.locator(".fp img, .fp b").count() === 0 && await page.evaluate(() => (window as unknown as { __fp?: number }).__fp) === undefined, `${at}: markup typed into a box is drawn as text`);
  check((await page.locator(".fp-text").innerText()).includes('<img src=x onerror=\\"window.__fp=1\\"><b>bold</b>'), `${at}: and is hashed as the text it is`);
  await page.getByRole("button", { name: "Reset" }).click();
  await page.waitForSelector('.fp[data-state="match"]');

  const shape = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [...document.querySelectorAll(".fp, .fp *")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -0.5 || r.right > vw + 0.5); }).length;
    const boxes = [...document.querySelectorAll<HTMLElement>(".fp-box")].map((b) => b.getBoundingClientRect().height);
    const btns = [...document.querySelectorAll<HTMLElement>(".fp .btn")].map((b) => b.getBoundingClientRect().height);
    return { sideways: document.documentElement.scrollWidth > vw, out, minBox: Math.min(...boxes), minBtn: Math.min(...btns) };
  });
  check(!shape.sideways && shape.out === 0, `${at}: nothing runs off the side (${shape.out} elements out)`);
  check(shape.minBox >= 44 && shape.minBtn >= 40, `${at}: boxes are at least 44 px tall and buttons 40 (${shape.minBox}, ${shape.minBtn})`);

  // The two links go to copies this site serves, and those are the repo's own files byte for byte.
  const links = await page.locator(".fp-fine a").evaluateAll((as) => as.map((a) => [a.textContent, new URL((a as HTMLAnchorElement).href).pathname]));
  check(JSON.stringify(links) === JSON.stringify([["The recipe, step by step", "/fingerprint-v0.txt"], ["16 test vectors", "/fingerprint-vectors.json"]]), `${at}: the two links are the site's own copies (${links.map((l) => l[1]).join(", ")})`);
  for (const [path, file] of [["/fingerprint-v0.txt", "../docs/fingerprint-v0.md"], ["/fingerprint-vectors.json", "../trust/test/vectors.json"]] as const) {
    const r = await page.context().request.get(`${BASE}${path}`);
    check(r.status() === 200 && (await r.text()) === readFileSync(new URL(file, import.meta.url), "utf8"), `${at}: ${path} answers 200 with ${file.slice(3)} as it is (${r.headers()["content-type"]})`);
  }

  await page.evaluate(AXE);
  const axe = await page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run(el: Element, o: unknown): Promise<{ violations: { id: string; nodes: { html: string }[] }[] }> } }).axe.run(document.querySelector(".fp")!.closest("section")!, { resultTypes: ["violations"] });
    return r.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.html.slice(0, 80)}`);
  });
  check(axe.length === 0, `${at}: axe finds nothing in the section${axe.length ? `: ${axe.join("; ")}` : ""}`);

  await page.waitForTimeout(500);
  const since = requests.slice(quiet), fresh = since.filter((u) => !pageOwn.has(new URL(u).pathname));
  check(askedByPart.length === 0, `${at}: the part's own code started no request, by the browser's record of who asked (${askedByPart.length})`);
  check(fresh.length === 0, `${at}: while it was used, the page asked for nothing it wasn't already asking for (${since.length} requests, all the page's own stream: ${[...new Set(since.map((u) => new URL(u).pathname))].join(", ") || "none"})${fresh.length ? ` NEW: ${fresh.slice(0, 3).join(", ")}` : ""}`);
  check(await kept() === keptBefore, `${at}: nothing was kept (localStorage, sessionStorage and cookies as before)`);
  check(failed.length === 0, `${at}: no request failed${failed.length ? `: ${failed.slice(0, 3).join(", ")}` : ""}`);
  check(errors.length === 0, `${at}: the console has no error${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  check(fromPart.length === 0, `${at}: the part's own chunk logged nothing${fromPart.length ? `: ${fromPart.slice(0, 3).join(" | ")}` : ""}`);
  if (otherWarnings.length) console.log(`note ${at}: ${otherWarnings.length} warning(s) from other parts of the page, not this one: ${[...new Set(otherWarnings)].slice(0, 2).join(" | ").slice(0, 200)}`);
  if (SHOTS) await page.locator("section.hood-next").screenshot({ path: `${SHOTS}/fingerprint-${width}-end.png` });
  await browser.close();
}

await walk(1440, 900);
await walk(390, 844);
console.log(misses ? `fingerprint-walk: ${misses} FAILED` : "fingerprint-walk: all ok at 1440 and 390");
process.exit(misses ? 1 : 0);
