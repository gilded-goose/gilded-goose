// The Content-Security-Policy (server/src/csp.ts) in a real Chrome, on every route a shopper or judge opens, served by
// the real server from the real web build: no CSP violation anywhere, and a script injected into a page doesn't run.
// The mic page records a hold through a fake microphone with the real model (WebGPU and WebAssembly), with ONNX Runtime
// from our own origin and no request to jsDelivr, so the speech worker's own policy is exercised too. PayPal's return lands through the fake PayPal page.
// `--paypal` also boots a second server with the repo's .env (read by the server only, sandbox) and draws PayPal's Pay
// Later message under the policy. Exits 1 on any miss.
//
//   corepack pnpm --filter @goose/web build && node scripts/csp-smoke.ts [--paypal]   (GOOSE_ENV=<path>: another .env)

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let misses = 0;
const check = (ok: boolean, what: string) => { if (!ok) misses++; console.log(`${ok ? "ok  " : "MISS"} ${what}`); };

async function boot(port: number, env: Record<string, string>, envFile = false): Promise<ChildProcess> {
  const dir = mkdtempSync(join(tmpdir(), "goose-csp-"));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [...(envFile ? [`--env-file=${process.env.GOOSE_ENV ?? "../.env"}`] : []), "src/main.ts"], {
    cwd: join(ROOT, "server"), stdio: ["ignore", "pipe", "pipe"],
    // Never the real store, push or Render host, whatever .env says: an empty value wins over the file
    // (core/test/env-file-boot.test.ts). PayPal stays: --paypal draws Pay Later from the sandbox app and creates no order.
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: base, WEB_URL: base, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs"), TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "", PING_PUSH: "", VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", VAPID_SUBJECT: "", RENDER: "", RENDER_EXTERNAL_URL: "", RENDER_GIT_COMMIT: "", BUYER: "rule", ...env },
  });
  let log = "";
  child.stdout!.on("data", (d) => { log += d; });
  child.stderr!.on("data", (d) => { log += d; });
  // A server that crashed says why, unless it read .env (its log is never printed then).
  child.on("exit", (code) => { if (code && !envFile) console.log(`server on ${port} exited ${code}:\n${log.slice(-1500)}`); });
  for (let i = 0; i < 100; i++) {
    if (log.includes(`listening on 127.0.0.1:${port}`)) return child;
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error(`server didn't start${envFile ? "" : `:\n${log}`}`);
}

/** Every CSP violation a page (or its worker) reports, from the browser's own console line and the DOM event. */
function watch(page: Page) {
  const seen: string[] = [];
  page.on("console", (m) => { if (/Content.Security.Policy|Refused to/i.test(m.text())) seen.push(m.text().slice(0, 240)); });
  page.on("worker", (w) => w.on("console", (m) => { if (/Content.Security.Policy|Refused to/i.test(m.text())) seen.push(`worker: ${m.text().slice(0, 240)}`); }));
  void page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error(`Refused to (event) ${e.violatedDirective} ${e.blockedURI}`)));
  return seen;
}

/** A script slipped into the page, the way an injection would: it must not run. */
const injected = (page: Page) => page.evaluate(() => {
  const s = document.createElement("script");
  s.textContent = "window.__injected = 1";
  document.body.append(s);
  const d = document.createElement("div");
  d.innerHTML = '<img src="data:," onerror="window.__injected = 2">';
  document.body.append(d);
  return new Promise<unknown>((r) => setTimeout(() => r((window as { __injected?: unknown }).__injected), 300));
});

// The spike's clips are gitignored, so a worktree or a clean clone has none, and Chrome's fake mic given a missing file plays its
// beep without a word: Whisper heard "you", and this read as a broken mic page. So the clip is made here when it's not there.
function micClip(): string {
  const spike = join(ROOT, "spikes/s8-voice/audio/toaster__karen__clean.wav");
  if (existsSync(spike)) return spike;
  const made = join(mkdtempSync(join(tmpdir(), "goose-csp-clip-")), "toaster.wav");
  const said = spawnSync("say", ["-v", "Karen", "-o", made, "--data-format=LEI16@16000", "find me a toaster that fits my kitchen"]);
  if (said.status !== 0 || !existsSync(made)) { console.error("csp-smoke: no mic clip, and macOS's `say` couldn't make one, so the mic page can't be judged"); process.exit(2); }
  return made;
}
const clip = micClip();
// Chrome's fake mic loops the clip and a hold can start anywhere in it: 8 s (under the page's 10 s cap) always holds one whole
// sentence. A shorter hold could land on the padding, which Whisper hears as "you", dropped.
const HEAR_MS = 8000;
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-webgpu", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${clip}`] });
const PORT = 4396;
const server = await boot(PORT, { PAYMENT: "fake" });
const base = `http://127.0.0.1:${PORT}`;
try {
  for (const path of ["/", "/?desk=1", "/?desk=proof", "/?desk=ledger", "/?market=1", "/?wallet=1", "/safe.html", "/voice-test"]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const seen = watch(page);
    const r = await page.goto(base + path, { waitUntil: "networkidle" });
    const csp = r?.headers()["content-security-policy"] ?? "";
    await page.waitForTimeout(1500);
    check(/script-src 'self'/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp), `${path}: strict script-src`);
    check(seen.length === 0, `${path}: no violation${seen.length ? `: ${seen.join(" | ")}` : ""}`);
    check(await injected(page) === undefined, `${path}: an injected script doesn't run`);
    if (path === "/?wallet=1") check(await page.evaluate(() => document.documentElement.hasAttribute("data-first")), "/?wallet=1: the first-paint inline scripts ran (by hash)");
    await ctx.close();
  }

  // PayPal's return: the market's cart, complete_payment, the fake PayPal tap, and back to the page.
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const seen = watch(page);
    await page.goto(`${base}/?market=1`, { waitUntil: "networkidle" });
    const post = (p: string, data: unknown) => page.request.post(base + p, { data, headers: { Origin: base } }).then((x) => x.json()) as Promise<Record<string, string>>;
    const cart = await post("/api/runs/store/cart", { listingId: "ss-pondside-kettle" });
    const pay = await post("/api/runs/store/complete_payment", { runId: cart.runId });
    await page.goto(pay.approveUrl!, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    check(new URL(page.url()).origin === base && page.url() !== pay.approveUrl, `PayPal's return lands on the page (${new URL(page.url()).pathname}${new URL(page.url()).search})`);
    check(seen.length === 0, `PayPal's return: no violation${seen.length ? `: ${seen.join(" | ")}` : ""}`);
    await ctx.close();
  }

  // The mic test page, every way it loads ONNX Runtime and the model: a real hold through the worker.
  for (const q of ["", "?backend=wasm"]) {
    const ctx = await browser.newContext({ permissions: ["microphone"] });
    const page = await ctx.newPage();
    const seen = watch(page);
    const hosts = new Set<string>();
    page.on("request", (r) => hosts.add(new URL(r.url()).host));
    await page.goto(`${base}/voice-test-2${q}`);
    const hold = page.locator("#hold");
    const box = (await hold.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForSelector('#hold[data-state="ready"]', { timeout: 180_000 }).catch(() => {});
    await page.mouse.down();
    await page.waitForTimeout(HEAR_MS);
    await page.mouse.up();
    await page.waitForFunction(() => document.getElementById("transcript")!.textContent!.length > 0, null, { timeout: 60_000 }).catch(() => {});
    const said = await page.textContent("#transcript");
    check(/toaster/i.test(said ?? ""), `/voice-test-2${q}: a hold turns into text under the policy ("${said}"; ${await page.textContent("#backend")})`);
    check(seen.length === 0, `/voice-test-2${q}: no violation${seen.length ? `: ${seen.join(" | ")}` : ""}`);
    check(!hosts.has("cdn.jsdelivr.net") && !hosts.has(""), `/voice-test-2${q}: no jsDelivr, no blob: (hosts ${[...hosts].sort().join(", ")})`);
    await ctx.close();
  }
} finally { server.kill(); }

if (process.argv.includes("--paypal")) {
  const PP = 4397;
  const pp = await boot(PP, {}, true);
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const seen = watch(page);
    const hosts = new Set<string>();
    page.on("request", (r) => hosts.add(new URL(r.url()).host));
    await page.goto(`http://127.0.0.1:${PP}/`, { waitUntil: "networkidle" });
    // What PayLater.tsx does beside Approve, run on the real page under its real policy.
    const words = await page.evaluate(async () => {
      const cfg = await (await fetch("/api/config")).json() as { payLater: { clientId: string } | null };
      if (!cfg.payLater) return "no client id (sandbox PayPal off on this server)";
      await new Promise((ok, no) => { const s = document.createElement("script"); s.src = "https://www.sandbox.paypal.com/web-sdk/v6/core"; s.onload = ok; s.onerror = no; document.head.append(s); });
      const paypal = (window as unknown as { paypal: { createInstance(o: unknown): Promise<{ createPayPalMessages(o: unknown): unknown }> } }).paypal;
      const sdk = await paypal.createInstance({ clientId: cfg.payLater.clientId, components: ["paypal-messages"], pageType: "checkout" });
      sdk.createPayPalMessages({ currencyCode: "USD" });
      const el = document.createElement("paypal-message");
      for (const [k, v] of Object.entries({ amount: "120.00", "currency-code": "USD", "auto-bootstrap": "", "logo-position": "inline" })) el.setAttribute(k, v);
      document.body.append(el);
      await new Promise((r) => setTimeout(r, 6000));
      return (el.shadowRoot ?? el).textContent?.trim().slice(0, 80) || "(empty)";
    });
    check(words.length > 0 && words !== "(empty)" && !words.startsWith("no client"), `Pay Later draws under the policy: "${words.replace(/\s+/g, " ")}"`);
    // Its "Learn more" opens PayPal's own modal (more of PayPal's script, in a frame).
    const opened = await page.evaluate(async () => {
      const el = document.querySelector("paypal-message")!;
      const link = [...(el.shadowRoot ?? el).querySelectorAll<HTMLElement>("a, button, [role=button], [tabindex]")].find((x) => /learn more/i.test(x.textContent ?? "")) ?? (el.shadowRoot ?? el).querySelector<HTMLElement>("a, button");
      if (!link) return "no Learn more";
      link.click();
      await new Promise((r) => setTimeout(r, 6000));
      return [...document.querySelectorAll("iframe")].map((f) => new URL(f.src || "about:blank").host || f.src).join(", ") || "no frame";
    });
    check(!/^no /.test(opened), `Pay Later's Learn more opens PayPal's modal (frames: ${opened})`);
    check(seen.length === 0, `Pay Later: no violation${seen.length ? `: ${seen.join(" | ")}` : ""}`);
    console.log(`     hosts: ${[...hosts].sort().join(", ")}`);
    await ctx.close();
  } finally { pp.kill(); }
}
await browser.close();
console.log(misses ? `${misses} missed` : "all ok");
process.exit(misses ? 1 : 0);
