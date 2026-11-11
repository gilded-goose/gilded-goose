// "Set your price" and the Watching list (Joshua, Nov 5, sections 3 and 4): the row says what the price watch says, a
// ping only ever offers an ask held to her price, and no limit moves.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { demoCatalogItems, demoPolicy } from "../src/scenario.ts";
import { askAtPrice, watchRow, watchingRows } from "../src/ask/watching-list.ts";
import { spokenCap } from "../src/ask/cap.ts";
import { recordedMarket } from "../src/ask/recorded-market.ts";
import { checkWant, type SavedWant } from "../src/ask/wants.ts";
import { watchPrice } from "../src/trust/pricewatch.ts";
import { BEAT_DAY, offersFor, watchedWant } from "../src/ask/watching.ts";
import { wantRead } from "../src/ask/want-reads.ts";

const catalog = demoCatalogItems();
const policy = demoPolicy();
const want = (catalogId: string, max: number, extra: Partial<SavedWant> = {}): SavedWant => ({ catalogId, priority: "really", max, at: 1, ...extra });
const MARSH = "marsh-lights-ticket";

describe("the Watching list", () => {
  it("at your $90 the Marsh Lights ticket pinged, on the recorded $84.00", () => {
    const r = watchRow(want(MARSH, 9000), catalog, policy)!;
    expect(r.target).toBe(9000);
    expect(r.best?.total).toBe(8400);
    expect(r.pinged).toBe(true);
    expect(r.status).toBe("Pinged: $84.00 is $6.00 under your $90.00.");
  });

  it("at your $80 it keeps watching, and the deal stays shut", () => {
    const r = watchRow(want(MARSH, 8000), catalog, policy)!;
    expect(r.pinged).toBe(false);
    expect(r.ask).toBeNull();
    expect(r.status).toBe("$4.00 over your $80.00. Still watching.");
  });

  it("today's best is never a seller the Watcher set aside", () => {
    const r = watchRow(want(MARSH, 6000), catalog, policy)!;
    // TixQuack's $55.00 asks for a gift card: it's under her price, and it is not her best.
    expect(r.best?.total).toBe(8400);
    expect(r.pinged).toBe(false);
    expect(r.status).toMatch(/^Goose set aside .* at \$55\.00\. Still watching for \$60\.00 or less\.$/);
  });

  it("the Pinged word follows the price watch on every item and every price", () => {
    const ids = [MARSH, "gullwing-seat", "mossbell-night", "harbor-jacket"];
    for (const id of ids) for (const max of [500, 2000, 4000, 6000, 8000, 9000]) for (let day = 0; day < 7; day++) {
      if (!checkWant({ catalogId: id, priority: "really", max }, catalog, policy, 1).ok) continue;
      const w = want(id, max);
      const r = watchRow(w, catalog, policy, day)!;
      const kind = watchPrice(watchedWant(w, catalog, policy)!, offersFor(w, day), policy).kind;
      expect(r.pinged).toBe(kind === "under");
      expect(r.status.startsWith("Pinged")).toBe(r.pinged);
      expect(r.ask !== null && !r.pinged).toBe(false);
    }
  });

  // Lead-12, Nov 5: a pinged row never sits next to an urge to buy. Goose's Read says BUY NOW only when a cleared seller is
  // within the want's max on the same simulated day, which is a ping; so the room hides the Read on a pinged row, and no
  // row of the list can show BUY NOW (its WAIT and SKIP still show on rows not pinged).
  it("Goose's BUY NOW only ever falls on a pinged row, and the list hides the Read there", () => {
    let buys = 0;
    for (const id of [MARSH, "gullwing-seat", "mossbell-night", "harbor-jacket"]) for (const max of [500, 2000, 4000, 6000, 8000, 9000]) for (let day = 0; day < 7; day++) {
      if (!checkWant({ catalogId: id, priority: "really", max }, catalog, policy, 1).ok) continue;
      const w = want(id, max);
      if (wantRead(w, catalog, policy, null, 1, day).call !== "BUY NOW") continue;
      buys++;
      expect(watchRow(w, catalog, policy, day)!.pinged).toBe(true);
    }
    expect(buys).toBeGreaterThan(0);
    const panes = readFileSync(new URL("../../web/src/desk/Panes.tsx", import.meta.url), "utf8");
    const list = panes.slice(panes.indexOf("dk-watching-h"), panes.indexOf("dk-watch-said"));
    expect(list).toContain("{!r.pinged && got.reads?.[r.catalogId] && ");
    expect(list.match(/<Read /g)).toHaveLength(1);
  });

  it("a ping's ask names the recorded market and is held to her price, never over", () => {
    const r = watchRow(want(MARSH, 8700), catalog, policy)!;
    expect(r.ask).toBe("Marsh Lights ticket, $87.00 max");
    expect(spokenCap(r.ask!)?.cents).toBe(8700);
    expect(recordedMarket(r.ask!)?.catalogId).toBe(MARSH);
  });

  it("a want saved under a bigger limit reads at today's limit, and a price over the limit is refused", () => {
    expect(watchRow(want(MARSH, 50000), catalog, policy)!.target).toBe(9000);
    const over = checkWant({ catalogId: MARSH, priority: "really", max: 9100 }, catalog, policy, 1);
    expect(over.ok).toBe(false);
  });

  it("rising is said only when the record shows it", () => {
    // Day 5 falls to $84.00; day 6 rises to $91.00, the record's only rise from Lantern Hall.
    expect(watchRow(want(MARSH, 9000), catalog, policy, BEAT_DAY)!.heads).toBeNull();
    expect(watchRow(want(MARSH, 9000), catalog, policy, BEAT_DAY + 1)!.heads).toBe("Rising: $84.00 the day before.");
  });

  it("keeps the list's order, really wants first", () => {
    const rows = watchingRows([want("gullwing-seat", 9000, { priority: "nice" }), want(MARSH, 9000)], catalog, policy);
    expect(rows.map((r) => r.catalogId)).toEqual([MARSH, "gullwing-seat"]);
  });

  it("the room collects no email and no phone number", () => {
    const room = ["Panes.tsx", "SetPrice.tsx"].map((f) => readFileSync(new URL(`../../web/src/desk/${f}`, import.meta.url), "utf8")).join("\n");
    expect(room).not.toMatch(/type="(email|tel)"|autoComplete="(email|tel)"|pushManager|new Notification\(/i);
    // The ping's only touch here is the permission, asked once, by Set your price (core/test/ping.test.ts pins where).
    expect(room.match(/Notification\.\w+\(/g)).toEqual(["Notification.requestPermission("]);
  });

  it("askAtPrice's words read as her cap at any price", () => {
    for (const c of [100, 8400, 9000, 123456]) expect(spokenCap(askAtPrice("Marsh Lights ticket", c))?.cents).toBe(c);
  });
});
