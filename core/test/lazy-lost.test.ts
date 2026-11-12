// A plain React.lazy whose chunk is lost throws, and with nothing to catch it React unmounts the whole page (Round 5, found by
// aborting one chunk at a time: the Egg, the Story, Real prices or After you pay emptied the Desk, Approve and all). So every lazy in
// web/src says what's drawn when its chunk never comes: `lazyOr`, its own catch, or a boundary in the same file.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../web/src");
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
});
/** A boundary around what they load: these fail to their own quiet state, in the file that says so. */
const CAUGHT = new Set(["SessionLedger.tsx", "studio/ThreatSlot.tsx", "studio/threat-widgets.tsx", "desk/story/TrickSlot.tsx"]);

/** The lazy( calls in a source that have no way to fail: nothing on their line catches, and they aren't this file's own helper. */
export const bare = (src: string) => src.split("\n").filter((l) => /(?<![\w.])lazy\(/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l) && !/\.catch\(|\.then\([^;]*,\s*\(\)\s*=>/.test(l));

describe("no lazy can empty a page", () => {
  it("the check sees a bare lazy, and passes a caught one", () => {
    expect(bare('const A = lazy(() => import("./a.tsx"));')).toHaveLength(1);
    expect(bare('const A = lazy(() => get().catch(() => ({ default: lost })));')).toHaveLength(0);
    expect(bare('const A = lazy(() => k().then((m) => ({ default: m.A }), () => ({ default: B })));')).toHaveLength(0);
    expect(bare('const A = lazyOr(() => import("./a.tsx"));')).toHaveLength(0);
  });
  it("every lazy in web/src has a lost path", () => {
    const found = files(root).flatMap((p) => {
      const name = p.slice(root.length + 1);
      return CAUGHT.has(name) ? [] : bare(readFileSync(p, "utf8")).map((l) => `${name}: ${l.trim()}`);
    });
    expect(found).toEqual([]);
  });
  it("what's excused really has a boundary", () => {
    for (const name of ["SessionLedger.tsx", "studio/ThreatSlot.tsx", "desk/story/TrickSlot.tsx"]) expect(readFileSync(join(root, name), "utf8"), name).toMatch(/ErrorBoundary|extends Component|\.catch\(/);
    expect(readFileSync(join(root, "studio/ThreatSlot.tsx"), "utf8")).toContain("ThreatBoard");
  });
});

describe("a page that throws never empties it", () => {
  const src = (f: string) => readFileSync(join(import.meta.dirname, "../../web/src", f), "utf8");
  it("every page root in main.tsx and safe-main.tsx is held; only the lines drawn when a page didn't load stand alone", () => {
    for (const f of ["main.tsx", "safe-main.tsx"]) {
      const drawn = [...src(f).matchAll(/(?:mount\([^,]+, |\broot\.render\()<(\w+)/g)].map((m) => m[1]);
      expect(drawn.length, f).toBeGreaterThan(0);
      expect(drawn.filter((d) => d !== "Held" && d !== "HeldLine" && d !== "WalletMissed"), f).toEqual([]);
    }
    // Control: the walk's nine pages are all reached by one of these two forms, so a new form of mounting fails the count.
    expect([...src("main.tsx").matchAll(/<Held\b/g)]).toHaveLength(5);
  });
  it("Try again reloads, since a link to the address she's on only jumps to its hash when it has one", () => {
    expect(src("held.tsx")).toContain("location.reload()");
    for (const f of ["main.tsx", "safe-main.tsx", "held.tsx"]) expect(src(f).match(/<a href=\{location\.href\}>/g), f).toBeNull();
  });
  it("offline wins, and a cover can't hide the words", () => {
    expect(src("held.tsx")).toMatch(/navigator\.onLine \? <><TryAgain \/>\.<\/> : ROOM_LOST\.offline/);
    expect(src("main.tsx")).toContain("<Held onThrow={uncover}><Desk /></Held>");
  });
});

describe("a throw in one part of the Desk keeps the Desk and the conversation", () => {
  const src = (f: string) => readFileSync(join(import.meta.dirname, "../../web/src", f), "utf8");
  const code = (f: string) => src(f).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l));
  it("every part that waits on a chunk is held under its own Suspense: a new one without its boundary fails here", () => {
    const desk = code("desk/Desk.tsx").filter((l) => /<Suspense\b/.test(l));
    expect(desk.length).toBeGreaterThan(5); // control: the rule still sees them
    expect(desk.filter((l) => !/<Kept\b/.test(l))).toEqual([]);
    expect(src("desk/story/index.tsx")).toMatch(/<Kept or=\{[^\n]*<Story onAsk=\{onAsk\} \/><\/Kept>/);
  });
  it("every other part the Desk draws is held, but for what only says words", () => {
    const body = src("desk/Desk.tsx").slice(src("desk/Desk.tsx").indexOf('<div ref={rootRef} className="dk"'));
    const inside = new Set(["Kept", "Suspense", "Use", "Fragment", "Landing", "PlainAction", "AskingLine", "RoomWait", "RoomThrew", "CartSays", "LinkBtn"]);
    const parts = [...new Set([...(src("desk/Desk.tsx").slice(src("desk/Desk.tsx").indexOf("const askBox")).matchAll(/<([A-Z]\w+)(\.Now)?\b/g))].filter((m) => !m[2] && !inside.has(m[1]!)).map((m) => m[1]!))];
    expect(parts.length, "control: the rule still sees them").toBeGreaterThan(5);
    for (const p of parts) expect(src("desk/Desk.tsx"), p).toMatch(new RegExp(`<Kept(?: or=\\{[^\\n]*?\\})?><${p}\\b`));
    expect(body).toContain("<Kept><SiteNav");
  });
  it("a room that threw offers Back to Goose, online too: a reload would cost the conversation she's kept", () => {
    const desk = src("desk/Desk.tsx");
    for (const room of ["WeekPane", "WantsPane", "SettingsPane"]) expect(desk).toMatch(new RegExp(`const ${room} = early<.*, RoomLost, RoomThrew\\);`));
    expect(desk).toContain("<Kept or={<RoomThrew />}><AfterPay room");
    expect(desk).toContain("{online && !threw\n");
    // Each part's own boundary: \`early\` holds every part made with it.
    expect(desk).toMatch(/const Now = [^\n]*\n\s*<Kept or=\{createElement\(threw,/);
  });
  it("the boundary carries no stylesheet, so it can't change a first paint's sheets", () => {
    expect(src("kept.ts")).not.toMatch(/\.css/);
  });
});
