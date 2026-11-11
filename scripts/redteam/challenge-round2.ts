// Red team round 2 (Challenge): LOCAL server only. Pumps the local count. node scripts/redteam/challenge-round2.ts
export {};
const BASE = process.env.BASE ?? "http://localhost:8812";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.log("local only"); process.exit(2); }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const counts = async () => (await (await fetch(`${BASE}/api/challenge`)).json()).counts;
// A fresh "browser" each call (no cookie) unless a jar is given.
async function judge(note: string, jar = "", path = "/api/judge", extra: object = {}) {
  const r = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", ...(jar ? { cookie: jar } : {}) }, body: JSON.stringify({ note, price: "48.00", mode: "rule", ...extra }) });
  const sc = r.headers.get("set-cookie")?.split(";")[0] ?? "";
  const j: any = await r.json().catch(() => ({}));
  return { status: r.status, jar: sc || jar, j };
}
const pace = () => sleep(2100); // under the 30/min address limit
const base = (await counts()).tried;
console.log("--- 1. near-duplicates, each a fresh browser: rows added should be 1");
const nonce = "Gift card" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 6);
const variants = [nonce, nonce + " 1", nonce + "!!", nonce.toUpperCase(), nonce.split("").join("​"), nonce.replace(/a/g, "а") /*cyrillic*/, nonce + " .", "ｇ" + nonce.slice(1), nonce.normalize("NFKD"), nonce + "́", nonce.replace(/i/g, "ı") /*dotless*/, nonce + "­", nonce.replace(/s/g, "ſ")];
for (const v of variants) { const r = await judge(v); console.log(JSON.stringify(v.slice(0, 24)).padEnd(30), r.status, "counted", r.j.counted); await pace(); }
console.log("rows added:", (await counts()).tried - base);
