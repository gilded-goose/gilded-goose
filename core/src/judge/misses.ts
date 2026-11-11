// A Watcher miss becomes a test the same day (Joshua, Nov 4, 8:57, 1c and 3d). What's kept in core/test/fixtures/misses.json and
// how a note gets in. Dev material the Watcher may be tuned on, so it never shares a note with a sealed set, and the sealed sets
// never move: a rule is scored on those without having seen them. Nothing ships this file: only scripts/miss-to-test.ts and its test.
import { quoteNote } from "../trust/fence.ts";
import { foldedWords, type AttemptVerdict, type ThreatType } from "./attempts.ts";

export interface KeptMiss {
  note: string;
  /** Cents, the price the note was offered at. */
  price: number;
  type: ThreatType;
  /** The AI's words come from the public review queue. A person's come only from that person, with their yes. */
  from: "scammer-ai" | "person";
  /** A first name, or null. Null always for the AI's, and for a person who'd rather not be named. */
  who: string | null;
  /** YYYY-MM-DD it became a test. */
  added: string;
  /** What the Watcher said when this file last ran: a note set aside stays set aside. */
  verdict: AttemptVerdict;
}

export const MISSES_ABOUT = "Notes the Watcher didn't set aside when they were first tried, each one a test from the day it was added (Joshua, Nov 4). Written by the scammer AI on a practice marketplace or, with their permission, by a person trying to trick Goose; not real offers. A person's name is a first name or none. Dev material: no note here is in a sealed set.";

/** Contact details and links, in a person's own note. A public test file holds none, so take them out with the person's yes and run it again. */
const CONTACT: ReadonlyArray<readonly [RegExp, string]> = [
  [/[^\s@]+@[^\s@]+\.[^\s@]+/, "an email address"],
  [/(?:\+?\d[\s().-]?){7,}/, "a phone number or a long number"],
  [/https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|me|co|app)\b|\b[a-z0-9-]+\s*(?:\.|\bdot\b)\s*(?:com|net|org)\b/i, "a link"],
];

/** A person's note as the file would hold it: what the fence leaves, with nothing invisible to hide a number or a link. */
export const personWords = (note: string): string => quoteNote(note.normalize("NFKC").replace(/\p{Cf}/gu, ""));

/** Why a person's note can't go in, or null. Their yes comes first; everything else is about what a public file may hold. */
export function personRefused(p: { note: string; permission: boolean; name: string | null }): string | null {
  if (!p.permission) return "A person's note goes in only with their permission. Ask them, then pass --permission.";
  if (p.name !== null && !/^\p{L}[\p{L}'-]{0,30}$/u.test(p.name)) return "One first name or none: never a full name, a handle or an email.";
  const words = personWords(p.note);
  for (const [shape, what] of CONTACT) if (shape.test(words)) return `This note holds ${what}, and a public test file holds none. Take it out with their yes and run it again.`;
  return null;
}

/** Every string under a key with "sealed" in its name, however deep. What this file may never share a note with. */
export function sealedNotes(fixture: unknown, inSealed = false, out: string[] = []): string[] {
  if (typeof fixture === "string") { if (inSealed) out.push(fixture); return out; }
  if (Array.isArray(fixture)) { for (const x of fixture) sealedNotes(x, inSealed, out); return out; }
  if (fixture && typeof fixture === "object") for (const [k, v] of Object.entries(fixture)) sealedNotes(v, inSealed || /sealed/i.test(k), out);
  return out;
}

/** New notes only: same words once, across this file and whatever else is passed as already known. Oldest stay first. */
export function addMisses(kept: readonly KeptMiss[], incoming: readonly KeptMiss[], known: readonly string[], sealed: readonly string[]): { kept: KeptMiss[]; added: number; again: number; sealed: number } {
  const seen = new Set([...kept.map((k) => foldedWords(k.note)), ...known.map(foldedWords)]);
  const locked = new Set(sealed.map(foldedWords));
  const out = [...kept];
  let added = 0, again = 0, hit = 0;
  for (const m of incoming) {
    const w = foldedWords(m.note);
    if (locked.has(w)) { hit++; continue; }
    if (seen.has(w)) { again++; continue; }
    seen.add(w);
    out.push(m);
    added++;
  }
  return { kept: out, added, again, sealed: hit };
}

/** The sentence for the Lead's report. A rate with its size, never a bare percent. */
export function catchWords(what: string, caught: number, of: number): string {
  return of === 0 ? `${what}: none yet.` : `${what}: ${caught} of ${of} set aside (${Math.round((caught / of) * 100)}%).`;
}
