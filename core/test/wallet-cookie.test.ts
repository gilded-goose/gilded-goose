// The wallet's signed cookies (push review MEDIUM, Thu Oct 29): only the server can write one it believes.
import { describe, expect, it } from "vitest";
import { openWalletCookie, signWalletCookie, walletCookieKey } from "../../server/src/wallet-cookie.ts";
import { parseWalletHeld, parseWalletPaid } from "../src/view/wallet.ts";

describe("wallet cookie signing", () => {
  const key = walletCookieKey("test.stand-in");

  it("opens what it signed, and nothing bent, unsigned, renamed or foreign", () => {
    const v = signWalletCookie(key, "goose_wallet_held", "1_FAKE-0001");
    expect(openWalletCookie(key, "goose_wallet_held", v)).toBe("1_FAKE-0001");
    expect(openWalletCookie(key, "goose_wallet_held", "1_FAKE-0001")).toBeNull();
    expect(openWalletCookie(key, "goose_wallet_held", `${v.slice(0, -1)}${v.endsWith("A") ? "B" : "A"}`)).toBeNull();
    expect(openWalletCookie(key, "goose_wallet_held", v.replace("0001", "0042"))).toBeNull();
    expect(openWalletCookie(key, "goose_wallet_paid", v)).toBeNull(); // a held cookie can't pass as paid
    expect(openWalletCookie(walletCookieKey("other.stand-in"), "goose_wallet_held", v)).toBeNull();
    for (const junk of [undefined, null, "", ".", `.${v.split(".").pop()}`]) expect(openWalletCookie(key, "goose_wallet_held", junk)).toBeNull();
  });

  it("one secret gives one key across restarts; no secret gives a fresh key each time", () => {
    expect(walletCookieKey("test.stand-in").equals(key)).toBe(true);
    expect(walletCookieKey(undefined).equals(walletCookieKey(undefined))).toBe(false);
    expect(walletCookieKey("")).toHaveLength(32);
  });

  it("the wallet still reads a signed cookie to draw itself", () => {
    expect(parseWalletHeld(signWalletCookie(key, "goose_wallet_held", "1_FAKE-0001"))?.orderId).toBe("FAKE-0001");
    expect(parseWalletPaid(signWalletCookie(key, "goose_wallet_paid", "2_FAKE-0003_47.73"))).toMatchObject({ week: 2, orderId: "FAKE-0003", total: "47.73" });
  });
});
