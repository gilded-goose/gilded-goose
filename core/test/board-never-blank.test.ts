// The board's counter is never blank and never "Reading" for good (Lead-12 and Track P, Fri Nov 6). On live, one WebKit load
// in 13 kept the ledger board at "Reading the record…" past 30 s: it waited on one /api/challenge answer with no end, and a
// stalled request (no error, no status) never ends. And a lost board chunk left no counter at all. Rule for the class: every
// count on a board shows a number, a loading line that ends, or a named error. scripts/board-faults.ts drives both in a browser.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { within } from "../../web/src/studio/within.ts";
import { BOARD_LOADING, BOARD_UNAVAILABLE } from "../../web/src/studio/board-first-words.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const code = (p: string) => read(p).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

describe("a read the board waits on has an end", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("a stalled answer reads as null once its time is up, a failed one at once, a good one as itself", async () => {
    vi.useFakeTimers();
    const stalled = within(new Promise<number>(() => {}), 6000);
    let got: number | null | undefined;
    void stalled.then((v) => { got = v; });
    await vi.advanceTimersByTimeAsync(5999);
    expect(got).toBeUndefined(); // control: still waiting a moment before its end
    await vi.advanceTimersByTimeAsync(1);
    expect(got).toBeNull();
    await expect(within(Promise.reject(new Error("network")), 6000)).resolves.toBeNull();
    await expect(within(Promise.resolve(7), 6000)).resolves.toBe(7);
  });

  it("the feed bounds both the early answer and its own ask, aborts a stalled ask, and asks again soon after a first failure", () => {
    const feed = code("web/src/studio/threat-state.tsx");
    expect(feed).toContain("let body = early ? await within(early, READ_MS) : null;");
    expect(feed).toContain('body = await within(fetch("/api/challenge", { credentials: "same-origin", headers: { accept: "application/json" }, signal: stop.signal }).then((r) => (r.ok ? r.json() : null)), READ_MS);');
    expect(feed).toContain("if (!body) stop.abort();");
    expect(feed).toContain("next(failed++ === 0 ? FIRST_RETRY_MS : RETRY_MS);");
    expect(feed).not.toMatch(/await early\b(?!,)/); // no unbounded wait on the early answer
    // "Reading" lasts two reads at most before the line names the failure, then the board asks again within seconds.
    const n = (name: string) => Number(feed.match(new RegExp(`const ${name} = ([\\d_]+);`))?.[1]?.replace(/_/g, ""));
    expect(2 * n("READ_MS") + n("FIRST_RETRY_MS")).toBeLessThanOrEqual(20_000);
  });

  it("a lost board chunk or a board that throws keeps the counter, with the record's count or the named failure", () => {
    const slot = code("web/src/studio/ThreatSlot.tsx");
    expect(slot).toContain('lazy(() => import("./ThreatBoard.tsx").catch(() => ({ default: BoardHeld })))');
    expect(slot).toContain("<Kept or={<BoardHeld />}>");
    expect(slot).toContain('<BoardFirst words={earlyWords()} mark="held" failed />');
    const first = code("web/src/studio/BoardFirst.tsx");
    expect(first).toContain("words ? `${words.tries}${words.outcome ? \" \" : \"\"}` : failed ? BOARD_UNAVAILABLE : BOARD_LOADING");
    expect([BOARD_LOADING, BOARD_UNAVAILABLE].every((w) => w.length > 0)).toBe(true);
  });

  it("class: a part that can't come names its loss; lazyOr's and Kept's defaults raise the page's strip, never a silent nothing", () => {
    const online = code("web/src/states/online.ts");
    expect(online).toContain("lost: ComponentType<any> = PartLost)");
    expect(online).toContain("document.documentElement.dataset.partLost = \"\";");
    expect(online).toContain('dispatchEvent(new Event("vite:preloadError"));');
    expect(code("web/src/kept.ts")).toContain("this.props.or ?? createElement(PartLost)");
    // A part lost before the strip is mounted is named all the same.
    const mount = code("web/src/states/mount.ts");
    expect(mount).toContain("const chunkLost = () => { lost = lostChunk(lost); };");
    expect(mount).toContain('addEventListener("vite:preloadError", () => { chunkLost(); draw(); });');
    expect(mount).toContain('if ("partLost" in document.documentElement.dataset) chunkLost();');
    expect(code("web/src/desk/Desk.tsx")).toContain("lost: ComponentType<P> = PartLost as ComponentType<P>, threw");
  });

  it("sweep: no lazy part or boundary anywhere in the site falls back to nothing", () => {
    const files = execFileSync("git", ["ls-files", "web/src"], { cwd: new URL("../../", import.meta.url), encoding: "utf8" })
      .split("\n").filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts"));
    expect(files.length).toBeGreaterThan(50); // control: the sweep reads the site, not an empty list
    let calls = 0;
    for (const f of files) {
      const src = code(f);
      calls += (src.match(/\blazyOr\(/g) ?? []).length;
      for (const line of src.split("\n").filter((l) => /\blazyOr\(/.test(l))) expect(line, f).not.toMatch(/=>\s*null\)|:\s*null\)\)|,\s*\(\)\s*=>\s*null/);
      expect(src, f).not.toMatch(/\bor=\{null\}/);
      expect(src, f).not.toMatch(/ComponentType<[^>]*>\s*=\s*\(\(\)\s*=>\s*null\)/); // a lazy helper's own silent default (Desk's `early` had one)
    }
    expect(calls).toBeGreaterThan(10); // control: the lazy parts were found
  });

  it("sweep: no boundary in the board's folder draws nothing", () => {
    for (const f of ["ThreatSlot.tsx", "Shell.tsx", "ShellBoard.tsx", "ThreatBoard.tsx", "BoardFirst.tsx", "threat-widgets.tsx"]) {
      const src = code(`web/src/studio/${f}`);
      expect(src, f).not.toMatch(/failed \? null :|threw \? null :|getDerivedStateFromError[\s\S]{0,200}?\? null :/);
    }
  });
});
