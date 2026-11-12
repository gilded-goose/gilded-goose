// The shopper's name (034, Joshua's 12:15 queue, Lead's default 1): "call me Sam" or "my name is Sam", typed or said
// into an Ask box, and Goose greets her by name on the Desk and the wallet. The name lives only in this browser's
// storage (`NameKeeper`, the `TriedKeeper` pattern): never sent to the server, never in a URL, never logged, never in
// the buyer's prompt. The page answers the command itself, before any request, so the words never leave either. "Forget
// my name" removes it. Pure: storage is injected, and any touch of it may throw.

/** Where this browser keeps the name: the name alone, as typed (tidied), nothing else. */
export const NAME_KEY = "gg-name-v1";
/** Longest name kept: a name, not a sentence. */
export const NAME_MAX = 30;

/** What Goose says when it learns the name. Fixed, so it can be a recorded clip; the name itself is shown, never spoken. */
export const NAME_HELLO = "Nice to meet you. I'll remember your name in this browser only.";
/** What Goose says when it forgets. */
export const NAME_FORGOT = "Done. I've forgotten your name in this browser.";

export type NameCommand = { kind: "set"; name: string } | { kind: "forget" };

const GOOSE = String.raw`(?:(?:hey|ok|okay|hi)\s+goose\b[\s,]*)?`;
// Words that make "call me …" an ask or a sentence, never a name: "call me when it drops", "call me back", "my name is
// not important", "call me a cab".
const NOT_NAME = new Set(["a", "an", "the", "when", "if", "after", "before", "back", "later", "tomorrow", "today", "now", "tonight", "soon", "once", "maybe", "at", "about", "on", "in", "please", "not", "no", "yes", "goose", "me", "you", "it", "and", "or", "but", "with", "for", "to", "under", "over", "anything", "something", "whatever", "nothing", "nobody", "asap",
  // The app's own words: "Hi, Approve." would read as a command on screen.
  "approve", "buy", "pay", "order", "cancel", "stop", "wait", "decline", "home", "wallet", "proof", "market", "ledger", "undo"]);
const SET = new RegExp(String.raw`^${GOOSE}(?:please\s+)?(?:call\s+me|my\s+name\s+is|my\s+name's)\s+(.+?)(?:\s+please)?[\s.!]*$`, "i");
const FORGET = new RegExp(String.raw`^${GOOSE}(?:please\s+)?(?:forget|delete|clear|remove|erase)\s+my\s+name(?:\s+please)?[\s.!]*$`, "i");
/** One word of a name: letters (any script), with an inner apostrophe or hyphen ("O'Neil", "Mary-Jane"). */
const WORD = /^\p{L}+(?:['’-]\p{L}+)*$/u;

/**
 * A name as kept and shown, or null when the text isn't one: one or two words of letters, at most `NAME_MAX`
 * characters, none of them a word that makes it a sentence. Each word gets a capital first letter (dictation types
 * "sam"); the rest is kept as she wrote it ("McKenzie").
 */
export function tidyName(raw: string): string | null {
  const words = raw.normalize("NFKC").replace(/’/g, "'").trim().split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 2) return null;
  if (!words.every((w) => WORD.test(w) && !NOT_NAME.has(w.toLowerCase()))) return null;
  const name = words.map((w) => w.charAt(0).toLocaleUpperCase("en-US") + w.slice(1)).join(" ");
  return name.length <= NAME_MAX ? name : null;
}

/** "Call me Sam", "my name is Sam", "forget my name", or null: anything else is an ordinary ask. */
export function nameCommand(words: string): NameCommand | null {
  const w = words.normalize("NFKC").replace(/[‘’]/g, "'").trim();
  if (FORGET.test(w)) return { kind: "forget" };
  const m = SET.exec(w);
  if (!m) return null;
  const name = tidyName(m[1]!);
  return name ? { kind: "set", name } : null;
}

/** A Goose question with her name in it: "What should Goose find?" → "What should Goose find, Sam?". */
export function withName(line: string, name: string | null): string {
  if (!name) return line;
  const end = /[?.!]$/.exec(line)?.[0] ?? "";
  return `${line.slice(0, line.length - end.length)}, ${name}${end}`;
}

/** The part of the day by the shopper's own clock: 00:00–04:59 night, 5:00–11:59 morning, 12:00–17:59 afternoon,
 *  18:00–23:59 evening (DK, Joshua's Sat Oct 31 3:30 AM note: after midnight it says "Hello", never "Good evening"). */
export type DayPart = "night" | "morning" | "afternoon" | "evening";
export const dayPart = (hour: number): DayPart => (hour < 5 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening");
/**
 * The Desk's greeting, one short line (DK, Joshua's calm hero): "Good evening, Joshua." and with no name "Good evening.";
 * from midnight to 4:59 "Hello, Joshua." / "Hello.". `hour` is the local clock's (0–23); the name is shown, never sent.
 */
export const greeting = (hour: number, name: string | null): string => `${dayPart(hour) === "night" ? "Hello" : `Good ${dayPart(hour)}`}${name ? `, ${name}` : ""}.`;

/** A greeting before a Goose line: "Hi, Sam. Tell Goose what you want…"; no name, the line alone. */
export const hiName = (line: string, name: string | null): string => (name ? `Hi, ${name}. ${line}` : line);

/** The browser's storage as the keeper uses it (localStorage's shape). */
export interface NameStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

/**
 * This browser's name for the shopper. Storage may be missing or throw on any touch (a private window, blocked site
 * data), and then the name lives in memory for this page only. A stored value that isn't a name (a hand edit, junk)
 * reads as no name. `storage` is a function because even reading `window.localStorage` can throw.
 */
export class NameKeeper {
  private mem: string | null = null;
  private forgotten = false;
  private readonly storage: () => NameStorage | null;
  constructor(storage: () => NameStorage | null) {
    this.storage = storage;
  }

  read(): string | null {
    if (this.forgotten) return null;
    if (this.mem) return this.mem;
    try {
      const kept = this.storage()?.getItem(NAME_KEY);
      return kept ? tidyName(kept) : null;
    } catch { return null; }
  }

  /** Keeps a name (tidied; null if it isn't one) and returns what is kept now. */
  set(raw: string): string | null {
    const name = tidyName(raw);
    if (!name) return this.read();
    this.mem = name;
    this.forgotten = false;
    try { this.storage()?.setItem(NAME_KEY, name); } catch { /* blocked: kept in memory only */ }
    return name;
  }

  /** Forgets it here and in storage. If storage can't be cleared, this page still shows no name. */
  forget(): void {
    this.mem = null;
    try {
      this.storage()?.removeItem(NAME_KEY);
      this.forgotten = false;
    } catch { this.forgotten = true; }
  }
}
