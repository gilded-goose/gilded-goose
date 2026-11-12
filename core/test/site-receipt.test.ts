// The white site's receipt, rendered (Q, Nov 11): the words tests in site-shop.test.ts only cover receipt-words.ts, so
// reverting Receipt.tsx's own gate (`paid = settledOk && mine`) stayed green. These render Receipt.tsx itself with React's
// static renderer (web's own react-dom, so one React), and drive the re-read it does after an Undo with a stand-in server.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { returnCard } from "@goose/core/return";
import type { LedgerEvent } from "@goose/core";
import type { Back } from "../../web/src/goose/back.ts";
import { LOST, LOST_ANSWER, readAfterUndo, readBack } from "../../web/src/goose/read-back.ts";
import { receiptHead } from "../../web/src/site/shop/receipt-words.ts";

// React from web/ (core has no React of its own): the same copy Receipt.tsx imports, so its hooks see one React.
const fromWeb = createRequire(new URL("../../web/package.json", import.meta.url));
const { createElement } = fromWeb("react") as { createElement: (c: unknown, p: unknown) => unknown };
const { renderToStaticMarkup } = fromWeb("react-dom/server") as { renderToStaticMarkup: (el: unknown) => string };
// Loaded at run time: core's typecheck has no JSX, so it must not follow a static import into a .tsx (vitest compiles it).
const RECEIPT = fileURLToPath(new URL("../../web/src/site/shop/Receipt.tsx", import.meta.url));
const { Receipt } = await import(RECEIPT) as { Receipt: (p: { runId: string; back: Back | null; mode: "practice" | "sandbox"; onAgain(): void }) => unknown };
const RUN = "0123456789ab";
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const draw = (back: Back, mode: "practice" | "sandbox" = "sandbox") => renderToStaticMarkup(createElement(Receipt, { runId: RUN, back, mode, onAgain: () => undefined }));

const paid: Back = { total: "42.00", merchant: "Reedbank Outfitters (fictional)", item: "Kettle", orderId: "ORDER1", ok: true, reason: null, card: null, mine: true };
const run = { week: null, bound: { total: "42.00", orderId: "ORDER1" }, events: [] as LedgerEvent[], mine: true };
const refunded: Back = { ...paid, card: returnCard({ ...run, settled: { ok: true }, refunded: true }) };

describe("Receipt.tsx, rendered", () => {
  it("receipt_owner_paid: this browser's paid run reads Paid with Your tap and the Undo/after-you-pay area (the control for the next test)", () => {
    const html = draw(paid);
    expect(text(html)).toContain("Paid $42.00 to Reedbank Outfitters.");
    expect(text(html)).toContain("Your tap approved it");
    expect(html).toContain('class="receipt-undo"');
  });

  for (const mode of ["sandbox", "practice"] as const) {
    it(`receipt_other_browser_${mode}: mine false shows no Undo, no after-you-pay, no "Your tap", and the lede says the headline's word`, () => {
      const html = draw({ ...paid, mine: false }, mode);
      expect(text(html)).not.toContain("Your tap");
      expect(html).not.toContain('class="receipt-undo"');
      expect(text(html)).not.toMatch(/Undo|Tracking and help/);
      // The headline's word, said again under it: "Paid ... / Paid from another browser." or "Approved: ... / Approved from another browser."
      const word = mode === "practice" ? "Approved" : "Paid";
      expect(text(html)).toContain(`${word}${mode === "practice" ? ":" : ""} $42.00 to Reedbank Outfitters.`);
      expect(text(html)).toContain(`${word} from another browser.`);
    });
  }

  it("receipt_after_undo_reads_refunded: the run as the server has it after the refund heads the receipt, never Paid", () => {
    const html = draw(refunded);
    expect(text(html)).toContain("Refunded $42.00");
    expect(text(html)).toContain("This payment was refunded.");
    expect(text(html)).not.toMatch(/Paid \$|Your tap approved/);
  });

  it("receipt_reread_lost: a re-read that fails heads the lost-answer state, never Paid", () => {
    for (const lost of [LOST, LOST_ANSWER]) {
      const t = text(draw(lost));
      expect(t).toContain(receiptHead(lost));
      expect(t).not.toMatch(/Paid \$|Your tap|PayPal hasn't confirmed/);
    }
  });
});

describe("read-back.ts: the re-read after an Undo", () => {
  const server = (status: number, data: unknown) => (async <T,>() => ({ status, data: data as T })) as Parameters<typeof readBack>[2];
  const view = { bound: { total: "42.00", merchant: "Reedbank Outfitters (fictional)", item: "Kettle", orderId: "ORDER1" }, settled: { ok: true }, card: refunded.card, mine: true };

  it("undo_reread_prints_server_card: a refunded run reads back with the server's card", async () => {
    const b = await readAfterUndo(RUN, null, server(200, view));
    expect(b.card).toEqual({ head: "Refunded $42.00", line: "This payment was refunded." });
    expect(receiptHead(b)).toBe("Refunded $42.00");
  });

  it("undo_reread_failures_are_lost: no answer, an error status, or the run gone are the lost-answer state", async () => {
    const away = (async () => { throw new Error("away"); }) as Parameters<typeof readBack>[2];
    expect(await readAfterUndo(RUN, null, away)).toBe(LOST);
    expect(await readAfterUndo(RUN, null, server(500, { error: "boom" }))).toBe(LOST_ANSWER);
    expect(await readAfterUndo(RUN, null, server(404, { error: "no such run" }))).toBe(LOST_ANSWER);
  });

  it("undo_press_rereads: Receipt.tsx's Undo, once the refund is ok, shows checking and then the re-read, not a page-made state", async () => {
    // A static render can't press the button, and no repo walk presses it yet (Track W walked it by hand, Nov 11). This
    // pins the wiring: removing the re-read turns this red.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../web/src/site/shop/Receipt.tsx", import.meta.url), "utf8");
    expect(src).toContain('if (r.ok) { setUndo({ state: "refunded" }); setFresh("checking"); setFresh(await readAfterUndo(runId, given?.recap ?? null)); return; }');
  });

  it("run_get_error_is_lost (Q SHOULD): PayPal's return reading a non-404 JSON error says Goose couldn't check, not PayPal hasn't confirmed", async () => {
    const b = await readBack(RUN, null, server(503, { error: "busy" }));
    expect(b.lost).toBe(true);
    expect(receiptHead(b)).toBe("Goose couldn't check this payment.");
    expect((await readBack(RUN, null, server(404, {}))).gone).toBe(true);
  });
});
