// The team line and the two placeholders on the public texts (Joshua's mandate, Fri Oct 30 2:40 PM, item 5): "Team:
// Joshua Javier and Lucas (a team of two). Use exactly that on the README, Devpost and the video credits. Repo link:
// placeholder until public (~Nov 11). Video link: placeholder until the video freezes (Nov 10, noon PT)."
// The video link is now due Wed Nov 11 (Lead-12, Fri Nov 6 night: the edit runs Sat to Tue, Devpost goes in Wed night).
// Pure (no fs, no node types), so `core/test/claims-placeholders.test.ts` can run it on made-up texts;
// `scripts/check-claims.ts` runs it on the real files.

/** The team, word for word. Nothing else may name the team. */
export const TEAM = "Joshua Javier and Lucas (a team of two)";

/** Where the team must appear: the README, the Devpost text and the video's credits (the shot list's end card). */
export const TEAM_FILES = ["README.md", "docs/devpost.md", "docs/video-shot-list.md"] as const;

/** Links that stay visible placeholders until Joshua fills them; each file that carries one is listed. */
export const PLACEHOLDERS = [
  { text: "[placeholder: video link", files: ["README.md", "docs/devpost.md"], until: "the video link is due (Wed Nov 11)" },
] as const;

/** The old team placeholder: once the team is filled, it must be gone everywhere. */
export const OLD_TEAM_PLACEHOLDER = "[Joshua fills in]";

/** A team size said any other way: "a team of three", "solo", "duo", "a 2-person team". ("A team of Claude Code agents" is not a size.) */
const TEAM_SIZE = /\bteam of (one|two|three|four|five|\d+)\b|\bsolo\b|\bduo\b|\b(\w+)[-\s](person|member) team\b/i;

/** Anything that reads as a link, so a placeholder's line can't quietly hold one. */
const LINK = /:\/\/|\bwww\.|\byoutu\.be\b|\byoutube\.com\b|\bgithub\.com\b|\]\(/i;

/** A Markdown text cut into paragraphs and list items (a numbered or bulleted item keeps its indented lines). */
const blocks = (t: string): string[] => t.split(/\n\s*\n|\n(?=\s*(?:[-*]|\d+\.)\s)/);

/**
 * Every way the given texts break the rule, as one sentence each; empty when they keep it.
 * - each TEAM_FILES text has the team exactly, and every "Lucas" in it is inside that exact line (so "Joshua and Lucas",
 *   "a team of three" or a third name can't sit beside the right line), no team size is said any other way, and the
 *   shot list's team line sits in its end card;
 * - no text still says "[Joshua fills in]";
 * - each placeholder is still there in every file in its list, and no line that holds it has a link yet.
 */
export function placeholderFails(texts: Readonly<Record<string, string>>): string[] {
  const fails: string[] = [];
  const get = (f: string): string | null => (f in texts ? texts[f]! : null);
  for (const f of TEAM_FILES) {
    const t = get(f);
    if (t === null) { fails.push(`${f}: not read`); continue; }
    const exact = t.split(TEAM).length - 1;
    const lucas = (t.match(/\bLucas\b/g) ?? []).length;
    if (exact === 0) fails.push(`${f}: the team line "${TEAM}" is missing`);
    if (lucas !== exact) fails.push(`${f}: names Lucas ${lucas} time(s) but has the exact team line ${exact} time(s); say it only as "${TEAM}"`);
    if (TEAM_SIZE.test(t.split(TEAM).join(""))) fails.push(`${f}: gives a team size outside the exact team line`);
  }
  // The video's credits are the end card: the shot list's team line must sit in the block that describes it.
  const shot = get("docs/video-shot-list.md");
  if (shot !== null && !blocks(shot).some((b) => b.includes(TEAM) && /end card/i.test(b))) fails.push(`docs/video-shot-list.md: the team line isn't in the end card's credits`);
  for (const [f, t] of Object.entries(texts)) if (t.includes(OLD_TEAM_PLACEHOLDER)) fails.push(`${f}: still says "${OLD_TEAM_PLACEHOLDER}"; the team is filled`);
  for (const p of PLACEHOLDERS) for (const f of p.files) {
    const t = get(f);
    if (t === null) { fails.push(`${f}: not read`); continue; }
    const lines = t.split("\n").filter((l) => l.includes(p.text));
    if (lines.length === 0) fails.push(`${f}: the placeholder "${p.text}" is gone before ${p.until}`);
    else if (lines.some((l) => LINK.test(l))) fails.push(`${f}: the placeholder "${p.text}" sits beside a link; fill it by removing the placeholder`);
  }
  return fails;
}

// The pasted range (R, Thu Nov 5 night): Devpost's About field is docs/devpost.md from "Judge Goose in 60 seconds" to the
// end of "Built with". The link placeholders above live in the header fields (Video, Code), which Joshua fills on the
// form; a placeholder or TODO inside the pasted range would show to every judge if the early entry is pasted as is.

/** Where the About field starts and stops in docs/devpost.md. */
export const PASTE_FROM = "## Judge Goose in 60 seconds";
export const PASTE_TO = "## Built with";

/** Anything that reads as unfinished: a placeholder, a TODO, a TBD, a fill-in. */
const UNFINISHED = /\[placeholder\b|\bTODO\b|\bTBD\b|\bFIXME\b|\[Joshua fills in\]/i;

/** docs/devpost.md's pasted range, or null when its start or end heading is gone (which is itself a failure). */
export function pastedRange(devpost: string): string | null {
  const from = devpost.indexOf(PASTE_FROM), to = devpost.indexOf(PASTE_TO, from);
  if (from < 0 || to < 0) return null;
  const end = devpost.indexOf("\n---", to);
  return devpost.slice(from, end < 0 ? undefined : end);
}

/** Every line in the pasted range that reads as unfinished, one sentence each; empty when none does. */
export function pastedFails(devpost: string): string[] {
  const range = pastedRange(devpost);
  if (range === null) return [`docs/devpost.md: the pasted range ("${PASTE_FROM}" to "${PASTE_TO}") can't be found`];
  return range.split("\n").filter((l) => UNFINISHED.test(l))
    .map((l) => `docs/devpost.md: the pasted About text still reads as unfinished: "${l.trim().slice(0, 80)}"; judges would see it`);
}

// One word per verdict (Lead-12, Thu Nov 5 night, from Track C's Questioned line on draft 9): the Desk says "Set aside"
// and "Held for your yes", so public text does too. "Refused" for a seller or a note crept back three ways (a count, a
// shape, a summing-up), so each is a pattern here. Code refusing something (a changed cart, a call, a brand) is not a
// verdict and stays.

/** Where the verdict words are held to the Desk's: the README, the FAQ and Devpost's pasted range. */
export const VERDICT_FILES = ["README.md", "docs/launch/faq.md", "docs/devpost.md"] as const;

/** "Refused" used as the Watcher's verdict on a seller or a note. */
export const REFUSED_VERDICT = /\b\d+ (?:of \d+ )?(?:\w+ ){0,2}(?:were |was )?refused\b|\b\d+ refused\)|\brefusing none\b|\bstill gets? refused\b|\bsellers? refused\b|\brefuses or holds\b|\bevery refusal\b/i;

/** Every line in VERDICT_FILES that calls a seller or note "refused" instead of "set aside", one sentence each. */
export function verdictWordFails(texts: Readonly<Record<string, string>>): string[] {
  const fails: string[] = [];
  for (const f of VERDICT_FILES) {
    if (!(f in texts)) { fails.push(`${f}: not read`); continue; }
    const t = f === "docs/devpost.md" ? pastedRange(texts[f]!) ?? texts[f]! : texts[f]!;
    for (const l of t.split("\n")) {
      const m = REFUSED_VERDICT.exec(l);
      if (m) fails.push(`${f}: says "${m[0]}" for a verdict; the Desk's word is "set aside"`);
    }
  }
  return fails;
}

// Staged lines (Joshua's strategy, Fri Oct 30 3:25 PM): Channel3's real prices and the AG Studio dashboard are not built
// yet, and neither is Track S1's tour. Their lines wait as drafts in the shot list's "Staged lines" section; they may not
// appear on the README, the Devpost or in the video's voice until the track that builds them lands a claims row.

/** A line that waits for its code: the words that name it, the track that lands it, and the row prefix that says it landed. */
export const STAGED = [
  { name: "Channel3", words: /\bchannel[\s-]?3\b/i, landsWith: "Track C3", prefix: "c3-", about: null },
  { name: "AG Studio", words: /\bAG[\s-]?Studio\b/i, landsWith: "Track AS", prefix: "as-", about: null },
  { name: "the tour", words: /\btours?\b/i, landsWith: "Track S1", prefix: "s1-", about: /\btour\b/i },
] as const;

/** Where a staged line may not show early: all of the README and Devpost, and the spoken ("> ") lines of the shot list. */
export const STAGED_FILES = ["README.md", "docs/devpost.md", "docs/video-shot-list.md"] as const;

/** Only what a viewer reads or hears: the shot list's voice lines; the README and Devpost whole. */
export const publicPart = (file: string, text: string): string =>
  file === "docs/video-shot-list.md" ? text.split("\n").filter((l) => /^\s*>/.test(l)).join("\n") : text;

/**
 * Every staged line that shows before its code, one sentence each; empty when none does. A line has landed once
 * docs/claims.md has a row whose id starts with its prefix (and, for the tour, whose claim says "tour").
 */
export function stagedFails(texts: Readonly<Record<string, string>>, rows: readonly { id: string; claim: string }[]): string[] {
  const fails: string[] = [];
  for (const s of STAGED) {
    // A row lands the line when its id has the track's prefix and, for the tour, its id or claim names the tour.
    if (rows.some((r) => r.id.startsWith(s.prefix) && (s.about === null || s.about.test(`${r.id} ${r.claim}`)))) continue;
    for (const f of STAGED_FILES) {
      if (!(f in texts)) { fails.push(`${f}: not read`); continue; }
      if (s.words.test(publicPart(f, texts[f]!))) fails.push(`${f}: names ${s.name} before ${s.landsWith} lands a ${s.prefix} row; keep it in the shot list's Staged lines`);
    }
  }
  return fails;
}

// No competitor is named anywhere public (the brief's rule; round 0's judges found "AP2's cart mandate" in the Devpost).
// Sponsors the hackathon names (PayPal, AG Grid / AG Studio, Channel3 and the rest of its list) and the tools we build
// on (Anthropic, Claude, Whisper, Kokoro, Render) are fine; payment and shopping-agent rivals are not.
export const NEVER_NAMED = /\b(AP2|Google|Stripe|Amazon|Visa|Mastercard|OpenAI|ChatGPT|Gemini|Shopify|Klarna|Affirm|Apple Pay)\b/i;

/** The one place a cited source may be named (Joshua, Nov 3: the missing layer's sources, each linked; the Lead's limit 3). */
export const NAMED_SECTION = "core/src/view/missing-layer.ts";

/** Every public text that names a competitor, one sentence each; empty when none does. */
export function competitorFails(texts: Readonly<Record<string, string>>): string[] {
  return Object.entries(texts).flatMap(([f, t]) => {
    const m = NEVER_NAMED.exec(t);
    return m ? [`${f}: names "${m[0]}"; describe the idea without naming a competitor`] : [];
  });
}

// The Nov 9 dry run (Track T, Thu Nov 5): the public copy leaves the team's private notes out, and 24 citations in the
// judge-facing docs pointed at them. A judge who follows one finds nothing. The copy keeps docs/guild/ only for the
// ratchet's JSON files and the brand guide, so any other file under it is private too.
const PRIVATE_PATH = /docs\/(?:inbox|adr|milestones|student-session|private|screens)\/|docs\/QUEUE\.md|\b(?:CLAUDE|PROFILE)\.md\b|docs\/guild\/[\w./-]+/g;
const GUILD_PUBLIC = /^docs\/guild\/(?:ratchet(?:-overrides|-live|-days)?\.json|brand\.md)$/;

/** Every judge-facing text that names a file the public copy leaves out; empty when none does. */
export function privatePathFails(texts: Readonly<Record<string, string>>): string[] {
  return Object.entries(texts).flatMap(([f, t]) => t.split("\n").flatMap((line, i) =>
    [...line.matchAll(PRIVATE_PATH)].map((m) => m[0].replace(/[.,;:)]+$/, ""))
      .filter((p) => !GUILD_PUBLIC.test(p))
      .map((p) => `${f}:${i + 1}: cites ${p}, which the public repo leaves out; link a public copy or say it in plain words`)));
}

// The team's own words for itself (Lead-12, Thu Nov 5 night): a judge doesn't know what "Track C" or "the DD" is.
// docs/claims.md keeps them in its Source column, because it explains them once, at the top.
export const PROCESS_WORD = /\bTrack [A-Z]\b|\bLead-\d+\b|\bDD\b|\bthe Guild\b/;
export const CLAIMS_KEY = "**Reading the Source column.**";

/** Every judge-facing text that uses a team-process word with no key that explains it; empty when none does. */
export function processWordFails(texts: Readonly<Record<string, string>>): string[] {
  return Object.entries(texts).flatMap(([f, t]) => {
    if (f === "docs/claims.md" && t.includes(CLAIMS_KEY)) return [];
    return t.split("\n").flatMap((line, i) => {
      const m = PROCESS_WORD.exec(line);
      return m ? [`${f}:${i + 1}: says "${m[0]}"; say who in plain words (Claude, our lead agent, the design review)`] : [];
    });
  });
}

// Track C's cold walk of the judges' steps (Lead-12, Fri Nov 6): two steps sent a judge to nothing. On the Desk,
// "Try to trick Goose" is a heading with the note box beside it, so "tap" it does nothing; and on a phone the top bar
// shows only Menu, where Judge? Start here is called Judge tour. A step that tells a reader what to do names what's on
// screen at both widths. The video's files are left out: they film at desktop, where the top bar has it.
export const HEADING_TAP = /\b(?:tap|press|click)(?: on)? \*\*Try to trick Goose\*\*/i;
export const JUDGE_ENTRY = "**Judge? Start here**";
// And judges are pointed at the testing instructions for a sandbox login, never at "your own" account (Joshua, Nov 5
// 6:55 PM: the judges' sandbox buyer is ours). "anyone else, your own" is fine: it names who it's for.
export const OWN_SANDBOX = /\byour own (?:PayPal )?sandbox\b/i;
// And Proof's three sandbox runs are two captures and one voided hold ($0.00), never "three payments that went through"
// (Lead-12, Fri Nov 6, from S's live GET of Proof). A line that counts three runs names the void within a line of it.
export const THREE_RUNS = /\bthree (?:attended )?(?:sandbox )?(?:runs|payments|purchases)\b/i;
export const VOIDED = /\bvoid(?:ed)?\b/i;
// And Try to trick Goose is right under the ask, the first thing after it (Joshua, Fri Nov 6 9:35 AM, decision 1a: "a
// skimming judge must not miss it"; web/src/desk/story/Story.tsx mounts it first). Before that it sat 1,725 px down, after
// A week with Goose, and the steps sent judges through Everything Goose does to reach it. A step that still names that
// route, or places it after A week with Goose, sends a judge the long way: say it's right under the ask.
// And the Judge tour's 12 stops name the haggle and the Christmas list but never the Live Threat Board, which leads
// Behind the scenes (stop 10). C's GET of live's tour, Fri Nov 6. A step that sends a reader to the tour for the board
// names Behind the scenes too.
export const BOARD = "Live Threat Board";
export const UNDER_ASK = /\b(?:right|just|sits) under\s+the ask\b/i;
/** The routes to the trick from before decision 1a: through the menu, or down past A week with Goose. */
export const OLD_TRICK_ROUTE = /\*\*Everything Goose does\*\*[^\n]*\*\*Try to trick Goose\*\*|\bafter\s+\*\*A week with Goose\*\*/i;

/** Every reader's step that taps the trick heading, sends a phone to a top-bar link it doesn't show, sends a judge to their own sandbox account, sends a judge the old way to the trick (the menu, or after A week with Goose), sends the tour for the Live Threat Board, or counts three runs without the voided hold; empty when none. */
export function judgePathFails(texts: Readonly<Record<string, string>>): string[] {
  return Object.entries(texts).flatMap(([f, t]) => {
    const lines = t.split("\n");
    return lines.flatMap((line, i) => {
      const near = `${line} ${lines[i + 1] ?? ""}`;
      const around = `${lines[i - 1] ?? ""} ${near}`;
      const out: string[] = [];
      if (HEADING_TAP.test(line) && !line.includes("**Menu**"))
        out.push(`${f}:${i + 1}: says to tap **Try to trick Goose**, a heading on the Desk; say it's right under the ask`);
      if (line.includes(JUDGE_ENTRY) && !near.includes("**Menu**"))
        out.push(`${f}:${i + 1}: names **Judge? Start here** with no phone path; add (on a phone, **Menu**, then **Judge tour**)`);
      if (OWN_SANDBOX.test(line))
        out.push(`${f}:${i + 1}: sends a judge to "your own" sandbox account; say the testing instructions say how to get ours`);
      const old = OLD_TRICK_ROUTE.exec(near);
      if (old && old.index < line.length && /Try to trick Goose/.test(near))
        out.push(`${f}:${i + 1}: sends a judge the old way to Try to trick Goose (the menu, or after A week with Goose); it's right under the ask now, so say that`);
      if (line.includes(BOARD) && /Judge tour|\*\*Judge\? Start here\*\*/.test(around) && !around.includes("Behind the scenes"))
        out.push(`${f}:${i + 1}: sends a reader to the Judge tour for the Live Threat Board, which no stop names; say it leads **Behind the scenes**`);
      if (THREE_RUNS.test(line) && !VOIDED.test(around))
        out.push(`${f}:${i + 1}: counts three sandbox runs as if all paid; one was a $0.00 hold voided, so say (two captured, one hold voided)`);
      return out;
    });
  });
}
