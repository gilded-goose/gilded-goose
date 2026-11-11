import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAgTrialLine } from "../../scripts/ag-trial-lines.ts";

// The tour's pill and its probe each ask "does this move with the page?". The probe learned that a `display: contents`
// column pins nothing and the pill didn't, so on a phone the pill landed stop 01 with the window's top through "The
// challenge" (ci-local, Nov 4). The probe runs inside page.evaluate and can't import, so both are read here.
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("the tour is walked with a real try on record (F, Nov 4: an empty record hid a cut at 390x667)", () => {
  const ci = read("scripts/ci-local.sh"), probe = read("scripts/tour-pill.ts");
  it("ci-local runs that walk on a server of its own, so the other walks stay on an empty record", () => {
    const start = ci.split("\n").find((l) => l.includes("PORT=8796")) ?? "";
    expect(start).toMatch(/GOOSE_DIR=\$\w+ /);
    expect(ci).toMatch(/TOUR_ONLY=real node scripts\/tour-pill\.ts http:\/\/localhost:8796 .*\|\| .*fail tour-pill-real/);
    expect(ci.indexOf("ours 8796")).toBeGreaterThan(ci.indexOf("PORT=8796"));
  });
  it("only that mode sends a round, it stops off this machine, and it proves the page drew the row", () => {
    expect(probe).toContain('if (process.env.TOUR_ONLY === "real") localOnly(url);');
    expect(probe.split("api/runs/trick").length).toBe(2);
    expect(probe).toMatch(/fetch\(`\$\{localOnly\(url\)\}api\/runs\/trick`/);
    expect(probe).toMatch(/TOUR_ONLY === "real"\) \{ await aRealTry\(browser\);/);
    expect(probe).toMatch(/if \(!\(tried >= 1\)\)/);
  });
});

describe("the pill and its probe agree on what's pinned", () => {
  it.each(["web/src/tour/edges.ts", "scripts/tour-pill.ts"])("%s: a box-less element pins nothing", (file) => {
    expect(read(file)).toMatch(/\.display !== "contents" && \/sticky\|fixed\/\.test\(\w+\.position\)/);
  });
});

// Nov 5: the flip stranded the tour at stop 10 on live with every check green, since a build with no key draws the Community ledger.
describe("CI opens the page live serves", () => {
  it("ci-local builds with Studio drawn and walks it", () => {
    const s = read("scripts/ci-local.sh");
    expect(s).toContain("GOOSE_FLIP_REHEARSAL=1 VITE_WALLET=1");
    for (const walk of ["studio-tour-doors.ts", "studio-flip-rehearsal.ts"]) expect(s, walk).toContain(`scripts/${walk}`);
    expect(s).toContain("HANDOVER=only node scripts/keys-landed.ts");
    expect(s).toContain("KEYLESS_STUDIO=1 node scripts/keyboard-tour.ts");
  });
  it("the walks read the rehearsal build itself: the served page must carry the date only that build prints (Q, Nov 5)", () => {
    const s = read("scripts/ci-local.sh");
    const date = /^GOOSE_FLIP_REHEARSAL=1 .*GOOSE_STUDIO_EXPIRY="([^"]+)"/m.exec(s)?.[1];
    expect(date).toBeTruthy();
    const check = s.indexOf("|| fail flip-dist");
    expect(check).toBeGreaterThan(s.indexOf("PORT=8798")); // after the server is up
    expect(check).toBeLessThan(s.indexOf("scripts/studio-tour-doors.ts")); // before the first walk
    const line = s.slice(s.lastIndexOf("\n", check) + 1, check);
    expect(line).toContain("curl -sf http://localhost:8798/assets/"); // what's served, not only what's on disk
    expect(line.replace(/\\"/g, '"')).toContain(`expiry:"${date}"`); // the same date the build line sets ($STUDIO_EXPIRY, Nov 6)
  });
  it("the gate allows AG's seven trial lines and no other red line", () => {
    const stars = "*".repeat(124);
    const seven = [stars, `${"*".repeat(46)} AG Studio Pro with AI License ${"*".repeat(47)}`, `${"*".repeat(50)} License Key Not Found ${"*".repeat(51)}`, `* All AG Studio Pro with AI features are unlocked for trial.${" ".repeat(63)}*`, `* If you want to hide the watermark please email info@ag-grid.com for a trial license key.${" ".repeat(33)}*`, stars, stars];
    expect(seven.every(isAgTrialLine)).toBe(true);
    for (const other of ["Error: boom", "* something else *", "***", "AG Studio Pro with AI License", "License Key Not Found", `${stars} Error: boom`, `* All AG Studio Pro with AI features are unlocked for trial. Error: boom *`]) expect(isAgTrialLine(other), other).toBe(false);
  });
});
