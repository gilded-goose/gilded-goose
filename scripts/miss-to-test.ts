// One command from the review queue to a test (Joshua, Nov 4, 8:57: "every Watcher miss becomes a test the same day"). Reads the
// scammer AI's misses with a GET, runs each through the real round with the plain code, and appends the new ones to
// core/test/fixtures/misses.json, which core/test/misses.test.ts then holds to: none pays, a note set aside stays set aside, and
// the number missed only falls. No model call and no POST, so it can't add to any count, and it never writes to a sealed set.
//
//   node scripts/miss-to-test.ts [url]        the review queue, default the live site; add --dry to change nothing
//   node scripts/miss-to-test.ts --note "..." --price 48.00 --permission [--name Ana]
//
// A person's words are never on the server (the page promises that), so a classmate's miss comes from them, by hand, with their yes.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AttemptVerdict, ThreatType } from "../core/src/judge/attempts.ts";
import { answerOf } from "../core/src/judge/challenge.ts";
import { demoJudgeRound, parseJudgeRequest } from "../core/src/judge/judge.ts";
import { addMisses, catchWords, MISSES_ABOUT, personRefused, personWords, sealedNotes, type KeptMiss } from "../core/src/judge/misses.ts";
import { fromCents, type Cents } from "../core/src/money.ts";

const here = import.meta.dirname;
const fixtures = join(here, "..", "core", "test", "fixtures");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] ?? null : null; };
const file = value("file") ?? join(fixtures, "misses.json");
const today = new Date().toISOString().slice(0, 10);
const json = (name: string) => JSON.parse(readFileSync(join(fixtures, name), "utf8")) as unknown;

async function watcher(note: string, price: Cents, i: number): Promise<{ verdict: AttemptVerdict; type: ThreatType }> {
  const parsed = parseJudgeRequest({ note, price: fromCents(price), mode: "rule" });
  if (!parsed.ok) throw new Error(`the round refused this note: ${parsed.error}`);
  const { events } = await demoJudgeRound({
    req: parsed.value, hash: (s: string) => createHash("sha256").update(s).digest("hex"), now: () => Date.now(), seed: i + 1, runId: `miss-${i}`,
    ai: null, reader: null, aiState: "off", aiName: "miss-to-test", where: "server",
  });
  const a = answerOf(events, note, price);
  return { verdict: a.verdict, type: a.type };
}

const sealed = ["off-paypal-corpus.json", "peer-scams.json", "reader-blind-r4.json"].flatMap((f) => sealedNotes(json(f)));
const measured = (json("scammer-notes.json") as { notes: { note: string }[] }).notes.map((n) => n.note);
const kept = (JSON.parse(readFileSync(file, "utf8")) as { notes: KeptMiss[] }).notes;
const incoming: KeptMiss[] = [];

const typed = value("note");
const said = typed === null ? null : personWords(typed);
if (said !== null) {
  const name = value("name");
  const no = personRefused({ note: said, permission: flag("permission"), name });
  if (no) { console.error(no); process.exit(2); }
  const dollars = value("price");
  if (!dollars || !/^\d+(?:\.\d{2})?$/.test(dollars)) { console.error('Say the price it was offered at: --price 48.00'); process.exit(2); }
  const price = Math.round(Number(dollars) * 100) as Cents;
  const { verdict, type } = await watcher(said, price, kept.length);
  incoming.push({ note: said, price, type, from: "person", who: name, added: today, verdict });
} else {
  const base = (args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--file") ?? "https://gilded-goose.onrender.com/").replace(/\/?$/, "/");
  const r = await fetch(`${base}api/challenge/review`, { headers: { accept: "application/json" } });
  if (!r.ok) { console.error(`GET ${base}api/challenge/review answered ${r.status}`); process.exit(1); }
  const q = await r.json() as { notes: { note: string; type: ThreatType; price?: Cents }[] };
  let i = 0;
  for (const n of q.notes) {
    const price = n.price ?? (4800 as Cents);
    const { verdict } = await watcher(n.note, price, i++);
    incoming.push({ note: n.note, price, type: n.type, from: "scammer-ai", who: null, added: today, verdict });
  }
  console.log(`The queue held ${q.notes.length}.`);
}

// Today's Watcher on what's kept, so the rate is today's, and a note it stopped catching stops here.
let n = 0;
const rerun = await Promise.all(kept.map(async (k) => ({ ...k, verdict: (await watcher(k.note, k.price as Cents, n++)).verdict })));
const lost = rerun.filter((k, i) => kept[i]!.verdict === "set-aside" && k.verdict !== "set-aside");
if (lost.length) { console.error(`The Watcher stopped catching ${lost.length} it caught before:\n${lost.map((k) => k.note).join("\n")}`); process.exit(1); }
const next = addMisses(rerun, incoming, measured, sealed);
if (next.sealed) console.log(`Left out ${next.sealed} that a sealed set already holds, so that set stays unseen.`);
console.log(`New tests: ${next.added}. Already kept: ${next.again}.`);
const moved = rerun.some((k, i) => k.verdict !== kept[i]!.verdict);
if (!flag("dry") && (next.added > 0 || moved)) writeFileSync(file, `${JSON.stringify({ about: MISSES_ABOUT, notes: next.kept }, null, 2)}\n`);
const caught = next.kept.filter((k) => k.verdict === "set-aside").length;
console.log(catchWords("Of the misses kept as tests, the Watcher now", caught, next.kept.length));
if (next.kept.some((k) => k.verdict === "paid")) { console.error("One of these paid. That should be impossible: stop and look."); process.exit(1); }
if ((next.added > 0 || moved) && !flag("dry")) console.log("Next: corepack pnpm check, then commit core/test/fixtures/misses.json.");
