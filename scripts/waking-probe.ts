// Track R (the DD, ~07:20: "add a forced-503 probe that proves the failed case"). The page-wide waking line, in a real
// browser on a served build: every /api call is held past WAKE_AFTER_MS, then answered the way a waking host answers in
// the server's place (a non-JSON 503). The line must first say the pending words ("This fills in when it answers.", no
// button), then the failed words ("It sleeps when no one visits." and Try again), and never say "fills in" once nothing
// is pending. A control run answers with real JSON instead: the line leaves and the failed words never show.
// Exits 1 on any miss.
//
//   node scripts/waking-probe.ts [base] [path]     default http://localhost:4191 and / (a built site served by vite preview
//                                                  or server/; the page must run mountStates, as main.tsx does)
import { chromium, type Page } from "playwright";
import { WAKING, WAKING_FAILED } from "../web/src/states/words.ts";
import { WAKE_AFTER_MS } from "../web/src/states/waking.ts";

const base = (process.argv[2] ?? "http://localhost:4191").replace(/\/$/, "");
const path = process.argv[3] ?? "/";
const HOLD_MS = WAKE_AFTER_MS + 1_000;
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails.push(what); };

/** What the page-wide line shows right now: its words, its button (if drawn) and the live region's words. */
const read = (page: Page) => page.evaluate(() => {
  const strip = document.querySelector<HTMLElement>(".st-strip");
  const button = strip?.querySelector<HTMLButtonElement>(".st-note-action");
  const line = strip?.querySelector<HTMLElement>(".st-note-line");
  return {
    shown: !!strip && !strip.hidden,
    title: strip?.querySelector(".st-note-title")?.textContent ?? "",
    line: line && !line.hidden ? line.textContent ?? "" : "",
    button: button && !button.hidden ? button.textContent ?? "" : "",
    said: document.querySelector(".st-sr")?.textContent ?? "",
  };
});
const waitFor = async (page: Page, want: (s: Awaited<ReturnType<typeof read>>) => boolean, ms: number) => {
  const end = Date.now() + ms;
  for (;;) { const s = await read(page); if (want(s) || Date.now() > end) return s; await page.waitForTimeout(50); }
};

const browser = await chromium.launch();
for (const run of ["host 503", "real answer"] as const) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    await new Promise((r) => setTimeout(r, HOLD_MS));
    if (run === "host 503") await route.fulfill({ status: 503, contentType: "text/html", body: "<!doctype html><title>Service waking</title>" }).catch(() => {});
    else await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }).catch(() => {});
  });
  await page.goto(base + path, { waitUntil: "load" });

  const pending = await waitFor(page, (s) => s.shown && s.line === WAKING.line, HOLD_MS + 2_000);
  check(pending.shown && pending.title === WAKING.title && pending.line === WAKING.line, `${run}: pending says "${WAKING.line}" (saw "${pending.line}")`);
  check(pending.button === "", `${run}: pending draws no button (saw "${pending.button}")`);

  if (run === "host 503") {
    const failed = await waitFor(page, (s) => s.line === WAKING_FAILED.line, HOLD_MS + 2_000);
    check(failed.shown && failed.title === WAKING_FAILED.title && failed.line === WAKING_FAILED.line, `failed says "${WAKING_FAILED.line}" (saw "${failed.line}")`);
    check(failed.button === WAKING_FAILED.action, `failed offers "${WAKING_FAILED.action}" (saw "${failed.button}")`);
    check(!/fills in/i.test(`${failed.line} ${failed.said}`), `failed never says "fills in", on screen or to a screen reader (said "${failed.said}")`);
    await page.waitForTimeout(1_000);
    const still = await read(page);
    check(still.line === WAKING_FAILED.line, "failed stays failed with nothing pending (no flip back to the pending words)");
  } else {
    const gone = await waitFor(page, (s) => !s.shown, HOLD_MS + 3_000);
    check(!gone.shown, "a real answer ends the line");
    check(!/^It sleeps when no one visits\.$/.test(gone.line), "a real answer never shows the failed words");
  }
  check(errors.length === 0, `${run}: no page errors${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
  await page.close();
}
await browser.close();
console.log(fails.length ? `waking-probe: ${fails.length} FAILED` : "waking-probe: all ok");
process.exit(fails.length ? 1 : 0);
