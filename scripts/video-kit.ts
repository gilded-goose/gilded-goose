// The video kit (Joshua, Nov 3, section 6; Lead-10): one folder for the video team, built from the sources so there is
// never a second version of anything. Only docs/video-kit/README.md and brief.md are committed; the copies, images, takes and the zip are
// built here, gitignored. Run `pnpm video:takes` first, then:
//
//   pnpm video:kit     docs/video-kit/ (text, images, takes/) and docs/video-kit/gilded-goose-video-kit.zip
//
// The sweep (scripts/video-kit-words.ts) reads every text in the folder and stops the build on a secret, a private note
// or a competitor's name; a file it doesn't expect stops the build too, and the zip holds only the files it sorted.
// Nothing reads .env; nothing here talks to a server.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { EGG_SYMBOL } from "../web/src/brand/egg.ts";
import { lockupHtml } from "../web/src/brand/lockup-html.ts";
import { SHOT_LIST_DROPS, VOICE_DROPS, cleanBrand, cleanFaq, dropSections, kitContents, kitPaths, isClean, sweep, takesIndex, type TakeRow } from "./video-kit-words.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const KIT = join(ROOT, "docs/video-kit");
const TAKES = join(ROOT, "docs/video/takes");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const SUGGESTION = (what: string) => `**Suggestion.** This is the team's own draft of ${what}. You own the cut: change the order, the pace and the shots. Keep the four beats of A Week with Goose as the spine, the three promises in the voice, and every word the site says as the site says it (\`README.md\`). "Rows" and \`pnpm check\` are how the team checks its numbers; \`docs/video/takes/\` is this kit's \`takes/\`.\n\n`;

for (const name of ["video-ownership-note.md", "press-release.md", "faq.md", "brand.md", "suggestion-voice.md", "suggestion-shot-list.md", "gilded-goose-video-kit.zip"]) rmSync(join(KIT, name), { force: true });
for (const dir of ["images", "takes"]) rmSync(join(KIT, dir), { recursive: true, force: true });
mkdirSync(join(KIT, "images"), { recursive: true });
mkdirSync(join(KIT, "takes"), { recursive: true });

// Word for word: the press release and the FAQ, as they stand, and the ownership note the video team signs (Lead-12, Fri Nov 6).
copyFileSync(join(ROOT, "docs/launch/press-release.md"), join(KIT, "press-release.md"));
copyFileSync(join(ROOT, "docs/launch/video-ownership-note.md"), join(KIT, "video-ownership-note.md"));
writeFileSync(join(KIT, "faq.md"), cleanFaq(read("docs/launch/faq.md")));
writeFileSync(join(KIT, "brand.md"), cleanBrand(read("docs/guild/brand.md")));
writeFileSync(join(KIT, "suggestion-voice.md"), SUGGESTION("the voice") + kitPaths(dropSections(read("docs/beat-script.md"), VOICE_DROPS)));
writeFileSync(join(KIT, "suggestion-shot-list.md"), SUGGESTION("the shots") + kitPaths(dropSections(read("docs/video-shot-list.md"), SHOT_LIST_DROPS)));

// The egg and the share image as the site serves them.
for (const f of ["brand/egg-1500.png", "brand/egg-1200.webp", "brand/egg-600.webp", "og/share.png"]) copyFileSync(join(ROOT, "web/public", f), join(KIT, "images", f.split("/")[1]!));

// The lockup, rendered from the site's own markup, sheet and face (as scripts/brand-render.ts does), at 96 px on Velvet and clear.
const fileUrl = (p: string) => "file://" + join(ROOT, p);
const page = (ground: string) => `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: "Hanken Goose"; font-weight: 100 900; src: url("${fileUrl("web/node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2")}") format("woff2"); }
:root { --display: "Hanken Goose", system-ui, sans-serif; --mark-face: var(--display); --mark-w: 400; --mark-track: -.02em; --ink: #f4eadc; }
html, body { margin: 0; background: transparent; -webkit-font-smoothing: antialiased; } a { text-decoration: none; color: var(--ink); }
${read("web/src/brand/lockup.css")}</style>${EGG_SYMBOL}<div id="card" style="display:inline-block;padding:64px 80px;background:${ground}">${lockupHtml("#", "end")}</div>`;
const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
try {
  const p = await (await browser.newContext({ viewport: { width: 1200, height: 400 }, deviceScaleFactor: 2 })).newPage();
  for (const [name, ground] of [["lockup-on-velvet.png", "#2c1520"], ["lockup-clear.png", "transparent"]] as const) {
    const html = join(KIT, "images", ".lockup.html");
    writeFileSync(html, page(ground));
    await p.goto("file://" + html);
    await p.evaluate(() => document.fonts.ready);
    await p.locator("#card").screenshot({ path: join(KIT, "images", name), omitBackground: ground === "transparent" });
    rmSync(html);
  }
} finally { await browser.close(); }

// The takes that are clean, with a table of what's here and what isn't yet.
const manifest = join(TAKES, "takes.json");
const { shot, takes } = existsSync(manifest) ? JSON.parse(readFileSync(manifest, "utf8")) as { shot: string; takes: TakeRow[] } : { shot: "never", takes: [] as TakeRow[] };
for (const t of takes.filter(isClean)) {
  for (const f of [`${t.id}-${t.size}.webm`, `${t.id}-${t.size}-last.png`]) if (existsSync(join(TAKES, f))) copyFileSync(join(TAKES, f), join(KIT, "takes", f));
}
writeFileSync(join(KIT, "takes/INDEX.md"), takesIndex(takes, shot, execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim()));
for (const f of readdirSync(TAKES)) if (/^(?:caption-|end-card-).*\.png$/.test(f)) copyFileSync(join(TAKES, f), join(KIT, "takes", f));

// What ships is what was sorted: every file in the folder is a swept text, an expected image or take, or it stops the build.
const found = kitContents(readdirSync(KIT, { recursive: true, encoding: "utf8" }).filter((f) => statSync(join(KIT, f)).isFile()));
if (found.stray.length) { console.error(`the kit has files it doesn't expect, so they haven't been read:\n${found.stray.join("\n")}`); process.exit(1); }
const texts: Record<string, string> = {};
for (const f of found.texts) texts[f] = readFileSync(join(KIT, f), "utf8");
const bad = sweep(texts);
if (bad.length) { console.error(`the kit isn't clean, ${bad.length} found:\n${bad.join("\n")}`); process.exit(1); }

execFileSync("zip", ["-q", "gilded-goose-video-kit.zip", "-@"], { cwd: KIT, input: [...found.texts, ...found.media].join("\n") });
const clean = takes.filter(isClean).length;
console.log(`docs/video-kit: ${Object.keys(texts).length} texts swept clean, ${readdirSync(join(KIT, "images")).length} images, ${clean} of ${takes.length} takes; the zip is ${Math.round(statSync(join(KIT, "gilded-goose-video-kit.zip")).size / 1e6)} MB`);
