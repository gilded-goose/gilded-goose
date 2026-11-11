// Red team: scammer AI route + source forgery + review leak. LOCAL only. node scripts/redteam/challenge-scammer.ts
export {};
const BASE = process.env.BASE ?? "http://localhost:8812";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.log("local only"); process.exit(2); }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const get = async (p: string) => (await fetch(BASE + p)).json() as Promise<any>;
async function post(path: string, body: unknown, headers: Record<string, string> = {}, raw?: string) {
  const r = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw ?? JSON.stringify(body) });
  return { status: r.status, j: (await r.json().catch(() => ({}))) as any };
}
const c0 = (await get("/api/challenge")).counts;
console.log("start", JSON.stringify(c0));
console.log("--- source forgery: person routes with source hints in body/headers/query");
const note = "forged source test " + Math.random().toString(36).slice(2).replace(/[0-9]/g, "z");
const f = await post("/api/runs/trick?source=scammer-ai", { note, price: "48.00", mode: "rule", source: "scammer-ai", type: "friends-family", skip: true, counted: false, replay: "declined" }, { "x-source": "scammer-ai", "x-skip-count": "1" });
console.log("trick:", f.status, "counted", f.j.counted, "keys", Object.keys(f.j).join(","));
await sleep(2100);
const c1 = (await get("/api/challenge")).counts;
console.log("byAi before/after", c0.byAi, c1.byAi, "byPerson", c0.byPerson, c1.byPerson);
console.log("--- scammer route with hostile body (must be ignored), oversized body");
const marker = "ZQXMARK" + Date.now();
const s = await post("/api/runs/scammer", { note: marker, price: "1", item: marker, brief: marker, source: "person" });
console.log("scammer:", s.status, "marker echoed:", JSON.stringify(s.j).includes(marker), "replay", s.j.replay, "counted", s.j.counted, "note", JSON.stringify(s.j.note)?.slice(0, 60));
await sleep(2100);
const big = await post("/api/runs/scammer", null, {}, "x".repeat(5000));
console.log("5KB body:", big.status);
await sleep(2100);
const bad = await post("/api/runs/scammer", null, {}, "not json {{{");
console.log("garbage body:", bad.status, "replay", bad.j.replay);
console.log("--- cross-origin / form post");
const xo = await fetch(BASE + "/api/runs/scammer", { method: "POST", headers: { "content-type": "text/plain", origin: "http://evil.example" }, body: "x" });
console.log("text/plain:", xo.status);
const xo2 = await fetch(BASE + "/api/runs/scammer", { method: "POST", headers: { "content-type": "application/json", origin: "http://evil.example" }, body: "{}" });
console.log("evil origin:", xo2.status);
console.log("--- replay vs counts: press 4 more, fresh browsers; N/X should only move on fresh notes");
for (let i = 0; i < 4; i++) { const r = await post("/api/runs/scammer", {}); console.log(" run", r.status, "replay", r.j.replay, "counted", r.j.counted, "scammerLeft", r.j.scammerLeft, "tried", r.j.challenge?.tried, "byAi", r.j.challenge?.byAi); await sleep(2100); }
console.log("--- review");
const rv = await fetch(BASE + "/api/challenge/review");
console.log("review", rv.status, "no auth needed; keys:", Object.keys(await rv.json()).join(","), "cache-control:", rv.headers.get("cache-control"), "ACAO:", rv.headers.get("access-control-allow-origin"));
const rv2 = await fetch(BASE + "/api/challenge/review", { headers: { origin: "http://evil.example" } });
console.log("review with evil Origin:", rv2.status, "ACAO:", rv2.headers.get("access-control-allow-origin"));
