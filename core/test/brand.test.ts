// Track B-11 (brand.md §10.1, §10.2, §10.6, §10.8): every copy of the brand holds to its one source. The HTML entries carry
// the share meta, the lockup's sheet and the egg symbol byte for byte; the title script is titleFor() exactly, and each
// room's title is the menu's name for it; the tokens carry §10.6's values, the same in index.html's first-paint :root; the
// rendered files are the sizes §10.8 sets; and the egg's render still applies to eggThree.ts's studio.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "../src/view/menu.ts";
import { TOUR } from "../src/view/tour.ts";
import { EGG_PATH, EGG_SYMBOL, FAVICON_SVG } from "../../web/src/brand/egg.ts";
import { lockupHtml } from "../../web/src/brand/lockup-html.ts";
import { SHARE, SHARE_META_HTML, SHARE_TAGS } from "../../web/src/brand/meta.ts";
import { BRAND_NAME, ROOMS, TITLE_SCRIPT, pageTitle, titleFor, titleOnHashChange } from "../../web/src/brand/title.ts";
import { LIFT, lifted } from "../../scripts/brand/lift.ts";
import { HOW_TITLE } from "../../web/src/how/how.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url));
const text = (p: string) => read(p).toString("utf8");
const ENTRIES = ["web/index.html", "web/safe.html", "web/404.html"];
const head = (html: string) => html.slice(0, html.indexOf("</head>"));
/** A PNG's width and height, from its IHDR. */
const pngSize = (b: Buffer) => { expect(b.subarray(1, 4).toString("latin1")).toBe("PNG"); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

describe("B-11: the share card on every page (§10.8)", () => {
  it("each HTML entry's head carries the share meta verbatim, and only once", () => {
    for (const f of ENTRIES) {
      const h = head(text(f));
      expect(h.split(SHARE_META_HTML).length, f).toBe(2);
      for (const [a, k] of SHARE_TAGS) expect(h.split(`<meta ${a}="${k}"`).length, `${f} ${k}`).toBe(2);
    }
  });

  it("the share image is the size the meta says, a PNG under 300 KB, and its address is the live site's", () => {
    const b = read(`web/public${SHARE.imagePath}`);
    expect(pngSize(b)).toEqual([SHARE.width, SHARE.height]);
    expect(b.length).toBeLessThan(300 * 1024);
    expect(SHARE.image).toBe(`https://gilded-goose.onrender.com${SHARE.imagePath}`);
  });

  it("the icons: the favicon is the vector egg alone, its .ico a 32×32 PNG entry, the touch icon 180×180", () => {
    expect(text("web/public/favicon.svg")).toBe(FAVICON_SVG);
    expect(FAVICON_SVG).toContain(EGG_PATH);
    const ico = read("web/public/favicon.ico");
    expect([ico.readUInt16LE(2), ico.readUInt16LE(4), ico[6], ico[7]]).toEqual([1, 1, 32, 32]);
    expect(pngSize(ico.subarray(ico.readUInt32LE(18)))).toEqual([32, 32]);
    expect(pngSize(read("web/public/apple-touch-icon.png"))).toEqual([180, 180]);
  });
});

describe("B-11: page titles (§10.8)", () => {
  it("each room's title is the menu item's name for it, at the address that item opens", () => {
    for (const r of ROOMS) {
      if (!r.menuId) continue; // a page the menu doesn't list: held to its own page's title below
      const item = MENU_ITEMS.find((i) => i.id === r.menuId);
      expect(item, r.menuId).toBeDefined();
      expect(r.name).toBe(item!.name);
      if (r.value !== "studio") expect(new URLSearchParams(item!.href.split("#")[0]).get(r.param), r.menuId).toBe(r.value);
      if (r.hash) expect(new URL(item!.href, "https://x/").hash, r.menuId).toBe(r.hash);
    }
    expect(pageTitle("Proof")).toBe("Proof · Gilded Goose");
    expect(pageTitle()).toBe(BRAND_NAME);
  });

  it("the Desk, the bare address and the classic page are the brand alone; main.tsx's precedence holds", () => {
    for (const s of ["", "?desk=1", "?wallet=0", "?desk=nope", "?utm_source=devpost"]) expect(titleFor(s), s).toBe("Gilded Goose");
    expect(titleFor("?desk=ledger")).toBe("Behind the scenes · Gilded Goose");
    expect(titleFor("?market=1&desk=ledger")).toBe("The cart, step by step · Gilded Goose");
    expect(titleFor("?desk=1&wallet=1")).toBe("Gilded Goose");
    expect(titleFor("?wallet=1") /* location.search never carries the #approve hash */).toBe("Approve in PayPal · Gilded Goose");
    expect(titleFor("?wallet=1", "#approve")).toBe("Approve in PayPal · Gilded Goose");
  });

  // S1-13 (Lead-10): the tour's stop 03 opens `?wallet=0#break`; a screen reader on that move heard only the site's name.
  it("the classic page opened on its lab is Try to trick Goose, the name its menu item, tour stop and h1 say", () => {
    expect(titleFor("?wallet=0", "#break")).toBe("Try to trick Goose · Gilded Goose");
    expect(titleFor("?wallet=0", "#other")).toBe("Gilded Goose");
    expect(titleFor("?wallet=0")).toBe("Gilded Goose");
    expect(titleFor("?desk=1", "#break")).toBe("Gilded Goose");
    expect(titleFor("?wallet=1", "#break")).toBe("Approve in PayPal · Gilded Goose");
    // Nov 4: the tour's stop opens the challenge on the Desk now (its heading takes focus there), and this page stays
    // the box the slot's fallback and the classic page link to.
    expect(TOUR.find((s) => s.id === "trick")!.href).toBe("?desk=1#challenge");
    expect(text("web/index.html")).toMatch(/<h1 id="brand-h"[^>]*>Try to trick Goose\.<\/h1>/);
  });

  // Pinned from web/src/main.tsx's own order (the reviewer's lesson: two copies agreeing proves nothing about the router).
  // A known back-room page wins over the wallet; an unknown `?desk=` with `?wallet=` is the wallet (main.tsx: no desk, no
  // back, so walletMode); `?studio=force` alone is rewritten to `?desk=studio` by index.html's first body script.
  it("main.tsx's edge cases: an unknown page beside the wallet, a back-room page beside it, studio=force", () => {
    expect(titleFor("?desk=nope&wallet=1")).toBe("Approve in PayPal · Gilded Goose");
    expect(titleFor("?desk=ledger&wallet=1")).toBe("Behind the scenes · Gilded Goose");
    expect(titleFor("?studio=force")).toBe("Behind the scenes · Gilded Goose");
    expect(titleFor("?wallet=1&studio=force")).toBe("Approve in PayPal · Gilded Goose");
    expect(titleFor("?desk=how")).toBe("How it works · Gilded Goose");
    expect(titleFor("?desk=system")).toBe("Design system · Gilded Goose");
    // Every back-room page main.tsx knows has a title, and no room names a page main.tsx doesn't route.
    const back = [...text("web/src/main.tsx").matchAll(/^\s+\["(\w+)", \[\(\) => import/gm)].map((m) => m[1]);
    expect(back.length).toBeGreaterThanOrEqual(7);
    expect(ROOMS.filter((r) => r.param === "desk").map((r) => r.value).sort()).toEqual([...back].sort());
  });

  it("the pages the menu doesn't list title themselves with the same name on mount", () => {
    expect(HOW_TITLE).toBe(ROOMS.find((r) => r.value === "how")!.name);
    expect(text("web/src/how/How.tsx")).toContain("document.title = `${HOW_TITLE} · Gilded Goose`");
    expect(text("web/src/system/System.tsx")).toContain(`document.title = "${pageTitle(ROOMS.find((r) => r.value === "system")!.name)}"`);
  });

  it("index.html's head runs TITLE_SCRIPT verbatim, and the script titles every address as titleFor does", () => {
    expect(head(text("web/index.html"))).toContain(`<script>${TITLE_SCRIPT}</script>`);
    const run = (search: string, hash = "") => {
      const doc = { title: BRAND_NAME };
      new Function("location", "document", "$q", TITLE_SCRIPT)({ search, hash }, doc, new URLSearchParams(search));
      return doc.title;
    };
    const all = ["", "?desk=1", "?wallet=0", "?market=1", "?market=0", "?desk=nope&wallet=1", ...ROOMS.map((r) => `?${r.param}=${r.value}`), "?market=1&wallet=1", "?desk=tour&wallet=1", "?studio=force", "?wallet=1&studio=force", "?desk=1&wallet=1", "?desk=ledger&wallet=1", "?desk=&wallet=1", "?desk="];
    for (const s of all) expect(run(s), s).toBe(titleFor(s));
    for (const s of all) for (const h of ["#break", "#approve", "#x"]) expect(run(s, h), s + h).toBe(titleFor(s, h));
    expect(run("?wallet=0", "#break")).toBe("Try to trick Goose · Gilded Goose");
  });

  it("the tab follows a hash-only move, which no load re-titles (the DD, Sat Oct 31 09:19: the menu's ?wallet=0 to #break)", () => {
    const on: (() => void)[] = [];
    const w = { location: { search: "?wallet=0", hash: "" }, document: { title: BRAND_NAME }, addEventListener: (t: string, f: () => void) => { if (t === "hashchange") on.push(f); } };
    titleOnHashChange(w);
    w.location.hash = "#break";
    on.forEach((f) => f());
    expect(w.document.title).toBe("Try to trick Goose · Gilded Goose");
    w.location.hash = "";
    on.forEach((f) => f());
    expect(w.document.title).toBe(BRAND_NAME);
    expect(text("web/src/main.tsx")).toContain("titleOnHashChange(window);");
  });

  it("the judge tour's own title on mount agrees", () => {
    expect(text("web/src/tour/Tour.tsx")).toContain(`document.title = "${pageTitle("Judge tour")}"`);
  });
});

describe("B-11: the lockup (§10.1)", () => {
  const css = text("web/src/brand/lockup.css");

  it("each HTML entry carries lockup.css verbatim in its head and the egg symbol first in its body", () => {
    for (const f of ENTRIES) {
      const h = text(f);
      expect(head(h).split(`<style data-gg>\n${css}</style>`).length, f).toBe(2);
      expect(h, f).toMatch(new RegExp(`<body>\\n\\s*<!--[^>]*-->\\n\\s*${EGG_SYMBOL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n`));
    }
  });

  it("the symbol is never display:none (which drops the gradient), and is hidden from screen readers", () => {
    expect(EGG_SYMBOL).toMatch(/^<svg width="0" height="0" style="position:absolute" aria-hidden="true">/);
    expect(EGG_SYMBOL).not.toMatch(/display\s*:\s*none/);
    expect(EGG_SYMBOL).toContain('<symbol id="ggEgg"');
  });

  it("the markup: the plain name for a screen reader, the egg drawing hidden, sizes from §10.1", () => {
    const html = lockupHtml("%BASE_URL%?desk=1", "bar");
    expect(html).toContain('aria-label="Gilded Goose"');
    expect(html).toContain('<span class="o"><span class="oc">o</span><svg aria-hidden="true"><use href="#ggEgg"/></svg></span>');
    expect(text("web/src/brand/snippet.html")).toContain(html);
    const tsx = text("web/src/brand/Lockup.tsx");
    expect(tsx).toContain('Gilded<span className="sp">{" "}</span>G<span className="o"><span className="oc">o</span><svg aria-hidden="true"><use href="#ggEgg" /></svg></span>ose');
    expect(tsx).toContain("aria-label={BRAND_NAME}");
    for (const rule of [".gg-bar { --mark-track: .05em; font-size: 22px; }", "@media (max-width: 720px) { .gg-bar { font-size: 20px; } }", ".gg-share { font-size: 40px; }", ".gg-bar .o { width: .55em; height: .68em;", ".gg .o { display: inline-block; width: .5em; height: .62em; margin: 0 .035em 0 .025em; transform: translateY(.012em); }", ".gg .sp { display: inline-block; width: .24em; }"]) expect(css).toContain(rule);
    expect(css).toMatch(/\.gg-end \{ --mark-w: 300; --mark-track: -\.03em; font-size: 96px; \}/);
    expect(css).not.toMatch(/Archivo|text-transform|gradient/); // never Archivo, never all caps, never gold type
  });
});

// Q's round 4 axe run (S1-13): the lockup's visible text read "GildedGose" (an empty spacer, the egg's o aria-hidden),
// so its name "Gilded Goose" wasn't the words on screen (WCAG 2.5.3, label-content-name-mismatch) and voice control
// could miss "click Gilded Goose". Every copy's visible text, as axe reads it (aria-hidden dropped), is the name.
describe("the lockup's visible text is its name, in every copy", () => {
  /** A copy's visible text: aria-hidden subtrees dropped, then tags; JSX's {" "} is a space. */
  const visible = (markup: string) => {
    let s = markup.replace(/\{" "\}/g, " ");
    for (let k = 0; k < 4; k++) s = s.replace(/<(\w+)[^>]*aria-hidden="true"[^>]*>(?:(?!<\1[\s>])[\s\S])*?<\/\1>/g, "");
    return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  };
  const lockups = (src: string) => [...src.matchAll(/<a class(?:Name)?=(?:"gg [^"]*"|\{`gg [\s\S]*?\})[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0]);
  const COPIES = ["web/index.html", "web/safe.html", "web/404.html", "web/voice-test-2.html", "web/src/brand/snippet.html", "web/src/brand/Lockup.tsx"];
  it("each HTML bar, the snippet, Lockup.tsx and lockupHtml() at each size read \"Gilded Goose\"", () => {
    for (const f of COPIES) {
      const found = lockups(text(f));
      expect(found.length, f).toBeGreaterThan(0);
      for (const l of found) expect(visible(l), f).toBe(BRAND_NAME);
    }
    for (const size of ["bar", "share", "end"] as const) expect(visible(lockupHtml("#", size)), size).toBe(BRAND_NAME);
    // control: the old markup reads as axe read it
    expect(visible('<a class="gg gg-bar" href="./?desk=1" aria-label="Gilded Goose">Gilded<span class="sp"></span>G<span class="o" aria-hidden="true"><svg><use href="#ggEgg"/></svg></span>ose</a>')).toBe("GildedGose");
  });
  it("its default link is the site's base, never \"./?…\" (wrong from a nested path)", () => {
    expect(lockupHtml()).toContain('href="/?desk=1"');
    expect(text("web/src/brand/Lockup.tsx")).toContain('href = appHref("?desk=1")');
    for (const f of [...COPIES, "web/src/brand/lockup-html.ts", "web/src/first-paint.tsx"]) expect(text(f), f).not.toMatch(/(?:gg-bar|dk-judge|Shopper)[^\n]*href="\.\/\?|href = "\.\/\?|<Lockup href="\.\//);
  });
  it("the hidden o paints nothing, and forced colours can't repaint it over the egg", () => {
    const css = text("web/src/brand/lockup.css");
    expect(css).toContain(".gg .oc { position: absolute; color: transparent; letter-spacing: 0; }");
    expect(css).toContain("@media (forced-colors: active) { .gg .oc { forced-color-adjust: none; } }");
  });
  // S's local CI, Nov 6 (a3b-screens): the bar's --mark-track .05em tracked the hidden o too, so the absolute o grew
  // past .o's fixed .55em box and .o held 2px more than it showed. Every size that tracks the name keeps the o untracked.
  it("the hidden o is never tracked, so no size's --mark-track widens it past the egg's fixed box", () => {
    const css = text("web/src/brand/lockup.css");
    const oc = css.match(/^\.gg \.oc \{([^}]*)\}/m)![1]!;
    expect(oc).toMatch(/(?:^|;)\s*letter-spacing: 0;/);
    // no later rule hands the o its tracking back
    expect(css.slice(css.indexOf("}", css.indexOf(".gg .oc {")) + 1)).not.toMatch(/\.oc[^{]*\{[^}]*letter-spacing/);
    // the sizes that track the name exist (a control: the guard is needed, not decoration)
    expect(css.match(/--mark-track: (?!-)/g)?.length).toBeGreaterThan(0);
    // and the probe that measures the spill on every route and size
    expect(text("scripts/lockup-name.ts")).toMatch(/scrollWidth - [\w.]*clientWidth/);
  });
});

describe("B-11: the tokens (§10.1, §10.6, §10.7)", () => {
  const tokens = text("web/src/desk/tokens.css");
  const rootBlock = text("web/index.html").match(/:root \{[\s\S]*?\n {6}\}/)![0];
  const val = (src: string, name: string) => src.match(new RegExp(`${name}: ([^;]+);`))?.[1];

  it("the new names, with §10's values; index.html's first-paint :root carries the same (Velvet)", () => {
    const want: Record<string, string> = { "--glass-bar-bg": "rgba(44, 21, 32, .93)", "--glass-bar-blur": "blur(40px) saturate(140%)", "--mark-face": "var(--display)", "--mark-w": "400", "--mark-track": "-.02em", "--d-cine": "900ms" };
    for (const [k, v] of Object.entries(want)) {
      expect(val(tokens, k), k).toBe(v);
      expect(val(rootBlock, k), `index.html ${k}`).toBe(v);
    }
  });

  it("Midnight's bar takes Midnight's page at 92%, on the back room's bar too", () => {
    const mid = tokens.match(/\.dk\[data-palette="c"\], \.dk\[data-palette="midnight"\], \.dk\[data-glass="midnight"\], \.gn\[data-room="back"\][^{]*\{[^}]*\}/)![0];
    expect(val(mid, "--glass-bar-bg")).toBe("rgba(21, 16, 19, .93)");
  });
});

describe("B-11: the egg still's render (§10.2)", () => {
  it("eggThree.ts's studio is either as it was or already lifted, box by box, so the render can't silently miss", () => {
    const src = text("web/src/desk/eggThree.ts");
    for (const l of LIFT) expect(src.includes(l.box + l.was) || src.includes(l.box + l.now), l.box).toBe(true);
    const out = lifted(src);
    for (const l of LIFT) expect(out.src).toContain(l.box + l.now);
    expect(() => lifted(src.replace(LIFT[0].box + LIFT[0].was, LIFT[0].box + "[9, 9, 9]").replace(LIFT[0].box + LIFT[0].now, LIFT[0].box + "[9, 9, 9]"))).toThrow(/neither/);
  });

  it("the still's files are in place: the master 1500×1800 with alpha, its webps 1200 and 600 wide", () => {
    const png = read("web/public/brand/egg-1500.png");
    expect(pngSize(png)).toEqual([1500, 1800]);
    expect(png[25]).toBe(6); // colour type 6: RGBA
    for (const w of [1200, 600]) {
      const b = read(`web/public/brand/egg-${w}.webp`);
      expect(b.subarray(0, 4).toString("latin1") + b.subarray(8, 12).toString("latin1")).toBe("RIFFWEBP");
    }
  });
});
