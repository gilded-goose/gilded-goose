/// <reference lib="dom" />
// Screenshots of the "I saw it for $X" field (021 item 8) under Ask Goose's answer, for guild-visual: one spoken price
// (filled, "check the amount"), two prices (Goose asks which, field empty), a typed non-price, the empty field, and
// "a kettle for $40" (maybe a budget, so the Settings line stays and the amount is offered to tap, never filled), and the field before any Ask (empty, optional), × phone
// 390 and desktop 1440, plus the phone in dark mode. Fails if the field isn't filled as the words say, if a pick doesn't fill it, if the error shows while typing
// or after a pick, if a typed "$55" is flagged as spoken, if a seen price shows the Settings line or a maybe-budget
// doesn't, if the page scrolls sideways at 390, or if the amount box or a button is under 44 px tall (the box, not the
// bare input: the whole box takes the tap) (shared Lessons 1, 4). And if the field isn't there before an Ask, if a price
// typed first doesn't survive an Ask with no price, or if × doesn't empty it (Joshua, via the lead, 2026-10-28).
// The answer ladder (item 9) under the field, with no run on screen (the week-3 beat): at $55 the answer first, "Buy it
// where you saw it", then QuickQuack's refusal, then what it compared; "Hear it" says the answer; at $70 over the $60
// limit, and the limit chip stops saying "under". None for a price with no kettle named, or for two prices. After a
// week-1 run binds $47.73, the answer is that deal, never "nothing beats $55" beside it (code review); on the wallet,
// which doesn't pass its market yet, no ladder shows, so none can contradict its deal.
// Needs the offline web server (.claude/launch.json "goose-web-offline", port 5179). Re-runnable from the repo root:
// corepack pnpm saw:screens
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { SAW_MAYBE, SAW_SPOKEN, SAW_TYPE_A_PRICE, SETTINGS_ONLY } from "@goose/core/ask-copy";
import { LADDER_BEAT, ONLY_CHECKOUT, ladderFrom } from "@goose/core/ladder";

const URL = process.env.SAW_URL ?? "http://localhost:5179/";
const OUT = "docs/screens"; mkdirSync(OUT, { recursive: true });
function fail(m: string): never { console.error(`saw FAIL: ${m}`); process.exit(1); }
const shown = (page: Page, text: string) => page.getByText(text, { exact: true }).isVisible();

async function ask(page: Page, words: string, fresh = true) {
  if (fresh) await page.goto(URL);
  await page.fill("#want", words);
  await page.press("#want", "Enter");
  await page.waitForSelector(".askout");
}

async function checks(page: Page, name: string, width: number) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  if (width === 390 && wide > 390) fail(`${name}: the phone page scrolls sideways (${wide} px)`);
  for (const el of await page.$$(".sawbox, .saw button, .sawx")) {
    const b = await el.boundingBox();
    if (b && b.height < 44) fail(`${name}: a field control is ${b.height} px tall`);
  }
}

const browser = await chromium.launch();
for (const [w, h, scheme, tag] of [[390, 844, "light", "phone"], [1440, 900, "light", "desktop"], [390, 844, "dark", "phone-dark"]] as const) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
  // What the page says aloud, recorded: "Hear it" is checked by what it speaks, not by a quote on screen.
  await page.addInitScript(() => {
    const said: string[] = ((window as unknown as { __said: string[] }).__said = []);
    const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u: SpeechSynthesisUtterance) => { if (u.text) said.push(u.text); speak(u); };
  });
  const said = async () => page.evaluate(() => (window as unknown as { __said: string[] }).__said.at(-1) ?? "");
  const shot = async (state: string) => {
    await checks(page, `${tag} ${state}`, w);
    await page.locator(".askg").screenshot({ path: `${OUT}/saw-${tag}-${state}.png` });
    console.log(`ok  ${OUT}/saw-${tag}-${state}.png`);
  };

  // Before any Ask: the field is there, empty, and optional; a price typed first survives an Ask that names none.
  await page.goto(URL);
  await page.waitForSelector("#saw");
  if ((await page.inputValue("#saw")) !== "") fail(`${tag}: the field isn't empty before an Ask`);
  if (scheme !== "dark") await shot("first");
  await page.fill("#saw", "55");
  await ask(page, "a black kettle like mine", false);
  if ((await page.inputValue("#saw")) !== "55.00") fail(`${tag}: a price typed before the Ask didn't survive it (as 55.00)`);
  // The ladder: the answer first (the store's $55 is best and in budget), then the scam named as refused, never as the deal.
  const best = "Among sellers not set aside, none beats your $55.00. Buy it where you saw it.";
  const lines = await page.locator(".ladder p").allInnerTexts();
  if (lines[0] !== best || lines[1] !== ladderFrom(LADDER_BEAT)) fail(`${tag}: the $55 answer and what it compared aren't first (${lines})`);
  if (!lines[2]?.startsWith("Watcher set QuickQuack Deals (fictional) aside:") || lines[3] !== ONLY_CHECKOUT) fail(`${tag}: the refused seller is wrong (${lines})`);
  // Said back: the ladder's short line (item 10, ~3 s) in the chips' place, on the Ask and on "Hear it", with no second quote on screen.
  // The answer first, then the refused seller in one short clause (Joshua, Thu Oct 29).
  const bestSaid = "Nothing cleared beats $55. Buy it where you saw it. QuickQuack was refused: it asked for a gift card.";
  if ((await said()) !== bestSaid) fail(`${tag}: the Ask said ${await said()}`);
  if (await page.isVisible("text=Hear it again")) fail(`${tag}: the chips' "Hear it again" shows beside the ladder`);
  await page.click(".ladhear");
  if ((await said()) !== bestSaid) fail(`${tag}: "Hear it" said ${await said()}`);
  if (scheme !== "dark") await shot("kept");
  await page.fill("#saw", "70");
  const over = "Among sellers not set aside, none beats your $70.00, and that's over your $60.00 limit.";
  if ((await page.locator(".ladline").innerText()) !== over) fail(`${tag}: $70 isn't over the $60 limit`);
  await page.click(".ladhear");
  if ((await said()) !== "Nothing cleared beats $70, over your $60 limit. QuickQuack was refused: it asked for a gift card.") fail(`${tag}: $70 said back as ${await said()}`);
  const chip = page.locator('.gchip[data-kind="limit"]');
  if ((await chip.getAttribute("data-over")) === null) fail(`${tag}: the limit chip isn't marked over beside an over-budget answer`);
  if ((await chip.innerText()) !== "your limit · $60.00") fail(`${tag}: the limit chip says "${await page.locator('.gchip[data-kind="limit"]').innerText()}" beside an over-budget answer`);
  await shot("over");
  await page.click(".sawx");
  if ((await page.inputValue("#saw")) !== "" || (await page.isVisible(".sawx"))) fail(`${tag}: × didn't clear the field`);
  const [w0, w1] = [await page.locator(".sawbox").boundingBox(), (await page.fill("#saw", "55"), await page.locator(".sawbox").boundingBox())];
  if (w0?.width !== w1?.width) fail(`${tag}: the box changes width when × appears (${w0?.width} → ${w1?.width})`);
  await page.click(".sawx");

  await ask(page, "I like this kettle, I saw it for fifty-five dollars, see if you can find it cheaper");
  if ((await page.inputValue("#saw")) !== "55.00") fail(`${tag}: the spoken price didn't fill the field`);
  if (!(await shown(page, SAW_SPOKEN))) fail(`${tag}: a spoken price isn't flagged to check`);
  if (await shown(page, SETTINGS_ONLY)) fail(`${tag}: a seen price shows the Settings line`);
  await shot("spoken");
  if (scheme === "dark") { await page.close(); continue; }

  // A price with no kettle named: no ladder (it only knows the kettle's sellers).
  await ask(page, "a red jacket, I saw it for $40");
  if (await page.isVisible(".ladder")) fail(`${tag}: a ladder shows for a price with no kettle named`);
  // After a week-1 run binds Goose's $47.73, the answer is that deal: never "nothing beats $55" beside it.
  await page.goto(`${URL}?seed=1`);
  await page.getByRole("button", { name: "Go find it" }).click();
  await page.getByText("Goose's cart, checked by code").first().waitFor({ timeout: 90_000 });
  await page.fill("#saw", "55");
  await ask(page, "a black kettle like mine", false);
  const after = await page.locator(".ladline").innerText();
  if (after !== "Not set aside, and $7.27 less: the same kettle for $47.73 in Goose's deal at Reedbank Outfitters (fictional).") fail(`${tag}: after week 1's run the answer is "${after}"`);
  if ((await page.locator(".ladfrom").innerText()) !== ladderFrom({ seed: 1, deal: { merchant: "Reedbank Outfitters (fictional)", total: "47.73" } })) fail(`${tag}: after week 1's run the comparison isn't week 1's`);
  await shot("deal");
  // The wallet shows week 1's deal and doesn't pass its market yet: no ladder, so none can contradict it.
  await page.goto(`${URL}?wallet=1`);
  await page.waitForSelector("#want");
  await page.fill("#want", "a black kettle like mine");
  await page.press("#want", "Enter");
  await page.waitForSelector(".askout");
  await page.fill("#saw", "55");
  if (await page.isVisible(".ladder")) {
    const line = await page.locator(".ladline").innerText();
    if (!line.includes("Goose's deal")) fail(`${tag}: on the wallet the ladder says "${line}" beside Goose's deal`);
  }

  // Controls: a typed "$55" isn't flagged as spoken; a maybe-budget keeps the Settings line.
  await ask(page, "I saw it for $55");
  if ((await page.inputValue("#saw")) !== "55.00" || (await shown(page, SAW_SPOKEN))) fail(`${tag}: a typed $55 is flagged as spoken`);
  // "a kettle for $40" may be a budget: offered to tap, never filled, so no "Buy it where you saw it" of it (visual review).
  await ask(page, "a kettle for $40");
  if (!(await shown(page, SETTINGS_ONLY))) fail(`${tag}: "a kettle for $40" (maybe a budget) lost the Settings line`);
  if ((await page.inputValue("#saw")) !== "" || !(await shown(page, SAW_MAYBE))) fail(`${tag}: "a kettle for $40" filled the field instead of offering it`);
  if (await page.isVisible(".ladder")) fail(`${tag}: a ladder shows for a price the shopper didn't say they saw`);
  await shot("budget");
  await page.click(".sawpick button >> text=$40.00");
  if ((await page.inputValue("#saw")) !== "40.00" || (await shown(page, SAW_MAYBE))) fail(`${tag}: tapping $40.00 didn't fill the field`);
  if (!(await page.isVisible(".ladder"))) fail(`${tag}: no ladder after the shopper tapped $40.00`);

  await ask(page, "it was $49.99 or $54.99 somewhere, find it cheaper");
  if ((await page.inputValue("#saw")) !== "") fail(`${tag}: two prices filled the field (Goose guessed)`);
  if (await page.isVisible(".ladder")) fail(`${tag}: a ladder shows with no price in the field`);
  await shot("which");
  await page.click(".sawpick button >> text=$54.99");
  if ((await page.inputValue("#saw")) !== "54.99") fail(`${tag}: picking $54.99 didn't fill the field`);
  if (await shown(page, SAW_TYPE_A_PRICE)) fail(`${tag}: the error shows after a pick`);

  await page.fill("#saw", "");
  await page.locator("#saw").blur();
  await shot("empty");

  // "54." on the way to "54.99" is still typing: no error until the shopper leaves the box.
  await page.fill("#saw", "54.");
  if (await shown(page, SAW_TYPE_A_PRICE)) fail(`${tag}: the error shows while typing`);
  await page.fill("#saw", "55 max");
  await page.locator("#saw").blur();
  if (!(await shown(page, SAW_TYPE_A_PRICE))) fail(`${tag}: a typed non-price isn't said`);
  await shot("typed");
  await page.close();
}
await browser.close();
