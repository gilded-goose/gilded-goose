// Red team: one script holds an address's minute limit; what does a stranger on it get? LOCAL only. node scripts/redteam/challenge-lockout.ts
export {};
const BASE = process.env.BASE ?? "http://localhost:8812";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.log("local only"); process.exit(2); }
const post = async (p: string, b: object) => { const r = await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return { s: r.status, j: (await r.json().catch(() => ({}))) as any }; };
await new Promise((r) => setTimeout(r, 61_000)); // a fresh minute
const seen: Record<number, number> = {};
for (let i = 0; i < 40; i++) { const r = await post("/api/judge", { note: "a", price: "48.00", mode: "rule" }); seen[r.s] = (seen[r.s] ?? 0) + 1; }
console.log("attacker statuses", JSON.stringify(seen));
for (const p of ["/api/judge", "/api/runs/trick", "/api/runs/scammer"]) { const r = await post(p, { note: "an honest stranger's note", price: "48.00", mode: "rule" }); console.log("stranger", p, r.s, JSON.stringify(r.j).slice(0, 140)); }
const g = await (await fetch(BASE + "/api/challenge")).json() as any; console.log("GET /api/challenge still", g.counts ? "answers" : "null");
