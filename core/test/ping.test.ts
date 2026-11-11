// The ping, Level 1 (Joshua, Nov 5 6:40 PM): after "Set your price", the recorded week replays and, on the first day the
// price reaches hers, a real browser notification shows if she allowed it. The words are the server's (pingFor), read
// with the same watch as the Watching list's row; the set-aside seller never pings; permission is asked only by the Set
// your price button; the page constructs a notification in one file and stores nothing.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pingFor, pingsFor, watchRow } from "../src/ask/watching-list.ts";
import { demoCatalogItems, demoPolicy } from "../src/scenario.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const CAT = demoCatalogItems();
const want = (max: number) => ({ catalogId: "marsh-lights-ticket", priority: "really" as const, max, at: 1 });
const walk = (dir: string): string[] => readdirSync(new URL(`../../${dir}/`, import.meta.url)).flatMap((f) => (statSync(new URL(`../../${dir}/${f}`, import.meta.url)).isDirectory() ? walk(`${dir}/${f}`) : [`${dir}/${f}`]));

describe("the ping's words", () => {
  it("ping_at_your_price: $90 pings on simulated day 5 at $84, after the gift-card seller is set aside on day 2", () => {
    expect(pingFor(want(9000), CAT, demoPolicy())).toEqual({
      steps: [
        "Simulated day 1: $105, over your $90.",
        "Simulated day 2: Goose set aside TixQuack (fictional) at $55. No ping.",
        "Simulated day 3: $94, over your $90.",
        "Simulated day 4: $94, over your $90.",
        "Simulated day 5: $84 at Lantern Hall Box Office (fictional). Pinged.",
      ],
      title: "Goose · simulated price alert",
      body: "Simulated day 5: Marsh Lights ticket is $84, under your $90 price. Tap to review.",
    });
  });

  // R's red team F1, Lead-12's ruling (Nov 5): a ping is an invitation to tap, so a seller the Watcher holds never pings;
  // its row says the hold and "no ping". Mossbell at $86 to $98 (Duckpond Stays, new, no sales) and Tidewater at $45 to $58
  // (Ferrylane Co.) were the seat's cases; then every item at every price: a ping only ever falls on a cleared seller.
  it("ping_never_for_a_held_seller: the row says the hold and no ping, and any ping is a cleared seller's", () => {
    const held = (id: string, dollars: number) => ({ catalogId: id, priority: "really" as const, max: dollars * 100, at: 1 });
    for (const [id, lo, hi, seller] of [["mossbell-night", 86, 98, "Duckpond Stays"], ["tidewater-jacket", 45, 58, "Ferrylane Co."]] as const) {
      for (let m = lo; m <= hi; m++) {
        const w = held(id, m);
        const p = pingFor(w, CAT, demoPolicy());
        expect([id, m, p?.steps.at(-1)?.includes(seller) ?? false]).toEqual([id, m, false]);
        const rows = [0, 1, 2, 3, 4].map((d) => watchRow(w, CAT, demoPolicy(), d)!);
        const h = rows.find((r) => r.status.includes(seller))!;
        expect(h.pinged).toBe(false);
        expect(h.ask).toBeNull();
        expect(h.status).toMatch(new RegExp(`^${seller.replace(".", "\\.")} \\(fictional\\) is \\$\\d+\\.\\d\\d, (under|right at) your \\$${m}\\.00, but held for your yes, so no ping\\. Still watching\\.$`));
        expect(h.status.includes(`right at your $${m}.00`)).toBe(h.status.startsWith(`${seller} (fictional) is $${m}.00`));
      }
    }
    expect(watchRow(held("mossbell-night", 86), CAT, demoPolicy(), 4)!.status).toBe("Duckpond Stays (fictional) is $86.00, right at your $86.00, but held for your yes, so no ping. Still watching.");
    expect(pingFor(held("mossbell-night", 90), CAT, demoPolicy())).toBeNull();
    for (const id of CAT.keys()) for (let m = 10; m <= 200; m += 3) {
      const w = held(id, m);
      const p = pingFor(w, CAT, demoPolicy());
      if (!p) continue;
      const day = p.steps.length - 1;
      expect([id, m, watchRow(w, CAT, demoPolicy(), day)?.pinged]).toEqual([id, m, true]);
      expect(p.steps.slice(0, -1).some((s) => s.endsWith("Pinged."))).toBe(false);
    }
  });

  it("ping_matches_the_row: it fires on the first day the row itself says Pinged, never before", () => {
    for (const max of [8000, 8400, 9000, 9400, 10000, 10500, 11200]) {
      const p = pingFor(want(max), CAT, demoPolicy());
      const first = [0, 1, 2, 3, 4].find((d) => watchRow(want(max), CAT, demoPolicy(), d)!.pinged);
      expect([max, p ? p.steps.length - 1 : undefined]).toEqual([max, first]);
    }
  });

  it("ping_says_right_at_and_never_below_the_record: $84 is right at; $80 never pings", () => {
    expect(pingFor(want(8400), CAT, demoPolicy())!.body).toBe("Simulated day 5: Marsh Lights ticket is $84, right at your $84 price. Tap to review.");
    expect(pingFor(want(8000), CAT, demoPolicy())).toBeNull();
    // The set-aside seller's $55 is under $60, and still no ping: the Watcher's refusal is the watch's own.
    expect(pingFor(want(6000), CAT, demoPolicy())).toBeNull();
  });

  it("pings_are_only_her_own: built from the cookie's own session, keyed by her wants", () => {
    expect(Object.keys(pingsFor([want(9000)], CAT, demoPolicy()))).toEqual(["marsh-lights-ticket"]);
    expect(read("server/src/main.ts")).toContain("pings: session ? pingsFor(session.wants, CATALOG, session.policy) : {}");
  });
});

describe("the ping on the page", () => {
  it("permission is asked only by a press that can bring a ping, never on load", () => {
    // Two presses ask: Set your price where a ping plays (desktop only), and the closed-tab button (Level 2, off unless
    // switched on), which is where a phone asks (Lead-12 and the L2 DD seat, Nov 5).
    const hits = walk("web/src").filter((f) => /\.(ts|tsx)$/.test(f) && /Notification\s*\.\s*requestPermission|Notification\)?\[/.test(read(f)));
    expect(hits.sort()).toEqual(["web/src/desk/PushRow.tsx", "web/src/desk/SetPrice.tsx"]);
    const src = read("web/src/desk/SetPrice.tsx");
    const save = src.slice(src.indexOf("async function save("), src.indexOf("return (", src.indexOf("async function save(")));
    expect(save).toContain("Notification.requestPermission()");
    expect(src.replace(save, "")).not.toContain("requestPermission");
    // Asked before the first wait, so the browser still counts it as her tap.
    expect(save.indexOf("Notification.requestPermission()")).toBeLessThan(save.indexOf("await "));
    // Never asked where a page's notification can't show (DD, Nov 5): a phone browser shows them only from a worker. And
    // only by a press that plays a ping (R's red team, Nov 5): the Week shelf's doesn't ask. A real row's does: it can
    // bring the real ping (Track F's, real-watcher.ts).
    const ask = save.split("\n").find((l) => l.includes("Notification.requestPermission()"))!;
    expect(ask).toContain("!/Android|iPhone|iPad/i.test(navigator.userAgent)");
    expect(ask.trim().startsWith("if (ping && ")).toBe(true);
    const panes = read("web/src/desk/Panes.tsx");
    const presses = panes.match(/<SetPrice [^>]*\/>/g)!;
    expect(presses).toHaveLength(4);
    for (const p of presses) expect([p, / ping \/>$/.test(p)]).toEqual([p, /onSaved=\{saved\(/.test(p) || /^<SetPrice real=\{/.test(p)]); // the real row: Track F
    // The closed-tab button asks inside its own press, before its first wait.
    const row = read("web/src/desk/PushRow.tsx");
    const on = row.slice(row.indexOf("async function on("), row.indexOf("async function off("));
    expect(on).toContain("Notification.requestPermission()");
    expect(on.indexOf("Notification.requestPermission()")).toBeLessThan(on.indexOf("await "));
    expect(row.replace(on, "")).not.toContain("requestPermission");
  });

  it("one file shows a notification, with the server's words only, and nothing is stored or pushed", () => {
    const shows = walk("web/src").filter((f) => /\.(ts|tsx)$/.test(f) && /new Notification\(|showNotification\(/.test(read(f)));
    expect(shows).toEqual(["web/src/desk/ping-notify.ts"]);
    const one = read("web/src/desk/ping-notify.ts");
    expect(one).toContain("new Notification(title, { body, tag })");
    expect(one).toContain('Notification.permission !== "granted"');
    expect(one).not.toMatch(/requestPermission|localStorage|sessionStorage|indexedDB|fetch\(|pushManager/);
    const replay = read("web/src/desk/PingReplay.tsx");
    expect(replay).toContain("notify(ping.title, ping.body, tag, () => open.current())");
    // An old ping can't open an old price (R's red team F2): the tap reads the newest onOpen, and a replay that leaves (a
    // new price replays from a new key; Stop watching removes the row) closes its notification.
    expect(replay).toContain("open.current = onOpen;");
    expect(replay).toContain("useEffect(() => () => unnotify(tag), [tag]);");
    expect(one).toContain("shown.set(tag, n);");
    expect(one).toMatch(/export function unnotify\(tag: string\): void \{\n  shown\.get\(tag\)\?\.close\(\);/);
    expect(replay).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\(|json\(|pushManager/);
    // Its own chunk: fetched only when a ping plays.
    expect(read("web/src/desk/Panes.tsx")).toContain('lazyOr(() => import("./PingReplay.tsx"))');
  });

  it("tapping the notification opens the ask held to her price, the same as Shop at your price", () => {
    const panes = read("web/src/desk/Panes.tsx");
    expect(panes).toMatch(/<PingReplay ping=\{ping\} tag=\{r\.catalogId\} onOpen=\{\(\) => \{ if \(r\.ask\) onDeal\(r\.ask\); \}\} \/>/);
    expect(panes).toContain("onClick={() => onDeal(r.ask!)}>{OPEN_DEAL}</button>");
  });
});
