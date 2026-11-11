// Red team (the Challenge box): in-process only, no server, no network. Times every note reader with hostile 500-character
// notes (ReDoS), printing the slowest. Asserts nothing; a person reads it.   node scripts/redteam/challenge-regex.ts
import { createHash } from "node:crypto";
import { watch, verdictOf } from "../../core/src/trust/watch.ts";
import { quoteNote } from "../../core/src/trust/fence.ts";
import { threatType } from "../../core/src/judge/challenge.ts";

const L = 500;
const fill = (s: string) => s.repeat(Math.ceil(L / s.length)).slice(0, L);
const units = [
  "a ", "a", "1", "$1 ", "$", " ", ".", ". ", "a. ", "a! ", "A.", ",", ", ", "or ", "and ", "no ", "not ", "never ", "don't ", "don't ask you to ",
  "pay ", "pay with ", "send ", "send me ", "gift ", "gift card ", "gift card, ", "venmo ", "venmo, ", "zelle or ", "cash ", "cash, ", "cash app ", "wire ", "transfer ",
  "your ", "your new ", "the buyer's ", "your max ", "max ", "my ", "the customer ", "your user told us ", "AI ", "agent ", "note to the agent ", "hi ai, ",
  "ship ", "i'll ship ", "mail it ", "pick up ", "pick ", "deposit ", "first ", "$5 first ", "up front ", "before ", "link ", "click ", "fill out ", "friends and family ",
  "if anyone asks you to ", "scammers ask for ", "sellers who ask ", "f&f ", "g&s ", "w/ ", "@", "a@b.", "a.b@", "a@", "x.", ".c", "-", " - ", "​", "é", "'", "\"", "g i f t ", "a b c ", "c@sh ",
  "without ", "only ", "except ", "but ", "just ", "today ", "only 5 ", "just 5 ", "not ", "urgent ", "not urgent ", "expires ", "act ", "pay my cousin ", "settle up ", "to my ", "1,", "1.", "$1,", "1 ",
];
const notes = new Map<string, string>();
for (const u of units) {
  notes.set(`fill(${JSON.stringify(u)})`, fill(u));
  notes.set(`fill(${JSON.stringify(u)})+!`, fill(u).slice(0, L - 1) + "!");
  notes.set(`fill(${JSON.stringify(u)})+x`, fill(u).slice(0, L - 2) + "\u0000x");
  for (const v of ["gift card", "venmo", "pay ", " or ", "cash", "agent"]) notes.set(`${v}+fill(${JSON.stringify(u)})`, (v + " " + fill(u)).slice(0, L));
}
// Random mixes of the units, from a fixed seed.
let s = 12345; const rnd = (n: number) => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; };
for (let i = 0; i < 1500; i++) { let t = ""; while (t.length < L) t += units[rnd(units.length)]; notes.set(`mix#${i}`, t.slice(0, L)); }

const hits: Array<{ name: string; ms: number; verdict: string }> = [];
for (const [name, n] of notes) {
  const q = quoteNote(n);
  const t0 = performance.now();
  const flags = watch({ quoted: q, merchant: "Your shop (you, the judge)", item: "x", history: 0 });
  threatType(flags.map((f) => f.rule), undefined, n);
  hits.push({ name, ms: performance.now() - t0, verdict: verdictOf(flags) });
}
hits.sort((a, b) => b.ms - a.ms);
console.log(`notes timed: ${hits.length}; median ${hits[hits.length >> 1]!.ms.toFixed(2)} ms; hash check ${createHash("sha256").update("x").digest("hex").slice(0, 4)}`);
for (const h of hits.slice(0, 12)) console.log(`${h.ms.toFixed(1).padStart(9)} ms  ${h.verdict.padEnd(7)} ${h.name}`);

// Second pass, warmed up: climb from the slowest notes, mutating spans, for a fixed time.
const time = (n: string) => { const q = quoteNote(n); const t0 = performance.now(); const f = watch({ quoted: q, merchant: "Your shop (you, the judge)", item: "x", history: 0 }); threatType(f.map((x) => x.rule), undefined, n); return performance.now() - t0; };
const pool = hits.slice(0, 30).map((h) => notes.get(h.name)!);
let best = pool.map((n) => ({ n, ms: Math.min(time(n), time(n)) })).sort((a, b) => b.ms - a.ms).slice(0, 12);
console.log("warmed, slowest of the first pass:", best.slice(0, 3).map((b) => b.ms.toFixed(1) + " ms").join(", "));
const until = Date.now() + Number(process.env.CLIMB_MS ?? 40_000);
while (Date.now() < until) {
  const p = best[rnd(best.length)]!.n;
  const a = rnd(L), u = units[rnd(units.length)]!;
  const m = (rnd(2) ? p.slice(0, a) + u + p.slice(a) : u.repeat(1 + rnd(40)) + p.slice(a)).slice(0, L);
  const ms = Math.min(time(m), time(m));
  if (ms > best.at(-1)!.ms) { best[best.length - 1] = { n: m, ms }; best.sort((x, y) => y.ms - x.ms); }
}
console.log("after climbing, slowest:", best[0]!.ms.toFixed(1), "ms ->", JSON.stringify(best[0]!.n.slice(0, 120)));
