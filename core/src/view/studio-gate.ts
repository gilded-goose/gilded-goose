// The AG Studio gate (Track AS, 044 §2; Joshua, Fri Oct 30 3:40 PM): Behind the scenes mounts the AG Studio dashboard
// only on a licence that is valid and not expired; on anything else (missing, invalid, expired, an expiry we can't
// read) it mounts today's AG Grid Community ledger instead, and Studio is never instantiated, so no licence banner and
// no watermark reach a visitor. The site never breaks; at worst it loses Studio's chrome.
//
// The facts come from the build (web/studio-licence.ts reads them from AG's own licence manager at build time, so the
// browser never loads AG Studio just to ask); the decision is made here, at runtime, against the clock, so a key that
// was valid when the site was built still falls back on the day it expires. This file never sees the key itself.

/** What the build learned about the licence key, with no key material in it. */
export interface StudioLicenceFacts {
  /** AG's licence manager accepted the key. */
  valid: boolean;
  /** No key was given at build time. */
  missing: boolean;
  /** The expiry AG printed for a valid key (e.g. "22 December 2026"), else null. */
  expiry: string | null;
  /** AG's own expired flag for a valid key, else null. */
  expired: boolean | null;
  /** AG's trial flag for a valid key, else null. */
  isTrial: boolean | null;
}

/** No key at all: the fallback. */
export const NO_LICENCE: StudioLicenceFacts = { valid: false, missing: true, expiry: null, expired: null, isTrial: null };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * The last millisecond (UTC) of the day a licence expires, from AG's "22 December 2026" wording or an ISO date
 * (`2026-12-22`); null when the words can't be read. Month names may be full or three letters, any case.
 */
export function parseExpiry(words: string | null | undefined): number | null {
  if (!words) return null;
  const s = words.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  const named = /^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/.exec(s);
  const namedFirst = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (iso) { y = Number(iso[1]); m = Number(iso[2]) - 1; d = Number(iso[3]); }
  else if (named || namedFirst) {
    const [dayS, monS, yearS] = named ? [named[1]!, named[2]!, named[3]!] : [namedFirst![2]!, namedFirst![1]!, namedFirst![3]!];
    const mon = monS.toLowerCase();
    m = MONTHS.findIndex((n) => n === mon || (mon.length >= 3 && n.startsWith(mon)));
    if (m < 0) return null;
    d = Number(dayS); y = Number(yearS);
  } else return null;
  if (!Number.isInteger(d) || d < 1 || d > 31 || m < 0 || m > 11 || y < 2000 || y > 2100) return null;
  const end = Date.UTC(y, m, d + 1) - 1;
  // A day that doesn't exist (31 February) rolls over; refuse it rather than guess.
  if (new Date(Date.UTC(y, m, d)).getUTCMonth() !== m) return null;
  return end;
}

const DAY_MS = 86_400_000;

/**
 * When we stop trusting a licence: the start of the day it prints. AG's words are a rounded date and its real moment can be
 * any time on that day, so a gate that read the end of the day could show AG's mark for hours. It rounds toward off.
 */
export function licenceEnds(words: string | null | undefined): number | null {
  const end = parseExpiry(words);
  return end === null ? null : end - DAY_MS + 1;
}

/** The hosts `studio=force` opens Studio on with no licence: a developer's own machine, never the public site. */
export const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;

export type StudioWhy = "forced" | "licensed" | "off-by-default" | "missing" | "invalid" | "expired" | "expiry-unreadable";

/**
 * Whether a valid, unexpired licence makes Studio the default Behind the scenes. On (Joshua, Nov 5 2:36 AM: the key is in, every
 * visitor opens in AG Studio; the DD re-scores it the same hour). A key alone can't reach anyone past its printed day, or with AG's
 * answer wrong: the licence still decides. `?studio=force` opens it on a good licence, for review, or on a developer's own machine.
 */
export const STUDIO_DEFAULT = true;

/**
 * The last millisecond a plain visit to Behind the scenes opens Studio on these facts, 0 when it never does: the same
 * rules as `studioAllowed` below, as the one number the page's head can test before any JS has landed. So a key that
 * expires puts the ledger's own first paint back that same day, with no rebuild, and a build with the flip on but no
 * key is exactly today's page.
 */
export function studioUntil(facts: StudioLicenceFacts, byDefault: boolean = STUDIO_DEFAULT): number {
  if (!byDefault || facts.missing || !facts.valid || facts.expired === true) return 0;
  return licenceEnds(facts.expiry) ?? 0;
}

/** The decision and its one-word reason (the reason is for tests and a dev log; nothing is printed in production). */
export interface StudioPick { studio: boolean; why: StudioWhy }

/** The licence alone: "licensed", or why not. When unsure, the fallback. */
function licenceWhy(facts: StudioLicenceFacts, now: number): StudioWhy {
  if (facts.missing) return "missing";
  if (!facts.valid) return "invalid";
  if (facts.expired === true) return "expired";
  const end = licenceEnds(facts.expiry);
  if (end === null) return "expiry-unreadable";
  return now > end ? "expired" : "licensed";
}

/**
 * Whether Behind the scenes mounts AG Studio. `search` is the page's query string. `studio=force` opens Studio past the
 * flip for reviewing a good licence anywhere, and with no licence only on `host` being a developer's own machine, where
 * AG's banner and "For Trial Use Only" mark are fine. On the public site with no good licence it does nothing, so no visitor
 * can type their way to the mark (Joshua, Nov 4, 5:03 PM: "no watermark ever reaches a visitor"). `desk=studio` is just a way
 * to reach this page (Round 0 judges, Oct 30). Everything else is the licence: valid, AG's expired flag off, and an expiry
 * we can read that is still ahead of `now`.
 * `byDefault` is `STUDIO_DEFAULT`: while it is off, even a good licence leaves the plain page on the Community ledger.
 */
export function studioAllowed(facts: StudioLicenceFacts, now: number, search: string, byDefault: boolean = STUDIO_DEFAULT, host = ""): StudioPick {
  const why = licenceWhy(facts, now);
  if (new URLSearchParams(search).get("studio") === "force" && (LOCAL_HOST.test(host) || why === "licensed")) return { studio: true, why: "forced" };
  if (!byDefault) return { studio: false, why: "off-by-default" };
  return { studio: why === "licensed", why };
}
