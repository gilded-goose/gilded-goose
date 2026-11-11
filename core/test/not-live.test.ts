// The Challenge's counter is real attempts only (Joshua, Nov 3), and a script's default address is no guard: `--base` or an
// argument can point it at the live site. So any script that names a counted route, or takes an address and POSTs, says in
// its source how it stays off the live site. A new script without that fails here, before anyone runs it.

import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localOnly } from "../../scripts/not-live.ts";

const root = new URL("../../", import.meta.url);
const SCRIPTS = readdirSync(new URL("scripts", root), { recursive: true }).map(String).filter((f) => /\.(?:ts|mjs|sh)$/.test(f)).map((f) => `scripts/${f}`);

/** Comment lines say what a script doesn't do, and naming a route in one sends nothing. */
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(?:\/\/|#|\*|\/\*)/.test(l)).join("\n");
const NAMES_COUNTED = /api\/(?:runs\/(?:trick|scammer)|judge)/;
const POSTS = /method: *"POST"|\.post\(|curl [^\n]*-(?:d|X POST) /;
const TAKES_ADDRESS = /(?:process\.argv|args)[^\n]*"http:\/\/localhost|process\.env\.BASE/;
/** localOnly, a literal local-only stop, or a server the script starts itself on this machine's loopback. */
const guarded = (src: string) => /\blocalOnly\(/.test(src) || /local only/.test(src) || /= `http:\/\/127\.0\.0\.1:\$\{/.test(src);

/** These name a counted route and can't write to it, each for a reason a line here can state. */
const NO_WRITE: Readonly<Record<string, string>> = {
  "scripts/check-claims.ts": "reads the repo's source, no server at all",
  "scripts/challenge-probe.ts": "GETs only, safe on live, and fails if the page posts by itself",
};

afterEach(() => { vi.restoreAllMocks(); });

describe("scripts stay off the live counter", () => {
  it("the rule itself tells a guarded script from one that isn't", () => {
    expect(guarded(`const b = process.argv[2] ?? "http://localhost:8787"; await fetch(b + "/api/judge", { method: "POST" });`)).toBe(false);
    expect(guarded(`const b = localOnly(process.argv[2] ?? "http://localhost:8787");`)).toBe(true);
    expect(code(`// never POSTs to /api/judge\nconst a = 1;`)).not.toMatch(NAMES_COUNTED);
  });

  it("every script naming a counted route carries a guard, or can't write to it", () => {
    const named = SCRIPTS.filter((f) => NAMES_COUNTED.test(code(readFileSync(new URL(f, root), "utf8"))));
    expect(named.length).toBeGreaterThan(8); // the walk still finds them
    expect(named.filter((f) => !NO_WRITE[f] && !guarded(readFileSync(new URL(f, root), "utf8")))).toEqual([]);
    for (const f of Object.keys(NO_WRITE).filter((x) => x !== "scripts/check-claims.ts")) expect(code(readFileSync(new URL(f, root), "utf8")), f).not.toMatch(POSTS);
  });

  it("every script that takes an address and POSTs carries the guard", () => {
    const open = SCRIPTS.filter((f) => { const s = code(readFileSync(new URL(f, root), "utf8")); return POSTS.test(s) && TAKES_ADDRESS.test(s) && !guarded(s); });
    expect(open).toEqual([]);
    for (const f of ["scripts/budget-round.ts", "scripts/sm-shots.ts", "scripts/charts-shots.ts", "scripts/ledger-shots.ts"]) expect(readFileSync(new URL(f, root), "utf8"), f).toContain("localOnly(");
  });

  it("the scripts built to walk the live site refuse a counted POST in the browser, the scammer button's too", () => {
    expect(readFileSync(new URL("scripts/keyboard-tour.ts", root), "utf8")).toContain("runs\\/trick|runs\\/scammer|judge");
    expect(readFileSync(new URL("scripts/video-takes.ts", root), "utf8")).toContain("runs\\/trick|runs\\/scammer|judge");
  });

  it("localOnly passes this machine and stops everything else", () => {
    for (const u of ["http://localhost:8787/", "http://127.0.0.1:1/", "http://[::1]:8787/"]) expect(localOnly(u)).toBe(u);
    const exit = vi.spyOn(process, "exit").mockImplementation(((c: number) => { throw new Error(`exit ${c}`); }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const u of ["https://gilded-goose.onrender.com/", "http://localhost.evil.example/", "http://127.0.0.1.nip.io/"]) expect(() => localOnly(u), u).toThrow("exit 2");
    expect(exit).toHaveBeenCalledTimes(3);
  });
});
