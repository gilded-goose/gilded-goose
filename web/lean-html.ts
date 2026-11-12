// Track F: Vite minifies every CSS file and leaves a page's own inline <style> and its comments exactly as written, so
// every route's first response carried 11.7 KB of the first-paint sheet's spaces and notes and 1.8 KB of notes to
// ourselves. These stay readable in web/*.html and leave at build. Runs on the authored page only, before prerender.ts
// puts React's first paints in, so React's own `<!-- -->` markers (which hydration reads) never pass through here.
import { transformWithEsbuild, type Plugin } from "vite";

// One pass over the page's raw-text parts, so a `<!--` inside a script's string is left alone, and a `<style>` inside one too.
const PART = /<script\b[\s\S]*?<\/script>|<style\b([^>]*)>([\s\S]*?)<\/style>|<!--[\s\S]*?-->/g;

/** The page with its comments gone and each inline sheet minified. Target esnext: nothing is rewritten for old browsers, only shortened. */
export async function leanHtml(html: string): Promise<string> {
  const sheets = new Map<string, string>();
  for (const m of html.matchAll(PART)) {
    const css = m[2];
    if (css === undefined || sheets.has(css)) continue;
    const { code } = await transformWithEsbuild(css, "inline.css", { loader: "css", minify: true, target: "esnext" });
    sheets.set(css, code.trim());
  }
  return html.replace(PART, (whole, attrs: string | undefined, css: string | undefined) => {
    if (whole.startsWith("<!--")) return "";
    return css === undefined ? whole : `<style${attrs ?? ""}>${sheets.get(css)!}</style>`;
  });
}

// The page's inline scripts, each minified on its own, after prerender.ts has put its gates and placers in (most of the
// bytes are there: 277 of 306 B on Nov 5). A classic script's top-level names are the page's globals ($q, $h, __pl), and
// esbuild leaves those alone outside a module; only a function's own names shorten. Their CSP hashes are taken from the
// built file when the server starts (server/src/csp.ts), so they follow. A script with a src, or one that isn't
// JavaScript (JSON, an import map), is left as written.
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
const JS_TYPE = /\btype\s*=\s*["']?(?!text\/javascript|module)[^"'\s>]+/i;

/** Each inline script in a page, minified; the page around them (templates, React's markers, notes) untouched. */
export async function leanScripts(html: string): Promise<string> {
  const done = new Map<string, string>();
  for (const [, attrs, js] of html.matchAll(SCRIPT)) {
    if (!js!.trim() || /\bsrc\s*=/i.test(attrs!) || JS_TYPE.test(attrs!) || done.has(js!)) continue;
    const { code } = await transformWithEsbuild(js!, "inline.js", { loader: "js", minify: true, target: "esnext" });
    const out = code.trim().replace(/;$/, "");
    if (/<\/script/i.test(out)) throw new Error(`leanScripts: a minified script would end its own tag: ${out.slice(0, 80)}`);
    done.set(js!, out);
  }
  return html.replace(SCRIPT, (whole, attrs: string, js: string) => (done.has(js) ? `<script${attrs}>${done.get(js)}</script>` : whole));
}

export const leanHtmlPlugin = (): Plugin => ({
  name: "goose-lean-html",
  apply: "build",
  transformIndexHtml: { order: "post", handler: (html) => leanHtml(html) },
});
