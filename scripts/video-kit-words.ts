// The video kit's text steps, with no browser and no file system, so a test can run them: what the kit drops from the
// shot list and the voice, what it takes out of brand.md, and the sweep that stops the build on a secret, a private
// note, a competitor's name or "refused" for a verdict. scripts/video-kit.ts does the copying.
import { NEVER_NAMED, REFUSED_VERDICT } from "./claims-placeholders.ts";

/** The notes meant for the team, not the video: dropped by heading, so the voice, the shots and the rows stay word for word. */
export const SHOT_LIST_DROPS = ["## Staged lines", "## Schedule", "## For Joshua", "## Takes on disk"] as const;
export const VOICE_DROPS = ["## Said only when its feature is live", "## Earlier drafts"] as const;

/** Removes each named section, from its heading to the next heading of the same or a higher level. A heading that has gone fails, so nothing leaks by a rename. */
export function dropSections(text: string, heads: readonly string[]): string {
  let lines = text.split("\n");
  for (const head of heads) {
    const at = lines.findIndex((l) => l.startsWith(head));
    if (at < 0) throw new Error(`the kit drops the section "${head}", and it isn't there: was it renamed?`);
    const level = /^#+/.exec(head)![0].length;
    const next = lines.findIndex((l, i) => i > at && new RegExp(`^#{1,${level}} `).test(l));
    lines = [...lines.slice(0, at), ...(next < 0 ? [] : lines.slice(next))];
  }
  return lines.join("\n").replace(/\n---\s*$/, "\n").replace(/\n{3,}/g, "\n\n");
}

/** brand.md is the build's own spec: same values, without who measured what and where the team's stills are kept. */
export const cleanBrand = (text: string): string => text
  .replace(/^Track B \(Brand & Motion\), [^.]*\. /m, "")
  .replace(/ ?\((?:Track|S2, session)[^()]*\)/g, "")
  .replace(/; measured by [^)|]*/g, "")
  .replace(/measured by Track B session \d+, /g, "measured ")
  .replace(/ Prototypes and DPR-1 stills are in the DD's notes\n\(`dd\/brand\/`:[^)]*\)\./, "")
  .replace(/ \(`dd\/brand\/frost\.html`,?/g, " (")
  .replace(/Render it from the DD's\n`dd\/brand\/share\.html` with Playwright at DPR 1 \([^)]*\)\./, "Rendered with Playwright at DPR 1.")
  .replace(/^Headline: Track C's press release had no headline yet.*$/m, "")
  .replace(/ \*\*To reconcile with C\*\* \(Track C's\n`docs\/launch\/surface-words\.md`, not written yet\): where C's words disagree, the lower budget wins until the DD rules\./, "")
  .replace(/\bDD seat \d+/g, "design review")
  .replace(/\bthe DD's\b/g, "the design director's")
  .replace(/\bthe DD\b/g, "the design director")
  .replace(/\bDD\b/g, "design review");

/** The FAQ, word for word, less the one citation that points into the team's inbox. */
// The scammer AI is on live (Nov 5: "2 by a scammer AI" on the counter), so the kit keeps its FAQ line: it was the Most
// Creative angle the video hid (Lead-12's judge seat). Only the inbox citation comes out.
export const cleanFaq = (text: string): string => text.replace(/;?\s*`docs\/inbox\/[^`]*`/g, "");

/** Split so this file never matches check-private. */
const SECRET = new RegExp(["sk-" + "ant-[A-Za-z0-9_-]{10,}", "A21" + "AA[A-Za-z0-9_-]{20,}", "gh" + "p_[A-Za-z0-9]{20,}", "github" + "_pat_", "-----BEGIN [A-Z ]*PRIVATE " + "KEY", "(?:PAYPAL_CLIENT_(?:ID|SECRET)|ANTHROPIC_API_KEY|CHANNEL3_API_KEY|VITE_AG_STUDIO_LICENSE)\\s*[=:]\\s*\\S"].join("|"));
const PRIVATE = /side-session-notes|Real Market|shared notes|docs\/private|docs\/inbox|dd\/(?:inbox|brand)|gate-log|Documents\/Winston|\.env\b|\bLead-\d+|\bFable\b|\bTrack [A-Z][A-Z0-9-]*\b|\bvo-v3\.md\b|director-v3/;

/** What's wrong with these texts, one line each; empty means the kit can go. The press release's own sources are the only names it could legitimately cite, and it cites none. */
export function sweep(texts: Readonly<Record<string, string>>): string[] {
  return Object.entries(texts).flatMap(([file, text]) => text.split("\n").flatMap((line, i) => {
    const where = `${file}:${i + 1}`;
    const found: string[] = [];
    if (SECRET.test(line)) found.push(`${where}: looks like a secret`);
    const note = PRIVATE.exec(line);
    if (note) found.push(`${where}: a private note ("${note[0]}")`);
    const named = NEVER_NAMED.exec(line);
    if (named) found.push(`${where}: names "${named[0]}"`);
    const verdict = REFUSED_VERDICT.exec(line);
    if (verdict) found.push(`${where}: says "${verdict[0]}" for a verdict; the Desk's word is "set aside"`);
    return found;
  }));
}

export interface TakeRow { commit?: string; live?: string; buyer?: string; payment?: string; id: string; beat: string; where: string; size: string; file: string; seconds: number; ok: boolean; skipped?: string; error?: string; marks?: Record<string, number>; consoleErrors: string[]; by?: string }

/** A take goes in the kit only if it reached every state it names, with a clean console. */
export const isClean = (t: TakeRow): boolean => t.ok && !t.skipped && t.file !== "" && t.consoleErrors.length === 0;

/** The takes' table, for the kit's takes/INDEX.md. Shown as the editor needs it: what's here, and what isn't yet. */
export function takesIndex(rows: readonly TakeRow[], shot: string, commit: string): string {
  const clean = rows.filter(isClean), rest = rows.filter((t) => !isClean(t));
  const filmed = [...new Set(clean.flatMap((t) => t.commit ?? []))];
  const lives = clean.filter((t) => t.where === "live"), builds = [...new Set(lives.flatMap((t) => t.live ?? []))];
  const liveLine = !lives.length ? "" : ` The live takes match the live site at ${builds.length ? builds.map((c) => `\`${c}\``).join(", ") : "a build not recorded"}${builds.length && lives.every((t) => t.live) ? "" : " (some not recorded)"}, its /api/health commit when they were shot.`;
  const buyers = [...new Set(lives.flatMap((t) => t.buyer ? `\`${t.buyer}\`${t.payment ? `, payments in PayPal's ${t.payment}` : ""}` : []))];
  const aiLine = !lives.length ? "" : ` Its AI buyer then: ${buyers.length ? buyers.join("; ") : "not recorded"}${buyers.length && !lives.every((t) => t.buyer) ? " (some not recorded)" : ""}.`;
  const say = (t: TakeRow) => t.where === "hand" ? (t.by ? `${t.by} records this take by hand` : "Joshua adds this take himself") : t.skipped ? t.skipped.replace(/ ?\(Track[^)]*\)/g, "") : t.error ?? `${t.consoleErrors.length} console errors`;
  return [
    "# The takes", "",
    `Shot ${shot}, filmed from ${filmed.length ? filmed.map((c) => `\`${c}\``).join(", ") : "a commit not recorded"}; this kit was built at \`${commit}\`. Recorded by a browser with no cursor and no overlays; 1440 is the master picture, 390 the phone. \`-last.png\` is each take's last frame. \`in\` and \`out\` are the seconds the cut uses.${liveLine}${aiLine}`, "",
    "| Take | Promise or beat | Size | Where | Seconds | In → out |", "|---|---|---|---|---|---|",
    ...clean.map((t) => `| \`${t.id}-${t.size}.webm\` | ${t.beat} | ${t.size} | ${t.where} | ${t.seconds} | ${t.marks?.in !== undefined ? `${t.marks.in} → ${t.marks.out ?? "end"}` : ""} |`), "",
    ...(rest.length ? ["## Not in this kit yet", "", ...rest.map((t) => `- \`${t.id}-${t.size}\`: ${say(t)}.`), ""] : []),
  ].join("\n");
}

/** Points the suggestion docs at the kit's own copies: its reader has this folder, not the repo. */
export function kitPaths(text: string): string {
  return text.replaceAll("docs/beat-script.md", "suggestion-voice.md").replaceAll("docs/video-shot-list.md", "suggestion-shot-list.md").replaceAll("docs/launch/press-release.md", "press-release.md").replaceAll("docs/video/takes/", "takes/");
}

const KIT_TEXTS = /^(?:README|brief|video-ownership-note|press-release|faq|brand|suggestion-voice|suggestion-shot-list)\.md$|^takes\/INDEX\.md$/;
const KIT_MEDIA = /^images\/[\w-]+\.(?:png|webp)$|^takes\/[\w.-]+\.(?:webm|png)$/;
const KIT_NOT_SHIPPED = /(?:^|\/)\.DS_Store$|^\.gitignore$|^gilded-goose-video-kit\.zip$/;

/** Sorts every path in the folder: the texts the sweep reads, the media that ship with them, and any stray file, which stops the build rather than going out unread. */
export function kitContents(paths: readonly string[]): { texts: string[]; media: string[]; stray: string[] } {
  const out = { texts: [] as string[], media: [] as string[], stray: [] as string[] };
  for (const p of paths) {
    if (KIT_NOT_SHIPPED.test(p)) continue;
    if (KIT_TEXTS.test(p)) out.texts.push(p);
    else if (KIT_MEDIA.test(p)) out.media.push(p);
    else out.stray.push(p);
  }
  return out;
}
