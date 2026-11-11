// Track B-11 (brand.md §10.8): what a shared link shows, read off the served site. Link scrapers run no script, so the
// share meta is read from each address's raw HTML (fetch, the scraper's view) and must be every SHARE_TAGS tag with its
// exact value, once; the image and icons it names must answer 200 with the right type (and the card 1200×630). The tab
// title is read in Chromium after load (the head script sets it before the first paint) and must be titleFor() for the
// address. Exits 1 on any miss. Re-runnable against any served build:
//
//   node scripts/share-meta-probe.ts [base]     default http://localhost:8788 (a VITE_WALLET=1 build served by server/)
import { chromium } from "playwright";
import { SHARE, SHARE_TAGS } from "../web/src/brand/meta.ts";
import { pageTitle, titleFor } from "../web/src/brand/title.ts";

const base = (process.argv[2] ?? "http://localhost:8788").replace(/\/$/, "");
/** Every address a judge can be sent, with the status and static title (no script) its HTML carries. */
const ROUTES: { path: string; status: number; title?: string }[] = [
  ...["/", "/?desk=1", "/?wallet=1", "/?wallet=0", "/?wallet=0#break", "/?market=1", "/?desk=ledger", "/?desk=studio", "/?desk=proof", "/?desk=haggle", "/?desk=tour", "/?desk=how", "/?desk=system"].map((path) => ({ path, status: 200 })),
  { path: "/safe.html", status: 200, title: pageTitle("See how it keeps you safe") },
  { path: "/no-such-page", status: 404, title: pageTitle("Nothing here") },
];
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const fails: string[] = [];

// The scraper's view: raw HTML, no script.
for (const r of ROUTES) {
  // A browser's Accept: the server sends the 404 shell (web/404.html) only to a client asking for HTML (server/src/main.ts,
  // app.notFound); a scraper that sends */* to an unknown path gets the plain-text 404, which no share card is made from.
  const res = await fetch(base + r.path, { headers: { "user-agent": "facebookexternalhit/1.1", accept: "text/html,application/xhtml+xml,*/*;q=0.8" } });
  const html = await res.text();
  const head = html.slice(0, html.indexOf("</head>"));
  const miss: string[] = [];
  if (res.status !== r.status) miss.push(`status ${res.status}, want ${r.status}`);
  for (const [a, k, v] of SHARE_TAGS) {
    const found = [...head.matchAll(new RegExp(`<meta ${a}="${k.replace(/[.:]/g, "\\$&")}" content="([^"]*)"`, "g"))].map((m) => unesc(m[1] ?? ""));
    if (found.length !== 1 || found[0] !== v) miss.push(`${k}: ${found.length ? JSON.stringify(found) : "absent"}`);
  }
  if (!head.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png"')) miss.push("apple-touch-icon link absent");
  console.log(`${miss.length ? "FAIL" : "ok  "} meta  ${r.path.padEnd(16)} ${res.status}  ${SHARE_TAGS.length} tags${miss.length ? "  " + miss.join("; ") : ""}`);
  fails.push(...miss.map((m) => `${r.path}: ${m}`));
}

// The files the meta names. The card's own address is the live site's; here it is fetched from the build under test.
const png = (b: Buffer) => b.subarray(1, 4).toString("latin1") === "PNG" ? [b.readUInt32BE(16), b.readUInt32BE(20)] : undefined;
for (const [path, type, size] of [[SHARE.imagePath, "image/png", [SHARE.width, SHARE.height]], ["/apple-touch-icon.png", "image/png", [180, 180]], ["/favicon.svg", "image/svg+xml"], ["/favicon.ico", "image/"]] as [string, string, number[]?][]) {
  const res = await fetch(base + path);
  const b = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type") ?? "";
  const dims = size && png(b);
  const ok = res.status === 200 && ct.startsWith(type) && (!size || (dims && dims[0] === size[0] && dims[1] === size[1]));
  console.log(`${ok ? "ok  " : "FAIL"} file  ${path.padEnd(22)} ${res.status}  ${ct}  ${(b.length / 1024).toFixed(1)} KB${dims ? `  ${dims.join("×")}` : ""}`);
  if (!ok) fails.push(`${path}: ${res.status} ${ct} ${dims?.join("×") ?? ""}`);
}

// The tab's title, as a person sees it (after the head script; and after the page's own scripts have run).
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const r of ROUTES) {
    // A fresh document each time: from /?wallet=0, /?wallet=0#break would be the same page's hash change, not a load.
    await page.goto("about:blank");
    await page.goto(base + r.path, { waitUntil: "load" });
    const want = r.title ?? titleFor(new URL(base + r.path).search, new URL(base + r.path).hash);
    const got = await page.title();
    console.log(`${got === want ? "ok  " : "FAIL"} title ${r.path.padEnd(16)} "${got}"${got === want ? "" : `, want "${want}"`}`);
    if (got !== want) fails.push(`${r.path}: title "${got}", want "${want}"`);
    // The design system is unlisted: its page says noindex once it has mounted (SYS); every other address is indexable.
    await page.waitForTimeout(r.path === "/?desk=system" ? 1500 : 0);
    const robots = await page.locator('meta[name="robots"]').evaluateAll((ms) => ms.map((m) => (m as HTMLMetaElement).content).join(", "));
    const noindex = /noindex/.test(robots), wantNoindex = r.path === "/?desk=system" || r.status === 404;
    console.log(`${noindex === wantNoindex ? "ok  " : "FAIL"} index ${r.path.padEnd(16)} ${robots || "(no robots meta: indexable)"}`);
    if (noindex !== wantNoindex) fails.push(`${r.path}: robots "${robots}", want ${wantNoindex ? "noindex" : "indexable"}`);
  }
} finally { await browser.close(); }

if (fails.length) { console.error(`\nshare-meta-probe FAIL (${fails.length}):\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log(`\nshare-meta-probe ok: ${ROUTES.length} addresses, every tag once and exact, 4 files 200, every title right`);
