import { describe, expect, it } from "vitest";
import { readSeller } from "../../trust/src/index.ts";

// Round 6b's trust seat (Fri Nov 6): "…taking steam or gift cards instead, super easy. just buy one for 58 at any store and
// send me the code in the chat" was only held. The gift-card rule now reads those steps a sentence after a card is named.
// The fresh Q failed the first try (412d15a8): it cleared three scams and refused 13 honest notes. Every note below tells
// the versions apart: each scam was held before the rule (it fails without it), and each never-clears note and honest
// control read wrong on 412d15a8 or db515b71 (they fail on that try). A rule that can't tell holds, never refuses.
describe("a gift card named, then bought and its code sent, is set aside", () => {
  it.each([
    "I'm taking gift cards now since PayPal is down. Just buy one for $58 at any store and send me the code.",
    "Google Play gift card works best. Pick up one and email me the numbers in the chat.",
    "Goldfeather Kettle, $55, ships tomorrow if paid today. Our card processor is under maintenance this week, so we're accepting store gift cards at face value for now. Buy one for the amount, send me the code and a photo of the receipt.",
  ])("refuses (held before this rule): %s", (note) => {
    expect(readSeller(note)).toMatchObject({ verdict: "refuse", rule: "gift-card", reason: "Watcher set this seller aside: it asks to be paid by gift card." });
  });

  // 412d15a8 cleared these: its span ate the card mentions, and the turned-down first card nulled the match.
  it.each([
    "Never by gift card online. Steam gift card in store. Get one and text me the pin.",
    "Never by gift card from Amazon, they get flagged. Steam gift cards are better for me. Buy two and send me the codes.",
    "Never by gift card through the app. Steam cards. Buy two and send me the codes.",
  ])("never clears, a turned-down card first or not: %s", (note) => {
    expect(readSeller(note).verdict).not.toBe("clear");
  });

  // 412d15a8 refused these: an if before the buy, "Don't", "it" as the thing bought, a photo that isn't of the card.
  it.each([
    "Our store gift card comes in $25 and $50. Grab one at checkout; if the code doesn't arrive, send us a photo of your receipt.",
    "Our gift cards never expire. If you buy one and it fails at the register, send us the code and we'll check the balance.",
    "Includes a free Steam gift card inside the box. Buy it today and send me a pic of your setup when it arrives!",
    "We take gift cards? No. Don't buy one and send me the code; pay through checkout.",
    "We sell prepaid cards for the arcade. Buy some at checkout through PayPal, then send us a photo of the receipt to get bonus tokens.",
    // The Q's re-check on db515b71: "one" or "two" and then another thing bought is no card bought (they refused there).
    "Free Steam gift card with every order. Just buy one kettle, then send us the code from the box insert.",
    "Free Steam gift card with every order. Buy two shirts, then send us the code from the tag.",
    "Gift card holders get 10% off. Get one of our mugs and email us the code on your card at checkout.",
    "Steam gift cards sold here. Buy one game and send us the pin from your receipt to get a bonus.",
    "Gift cards welcome in store. Grab one of the display models and text us the number on the back for a discount.",
  ])("an honest gift-card note still holds, never refuses: %s", (note) => {
    expect(readSeller(note)).toMatchObject({ verdict: "hold", rule: "mentions-gift-card" });
  });
});
