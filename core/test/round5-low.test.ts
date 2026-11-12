// Round 5's small findings from the red team, each pinned to what it could do.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { csvField } from "../src/view/session.ts";
import { bindCart, checkBoundCart, demoWant, toCents, type BoundCart, type Cart, type OrderSnapshot } from "../src/index.ts";
import { sha256 } from "./helpers.ts";

const cart = (price: string, extra: Partial<Cart> = {}): Cart => ({
  item: demoWant().item, merchant: "Pondside Goods (fictional)", sellerId: "pondside", qty: 1, price: toCents(price), currency: "USD", shape: "one-off", catalogId: "kettle", ...extra,
});
const web = (f: string) => readFileSync(new URL(`../../web/src/${f}`, import.meta.url), "utf8");

describe("a downloaded ledger's fields can't start a formula or a cell", () => {
  it.each(["=1+1", " =1+1", "  @x", "\n=1+1", "\t+1", "-1", "＝1+1", "＋1", "＠x"])("defuses %j", (v) => {
    expect(csvField(v).replace(/^"/, "").startsWith("'")).toBe(true);
  });
  it("quotes a ; so a ; locale keeps the words after it in their own field", () => {
    expect(csvField("x;=1+1")).toBe('"x;=1+1"');
    expect(csvField("x;=cmd|'/C calc'!A0")).toBe('"x;=cmd|\'/C calc\'!A0"');
  });
  it("leaves plain words and prices alone", () => {
    for (const v of ["Goldfeather Kettle", "47.73", "a - b", "x=1"]) expect(csvField(v)).toBe(v);
  });
});

describe("For builders says what the guard does about the payee", () => {
  const now = 1_000_000;
  const bound = (payee?: string): BoundCart => ({ ...bindCart(cart("42.00", payee ? { payee } : {}), sha256, now, 60_000, "n"), orderId: "o1" });
  const snap = (b: BoundCart, payee: string): OrderSnapshot => ({ id: "o1", status: "APPROVED", amount: toCents("42.00"), currency: "USD", customId: b.hash, payee });
  it("no payee on the cart: any payee passes, so the page may not say it always checks", () => {
    const b = bound();
    expect(checkBoundCart(b, snap(b, "EVIL"), now + 1).ok).toBe(true);
    expect(web("builders/builders.ts")).toContain("the payee when the cart names one");
  });
  it("a named payee: another one is refused", () => {
    const b = bound("MERCHANT-A");
    expect(checkBoundCart(b, snap(b, "EVIL"), now + 1)).toMatchObject({ ok: false, code: "payee" });
  });
});

describe("a run id from the address is checked before anything fetches it", () => {
  it("every page that reads run= tests it as 12 hex digits", () => {
    for (const f of ["App.tsx", "Wallet.tsx", "Haggle.tsx", "StoreSync.tsx", "desk/Desk.tsx"]) expect(web(f), f).toContain("/^[0-9a-f]{12}$/.test(");
    expect(web("App.tsx")).toMatch(/if \(id && \/\^\[0-9a-f\]\{12\}\$\/\.test\(id\)\) void load\(id\)/);
  });
});

describe("a malformed address anchor throws nothing", () => {
  it("no page decodes location.hash outside a try", () => {
    expect(web("menu/land.ts").match(/decodeURIComponent\(location\.hash/g)).toHaveLength(1);
    expect(web("menu/land.ts")).toMatch(/try \{ return decodeURIComponent\(location\.hash\.slice\(1\)\); \} catch/);
    expect(web("menu/MenuPanel.tsx")).not.toContain("decodeURIComponent(location.hash");
  });
});
