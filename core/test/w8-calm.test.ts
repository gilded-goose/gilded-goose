// Track W-8, the calm wallet: each bug this pass found is a test here, for its whole class (LESSONS "One line each").
//   1. The empty wallet (`?wallet=empty`) drew a blank band: every wallet state has a head (a headline and its line).
//   2. index.html's global `.ask` painted a card on the hero's Ask: a surface resets the global wrappers it reuses.
//   3. An empty list said only what was missing: every empty state is one line plus its action.
// Source-text tests, like the rest of core/test's page checks: the pages are React with no DOM in this suite.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

describe("W-8: every wallet state has a head", () => {
  const paint = read("web/src/first-paint.tsx");
  const wallet = read("web/src/Wallet.tsx");

  it("the hero's head is drawn with or without a desk, and says what to do when there is none", () => {
    // Control: the bug was a head gated on the desk (`desk && <DeskHead`), so the empty week had none.
    expect(paint).not.toMatch(/desk && <DeskHead/);
    expect(wallet).not.toMatch(/desk && <DeskHead/);
    expect(paint).toMatch(/<h1>What should Goose find\?<\/h1>/);
    expect(paint).toMatch(/<WalletHero head=\{<DeskHead desk=\{desk\}/);
    expect(wallet).toMatch(/<WalletHero head=\{<DeskHead desk=\{desk\}/);
  });

  it("loading and error mount Track R's states kit (brand.md 10.9), not words of their own", () => {
    const at = wallet.indexOf("if (down || !home) return (");
    expect(at).toBeGreaterThan(0);
    const state = wallet.slice(at, wallet.indexOf("</main>", at));
    expect(wallet).toMatch(/import \{ Loading, Offline, StateNote, WORDS, useOnline \} from "\.\/states\/index\.ts";/);
    // R-11, offline wins: while offline the failure is the kit's Offline (no Try again, which can't work offline).
    expect(state).toMatch(/\{down && !online \? <Offline \/> : down \? <StateNote/);
    // brand.md 10.9's three parts: the kit's title, the cause, the kit's Try again (DD nit: the cause line was missing).
    expect(state).toMatch(/down \? <StateNote kind="error" title=\{WORDS\.ERROR\.title\} line=\{WEEK_FAILED\} action=\{\{ label: WORDS\.ERROR\.action, onClick: reread \}\} \/> : <Loading \/>\}/);
    // The kit's straight apostrophe, as its title in the same block ("Goose couldn't load this.").
    expect(wallet).toMatch(/export const WEEK_FAILED = "This page couldn't build your week\.";/);
    // Try again reads the week again in place (R's hand-back): the load effect re-runs on each read.
    expect(wallet).toMatch(/const reread = \(\) => \{ setDown\(false\); setReads\(\(n\) => n \+ 1\); \};/);
    expect(wallet).toMatch(/\}\)\.catch\(\(\) => setDown\(true\)\);\n  \}, \[mode, reads\]\);/);
    // The page keeps one h1 while it waits; the kit's words are the only visible ones.
    expect(state).toMatch(/<h1 className="vh">Your week<\/h1>/);
    // No words of the wallet's own: the old "Loading your week…" and the kit's never-list.
    expect(state).not.toMatch(/Loading your week|Oops|Sorry|!"|spinner/i);
    expect(read("web/src/wallet.css")).not.toMatch(/\.wstate|\.wtry/);
  });
});

describe("W-8 review: cutting words never cuts what is the shopper's own", () => {
  const ask = read("web/src/AskGoose.tsx");
  it("the hero keeps the heading (with the shopper's name) as the box's visible label, and the stand-in draws the same label", () => {
    expect(ask).toMatch(/<label htmlFor="want" id="ask-h" className="ahlabel">\{heading\}<\/label>/);
    expect(read("web/src/first-paint.tsx")).toMatch(/<label htmlFor="want" id="ask-h" className="ahlabel">\{heading\}<\/label>/);
  });
  it("a chip tap leaves focus in the box (its button unmounts once the answer lands), and a busy box takes no second tap", () => {
    expect(ask).toMatch(/onClick=\{\(\) => \{ if \(busy\) return; setWords\(c\); box\.current\?\.focus\(\{ preventScroll: true \}\);/);
  });
  it("a hidden why always has its tap: the limits' notes hide only while the All limits button is there", () => {
    expect(read("web/src/safe.css")).toMatch(/\.settings:not\(\.all\):has\(\.more\) li \.note \{ display: none; \}/);
  });
});

describe("W-8 DD ruling: the hero keeps its natural height", () => {
  it("no min-height on the hero: --s-12 to the hairline, and the story's head shows below the first screen", () => {
    const css = read("web/src/wallet.css");
    const hero = [...css.matchAll(/\.wallet \.whero(?:\.solo)? \{[^}]*\}/g)].map((m) => m[0]).join("\n");
    expect(hero).not.toMatch(/min-height/);
    expect(css).toMatch(/\.wallet \.whero \{[^}]*padding: var\(--s-8\) 0 var\(--s-12\);/);
    expect(css).toMatch(/\.wallet \.wdesk \{ padding-top: var\(--s-12\); border-top: var\(--hair\); \}/);
  });
});

describe("W-8: a surface resets the global wrappers it reuses", () => {
  it("the hero's Ask wrapper has no card of its own (index.html styles every .ask as one)", () => {
    expect(read("web/index.html")).toMatch(/\.ask\s*\{/);
    expect(read("web/src/wallet.css")).toMatch(/\.wallet \.whero \.ask \{[^}]*background: none;/);
  });
});

describe("W-8: every empty state is one line plus its action", () => {
  it("an empty wants list is brand.md §10.9's Empty: a head, its one line, one action to the Ask box", () => {
    const wants = read("web/src/Wants.tsx");
    // SW: the head says what is missing (never "nothing … yet"), the line says how to fill it, the action is one pill.
    expect(wants).toMatch(/export const WANTS_EMPTY = "No wants yet\.";/);
    expect(wants).toMatch(/export const WANTS_LINE = "Tell Goose “I really want the kettle” and it keeps that here\.";/);
    expect(wants).toMatch(/<div className="wstate"><p className="wstate-t">\{WANTS_EMPTY\}<\/p><p className="wstate-l">\{WANTS_LINE\}<\/p><button type="button" className="wstate-go" onClick=\{toAsk\}>/);
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    expect(words("No wants yet.") + words("Tell Goose “I really want the kettle” and it keeps that here.") + words("Ask Goose")).toBeLessThanOrEqual(24);
    // The action only moves focus: nothing is typed or sent for the shopper.
    const fn = wants.slice(wants.indexOf("function toAsk()"), wants.indexOf("\n}", wants.indexOf("function toAsk()")));
    expect(fn).not.toMatch(/fetch|\.value\s*=|requestSubmit|\.click\(/);
  });
});

describe("W-8 DD fix (brand.md 10.1, 10.2): the wallet's first screen has one egg, the lockup's egg-o", () => {
  const paint = read("web/src/first-paint.tsx");
  const wallet = read("web/src/Wallet.tsx");
  const top = paint.slice(paint.indexOf("export function WalletTop"), paint.indexOf("export function HeroTop"));
  const heroTop = paint.slice(paint.indexOf("export function HeroTop"), paint.indexOf("\n}\n", paint.indexOf("export function HeroTop")));

  it("the bar wears B-11's lockup, not the old egg mark beside the name", () => {
    expect(top).toMatch(/<Lockup \/>/); // its default link, the site's base (S1-13: never "./?")
    expect(top).not.toMatch(/dk-mark|dk-brand/);
  });

  it("the deal card's limit line and Approve share the plain padlock; no egg in either", () => {
    expect(heroTop).toMatch(/<LockGlyph \/>/);
    expect(heroTop).not.toMatch(/<Egg\b/);
    expect(wallet).toMatch(/const tick = <LockGlyph \/>;/);
  });

  it("\"Goose can't pay\" is words alone, with no mini-egg bullet", () => {
    expect(read("web/src/first-paint.tsx")).toMatch(/const Only = \(\) => <p className="only">Goose can’t pay\. Only your tap in PayPal does\.<\/p>;/);
  });
});

describe("W-8 DD nits (~07:50)", () => {
  it("safe.css's reserved heights say what they hold, beside each value, as .tl-hold does", () => {
    const safe = read("web/src/safe.css");
    expect(safe).toMatch(/\.one \.b\.you \{ min-height: 81px; \}\s+\/\* the filled bubble/);
    expect(safe).toMatch(/\.one \.if \{ min-height: 83px; \}\s+\/\* the filled "if" line/);
    expect(safe).toMatch(/\.one \.settings \{ min-height: 131px; \} \/\* one limit face/);
  });

  it("every wallet.css class is drawn somewhere (no dead .wgo)", () => {
    expect(read("web/src/wallet.css")).not.toMatch(/\.wgo\b/);
  });
});

describe("W-8 after S1-13 (stack 95): what S1-13 retired stays retired on W-8's pages", () => {
  it("the wallet bar and safe.html draw no phone view rail (the views live in the menu sheet)", () => {
    const paint = read("web/src/first-paint.tsx");
    const top = paint.slice(paint.indexOf("export function WalletTop"), paint.indexOf("export function HeroTop"));
    expect(top).not.toMatch(/gn-rail/);
    expect(read("web/safe.html")).not.toMatch(/gn-rail/);
  });

  it("wallet.css keeps no scoped copy of B-11's BAR_CSS (nav.css owns the lockup's bar rules)", () => {
    expect(read("web/src/wallet.css")).not.toMatch(/\.gg-bar/);
  });

  it("wallet.css and safe.css draw every colour from a token (DD gate 06:11): no raw rgba() or hex colour", () => {
    for (const f of ["web/src/wallet.css", "web/src/safe.css"]) {
      // The one exception is a mask's alpha ramp (#0000 / #000 stops), which carries no colour.
      const css = read(f).replace(/mask: linear-gradient\([^;]*\);/g, "").replace(/url\(#[^)]*\)/g, "");
      expect(css, f).not.toMatch(/rgba?\(/);
      expect(css, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it("every radius in wallet.css and safe.css is a token (--r-1/2/3, --r-pill) or a 0 reset (DD, 06:35)", () => {
    for (const f of ["web/src/wallet.css", "web/src/safe.css"]) {
      const values = [...read(f).matchAll(/radius:\s*([^;}]+)/g)].map((m) => m[1]!.trim());
      expect(values.length, f).toBeGreaterThan(0);
      for (const v of values) expect(v.replace(/var\(--r-(?:1|2|3|pill)\)/g, "").replace(/\b0\b/g, "").trim(), `${f}: ${v}`).toBe("");
    }
    // The bubbles' tails are the Desk's (.dk-asked): --r-1 on the speaker's corner of an --r-3 bubble.
    expect(read("web/src/safe.css")).toMatch(/\.b\.you \{[^}]*border-bottom-right-radius: var\(--r-1\);/);
  });
});

describe("W-8 after WT's walkthrough (stack 116): the wallet's judge sheet stays retired", () => {
  // Decided by default (Lead-10): the tour replaced it, and the bar's "Judge? Start here" is a link to ?desk=tour. JudgePath
  // rendered nowhere after S1 while wallet.css still styled it, and the claims row s2-attack-tally probed its copy of the
  // tally. Flip if Joshua says to bring the wallet sheet back.
  it("no JudgePath in the wallet's code, and no judge-sheet rule in wallet.css", () => {
    for (const f of ["web/src/first-paint.tsx", "web/src/Wallet.tsx"]) {
      expect(read(f), f).not.toMatch(/\bJudgePath\b|className="(?:judge|jpanel|jclose|jsteps|jfoot)"/);
    }
    expect(read("web/src/wallet.css")).not.toMatch(/\.(?:judge|jpanel|jclose|jsub|jsteps|jn|jfoot|jwho)\b/);
  });

  // Track F, Nov 4: the first paint can't know the API is away, so nothing that shows only then may sit above the deal.
  // pages-smoke and first-routes-probe measure it; these keep the two reasons it holds in the check that runs on every commit.
  it("the hero's away note waits for the box's first use, so it never pushes the deal under a thumb", () => {
    const ask = read("web/src/AskGoose.tsx");
    expect(ask).toMatch(/\{heading && \(!hero \|\| boxUsed\) && \(live === "away"/);
    expect(ask).toMatch(/onFocus=\{\(\) => setBoxUsed\(true\)\}/);
  });
  it("the first paint keeps Approve's room, so what's under it doesn't drop off the phone's first screen", () => {
    // The block itself, its pieces unseen until the wallet draws them: a height written by hand went stale the day a line joined it.
    expect(read("web/src/first-paint.tsx")).toContain('<div className="acts acts-held">');
    // Pay Later holds its spot until it hears back: with /api/config out, what's under Approve collapsed 44 px and came back.
    const later = read("web/src/PayLater.tsx");
    expect(later).toContain('{!on && !quiet && <p className="wlater-none" aria-hidden="true">');
    expect(later).not.toMatch(/\(!on && !quiet\)\) return null/);
    const css = read("web/src/wallet.css");
    expect(css).toContain(".wallet .acts-held > :not(.apractice) { visibility: hidden; }");
    // DD, Nov 4: a real PayPal message adds up to 85 px. The room holds it, and so does the box when PayPal sends nothing.
    expect(css).toMatch(/\.wlater \{[^}]*min-height: var\(--later\)/);
    expect(css).toMatch(/\.wallet \{ --later: 72px; \}/);
    expect(css).toMatch(/@media \(max-width: 400px\) \{ \.wallet \{ --later: 112px; \} \}/);
  });

  it("the attack tally's claim is probed where it renders: JudgeBox.tsx, not first-paint.tsx", () => {
    expect(read("docs/claims.md")).toMatch(/^\| s2-attack-tally \| None got it to pay\. \| `core\/src\/judge\/count-words\.ts` \|/m);
    expect(read("web/src/first-paint.tsx")).not.toContain("Tries to break it here");
  });
});
