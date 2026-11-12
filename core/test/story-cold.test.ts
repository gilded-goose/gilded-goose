// No page runs the Watcher as its chunk loads (Track P, Fri Nov 6; Round 6b Motion at 390). Story.tsx called scrollStory() at
// module scope, so the Watcher's rules made their first, cold pass (each pattern compiled on first use) inside the Desk's
// opening: one 386 ms long task on a 4x phone, the scorecard's 408 ms. The week is fixed, so the build runs it
// (web/story-data.ts, `virtual:goose-story`) and the page reads the answer. Rule for the class: a module's top level in
// web/src never calls a function from a file that runs the Watcher; the Watcher runs when she acts, or at build.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STORY_ITEM, scrollStory, weekMoments } from "../src/view/scroll.ts";
import { MOVING_ITEMS, priceOn } from "../src/sellers/moving.ts";
import { BEAT_DAY } from "../src/ask/watching.ts";
import { verdictOf, watch } from "../src/trust/watch.ts";
import { builtStory, storyData } from "../../web/story-data.ts";

const root = new URL("../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

// The Watcher's own file (trust/src/watch.ts; core re-exports it) and every core file that calls it (`watch(`): any
// function they export may run it.
const WATCHER_FILES = ["trust/src/watch.ts", ...execFileSync("git", ["grep", "-l", "\\bwatch(", "--", "core/src"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean)];
const RUNNERS = [...new Set(WATCHER_FILES.flatMap((f) => [...read(f).matchAll(/^export (?:async )?function (\w+)|^export const (\w+) = (?:async )?\(/gm)].map((m) => (m[1] ?? m[2])!)))];

/** Each top-level statement of a module: a line at column 0 and the indented lines under it (a function's body is skipped). */
function topLevel(src: string): string[] {
  const out: string[] = [];
  for (const line of code(src).split("\n")) {
    if (/^\S/.test(line)) out.push(line);
    else if (out.length && line.trim()) out[out.length - 1] += `\n${line}`;
  }
  return out.filter((s) => !/^(export )?(default )?(async )?(function|class|interface|type|import|declare)\b/.test(s));
}
const callsRunner = (stmt: string) => RUNNERS.find((r) => new RegExp(`(?<![\\w.])${r}\\(`).test(stmt.replace(/=>[\s\S]*$/, "")));

describe("no page runs the Watcher as its chunk loads", () => {
  it("the build's story is a fresh run's, word for word, and survives the trip into the bundle", () => {
    const built = builtStory();
    const story = scrollStory();
    expect(built).toEqual({ story, week: weekMoments(story) });
    expect(JSON.parse(JSON.stringify(built))).toEqual(built);
    expect(built.story.scam.verdict).toBe("refuse"); // control: the Watcher's answer is in it
  });

  it("the bundle's verdicts are the Watcher's own, seller by seller, so the build's copy can never drift (Lead-12)", () => {
    // What the plugin writes into the bundle, read back as the page reads it.
    const text = (storyData().load as (id: string) => string | null)("\0virtual:goose-story");
    const shipped = JSON.parse(text!.replace(/^export default /, "").replace(/;$/, "")) as ReturnType<typeof builtStory>;
    // A live run: the Watcher itself on every seller listing on the beat day, not through scrollStory.
    const item = MOVING_ITEMS.find((i) => i.id === STORY_ITEM)!;
    const live = item.sellers.filter((s) => priceOn(s.curve, BEAT_DAY)).map((s) => {
      const flags = watch({ quoted: s.note, merchant: s.name, history: s.history });
      const verdict = verdictOf(flags);
      return { id: s.sellerId, verdict, why: verdict === "clear" ? null : [...new Set(flags.filter((f) => f.severity === verdict).map((f) => f.said))].join("; ") };
    });
    const drift = (s: typeof shipped) => live.flatMap((l) => {
      const got = s.story.sellers.find((x) => x.id === l.id);
      return got && got.verdict === l.verdict && got.why === l.why ? [] : [`${l.id}: shipped ${got?.verdict}/${got?.why}, the Watcher says ${l.verdict}/${l.why}`];
    });
    expect(live.length).toBeGreaterThanOrEqual(3); // control: the beat day has sellers
    expect(live.map((l) => l.verdict)).toEqual(expect.arrayContaining(["clear", "refuse"])); // control: both answers are tried
    expect(shipped.story.sellers.length).toBe(live.length);
    expect(drift(shipped)).toEqual([]);
    expect(shipped.story.scam.verdict).toBe(live.find((l) => l.id === shipped.story.scam.id)!.verdict);
    // Control: a shipped copy with one verdict changed is caught.
    const tampered = structuredClone(shipped);
    tampered.story.sellers[0]!.verdict = tampered.story.sellers[0]!.verdict === "clear" ? "refuse" : "clear";
    expect(drift(tampered)).toHaveLength(1);
  });

  it("Story reads the build's week and runs nothing of the Watcher's; the plugin is in the build", () => {
    const story = code(read("web/src/desk/story/Story.tsx"));
    expect(story).toContain('import built from "virtual:goose-story";');
    expect(story).toContain("const { story: STORY, week: WEEK } = built;");
    expect(story).not.toMatch(/\b(scrollStory|weekMoments)\(/);
    expect(code(read("web/vite.config.ts"))).toMatch(/plugins: \[[^\]]*\bstoryData\(\)/);
  });

  it("class: no module's top level in web/src calls a function that may run the Watcher", () => {
    expect(RUNNERS).toEqual(expect.arrayContaining(["watch", "scrollStory", "weekMoments"])); // control: the list is real
    // Control: the old line is caught, a call inside a function or an arrow's body is not.
    expect(callsRunner(topLevel("const STORY = scrollStory();")[0]!)).toBe("scrollStory");
    expect(topLevel("export function f() {\n  return scrollStory();\n}").map(callsRunner).filter(Boolean)).toEqual([]);
    expect(topLevel("const later = () => scrollStory();").map(callsRunner).filter(Boolean)).toEqual([]);
    const files = execFileSync("git", ["ls-files", "web/src"], { cwd: root, encoding: "utf8" }).split("\n").filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts"));
    expect(files.length).toBeGreaterThan(50); // control: the sweep reads the site
    const hits = files.flatMap((f) => topLevel(read(f)).flatMap((s) => { const r = callsRunner(s); return r ? [`${f}: ${r}( in ${s.split("\n")[0]}`] : []; }));
    expect(hits).toEqual([]);
  });
});
