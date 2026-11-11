// A room named in the address (`?desk=1#wants`) paints its head before the Desk's code, on a cover over the page
// (web/prerender.ts, Track F, Round 5's a11y-perf seat). The head is drawn twice, so the words must be one; the cover must
// never be able to outlive its room or take a tap; and every way a room can arrive, or fail to, has to lift it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MENU_ACTIONS } from "../src/view/menu.ts";
import { ROOM_HEADS, ROOM_N, roomFirstCss, roomHeadsChanged } from "../../web/src/desk/room-heads.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const src = (f: string) => read(`web/src/${f}`);

describe("the room's first paint", () => {
  it("room_heads_are_real_rooms: each names a menu action, so the Desk opens it and lifts the cover", () => {
    for (const room of Object.keys(ROOM_HEADS)) expect(MENU_ACTIONS).toContain(room);
  });

  it("room_heads_say_what_the_rooms_say: the build stops if a head parts from its room's source", () => {
    expect(roomHeadsChanged(src)).toBeNull();
    for (const [file, was, now] of [
      ["desk/Panes.tsx", ">Your wants</h1>", ">Your list</h1>"],
      ["desk/Panes.tsx", ">Your week</h1>", ">This week</h1>"],
      ["desk/Panes.tsx", ">{LIMITS_NAME}</h1>", ">Limits</h1>"],
      ["desk/story/ChallengeStart.tsx", 'CH_HEAD = "Try to trick Goose."', 'CH_HEAD = "Trick Goose."'],
      ["desk/story/ChallengeStart.tsx", 'CH_EYEBROW = "The challenge"', 'CH_EYEBROW = "A challenge"'],
      ["after/AfterPay.tsx", "{AFTER_TITLE}</h1>", "After</h1>"],
    ] as const) {
      expect(src(file), was).toContain(was);
      expect(roomHeadsChanged((f) => (f === file ? src(f).replaceAll(was, now) : src(f))), was).toMatch(/no longer matches/);
    }
  });

  it("room_cover_cant_outlive_its_room: no tap, no tab, no reading, and it hides itself if the Desk never comes", () => {
    const css = roomFirstCss();
    expect(css).toMatch(/#dk-room-first\{[^}]*pointer-events:none/);
    expect(css).toMatch(/#dk-room-first\{[^}]*animation:dk-case-out 0s 8s forwards/);
    // A later rule naming the cover itself would stop that 8 s (it did: `#dk-room-first,#dk-room-first *{animation:none!important`).
    expect(css).not.toMatch(/#dk-room-first(,[^{]*)?\{[^}]*animation:none/);
    expect(read("web/index.html")).toMatch(/@keyframes dk-case-out \{ to \{ visibility: hidden; \} \}/);
    expect(src("desk/first-paint.tsx")).toMatch(/<div id="dk-room-first" aria-hidden="true" inert>/);
    // No id on it: the page's own #main, #ds-ch-h and #ap-room-h stay the only ones of their names.
    expect(src("desk/first-paint.tsx")).not.toMatch(/data-room-head=\{room\}[\s\S]{0,200}\bid=/);
  });

  it("room_cover_lifts_on_every_arrival: found, never found, her own scroll, and a Desk that didn't load", () => {
    const desk = src("desk/Desk.tsx");
    const room = desk.slice(desk.indexOf("const focusHead"), desk.indexOf("requestAnimationFrame(() => focusHead(0))"));
    expect(room.match(/roomArrived\(\)/g)).toHaveLength(2);
    const land = desk.slice(desk.indexOf("const land = (n: number)"), desk.indexOf("requestAnimationFrame(() => land(0))"));
    expect(land.match(/roomArrived\(\)/g)).toHaveLength(3);
    // The head is looked for in the page, never on the cover that wears its class.
    expect(room).toContain('"#root .dk-work .dk-pane-h"');
    expect(src("main.tsx")).toMatch(/const uncover = [^\n]*roomArrived\(\)/);
    expect(src("main.tsx")).toMatch(/import\("\.\/desk\/Desk\.tsx"\)[^\n]*uncover\(\)/);
  });

  it("room_cover_costs_only_its_room: every route downloads index.html, so the cover never goes back in it", () => {
    const prerender = read("web/prerender.ts");
    expect(prerender).toMatch(/"first\/room-"\+N\+"\.html"/);
    expect(prerender).toMatch(/`room-\$\{room\}\.html`/);
    // A file that lands after the room adds no cover: the place script asks for the attribute roomArrived takes away.
    expect(prerender).toMatch(/if\(t&&h\.hasAttribute\("data-first-room"\)\)/);
    expect(src("desk/room-first.ts")).toMatch(/removeAttribute\("data-first-room"\)/);
    expect(prerender).not.toMatch(/<template id="desk-room">/);
  });

  it("dark_egg_fades_only_if_it_was_up: 160 ms on the slow path, and nothing at all on a visit with no opening", () => {
    expect(read("web/index.html")).toMatch(/html\.dk-fade #dk-case \{ animation: dk-case-fade 160ms forwards; \}/);
    expect(read("web/prerender.ts")).toMatch(/if\(h\.classList\.contains\("dk-opening"\)\)h\.classList\.add\("dk-fade"\);h\.classList\.remove\("dk-opening"\)/);
  });

  it("room_chunks_start_with_the_desks: the story doesn't wait for a first paint she won't see", () => {
    // The story's chunk is found by its source key or, when Vite keys it by file (it holds ChallengeStart.tsx since Nov 5), by file.
    expect(read("web/prerender.ts")).toContain(`const storyKey = manifest["src/desk/story/Story.tsx"] ? "src/desk/story/Story.tsx" : Object.keys(manifest).find((k) => manifest[k]!.isDynamicEntry && /^assets\\/Story-[\\w-]+\\.js$/.test(manifest[k]!.file));`);
    expect(read("web/prerender.ts")).toMatch(/ROOM_CHUNKS: Record<string, string\[\]> = \{ after: roomFiles\("src\/after\/AfterPay\.tsx"\), challenge: roomFiles\(storyKey, "src\/desk\/story\/Challenge\.tsx"\), wants: roomFiles\(panesKey, "src\/desk\/DeskState\.tsx"\) \}/);
    // Arriving for the Challenge or its "What counts, what's kept" fold (#kept, Track C), the story doesn't wait either.
    expect(src("desk/story/index.tsx")).toMatch(/if \(location\.hash === "#challenge" \|\| location\.hash === "#kept"\) \{ done\(\); return; \}/);
  });

  // Three bugs of Joshua's 3d (Wed Nov 4), each found by the cold drill's step check, which `pnpm check` doesn't run.
  it("arriving_at_the_challenge_jumps: its start is drawn from the first frame, so found at once no longer means in place", () => {
    // The glide lifted the cover with the head still 475 px away.
    expect(src("desk/Desk.tsx")).toMatch(/const arrived = document\.documentElement\.hasAttribute\("data-first-room"\);\s+scrollTo\(\{ top, behavior: n === 0 && !arrived && !still\(\)/);
  });

  it("the_challenges_cover_follows_its_phone_size: the same smaller head, the same less air, under the same 430", () => {
    expect(src("desk/story/hero.css")).toContain("@media (max-width: 430px) { .ds-h2 { font-size: var(--t-sec); } }");
    const css = roomFirstCss();
    expect(css).toContain("@media (max-width:430px){#dk-room-first [data-room-head=challenge]{padding-top:0}");
    expect(css).toContain("#dk-room-first [data-room-head=challenge] .dk-pane-h{font-size:var(--t-sec)}");
    expect(css).toContain("#dk-room-first [data-room-head=challenge] .dk-eyebrow{margin-bottom:var(--s-1)}");
  });

  it("the_challenges_cover_follows_push_17s_challenge: the room's own size and air at each width, held to hero.css's rules", () => {
    // Push 17 led the story with the Challenge and restyled it, and the cover kept the old look: from 721 px its label sat
    // 80 px low with a head 6 to 12 px too big, and at 390 its lede 16 px low (F's cover-vs-room boxes on f023d563, Nov 6).
    const hero = src("desk/story/hero.css");
    const css = roomFirstCss();
    expect(hero).toContain("@media (min-width: 721px) {\n  .dk-hero { padding-bottom: var(--s-6); }\n  .ds-ch { padding-top: var(--s-2); }\n  .ds-ch .ds-h2 { font-size: var(--t-h2); }\n}");
    expect(css).toContain("#dk-room-first [data-room-head=challenge]{margin-top:-15px}");
    expect(css).toContain("@media (max-width:720px){#dk-room-first [data-room-head=challenge]{margin-top:0;padding-top:calc(57px - var(--s-3))}}");
    expect(css).toContain("#dk-room-first [data-room-head=challenge] .dk-pane-h{font-weight:var(--w-display);font-size:var(--t-h2);line-height:1.06;");
    expect(css).not.toContain("--t-h1");
    expect(hero).toContain("@media (max-width: 430px) { .ds-ch { row-gap: var(--s-2); } .ds-ch .ds-lede { margin-top: var(--s-2); } }");
    expect(css).toContain("#dk-room-first [data-room-head=challenge] .ds-lede{margin-top:var(--s-2)}}");
  });

  it("cold_routes_judges_a_room_on_its_largest_paint: its head on the cover is not the room (Lead-12, Nov 6)", () => {
    // Judged on the head alone, #challenge printed "ok" at 560 ms with its counter, the largest paint, at 2928 ms on live.
    const tool = read("scripts/cold-routes.ts");
    const verdict = tool.match(/const over = ([^;]+);/)?.[1];
    expect(verdict).toBe("!(lcp <= BUDGET) || (head !== undefined && !(room <= BUDGET))");
    expect(tool).not.toMatch(/head \? room : lcp/);
  });

  it("the_challenges_cover_wears_its_number: its place among the numbered sections, with the counter's own look", () => {
    // Before Nov 6 the cover's label had no number, and "03" came in at the lift, pushing the label 30 px right. Push 17
    // moved the Challenge to the story's top, so a hard "03" went stale: the number is read from Story.tsx's order.
    const story = src("desk/story/Story.tsx");
    const order = [...story.matchAll(/^\s+<([A-Z]\w*)[ />]/gm)].map((m) => m[1]!);
    const FILE: Record<string, string> = { Promises: "PromisesStart.tsx", Week: "Week.tsx", TrickSlot: "TrickSlot.tsx", Impact: "Impact.tsx" };
    const before = order.slice(0, order.indexOf("TrickSlot") + 1);
    for (const c of before) expect(FILE[c], `${c} comes before the Challenge: say whether it is numbered`).toBeDefined();
    const numbered = before.filter((c) => src(`desk/story/${FILE[c]}`).includes('className="dk-eyebrow ds-eyebrow ds-n"'));
    expect(numbered.at(-1)).toBe("TrickSlot");
    expect(ROOM_N).toBe(String(numbered.length).padStart(2, "0"));
    expect(src("desk/story/hero.css")).toContain(".ds .ds-n::before { content: counter(ds-n, decimal-leading-zero); margin-right: var(--s-2); font-variant-numeric: tabular-nums; color: var(--ink-3); }");
    expect(roomFirstCss()).toContain('#dk-room-first [data-room-head=challenge] .dk-eyebrow::before{content:"01";margin-right:var(--s-2);font-variant-numeric:tabular-nums;color:var(--ink-3)}');
  });

  it("the_challenges_cover_waits_for_the_challenge: lifted for its lines-only start, the counter went and came back", () => {
    const desk = src("desk/Desk.tsx");
    const land = desk.slice(desk.indexOf("const land = (n: number)"), desk.indexOf("requestAnimationFrame(() => land(0))"));
    expect(land).toContain('if (n < 180 && document.documentElement.hasAttribute("data-first-room") && !el.querySelector(".ds-ch-count")) { requestAnimationFrame(() => land(n + 1)); return; }');
    // ChallengeStart has no counter, and the Challenge always has one (its words, or its placeholder): the wait ends.
    expect(src("desk/story/ChallengeStart.tsx")).not.toContain("ds-ch-count");
    expect(src("desk/story/Challenge.tsx")).toMatch(/<p className="ds-small ds-ch-count" data-tried="unknown">[\s\S]{0,80}<div className="ds-ch-count" aria-hidden="true">/);
  });

  it("the_story_eyebrow_outranks_the_desks: moved into the first sheet it comes before .dk-eyebrow, on the same element", () => {
    expect(src("desk/story/hero.css")).toMatch(/^\.ds \.ds-eyebrow \{ margin: 0 0 var\(--s-3\); \}/m);
  });

  it("index_html_has_one_preloader: every route downloads it, and each list's copy cost all eleven", () => {
    const prerender = read("web/prerender.ts");
    expect(prerender.match(/createElement\("link"\)/g)).toHaveLength(1);
    expect(prerender).toContain("${preloader}${deskPreload}"); // defined before the first list that calls it
    expect(prerender.match(/__pl\(/g)!.length).toBeGreaterThanOrEqual(6);
  });
});

// The head script itself, run: every page in main.tsx's table against the one thing only the landing may start.
describe("the opening's dark egg", () => {
  const script = /<script>(\(function\(\)\{var q=new URLSearchParams\(location\.search\).*?\}\)\(\))<\/script>/s.exec(read("web/index.html"))![1]!;
  // The page's first script defines what this one reads ($q, $h, $P, $R), so the two run together, as they do in the page.
  const defines = /<script>(var \$q=.*?)<\/script>/s.exec(read("web/index.html"))![1]!;
  const opens = (search: string) => {
    const on = new Set<string>();
    const noop = { add() {}, remove() {} };
    const document = { documentElement: { classList: { add: (c: string) => on.add(c), remove: (c: string) => on.delete(c) } }, body: { classList: noop } };
    const location = { search, pathname: "/", hash: "" };
    new Function("location", "document", "history", "sessionStorage", "matchMedia", "setTimeout", `${defines};${script}`)(
      location, document, { replaceState() {} }, { getItem: () => null }, () => ({ matches: false }), () => 0,
    );
    return on.has("dk-opening");
  };
  it("starts only on the landing: a page with no hero egg would sit under it for six seconds", () => {
    const pages = [...src("main.tsx").matchAll(/\["(\w+)", \[\(\) => import/g)].map((m) => m[1]!);
    expect(pages).toContain("builders");
    expect(pages.length).toBeGreaterThanOrEqual(9);
    for (const d of pages) expect([d, opens(`?desk=${d}`)]).toEqual([d, false]);
    for (const landing of ["", "?desk=1", "?utm_source=devpost"]) expect([landing, opens(landing)]).toEqual([landing, true]);
  });
});
