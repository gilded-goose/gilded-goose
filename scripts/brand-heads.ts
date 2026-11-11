// Track B-11: writes the brand's generated head blocks into each HTML entry (web/index.html, web/safe.html, web/404.html)
// from their one source, so a reworded card or a new room is one edit and one run: the share meta (web/src/brand/meta.ts
// SHARE_META_HTML), the lockup's sheet (web/src/brand/lockup.css, as <style data-gg>) and, in index.html only, the title
// script (web/src/brand/title.ts TITLE_SCRIPT). Each block must already be there once (the first insertion was by hand,
// beside its comment); this replaces it in place and fails if it isn't. core/test/brand.test.ts fails until it's run.
//
//   node scripts/brand-heads.ts
import { readFileSync, writeFileSync } from "node:fs";
import { SHARE_META_HTML } from "../web/src/brand/meta.ts";
import { TITLE_SCRIPT } from "../web/src/brand/title.ts";

const ROOT = new URL("..", import.meta.url);
const css = readFileSync(new URL("web/src/brand/lockup.css", ROOT), "utf8");
const BLOCKS: [RegExp, string, string[]][] = [
  [/<meta name="description" [\s\S]*?<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" \/>/g, SHARE_META_HTML, ["web/index.html", "web/safe.html", "web/404.html"]],
  [/<style data-gg>\n[\s\S]*?<\/style>/g, `<style data-gg>\n${css}</style>`, ["web/index.html", "web/safe.html", "web/404.html"]],
  // The head's title script: the one inline script before the body's first (whose opening is `var q=`, the router's).
  [/<script>\(function\(\)\{var (?:u=\$q,d=u\.get\("desk"\)|u=new URLSearchParams\(location\.search\),d=u\.get\("desk"\)|q=new URLSearchParams\(location\.search\),p=)[^\n]*<\/script>/g, `<script>${TITLE_SCRIPT}</script>`, ["web/index.html"]],
];
for (const f of ["web/index.html", "web/safe.html", "web/404.html"]) {
  const url = new URL(f, ROOT);
  const html = readFileSync(url, "utf8");
  const end = html.indexOf("</head>");
  let head = html.slice(0, end);
  for (const [re, block, files] of BLOCKS) {
    if (!files.includes(f)) continue;
    const n = head.match(re)?.length ?? 0;
    if (n !== 1) throw new Error(`brand-heads: ${f} has ${n} of ${re.source.slice(0, 40)}…, want exactly 1`);
    head = head.replace(re, () => block);
  }
  const out = head + html.slice(end);
  if (out !== html) writeFileSync(url, out);
  console.log(`${out === html ? "unchanged" : "wrote    "} ${f}`);
}
