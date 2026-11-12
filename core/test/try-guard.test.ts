// Try the guard in your browser (the white site's Builders page). What the page promises, held without a browser: the verdict
// words are the site's own, the examples are notes the repo already cites and read as labelled, the two lines shown are lines
// the part runs, the box's cap, nothing in the part can send, store, log or draw markup, the version is never typed, and
// the part is its own chunk that the Builders page only asks for. The browser half is scripts/try-guard-walk.ts; that the
// code is the published package's is trust/test/published.test.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readSeller } from "@gilded-goose/trust";
import { SELLER_READS } from "../../web/src/builders/builders.ts";
import { CAP_SAID, CHANGED_CODE, LOST, CODE_LINES, CODE_MISSES, CODE_ONLY, EXAMPLES, NOTE_CAP, NOTHING_SENT, SAME_AS_PUBLISHED, SAME_CODE, TRY_WORDS, capNote, sameCode } from "../../web/src/site/builders/try-guard-words.ts";
import { hrefOf } from "../../web/src/site/route.ts";
import { stampWords, verdictOf } from "../../web/src/site/ui/stamp.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const part = read("web/src/site/builders/TryGuard.tsx");
const words = read("web/src/site/builders/try-guard-words.ts");
const page = read("web/src/site/builders/Builders.tsx");
/** A source with its comments taken out, so a rule about code isn't tripped by a sentence about it. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

describe("try the guard: the verdict", () => {
  it("puts the package's three verdicts in the site's own stamp words", () => {
    expect((["refuse", "hold", "clear"] as const).map((v) => stampWords(verdictOf(v, false)))).toEqual(["Set aside", "Waits for your yes", "Clear"]);
    expect(part).toContain("stampWords(verdictOf(shown.verdict, false))");
    // No second set of verdict words in the part: the three come from ui/stamp.ts or not at all.
    for (const w of ["Set aside", "Waits for your yes", "Held"]) expect(code(part) + code(words)).not.toContain(w);
  });
  it("draws the stamp, the button and the Proof link as the site's own parts do", () => {
    // The part imports none of the three (an import of the entry chunk costs the Builders page a preload line), so it is held to them here.
    const stamp = read("web/src/site/ui/Stamp.tsx");
    for (const cls of ['className="stamp"', 'className="stamp-die"', 'className="stamp-reason"', "data-verdict=", "data-struck="]) { expect(stamp).toContain(cls); expect(part).toContain(cls); }
    expect(read("web/src/site/ui/Button.tsx")).toContain("className={`btn${className ? ` ${className}` : \"\"}`} data-tone={tone} data-size={size}");
    expect(part).toContain('<button type="button" className="btn" data-tone="ink" data-size="m"');
    expect(hrefOf("proof")).toBe("#/proof");
    expect(part).toContain('<a href="#/proof">{PROOF_LINK}</a>');
    expect(code(part)).not.toMatch(/from "\.\.\/(ui\/(Button|Stamp)\.tsx|route\.ts)"/);
  });
  it("shows the reason and the limits the package returned, not words of its own", () => {
    expect(part).toContain("const { verdict, rule, reason, cantSee } = readSeller(note);");
    expect(part).toContain("{shown.reason}");
    expect(part).toContain("{shown.cantSee}");
  });
});

describe("try the guard: the examples", () => {
  it("are one scam, one honest and one tricky note the repo already cites, each read as labelled", () => {
    expect(EXAMPLES.map((e) => e.label)).toEqual(["A scam", "An honest note", "A tricky one"]);
    expect(EXAMPLES.map((e) => e.verdict)).toEqual(["refuse", "clear", "hold"]);
    for (const e of EXAMPLES) {
      expect(SELLER_READS.find((r) => r.note === e.note)?.verdict, e.note).toBe(e.verdict);
      expect(readSeller(e.note).verdict, e.note).toBe(e.verdict);
    }
  });
});

describe("try the guard: the two lines", () => {
  it("are lines the part runs, as written", () => {
    expect(CODE_LINES).toHaveLength(2);
    // `?own` is the one thing the part's import has that the shown line hasn't: a build mark for the same package (below).
    const ran = code(part).split("\n").map((l) => l.trim().replace('"@gilded-goose/trust?own"', '"@gilded-goose/trust"'));
    for (const line of CODE_LINES) expect(ran).toContain(line);
  });
  it("runs the package itself: `?own` only gives the chunk its own copy of the same source", () => {
    const plugin = read("web/own-copy.ts");
    expect(read("web/vite.config.ts")).toContain("plugins: [ownCopy(), react(),");
    // The mark is stripped before resolving, so it resolves as the bare package does, and only trust/src is ever copied.
    expect(plugin).toContain("this.resolve(marked ? source.slice(0, -MARK.length) : source");
    expect(plugin).toContain("const COPIED = /\\/trust\\/src\\/[\\w-]+\\.ts$/;");
    expect(read("web/src/site/builders/own-copy.d.ts")).toContain('export * from "@gilded-goose/trust";');
    // One user: a second `?own` importer would be a second copy of the rules, and should be a decision, not an accident.
    expect(code(part).match(/\?own/g)).toEqual(["?own"]);
  });
});

describe("try the guard: the cap", () => {
  it("keeps the first 2,000 characters and says when it left any out", () => {
    expect(capNote("a".repeat(NOTE_CAP))).toEqual({ note: "a".repeat(NOTE_CAP), cut: false });
    const over = capNote(`${"a".repeat(NOTE_CAP)}b`);
    expect(over).toEqual({ note: "a".repeat(NOTE_CAP), cut: true });
    expect(capNote("")).toEqual({ note: "", cut: false });
    expect(CAP_SAID).toContain(`${NOTE_CAP.toLocaleString("en-US")} characters`);
  });
  it("can't be used to hide a scam: padding past the Watcher's reach holds, and the scam's own words still refuse", () => {
    const scam = EXAMPLES[0]!.note;
    expect(readSeller(capNote(`${" ".repeat(NOTE_CAP - scam.length)}${scam}`).note).verdict).not.toBe("clear");
    expect(readSeller(capNote(`${scam}${"x".repeat(NOTE_CAP * 2)}`).note).verdict).toBe("refuse");
    expect(readSeller(capNote("x".repeat(NOTE_CAP * 2)).note)).toMatchObject({ verdict: "hold", rule: "too-long" });
    // Every way a note reaches the box goes through the cap: typed or pasted, and an example's tap.
    expect(part.match(/\bsetNote\(/g)).toEqual(["setNote("]);
    expect(part).toContain("onChange={(e) => take(e.target.value)}");
    expect(part).toContain("onClick={() => take(e.note)}");
  });
});

describe("try the guard: nothing leaves the page", () => {
  it("has no way to send, store or log in the part's files", () => {
    for (const src of [part, words]) {
      expect(code(src)).not.toMatch(/\bfetch\b|XMLHttpRequest|sendBeacon|WebSocket|EventSource|\bnavigator\b|localStorage|sessionStorage|indexedDB|\bcookie\b|\bconsole\b|postMessage|\bimport\(/);
      // No money path and no server: none of the site's API, pay, approve, receipt or undo code is imported.
      expect(code(src)).not.toMatch(/live\/|\/api|shop\/|paypal|approve|receipt|undo|tries-fold|offline/i);
    }
    expect([...code(part).matchAll(/from "([^"]+)"/g)].map((m) => m[1])).toEqual(["react", "react-dom/client", "@gilded-goose/trust?own", "../../../../trust/package.json", "../ui/stamp.ts", "./try-guard-words.ts", "./try-guard.css?inline"]);
    expect(NOTHING_SENT).toContain("Nothing is sent, stored or logged.");
  });
  it("draws everything as text: no HTML sink", () => {
    expect(code(part) + code(page)).not.toMatch(/dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
  });
});

describe("try the guard: what it says it is", () => {
  it("reads the package's name and version from trust/package.json, and types neither", () => {
    const pkg = JSON.parse(read("trust/package.json")) as { name: string; version: string };
    expect(part).toContain('import { name, version } from "../../../../trust/package.json";');
    expect(part).toContain("{sameCode(name, version)}");
    expect(SAME_CODE(pkg.name, pkg.version)).toBe(`This is the same guard code as ${pkg.name} ${pkg.version} on npm: a test checks each file readSeller runs against the published package.`);
    // The sentence written in advance for a Watcher fix that ships before its npm publish: one constant picks it, on purpose.
    expect(CHANGED_CODE(pkg.name, pkg.version)).toBe(`Built from the same source as ${pkg.name} ${pkg.version} on npm, plus changes not yet published.`);
    expect(sameCode(pkg.name, pkg.version)).toBe((SAME_AS_PUBLISHED ? SAME_CODE : CHANGED_CODE)(pkg.name, pkg.version));
    expect(words.match(/^export const SAME_AS_PUBLISHED: boolean = (true|false);$/m)).not.toBeNull();
    for (const src of [part, words]) expect(code(src)).not.toMatch(/\b\d+\.\d+\.\d+\b/);
    // The page's import is the workspace package, whose pure entry is the source the published files are compiled from.
    expect((JSON.parse(read("web/package.json")) as { dependencies: Record<string, string> }).dependencies["@gilded-goose/trust"]).toBe("workspace:*");
    expect((JSON.parse(read("trust/package.json")) as { exports: Record<string, string> }).exports["."]).toBe("./src/index.ts");
  });
  it("says it's the code-only guard, that the live site can add a reader, and that code alone misses some", () => {
    expect(CODE_ONLY).toContain("code-only guard");
    expect(CODE_ONLY).toContain("The live site can add an AI reader on top");
    expect(CODE_MISSES).toBe("Code alone misses some scam notes.");
    expect(part).toContain("{CODE_ONLY} {CODE_MISSES}");
    // No rate here: the figures are Proof's, with their fair notes beside them.
    for (const w of TRY_WORDS) expect(w).not.toMatch(/%|\bpercent\b|\d+ of \d+/);
  });
});

describe("try the guard: its own chunk", () => {
  it("is asked for by the Builders page, never imported with it", () => {
    expect(page).toContain('import("./TryGuard.tsx")');
    expect(code(page)).not.toMatch(/from "[^"]*(TryGuard|try-guard|trust)[^"]*"/);
    expect(page).toContain('<div ref={tryGuard as RefCallback<HTMLDivElement>} />');
    // The room is held by the page's CSS as its one empty child, so it must stay the only bare div under .bd.
    expect(page.match(/^      <div\b/gm)).toHaveLength(1);
    expect(read("web/src/site/builders/builders.css")).toContain(".bd > :empty { min-height: 560px; }");
    for (const w of TRY_WORDS) expect(page, w).not.toContain(w);
  });
  it("is asked for once: the observer lets go on its first hit, and a lost chunk is one message, never a retry", () => {
    // c76fbe67 kept the part in state and set a new fallback function on each failure: a new render, a new ref, a new
    // observer, a new fetch, 60 a second for as long as the page stayed open. Now there is no state to re-render on.
    expect(code(page)).not.toMatch(/\buseState\b|\buseEffect\b|\bsetPart\b/);
    expect(page).toContain("(e) => e.at(-1)!.isIntersecting && (io.disconnect(), import(\"./TryGuard.tsx\")");
    // One screen early, so the heading and the box are in place before a keyboard or a screen reader gets to them.
    expect(page).toContain('{ rootMargin: "100%" });');
    expect(page.match(/import\("\.\/TryGuard\.tsx"\)/g)).toHaveLength(1);
    expect(page).toContain('() => { el.role = "alert"; el.textContent = "Didn’t load. Reload to try it."; }');
    // The loader is at module scope, so its identity never changes and React calls the ref once per mount.
    expect(page).toMatch(/^const tryGuard = \(el: HTMLElement\) => \{$/m);
    // The part draws itself into that room, with its own root.
    expect(part).toContain("export default function mount(room: HTMLElement): void {");
    expect(part).toContain("createRoot(room).render(<Hold><TryGuard /></Hold>);");
    // A part that throws while drawing says the lost chunk's own line, once: the same words, from a boundary in the chunk.
    expect(part).toContain("static getDerivedStateFromError() { return { lost: true }; }");
    expect(part).toContain('this.state.lost ? <p role="alert">{LOST}</p> : this.props.children');
    expect(page).toContain(`el.textContent = "${LOST}";`);
  });
  it("gets no preload list from the Builders page, and carries its own styles", () => {
    expect(read("web/vite.config.ts")).toContain("/TryGuard-/.test(file) ? [] : deps");
    expect(part).toContain('import css from "./try-guard.css?inline";');
    expect(part).toContain("<style>{css}</style>");
  });
});
