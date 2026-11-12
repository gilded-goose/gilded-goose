// AS-15 (Behind the scenes; Joshua's launch program, Sat 3:30 AM): show, don't explain. No chart apologizes for its
// scale, no empty state says "nothing here yet", a ledger that can't reach its server says so with "Try again" instead of
// reading forever, and the Studio's desktop frames are their cards' own heights. Each block is a bug's whole class, so
// a new chart, empty state or card is held to the same rule.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { weekAxis } from "../../web/src/charts/axis.ts";
import { GUTTER_PX, GUTTER_TRACKS, fitRows, layoutFor, tracksIn, type Layout } from "../../web/src/studio/layout.ts";
import { ASK_IDLE, ASK_VIEW_ONLY } from "../../web/src/studio/words.ts";
import { follow, type SourceLike, type StreamEnd } from "../../web/src/ledger/follow.ts";
import { ROWS_FAILED, stoppedAs, stoppedWords } from "../../web/src/ledger/stopped.ts";
import { LONG_WAIT_MS } from "../../web/src/states/retry.ts";
import { EMPTY, ERROR, LIMITED, LIMITED_LATER, OFFLINE } from "../../web/src/states/words.ts";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const sources = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap((n) => {
  const p = `${dir}/${n}`;
  return statSync(join(ROOT, p)).isDirectory() ? sources(p) : /\.(tsx?|css)$/.test(n) ? [p] : [];
});
/** Lines a visitor can be shown: comments are left out (a comment may quote the banned words to ban them). */
const shown = (p: string) => read(p).split("\n").map((line, i) => ({ p, n: i + 1, line })).filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line));

describe("AS-15: no chart apologizes for its scale", () => {
  it("week_axis_starts_at_zero: whatever the prices, the week's price scale starts at $0", () => {
    for (const dollars of [[112, 84, 97, 55], [40, 41, 42], [1, 2], [900, 905], [0]]) expect(weekAxis(dollars).lo).toBe(0);
  });

  it("no_scale_apology_anywhere: no line in web/src explains away a cut-off scale", () => {
    const hits = sources("web/src").flatMap(shown).filter(({ line }) => /scale starts at|not \$0|look steeper|isn't zero|doesn't start at/i.test(line));
    expect(hits.map((h) => `${h.p}:${h.n}`)).toEqual([]);
  });
});

describe("AS-15: a chart's caption is one sentence of at most 16 words (brand.md §10's budget)", () => {
  it("captions_one_sentence: every caption on a card's face, outside \"How this works\", is one sentence of ≤16 words", () => {
    // The bug: the PayPal card's caption was two sentences after the cut. What sits behind a "How this works" tap is
    // the explanation, so it is left out; the rest is what a judge reads on the card's face.
    const files = ["web/src/studio/widgets/index.tsx", "web/src/ledger/Week.tsx", "web/src/ledger/Charts.tsx", "web/src/charts/SpendLimits.tsx"];
    const faces = files.flatMap((p) => {
      const face = read(p).replace(/<HowThisWorks[\s\S]*?<\/HowThisWorks>/g, "");
      const paras = [...face.matchAll(/<p(?: className="(?:lx-sec-sub|st-none)")?>([^<{]+)<\/p>/g)].map((m) => m[1]!);
      const subs = [...face.matchAll(/className="lx-sec-sub">\{[^}]*\}/g)].flatMap((m) => [...m[0].matchAll(/"([^"]{12,})"/g)].map((q) => q[1]!));
      return [...paras, ...subs].map((t) => ({ p, t: t.trim() }));
    });
    expect(faces.length).toBeGreaterThanOrEqual(6);
    const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}$]/u.test(w)).length;
    const over = faces.filter(({ t }) => words(t) > 16 || /[.!?]\s+[A-Z]/.test(t));
    expect(over.map(({ p, t }) => `${p}: ${t}`)).toEqual([]);
  });
});

describe("AS-15: an empty state leads with the story or one inviting line, never \"nothing yet\"", () => {
  // Other tracks' files that still say it (reported as "Needs from …"); this list only shrinks. brand.md §10.9 says what is
  // missing ("No rows yet.") and then the one way to fill it; what it bans is "nothing" standing in for the content.
  const ELSEWHERE = new Set<string>(); // empty: DK took Panes.tsx off, SW took Wants.tsx off (brand.md §10.9's Empty)
  it("no_nothing_yet: no visitor-facing line says nothing is here yet", () => {
    const hits = sources("web/src").flatMap(shown).filter(({ line }) => /["'>`]nothing( here| saved| paid| this session)? yet/i.test(line));
    expect(hits.filter((h) => !ELSEWHERE.has(h.p)).map((h) => `${h.p}:${h.n}: ${h.line.trim().slice(0, 80)}`)).toEqual([]);
  });

  it("ledger_empty_invites: with no session the ledger draws the kit's Empty, which names the next step as a link", () => {
    // Slice 2 (Track R's kit): brand.md §10.9's Empty, word for word, from web/src/states (claims row l-ask-rows).
    expect([EMPTY.title, EMPTY.line, EMPTY.action]).toEqual(["No rows yet.", "They start when you ask Goose.", "Ask Goose"]);
    expect(read("web/src/SessionLedger.tsx")).toMatch(/case "empty": return <Empty className="lx-state lx-state-visit" title=\{EMPTY_VISIT\} \/>;/);
  });
});

describe("AS-15: a ledger that can't reach its server says so, with Try again", () => {
  // A fake EventSource: the test opens it, drops it or fails it; `closed` says whether the page let it go.
  class Fake implements SourceLike {
    readyState = 0;
    closed = false;
    onerror: ((e: never) => void) | null = null;
    private opens: (() => void)[] = [];
    addEventListener(_t: "open", f: () => void) { this.opens.push(f); }
    close() { this.closed = true; this.readyState = 2; }
    open() { this.readyState = 1; for (const f of this.opens) f(); }
    fail(state: 0 | 2 = 0) { this.readyState = state; this.onerror?.(undefined as never); }
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const harness = (whys: (() => Promise<StreamEnd>)[]) => {
    const made: Fake[] = [];
    const ends: StreamEnd[] = [];
    let asked = 0;
    const f = follow<Fake>({ open: () => { const s = new Fake(); made.push(s); return s; }, askWhy: () => whys[asked++]!(), wire: () => {}, ended: (e) => ends.push(e) });
    return { f, made, ends, asked: () => asked, live: () => made.filter((s) => !s.closed) };
  };

  it("never_opened_stream_asks_why: an EventSource that errors before it ever opened is closed and asked why at once", async () => {
    // The bug: EventSource retries an unreachable server forever, and onerror acted only on CLOSED, so the page read
    // "Reading your ledger…" with nothing under it for as long as the visitor waited.
    const h = harness([async () => ({ status: 0 })]);
    h.f.start();
    h.made[0]!.fail();
    await tick();
    expect(h.made[0]!.closed).toBe(true);
    expect(h.ends).toEqual([{ status: 0 }]);
  });

  it("dropped_stream_is_left_to_retry: a stream that opened and then dropped is not closed or asked about", async () => {
    const h = harness([]);
    h.f.start();
    h.made[0]!.open();
    h.made[0]!.fail(0);
    await tick();
    expect(h.made[0]!.closed).toBe(false);
    expect(h.asked()).toBe(0);
    expect(h.ends).toEqual([]);
  });

  it("try_again_twice_holds_one_stream: a slow answer from an older try is dropped, and every older stream is closed", async () => {
    // The review's bug: Try again, the new stream fails, Try again again while the first "why" is in flight; that stale
    // answer then set the page's words (and its 3 s look) over the live stream, and could leave two streams open.
    let slow!: (e: StreamEnd) => void;
    const h = harness([() => new Promise((r) => { slow = r; }), async () => ({ status: 429, body: { error: "Too many." } })]);
    h.f.start();
    h.made[0]!.fail();           // asks why (slow)
    h.f.again();                 // Try again: a second stream
    h.f.again();                 // and a third, before anything answered
    expect(h.live()).toEqual([h.made[2]]);
    slow({ status: 204 });       // the first try's answer arrives late
    await tick();
    expect(h.ends).toEqual([]);  // dropped: the live stream's own answer is the one that counts
    h.made[2]!.fail();
    await tick();
    expect(h.ends).toEqual([{ status: 429, body: { error: "Too many." } }]);
  });

  it("didnt_answer_only_when_nothing_did: a 2xx why connects once more, then gives up with the server's status", async () => {
    // The review's bug: a first connect that failed while the server was up said "Goose's server didn't answer."
    const h = harness([async () => ({ status: 200 }), async () => ({ status: 200 })]);
    h.f.start();
    h.made[0]!.fail();
    await tick();
    expect(h.made.length).toBe(2); // one more try, at once
    expect(h.ends).toEqual([]);
    h.made[1]!.fail();
    await tick();
    expect(h.ends).toEqual([{ status: 200 }]);
    // ...and that 200 draws no cause, never "didn't answer": only a status 0 says that (ERROR.network).
    expect(stoppedAs(200)).toBe("error");
    expect(stoppedAs(0)).toBe("network");
    expect(ERROR.network).toBe("Goose's server didn't answer.");
  });

  it("every_stop_draws_a_kit_state: each way the stream can stop is one of the kit's blocks, with Try again where trying can help", () => {
    // Slice 2: the page's own words and its inline Try again became Track R's kit (docs/guild/062-r.md §7), one block
    // below the hero; the hero's line is Reading and Live only, so a stopped stream is never said twice.
    expect([204, 0, 429, 500, 503, 200].map(stoppedAs)).toEqual(["empty", "network", "limited", "error", "error", "error"]);
    const tsx = read("web/src/SessionLedger.tsx");
    expect(tsx).toMatch(/const w = stoppedWords\(kind, status\.retryAfterMs\);/);
    expect(tsx).toMatch(/<RateLimited onRetry=\{retry\} title=\{w\.title\} cause=\{w\.line\} retryAfterMs=\{status\.retryAfterMs\}/);
    expect(tsx).toMatch(/<RateLimited onRetry=\{retry\} retryAfterMs=\{status\.retryAfterMs\} className="lx-state" \/>/); // a long wait: the kit's own words
    expect(tsx).toMatch(/case "network":\s+case "error": return w \? <StateNote kind="error" title=\{w\.title\} line=\{w\.line\} action=\{\{ label: w\.action, onClick: retry \}\}/);
    expect(tsx).toMatch(/<ErrorBoundary>/); // a grid that throws (or a chunk lost to a deploy) is the kit's block, not a blank page
    expect(read("web/src/ledger/Hero.tsx")).toMatch(/status\.kind === "none" \? ""/);
    // askWhy and the first paint's early stream both keep a refusal's Retry-After.
    expect(tsx).toMatch(/const ra = r\.headers\.get\("retry-after"\);/);
    expect(read("web/src/ledger/early-stream.ts")).toContain('r.headers.get("retry-after");if(h)o.ra=h');
  });

  it("each_failure_says_what_failed: the three ways the stream fails share Track C's title, each with its own cause or none", () => {
    // The DD gate (06:14 PDT): "Goose couldn't load this." didn't say what failed. Track C's words, in the kit's three
    // parts; the cause only where the code knows it.
    expect(ROWS_FAILED).toBe("Your rows didn't load.");
    expect(stoppedWords("network")).toEqual({ title: ROWS_FAILED, line: "Goose's server didn't answer. What's on screen stays.", action: "Try again" });
    expect(stoppedWords("limited", 5000)).toEqual({ title: ROWS_FAILED, line: "Too many asks in a short time. What's on screen stays.", action: "Try again" });
    expect(stoppedWords("error")).toEqual({ title: ROWS_FAILED, line: "What's on screen stays.", action: "Try again" }); // no cause
    // The kit's own words stand for no session and for a long 429 (LIMITED_LATER, no Try again).
    expect(stoppedWords("empty")).toBeNull();
    expect(stoppedWords("limited", LONG_WAIT_MS + 1)).toBeNull();
    expect(LIMITED_LATER.title).not.toBe(ROWS_FAILED);
    // Each part is the kit's own sentence, word for word.
    expect(stoppedWords("network")!.line.startsWith(ERROR.network)).toBe(true);
    expect(stoppedWords("limited")!.line.startsWith(LIMITED.line)).toBe(true);
    for (const k of ["network", "limited", "error"] as const) expect(stoppedWords(k)!.line.endsWith(OFFLINE.line)).toBe(true);
  });

  it("rows_stay_after_a_failure: a stopped stream only sets the status, and the page never removes a row it drew", () => {
    // "What's on screen stays." is promised in every failure's words, so: the end handler touches no rows, the grid is
    // only ever added to, and the row lists only grow.
    const tsx = read("web/src/SessionLedger.tsx");
    const ended = tsx.slice(tsx.indexOf("const ended = (o: EarlyEnd) => {"), tsx.indexOf("// No session yet: the demo week still opens"));
    expect(ended.length).toBeGreaterThan(100);
    expect(ended).not.toMatch(/own\.current|week\.current|setRowData|applyTransaction\(\{ remove/);
    expect(tsx).not.toMatch(/\bremove:/);
    expect(tsx).not.toMatch(/setGridOption\("rowData"|setRowData\(/);
    for (const m of tsx.matchAll(/\b(own|seeded|week)\.current = (.+);/g)) {
      // Each assignment appends to its list, fills the seeded row once (seedLocally returns if it has one), or is the
      // recorded week arriving.
      expect(m[2], m[0]).toMatch(/^\[\.\.\.(own|seeded|week)\.current, |^sessionRows\(seededRows\(Date\.now\(\)\)\)\.map\(streamed\)$|^weekRows\(w\.events\)$/);
    }
  });

  it("panel_waits_for_every_row_source: nothing under the title draws until the stream answered and the week is in", () => {
    // The bug: a shorter header lifted the panel into view, and "Where to look" landing ~110 ms later pushed the table
    // down (CLS 0.030 at 1440 with a session; budget 0.022).
    expect(read("web/src/SessionLedger.tsx")).toMatch(/const ready = status\.kind !== "reading" && weekIn;/);
  });
});

describe("AS-15: the desktop Studio's frames are their cards' own heights", () => {
  // Measured at 1440 (Studio.tsx's cardTracks, the packet's as15-tracks3.ts): the tracks each card needs with the demo
  // week's rows, and with an ask's. A frame shorter than its card scrolls inside (the PayPal card cut its last row in
  // half); one much taller is empty velvet. Slice 2: the cards below the first row have full-width rows (spend 11 beside
  // the ladder's 35 left 380 px of bare velvet), and the page fits each row as rows stream in (`fitRows`).
  // Stack 107's gutter (layout.ts GUTTER_PX): each card is inset 8 px on every side, so each need is one track more
  // (session 35/32/33/11/29 and none 35/24/33/11/29 before it).
  const NEED = {
    session: { week: 36, blocked: 33, ladder: 34, spend: 12, paypal: 30 },
    none: { week: 36, blocked: 25, ladder: 34, spend: 12, paypal: 30 },
  } as const;
  const rows = (l: Layout) => Object.values(l).sort((a, b) => a.yTrack - b.yTrack || a.xTrack - b.xTrack);
  for (const [name, session] of [["session", true], ["none", false]] as const) {
    it(`desktop_frames_fit_${name}: every frame holds its card, with at most two tracks to spare beside its row's tallest`, () => {
      const l = layoutFor(false, session);
      for (const [id, need] of Object.entries(NEED[name])) {
        const p = l[id as keyof Layout];
        expect(p.ySpan, id).toBeGreaterThanOrEqual(need);
        const rowTallest = Math.max(...Object.entries(NEED[name]).filter(([o]) => l[o as keyof Layout].yTrack === p.yTrack).map(([, n]) => n));
        expect(p.ySpan - rowTallest, id).toBeLessThanOrEqual(2);
      }
      // No gaps: each row starts where the one above it ends, and a row's frames share one height.
      let y = 0;
      for (const p of rows(l)) {
        if (p.yTrack !== y) { expect(p.yTrack).toBe(y + rows(l).find((q) => q.yTrack === y)!.ySpan); y = p.yTrack; }
        expect(p.ySpan).toBe(rows(l).find((q) => q.yTrack === y)!.ySpan);
      }
      expect(tracksIn(l)).toBe(157); // 152 before the gutter, plus one track for each of the five rows
    });
  }

  it("empty_card_never_beside_a_taller_one: the transparent empty spend card's frame is its own height, give or take a track", () => {
    // The bug's class: a card that draws no frame of its own (the empty "against your limits" card) shows every spare
    // track under it as bare velvet, so it never shares a row, on either layout.
    for (const session of [true, false]) {
      const l = layoutFor(false, session);
      expect(Object.values(l).filter((p) => p.yTrack === l.spend.yTrack)).toHaveLength(1);
      expect(l.spend.ySpan - NEED.none.spend).toBeLessThanOrEqual(1);
    }
  });

  it("rows_fit_as_rows_stream_in: a paid cart and PayPal's rows grow their rows; one track over holds still; a visitor's arrangement is left alone", () => {
    const l = layoutFor(false, true);
    // As first painted (each frame its card's own, within a track): nothing moves.
    expect(fitRows(l, { ...NEED.session }, 1)).toBeNull();
    // One paid cart, measured at 1440: the spend chart needs 20, PayPal 42 (with the gutter). Each row grows; every row below moves down.
    const fit = fitRows(l, { ...NEED.session, blocked: 36, spend: 20, paypal: 42 }, 1)!;
    expect(fit.spend).toEqual({ ...l.spend, ySpan: 20 });
    expect(fit.paypal).toEqual({ ...l.paypal, yTrack: l.spend.yTrack + 20, ySpan: 42 });
    expect(fit.every).toEqual({ ...l.every, yTrack: l.spend.yTrack + 20 + 42 });
    // A row two tracks over its tallest card shrinks to it (velvet), and a card left out of `need` keeps its frame.
    expect(fitRows(l, { ...NEED.session, ladder: 32 }, 1)!.ladder?.ySpan).toBe(32);
    // Not clean rows (a visitor moved a card half a row down): left alone.
    expect(fitRows({ ...l, spend: { ...l.spend, yTrack: l.spend.yTrack + 3 } }, { spend: 30 }, 1)).toBeNull();
    expect(fitRows({ ...l, blocked: { ...l.blocked, xTrack: 10 } }, { week: 50 }, 1)).toBeNull();
  });
});

describe("the DD gate (06:11 PDT): Behind the scenes' stylesheets name space, radius and colour by role", () => {
  const SHEETS = ["web/src/ledger/ledger.css", "web/src/charts/charts.css"];
  /** Each line's code without comments, and whether it carries a `raw-ok: <why>` (the rule of core/test/dk-raw.test.ts). */
  const codeLines = (css: string) => {
    let inComment = false;
    return css.split("\n").map((line, i) => {
      let code = "", rest = line;
      while (rest.length) {
        const at = rest.indexOf(inComment ? "*/" : "/*");
        if (at < 0) { if (!inComment) code += rest; break; }
        if (!inComment) code += rest.slice(0, at);
        rest = rest.slice(at + 2); inComment = !inComment;
      }
      return { n: i + 1, code, ok: /raw-ok: \S/.test(line) };
    });
  };
  /** DK's guard, the same patterns: raw colours (hex, rgb/rgba, hsl/hsla) and px corner radii, outside `raw-ok` lines. */
  const rawValues = (css: string) => codeLines(css).flatMap(({ n, code, ok }) => ok ? [] : [
    ...[...code.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/gi)].filter((m) => !/^\w+\(\s*var\(/.test(m[0])).map((m) => `${n}: ${m[0]}`),
    ...[...code.matchAll(/border(?:-[a-z]+)*-radius:\s*([^;}]*)/gi)].filter((m) => /\b\d+(?:\.\d+)?px\b/.test(m[1]!.replace(/var\([^)]*\)/g, "").replace(/calc\([^)]*\)/g, ""))).map((m) => `${n}: radius ${m[1]!.trim()}`),
  ]);
  /** Margin, padding and gap px values off the 8 px grid: not a token's size (a negative pull may be one), not a 1-2 px
   *  hairline, not a 4 px optical nudge. */
  const offGrid = (css: string) => codeLines(css).flatMap(({ code }) => {
    const sel = code.split("{")[0]!.trim();
    return [...code.matchAll(/\b(?:margin|padding|gap|row-gap|column-gap)(?:-(?:top|bottom|left|right|block|inline)(?:-(?:start|end))?)?\s*:\s*[^;}]+/g)]
      .filter((m) => [...m[0].matchAll(/(?<![\w.-])-?(\d+(?:\.\d+)?)px\b/g)].some((v) => ![0, 1, 2, 4, 8, 16, 24, 32, 40, 48, 64, 80, 96].includes(Number(v[1]))))
      .map((m) => `${sel} :: ${m[0].trim()}`);
  });

  it("finds raw values and off-grid space in a sample (the guards can fail)", () => {
    expect(rawValues(".a { color: #3f2131; border-radius: 14px; box-shadow: 0 1px 0 rgba(1, 2, 3, .4); }")).toHaveLength(3);
    expect(rawValues(".a { border-radius: var(--r-3); background: color-mix(in srgb, var(--lx-ink) 8%, transparent); }")).toEqual([]);
    expect(offGrid(".a { padding: 20px var(--s-3); gap: 4px; margin: 0 1px; }")).toEqual([".a :: padding: 20px var(--s-3)"]);
  });

  it("no raw colour or px radius in ledger.css or charts.css", () => {
    for (const f of SHEETS) expect(rawValues(read(f)), f).toEqual([]);
  });

  it("every space is a token, a hairline or a 4 px nudge, except a control's 12 and a few that are arithmetic, not rhythm", () => {
    expect(SHEETS.flatMap((f) => offGrid(read(f)))).toEqual([
      ".lx-sec-sub :: margin: -12px 0 4px", // tucks the subtitle under its heading's line box
      ".lx-search input :: padding: 0 12px 0 var(--s-5)", // inside a 44 px control (brand.md §5)
      "@media (max-width: 720px) :: margin-bottom: calc(57px + env(safe-area-inset-bottom, 0px) + var(--s-2))", // the phone rail's height (scroll-margin)
      ".lx-fm-item :: gap: 12px", // inside a 44 px control
      ".lx-x :: margin-right: -10px", // pulls the close button's 44 px target to the sheet's edge
      ".lx-status a, .lx-lede a :: margin-block: -12px", // a 44 px target whose margin box is one line tall
      ".lx-status a, .lx-lede a :: margin-block: calc((1lh - 44px) / 2)",
    ]);
  });

  it("every control in the ledger's tools is 44 px tall", () => {
    const css = read("web/src/ledger/ledger.css");
    for (const sel of [".lx-look button", ".lx-search input", ".lx-btn", ".lx-filter-btn"]) {
      const rule = css.split("\n").find((l) => l.startsWith(`${sel} {`) && l.includes("min-height"));
      expect(rule, sel).toMatch(/min-height: 44px/);
    }
  });

  it("a stopped stream's kit block sits at its natural height, --s-6 under the hero's lede and above the story", () => {
    // The kit's own 96 px above and below made a 144 px band under the lede (over brand.md's one --s-12).
    const css = read("web/src/ledger/ledger.css");
    expect(css).toContain(".st-note.lx-state { padding: 0 0 var(--s-6); margin-top: calc(var(--s-6) - var(--s-5)); }");
    expect(css).toContain("  .st-note.lx-state { margin-top: calc(var(--s-6) - var(--s-3)); }"); // the phone's hero pads --s-3
    expect(css).toMatch(/\.lx-hero \{ padding: var\(--s-8\) 0 var\(--s-5\); \}/);
  });
});

describe("AS-15 (the DD, stack 107): the ask box says on screen that it can't pay", () => {
  const css = read("web/src/studio/studio.css");
  const shell = read("web/src/studio/Shell.tsx");
  /** Every rule in studio.css whose selector names `cls`, as "selector { body }" (one rule per line, the file's style). */
  const rulesFor = (cls: string) => css.split("\n").filter((l) => new RegExp(`\\.${cls}\\b[^{]*\\{`).test(l));

  it("view_only_line_is_visible: the short line is a plain <p> under the box, in no visually hidden rule, and it is the claims row", () => {
    expect(ASK_VIEW_ONLY.split(/\s+/)).toHaveLength(8); // "can't" is one word, as the header probe splits them
    expect(shell).toContain('<p className="st-ask-view">{ASK_VIEW_ONLY}</p>');
    // Under the input row, before the chips: the line a visitor reads while typing.
    expect(shell.indexOf("{ASK_VIEW_ONLY}")).toBeGreaterThan(shell.indexOf('id="st-ask-in"'));
    expect(shell.indexOf("{ASK_VIEW_ONLY}")).toBeLessThan(shell.indexOf('className="st-ask-chips"'));
    // The bug's class (the DD: "shorten it, not hide it"): the line must never pick up a hiding rule.
    expect(rulesFor("st-ask-view").length).toBeGreaterThan(0);
    for (const rule of rulesFor("st-ask-view")) expect(rule).not.toMatch(/display:\s*none|visibility:\s*hidden|clip|position:\s*absolute|width:\s*1px|opacity:\s*0\b|font-size:\s*0/);
    expect(shell).not.toMatch(/st-sr-only[^\n]*ASK_VIEW_ONLY|ASK_VIEW_ONLY[^\n]*st-sr-only/);
    const row = read("docs/claims.md").split("\n").find((l) => l.startsWith("| as-view-only |"))!;
    expect(row.split("|")[2]!.trim()).toBe(ASK_VIEW_ONLY);
    // The full sentence stays the box's screen-reader description.
    expect(shell).toContain('aria-describedby="st-ask-idle"');
    expect(shell).toContain('<span id="st-ask-idle" className="st-sr-only">{ASK_IDLE}</span>');
    expect(ASK_IDLE).toBe("Views only: nothing you type here can pay, approve or change a limit.");
  });

  it("empty_live_region_takes_no_room: before any ask the note under the box reserves no margin and no line", () => {
    expect(shell).toMatch(/<p ref=\{ask\?\.noteRef\} className="st-ask-note" aria-live="polite"[^>]*>\{ask\?\.note\}<\/p>/);
    expect(css).toContain(".st-ask-note:empty { margin: 0; min-height: 0; }");
  });

  it("gutter_is_one_s2: AG insets each card half a gutter, the shell draws the same, and each frame carries the gutter's track", () => {
    expect(GUTTER_PX).toBe(16); // --s-2
    const theme = read("web/src/studio/theme.ts");
    expect(theme).toContain("studioWidgetPadding: GUTTER_PX / 2,");
    expect(theme).toContain("studioWrapperSpacing: 0,");
    expect(shell).toContain("left: `calc(${(p.xTrack / COLUMNS) * 100}% + ${G})`, top: p.yTrack * TRACK_PX + GUTTER_PX / 2, width: `calc(${(p.xSpan / COLUMNS) * 100}% - ${GUTTER_PX}px)`, height: p.ySpan * TRACK_PX - GUTTER_PX");
    for (const phone of [true, false]) for (const session of [true, false]) {
      for (const p of Object.values(layoutFor(phone, session))) expect(p.ySpan).toBeGreaterThan(GUTTER_TRACKS);
    }
  });
});
