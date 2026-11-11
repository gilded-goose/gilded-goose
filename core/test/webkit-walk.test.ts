// The WebKit walk (scripts/webkit-walk.ts; Lead-12, Fri Nov 6) reads the live site after every push. Its promise is that
// it can't change live: GET-only in code, not by care. The script launches a browser at import, so these read its text.
// A guard that aborts every write, not just our own, also stopped PayPal's own SDK requests, and stop 3 lost its Pay
// Later line in WebKit: so the guard is pinned to the site's own origin.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const walk = read("scripts/webkit-walk.ts");
const code = walk.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

describe("the WebKit walk", () => {
  it("aborts every request to the site's own origin that isn't GET or HEAD, and fails the walk on one", () => {
    expect(code).toMatch(/ctx\.route\("\*\*\/\*"/);
    expect(code).toMatch(/new URL\(q\.url\(\)\)\.origin === origin && q\.method\(\) !== "GET" && q\.method\(\) !== "HEAD"\) \{ writes\.push\([\s\S]{0,80}?\); return r\.abort\(\); \}/);
    expect(code).toContain('row("all", "writes", writes.length === 0,');
  });

  it("presses only the tour's buttons and the menu: never Send, Approve or the demo list", () => {
    const clicks = [...code.matchAll(/locator\(([^)]*)\)[^;]*?\.click\(/g)].map((m) => m[1]);
    expect(clicks).toEqual(['"button:visible"', '".gm-root a, .gm-root button"', '".tr-stage .tr-next-go"', '".tp .tp-next"']);
    expect(code).toContain('.filter({ hasText: "Try to trick Goose" }).first().click()');
    expect(code).not.toMatch(/Send to Goose|Approve"|demo list"|\.fill\(|page\.type\(|pressSequentially|keyboard\.(?:type|insertText)|press\("Enter"\)/);
    expect(code).not.toMatch(/api\/runs\/trick|api\/judge|method:\s*"POST"/);
  });

  it("its one write is the control's, to the health check, and only to prove the guard aborts it", () => {
    const sends = code.split("\n").filter((l) => /method: "/.test(l));
    expect(sends).toHaveLength(1);
    expect(sends[0]).toMatch(/^\s*if \(control\) await page\.evaluate\(\(u\) => fetch\(u, \{ method: "DELETE" \}\)[^;]*`\$\{base\}api\/health\?webkit-walk-control=1`\);$/);
  });

  it("--control breaks the pill, stop 02's ask and the note box, and passes only when every broken row went red", () => {
    expect(code).toContain('const CONTROL_CSS = ".tp { opacity: 0.5 !important; } #ds-ch-note { visibility: hidden !important; }"');
    expect(code).toContain("if (ask && broken) ask.scrollLeft = 0;");
    expect(code).toMatch(/const meant = rows\.filter\(\(r\) => \/\^\\d\\d\$\|\^trick\$\|\^writes\$\/\.test\(r\.at\)\);/);
    expect(code).toContain("process.exit(green.length ? 1 : 0);");
  });

  it("exits 1 on any FAIL and 2 without WebKit", () => {
    expect(code).toContain("process.exit(fails ? 1 : 0);");
    expect(code).toContain("const fails = rows.filter((r) => !r.ok).length;");
    expect(code).toMatch(/webkit\.launch\(\); \} catch[\s\S]{0,200}process\.exit\(2\)/);
  });

  it("times every route cold by R's own measure in WebKit, labelled unthrottled, and that measure fails on a write", () => {
    expect(code).toContain('{ env: { ...process.env, ENGINE: "webkit", MODE: "phone" }, encoding: "utf8" }');
    expect(code).toContain('new URL("./cold-routes.ts", import.meta.url).pathname');
    expect(code).toMatch(/row\("webkit-390", "cold", cold\.status === 0,/);
    const cold = read("scripts/cold-routes.ts");
    expect(cold).toContain("const browser = await (SAFARI ? webkit : chromium).launch();");
    expect(cold).toContain('if (mode === "phone" && !SAFARI) {'); // no CDP in WebKit, so no throttle: its header says so
    expect(cold).toMatch(/phone: `WebKit \$\{browser\.version\(\)\}, iPhone 13 UA, 390x844, UNTHROTTLED/);
    expect(cold).toContain('page.on("request", (r) => { if (!["GET", "HEAD"].includes(r.method()) && r.url().startsWith(BASE)) errs.add(');
    expect(cold).not.toMatch(/method: "|\.click\(|\.fill\(|api\/runs\/trick|api\/judge/);
    // Chromium's room pins are throttled numbers, so WebKit prints its rooms beside them and is never judged by them; a room
    // never seen fails in both engines, and Chromium's own header keeps its words (cold-routes-pins.test.ts reads them).
    expect(cold).toContain("const pin = SAFARI ? undefined : ROOM_LCP_PINS[route]?.[mode];");
    expect(cold).toContain("if (!process.env.MEASURE_PINS && !SAFARI) errs.add(");
    expect(cold).toContain(`SAFARI ? " (Chromium's pins not applied)"`);
    expect(cold).toContain('phone: "a phone MODEL on this Mac: 390x844 @3x, 1.6 Mbps / 150 ms, 4x CPU"');
  });

  it("is a post-push walk: wired as postdeploy:webkit, never a ci-local step (it reads live)", () => {
    expect(JSON.parse(read("package.json")).scripts["postdeploy:webkit"]).toBe("node scripts/webkit-walk.ts");
    expect(read("scripts/ci-local.sh")).not.toContain("webkit-walk");
    expect(read("docs/ops/uptime.md")).toContain("corepack pnpm postdeploy:webkit");
  });
});
