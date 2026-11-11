// PayPal additions 4 (ADR 0013): PayPal's Pay Later message. The page gets only the public client id, only on sandbox
// PayPal, and only for a plain amount; anything else leaves no message.
import { describe, expect, it } from "vitest";
import { PAY_LATER_SDK, payLaterAmount, payLaterConfig } from "../src/paylater.ts";

describe("pay later message (PayPal additions 4)", () => {
  it("serves_the_client_id_only_on_sandbox_paypal", () => {
    const id = "AbC-123_xyzAbC-123_xyz";
    expect(payLaterConfig(id, true)).toEqual({ clientId: id });
    expect(payLaterConfig(id, false)).toBeNull();
    expect(payLaterConfig(undefined, true)).toBeNull();
    expect(payLaterConfig("", true)).toBeNull();
  });
  it("never_serves_something_that_isnt_a_client_id", () => {
    for (const bad of ["short", "has space in it padding padding", "x\"><script>alert(1)</script>xxxxxxxx", "a".repeat(129)]) expect(payLaterConfig(bad, true)).toBeNull();
  });
  it("asks_paypal_only_about_a_plain_amount", () => {
    expect(payLaterAmount("47.73")).toBe("47.73");
    for (const bad of ["0.00", "-47.73", "47.7", "1,047.73", "47.73 USD", ""]) expect(payLaterAmount(bad)).toBeNull();
  });
  it("loads_paypal_sandbox_sdk_only", () => {
    expect(PAY_LATER_SDK).toBe("https://www.sandbox.paypal.com/web-sdk/v6/core");
  });
});
