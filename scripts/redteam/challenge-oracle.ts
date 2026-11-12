// Red team: neighbor oracle once the address's daily count is full. LOCAL only. Pumps the local count and uses up its address cap.
export {};
//   node scripts/redteam/challenge-oracle.ts
const BASE = process.env.BASE ?? "http://localhost:8812";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.log("local only"); process.exit(2); }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function judge(note: string) {
  const r = await fetch(BASE + "/api/judge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note, price: "48.00", mode: "rule" }) });
  return { status: r.status, j: (await r.json().catch(() => ({}))) as any };
}
const rnd = () => Math.random().toString(36).replace(/[^a-z]/g, "").padEnd(8, "q").slice(0, 8);
// 1. fill this address's 30 counted tries
let full = false;
for (let i = 0; i < 45 && !full; i++) { const r = await judge("filler words " + rnd() + rnd()); full = r.j.countFull === true; await sleep(2100); }
console.log("address count full:", full);
// 2. a victim (browser A) sends a secret; then probes from fresh browsers
const secret = "my secret note " + rnd() + rnd();
const guess = "my secret note " + rnd() + rnd();
const v = await judge(secret); await sleep(2100);
console.log("victim's own answer:", { counted: v.j.counted, countFull: v.j.countFull });
const a = await judge(secret); await sleep(2100);
const b = await judge(guess);
console.log("probe with the true words :", { counted: a.j.counted, countFull: a.j.countFull });
console.log("probe with a wrong guess  :", { counted: b.j.counted, countFull: b.j.countFull });
console.log(a.j.counted !== b.j.counted || a.j.countFull !== b.j.countFull ? "ORACLE: the two answers differ" : "held: same answer");
