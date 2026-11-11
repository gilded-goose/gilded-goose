// The landing's first-paint fits and the words they were measured on (Track B session 10; the DD's B-9 ruling, item 2a).
// Imported by web/prerender.ts (the build) and core/test/first-fit.test.ts; never by the app.
//
// B-9 gave each of the landing's runs its own letter-spacing (and the lede a word-spacing too), drawn only while the
// fallback face is: one size-adjust can't hold Hanken 300 against Helvetica Neue Light, which runs 1.008 to 1.035 wide
// line by line. Those values are true only for these exact words. If the words change, the fit is off by the new words'
// ratio (up to ~3.5%), the face swap steps again (13.5 px before B-9) and nothing would say so. So the words are pinned
// here, beside the fit, and the build throws when the hero's text no longer matches them: a string compare, no browser.
//
// To change the words: edit them here and in the page, build, serve, then re-measure and re-fit:
//   node scripts/fit-shift.ts <url>         every h1 line end and lede line end, real face vs fallback + fit (≤ 2 px)
//   node scripts/fit-lede-grid.ts <url>     the lede's letter- and word-spacing grid fit
//   node scripts/fit-swap-frames.ts <url>   every frame from the first paint to the faces' arrival
// fit-shift.ts prints each h1 line's suggested em; copy them into FIT_H1 below.

/** The words the fits were measured on (brand.md §7): the h1's three lines, in order, and the lede. */
export const FIT_WORDS = {
  h1: ["Goose can’t be fooled into paying.", "Goose can’t overspend.", "Goose can’t hide anything."],
  lede: "Goose shops for you. Nothing is paid until you tap.",
} as const;

/** Each h1 line's letter-spacing over `--track-display`, in em (B-9: size-independent, .00721 at 68 px, .00722 at 36 px). */
export const FIT_H1 = [".0089em", ".0076em", ".0048em"] as const;
/** The lede's fit (B-9: a 41×41 grid at 1440 and 390; Track P re-ran it for the Nov 3 lede: no spacing at all is within 0.52 px). */
export const FIT_LEDE = { letterSpacing: "0em", wordSpacing: "0em" } as const;

/** Track F: the wallet's h1 (first-paint.tsx DeskHead), drawn in Hanken 300's fallback until that face is in. It ran 7.6 px
 *  narrower at 30 px, so the same words redrawn by React in the real face were a larger box, and the browser reported
 *  the h1 a second time as the page's largest paint (680 ms, then 2800 ms). `prerender.ts` pins the words. */
export const FIT_WALLET = { h1: "Goose set 1 seller aside this week.", em: ".0110em" } as const;

/** Track F: safe.html's "if" line, drawn in Hanken 300's fallback until that face is in. At 390 the real face runs 361 px
 *  in a 358 px column and wraps; the fallback ran 353 px and didn't, so the face's arrival moved the whole page down a
 *  line (a 0.0098 shift the old path never had: it drew after the face). The fit lands the fallback on the real width. */
export const FIT_SAFE = { line: "If a seller asks for more, nothing is bought.", em: ".0088em" } as const;
export const fitSafeCss = (): string => `<style>html[data-first-fit-display] .if{letter-spacing:calc(-.012em + ${FIT_SAFE.em})}</style>`;

/** The first paint's fit rules: each lifted by its own attribute once its web face has loaded (prerender.ts). */
export const fitCss = (): string =>
  `html[data-first-fit] .dk-hero .dk-sub{letter-spacing:${FIT_LEDE.letterSpacing};word-spacing:${FIT_LEDE.wordSpacing}}` +
  FIT_H1.map((em, i) => `html[data-first-fit-display] .dk-hero h1>.dk-mask:nth-child(${i + 1})>span{letter-spacing:calc(var(--track-display) + ${em})}`).join("") +
  `html[data-first-fit-display] .wallet[data-first] .dhead h1{letter-spacing:calc(var(--track-display) + ${FIT_WALLET.em})}`;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", nbsp: " " };
const text = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? m).replace(/\s+/g, " ").trim();

/** What the landing draws under the fits: the h1's line spans and the lede, read from the first paint's HTML (React's
 *  server render of story/index.tsx's Landing) and from Desk.tsx's source (the lede the Desk draws over it, which the
 *  fit is still on until Archivo has loaded). */
export function heroWords(deskPaint: string, deskSource: string): { h1: string[]; lede: string[]; deskLede: string[] } {
  const h1 = deskPaint.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
  return {
    h1: [...h1.matchAll(/<span class="dk-mask"[^>]*><span[^>]*>([\s\S]*?)<\/span><\/span>/g)].map((m) => text(m[1]!)),
    lede: [...deskPaint.matchAll(/<p class="dk-sub"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1]!)),
    deskLede: [...deskSource.matchAll(/<p className="dk-sub"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1]!)),
  };
}

/** Null when the hero still says exactly what the fits were measured on; else the build's error, naming what changed. */
export function fitWordsChanged(deskPaint: string, deskSource: string): string | null {
  const got = heroWords(deskPaint, deskSource);
  const diffs: string[] = [];
  const want = FIT_WORDS.h1 as readonly string[];
  if (got.h1.length !== want.length) diffs.push(`the h1 has ${got.h1.length} line(s) (${JSON.stringify(got.h1)}), the fit has ${want.length}`);
  else got.h1.forEach((l, i) => { if (l !== want[i]) diffs.push(`h1 line ${i + 1} reads ${JSON.stringify(l)}, the fit was measured on ${JSON.stringify(want[i])}`); });
  const lede = (where: string, l: string[]) => {
    if (l.length !== 1) diffs.push(`${where} has ${l.length} lede(s) (<p class="dk-sub">), expected 1`);
    else if (l[0] !== FIT_WORDS.lede) diffs.push(`${where}'s lede reads ${JSON.stringify(l[0])}, the fit was measured on ${JSON.stringify(FIT_WORDS.lede)}`);
  };
  lede("the first paint", got.lede);
  lede("Desk.tsx", got.deskLede);
  if (diffs.length === 0) return null;
  return `the landing's words changed, so the first paint's fallback fit (web/first-fit.ts) no longer matches them and the face swap would step again: ` +
    `${diffs.join("; ")}. Re-run node scripts/fit-shift.ts <url> (and scripts/fit-lede-grid.ts for the lede), update FIT_H1 / FIT_LEDE and FIT_WORDS in web/first-fit.ts, and record the new numbers in brand.md §7.`;
}

/** The build guard's pattern (prerender.ts): a source path in any quoting or context, with up to 60 characters around it
 *  for the error. Round 4's egg 404 was `"/src/desk/egg.webp"`; a single-quoted, `url(` or `=` path would fail the same. */
export const SOURCE_PATH = /.{0,60}["'(=]\/src\/.{0,60}/;
