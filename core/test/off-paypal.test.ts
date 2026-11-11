// W51 (docs/guild/023-session-1.md): the off-PayPal rule holds any way to pay that isn't PayPal checkout, in a
// stranger's words. The corpus was written by two blind agents that never read `notes.ts` (shared Lesson: our own
// phrasing can't find our own gaps), and every fair note in it must stay a non-refusal (project Lesson 23).

import { ASK_RULES } from "../../trust/src/asks.ts";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NEVER_REFUSE, noteEvidence, quoteNote, unleet, verdictOf, watch, type EvidenceRule, type Reading } from "../src/index.ts";

interface Half { scam: string[]; fair: string[] }
// W51 review 2: plus the reviewer's probe lists and a third blind writer's set (round2).
const CORPUS = JSON.parse(readFileSync(new URL("./fixtures/off-paypal-corpus.json", import.meta.url), "utf8")) as Record<"dev" | "sealed" | "fresh" | "probes" | "round2", Half>;
const SETS = ["dev", "sealed", "fresh", "probes", "round2"] as const;
const SCAM = SETS.flatMap((s) => CORPUS[s].scam);
const FAIR = SETS.flatMap((s) => CORPUS[s].fair);

/** The red team's probe (021 W51): the ten wordings that read clear, re-run by the lead. */
const PROBE = [
  "Venmo me the $40 and I ship today.", "Send it as PayPal Friends and Family so there are no fees.",
  "Pay through Wise or Revolut, PayPal holds my funds.", "Apple Cash or Chime only, sorry.",
  "Text me at 555-0100 to finish the deal off this site.", "Pay me directly at seller@example.com, it's cheaper.",
  "Use the goods and services button? no, friends & family please", "Gift crd payment only", "Pay w/ g1ft card",
];

const verdict = (note: string, history: number | null) => verdictOf(watch({ quoted: quoteNote(note), history }));
const rules = (note: string) => watch({ quoted: quoteNote(note), history: 150 }).map((f) => f.rule);

/** Joshua's answer 3: a blind writer's cash notes (`fixtures/cash-strangers.json`), a test set, not a measure. */
const CASH = JSON.parse(readFileSync(new URL("./fixtures/cash-strangers.json", import.meta.url), "utf8")) as Record<"cash_alone" | "cash_and_app" | "cash_app_refused" | "fair_with_cash_word", string[]>;
const REFUSE: Reading = { verdict: "refuse", sign: "off-paypal" };
const READINGS: Array<Reading | null> = [REFUSE, { verdict: "hold", sign: "other" }, { verdict: "clear", sign: "other" }, null];

describe("W51: the off-PayPal rule, in a stranger's words", () => {
  it(`off_paypal_wordings_never_clear: all ${SCAM.length} blind-written asks refuse or hold, as a note, a store name or an item title, whatever the record`, () => {
    expect(SCAM.length).toBeGreaterThanOrEqual(300);
    for (const n of SCAM) {
      expect([n, noteEvidence(n).length > 0]).toEqual([n, true]);
      for (const history of [0, 50, null]) expect([n, history, verdict(n, history)]).not.toEqual([n, history, "clear"]);
      expect([n, verdictOf(watch({ quoted: "", merchant: n, history: 50 }))]).not.toEqual([n, "clear"]);
      expect([n, verdictOf(watch({ quoted: "", item: n, history: 50 }))]).not.toEqual([n, "clear"]);
    }
  });

  it("the red team's probe: each of the wordings that read clear now refuses, named as an ask to be paid outside PayPal", () => {
    for (const n of PROBE) {
      expect([n, verdict(n, 50)]).toEqual([n, "refuse"]);
      expect([n, noteEvidence(n).some((e) => e.rule === "off-paypal" || e.rule === "gift-card")]).toEqual([n, true]);
    }
  });

  it(`${FAIR.length} blind-written fair notes: zero refusals (a warning about the scam, PayPal checkout named, "friends and family" as people)`, () => {
    expect(FAIR.length).toBeGreaterThanOrEqual(288);
    for (const n of FAIR) expect([n, verdict(n, 50)]).not.toEqual([n, "refuse"]);
  });

  it("the stranger's forms each refuse, and each negated or warned-about twin doesn't", () => {
    const asks = [
      "Venmo me the $40.", "PayPal me the total.", "Western Union to my cousin in Ohio.", "Wise transfer to my email.",
      "I only do F&F.", "Venmo or nothing.", "Cash App or Venmo, please.", "Please pay by Western Union, MoneyGram also fine.",
      "send payment via Zele or Venmo", "Send it as 'friends' on PayPal.", "Send as gifft on paypal", "No goods/services please.",
      "Pay thru gc (amazon).", "Cash. App. Only.", "c@sh app only", "pay at linda.pay@example.com", "Pay to $SellerGuy on Cash App.",
      "Make it payable to J. Alvarez.", "Message me and I'll tell you where to send the payment, it's not through here.",
      "Wire the $38 to my bank.", "Send the money to my personal PayPal account as family.", "Dont use the checkout button.",
    ];
    for (const n of asks) expect([n, verdict(n, 50)]).toEqual([n, "refuse"]);
    const twins = [
      "Never Venmo me, pay at checkout.", "We never ask for Venmo, Zelle or gift cards.", "If anyone asks you to pay outside PayPal checkout, it is a scam.",
      "Beware of imitators asking to chat off the site and pay by bitcoin.", "Never send us payment outside the site.",
      "We never contact buyers outside the marketplace.", "Great gift for friends and family.", "Friends and family discount: 10% off.",
      "A wise buy for any kitchen.", "The kettle plays a chime when it boils.", "Wire whisk included.", "Pay with PayPal at checkout.",
    ];
    for (const n of twins) expect([n, verdict(n, 50)]).not.toEqual([n, "refuse"]);
  });

  it("W51 review 2: an off-PayPal name no pattern read holds (W43's mention rule); one negated where it stands is clean", () => {
    for (const n of ["Throw it on my Venmo.", "Zelle is how I get paid.", "Venmo. Only.", "Hit me up on Venmo for the kettle.", "Not later, Venmo now, @kettle"]) {
      expect([n, verdict(n, 50)]).toEqual([n, "hold"]);
      expect([n, noteEvidence(n).map((e) => e.rule)]).toEqual([n, ["lists-off-paypal"]]);
    }
    for (const n of ["We can't take Zelle, please use checkout.", "Zelle is not accepted, please use checkout.", "Not via Zelle, please use checkout.",
      "Pay with PayPal; we never ask for Zelle or crypto.", "We don't do Venmo.", "Crypto-themed mug, ships tomorrow.", "Makes a perfect gift for friends and family."]) {
      expect([n, noteEvidence(n)]).toEqual([n, []]);
    }
  });

  it("W51 review 2: a negation reaches only its own clause, and a condition after it turns it around", () => {
    // The reviewer's sixteen: each refused before; none may.
    for (const n of ["Please pay at checkout, not as friends and family.", "Pay my daughter's shop at checkout, she runs the listing.",
      "Pay through checkout, and text me at 555-0100 with questions.", "Checkout via PayPal; send payment questions to help@shop.com.",
      "All payments outside of PayPal checkout are refused by us.", "Pay at checkout; we will send the gift card you won to your email.",
      "Payments only via PayPal Goods and Services at checkout; we don't do Friends and Family.", "Scam warning: we will never send a payment link by text."]) {
      expect([n, verdict(n, 50)]).not.toEqual([n, "refuse"]);
    }
    // Their twins still refuse: the same words as an ask.
    for (const n of ["Pay my daughter via Zelle.", "Pay at checkout? No, text me at 555-0100 to pay.", "We never send items before Zelle payment arrives.",
      "I'll text you a payment link.", "Venmo $40.", "Use the friends option on PayPal.", "Wire me the $85.", "Transfer to my IBAN."]) {
      expect([n, verdict(n, 50)]).toEqual([n, "refuse"]);
    }
    // A list made only of ways outside PayPal asks for each (W51): the card beside Zelle is asked for, not listed.
    expect(noteEvidence("Pay with Zelle or a gift card.").map((e) => e.rule)).toEqual(["gift-card", "lists-off-paypal"]);
    expect(noteEvidence("Pay with Visa or a gift card.").map((e) => e.rule)).toEqual(["lists-gift-card"]);
    // A refusal said after the name ends at its comma only when the rest asks nothing: a fake refusal then an ask holds.
    for (const n of ["Crypto isn't accepted, pay via the wallet I DM you.", "Zelle is not accepted, send the funds by the app instead."]) {
      expect([n, verdict(n, 50)]).not.toEqual([n, "clear"]);
    }
  });

  it("cash_in_person_holds (Joshua, 2026-10-28): never refuses, never clears; Goose pays only through PayPal checkout", () => {
    for (const n of ["Local pickup only, cash only.", "Cash at pickup.", "Pay when you collect.", "In-person only, bring cash.", "Cash on pickup, local only.",
      "Pickup only, pay cash when you collect it.", "Bring cash when you pick it up.", "Cash in hand at collection."]) {
      expect([n, verdict(n, 50)]).toEqual([n, "hold"]);
    }
    for (const n of ["No cash on delivery and no outside payments.", "Cash back is not available on this item."]) expect([n, verdict(n, 50)]).toEqual([n, "clear"]);
  });

  it("cash_alone_never_refuses_cash_beside_an_app_may (Joshua's answer 3, 2026-10-28): NEVER_REFUSE doesn't cover an app", () => {
    // Cash alone: held, never clear, and no reading refuses it, as a note or an item title, whatever the record.
    const alone = [...CASH.cash_alone, "Local pickup only, cash only.", "Cash at pickup, no Venmo.", "Cash at pickup. Venmo not accepted.",
      "Bring cash, not venmo.", "Venmo themed mug, cash at pickup.", "Cash at pickup or PayPal checkout.", "Pay the driver in cash at drop-off.",
      "Cash or card at pickup.", "in-person cash. not doing zelle or venmo anymore", "Cash only, NO Venmo, no Zelle"];
    for (const n of alone) {
      for (const ev of [{ quoted: quoteNote(n), history: 150 }, { quoted: "", item: n, history: 150 }, { quoted: quoteNote(n), history: 0 }]) {
        expect([n, watch(ev).some((f) => f.rule === "asks-for-cash")]).toEqual([n, true]);
        for (const reading of READINGS) expect([n, ev.history, verdictOf(watch({ ...ev, reading }))]).toEqual([n, ev.history, "hold"]);
      }
    }
    // Cash beside Zelle, Venmo, Cash App or another app: never clear, and refusable, by code or on the reader's refuse.
    const beside = [...CASH.cash_and_app, "Cash at pickup or Zelle.", "Cash only, or Zelle.", "Cash App at pickup.", "Cash or Cash App at meetup",
      "In person: cash, zelle, venmo, apple cash.", "cash or z3lle at pickup", "Pay cash when you collect, or Zelle me before."];
    for (const n of beside) {
      const ev = { quoted: quoteNote(n), history: 150 };
      const code = watch(ev);
      expect([n, verdictOf(code)]).not.toEqual([n, "clear"]);
      expect([n, verdictOf(code) === "refuse" || code.some((f) => f.severity === "hold" && f.field !== undefined && !NEVER_REFUSE.has(f.rule as EvidenceRule))]).toEqual([n, true]);
      expect([n, verdictOf(watch({ ...ev, reading: REFUSE }))]).toEqual([n, "refuse"]);
    }
    // Cash with the apps turned down is cash alone (Joshua's answers, 2026-10-28): held as cash, and no reading refuses it.
    for (const n of CASH.cash_app_refused) {
      expect([n, rules(n)]).toEqual([n, ["asks-for-cash"]]);
      for (const reading of READINGS) expect([n, verdictOf(watch({ quoted: quoteNote(n), history: 150, reading }))]).toEqual([n, "hold"]);
    }
    // Cash App is an app, not cash: told "a way to pay outside PayPal", never "asks to be paid in cash".
    expect(rules("Cash App at pickup.")).toEqual(["lists-off-paypal"]);
    expect(rules("Cash App only, meet at the gas station")).toEqual(["off-paypal"]);
    for (const n of ["Apple Cash when you come", "Pickup only, Cash App me", "Meet up, Cash App or Venmo"]) expect([n, rules(n).includes("asks-for-cash")]).toEqual([n, false]);
    // Fair notes with the word cash: never refused by code (fair_twins_never_refuse), and never told "asks to be paid in
    // cash" when nobody asks: a product, a name, cash back, an offer beside a card, cash turned down (review of answer 3).
    for (const n of CASH.fair_with_cash_word) expect([n, verdict(n, 150)]).not.toEqual([n, "refuse"]);
    const unasked = [...CASH.fair_with_cash_word, "Cash is not accepted and nothing should be mailed to us; checkout only.",
      "Cash box with lock and removable tray, steel. Ships in two business days via UPS.", "Cash or card, no gift card payments.",
      "Pay with cash back rewards at checkout."];
    for (const n of unasked) expect([n, rules(n).includes("asks-for-cash")]).toEqual([n, false]);
    for (const n of ["Johnny Cash At Folsom Prison vinyl LP", "Petty cash box with key", "Vintage cash registers, set of two", "Cash and carry hardware", "Cash Converters",
      "Johnny Cash deal, three LPs", "Petty cash payment log book"]) {
      expect([n, watch({ quoted: "", item: n, history: 150 }).map((f) => f.rule)]).toEqual([n, []]);
    }
  });

  it("cash_with_an_app_turned_down_is_cash_alone (Joshua's answers, 2026-10-28): turned down holds as cash, offered may refuse", () => {
    const cashAlone = (n: string) => {
      expect([n, rules(n)]).toEqual([n, ["asks-for-cash"]]);
      for (const reading of READINGS) expect([n, verdictOf(watch({ quoted: quoteNote(n), history: 150, reading }))]).toEqual([n, "hold"]);
    };
    const mayRefuse = (n: string) => {
      const code = watch({ quoted: quoteNote(n), history: 150 });
      expect([n, verdictOf(code)]).not.toEqual([n, "clear"]);
      expect([n, verdictOf(watch({ quoted: quoteNote(n), history: 150, reading: REFUSE }))]).toEqual([n, "refuse"]);
    };
    // 1. An app named only to turn it down, beside cash: cash alone, even on the reader's refuse.
    for (const n of ["Cash at pickup (I don't have Venmo).", "Cash at pickup, no Zelle.", "Cash in hand, Venmo isn't an option.", "Cash at pickup. We don't use Zelle.",
      "Cash only, don't ask about Venmo.", "Cash at pickup. Zelle? I don't use it.", "Cash only. No apps: venmo, zelle or cash app.", "Cash on pickup. No Zelle, Venmo or Cash App.",
      "Cash only, scammers keep asking for Zelle.", "Cash only, no Zelle or Venmo."]) cashAlone(n);
    // ...but an app offered beside it, a list that may turn around ("No Zelle, Venmo.") or a warning frame that may wrap
    // an ask ("If anyone asks you to pay with Zelle, …", W51) may refuse.
    for (const n of ["Cash only. I don't have Venmo, Zelle me.", "Cash at pickup. If anyone asks you to pay with Zelle, it's a scam.", "Cash at pickup. I don't have Venmo, so Zelle only.", "Cash at pickup, I don't use Venmo but Zelle works.",
      "Cash at pickup. No Zelle, Venmo.", "Cash at pickup. We don't do Venmo, Zelle."]) mayRefuse(n);
    // Away from cash, the same turned-down words still hold an app (W51 fails closed).
    for (const n of ["I don't have Venmo.", "Venmo isn't an option.", "Scammers keep asking for Zelle."]) expect([n, rules(n)]).toEqual([n, ["lists-off-paypal"]]);
    // A contrast between two ways in one match turns the negation around ("use Venmo but Zelle" was read as one negated phrase).
    for (const n of ["I don't use Venmo but Zelle works.", "We don't use Venmo but Cash App is fine."]) expect([n, verdict(n, 150)]).toEqual([n, "refuse"]);

    // 3. "No PayPal, cash only" is still cash in person: it holds as cash alone, said as cash (Goose pays only through
    // PayPal checkout, so this seller is the shopper's to handle). PayPal set aside alone, or beside an app, still refuses.
    for (const n of ["No PayPal, cash only", "No PayPal. Cash at pickup.", "We don't take PayPal, cash at pickup.", "Skip PayPal, bring cash when you collect.",
      "PayPal is disabled, cash at pickup.", "No Venmo, no Cash App, no PayPal. Cash only please"]) cashAlone(n);
    for (const n of ["No PayPal.", "No PayPal, Zelle only", "No PayPal, cash or Zelle at pickup.", "Skip PayPal, Venmo me.", "No PayPal, cash only, I don't have Venmo, Zelle me."]) {
      expect([n, verdict(n, 150)]).toEqual([n, "refuse"]);
    }

    // 2. Google Pay, Wise and Paze are ways outside PayPal checkout (W51), so beside cash they may refuse, and asked for
    // alone they refuse like Zelle. Offered beside a card, they hold.
    for (const n of ["Cash or Google Pay at pickup", "Cash or Wise at pickup", "Cash or Paze at pickup", "Cash at pickup or GPay.", "Cash, Wise or Venmo at pickup"]) mayRefuse(n);
    for (const n of ["Pay with Google Pay", "Google Pay only", "Paze only", "Send it via Wise", "Pay with Zelle or Google Pay", "Pay with Zelle; Google Pay also works."]) expect([n, verdict(n, 150)]).toEqual([n, "refuse"]);
    for (const n of ["We accept Visa, Google Pay and PayPal checkout.", "Google Pay or card at the register."]) expect([n, verdict(n, 150)]).toEqual([n, "hold"]);
    // "Wise" stays a word away from a way to pay, beside cash too.
    for (const n of ["A wise buy for any kitchen.", "Cash is a wise choice", "Cash, wise buyers welcome.", "Cash and wise shoppers only.", "Cash or chime in with an offer."]) {
      expect([n, rules(n).includes("lists-off-paypal")]).toEqual([n, false]);
    }

    // Review of these answers: a carve-out that lowers a verdict reads the whole note. PayPal set aside beside cash and
    // any other way, from any rule, refuses as before; an app turned down only for now or on a condition may refuse;
    // and "except from friends and family" names people, so it is no second way.
    for (const n of ["No PayPal, cash only. Apple Pay works too.", "No PayPal, cash or bank at pickup.", "No PayPal, cash or Visa at pickup.",
      "No PayPal, cash only, gift cards accepted.", "No PayPal, cash only, Steam codes accepted.", "No PayPal, cash only. Your budget is $500.",
      "No PayPal, cash only. Send a deposit to hold it.", "No PayPal, cash only. Deposit required to hold it.", "No PayPal, cash only. Half up front."]) {
      expect([n, verdict(n, 150)]).toEqual([n, "refuse"]);
    }
    expect(verdict("Skip PayPal, cash only, I'll text you how to pay the deposit.", 150)).not.toEqual("clear");
    expect(verdictOf(watch({ quoted: quoteNote("Skip PayPal, cash only, I'll text you how to pay the deposit."), history: 150, reading: REFUSE }))).toBe("refuse");
    for (const n of ["Cash at pickup. Zelle isn't available today, send it tomorrow.", "Cash at pickup. Zelle isn't available until Friday.",
      "Cash at pickup. I don't want Venmo unless you pay the deposit first.",
      // Security review: past a "?", or turned around in its own clause.
      "Cash at pickup. Zelle? I don't use it, unless you pay first.", "Cash at pickup. Zelle? I don't use it, my wife does, send it to her.",
      "Cash at pickup. Venmo? I don't use it otherwise.", "Cash only. I don't have Venmo, it's what I use for deposits.",
      "Cash at pickup. I don't have Zelle, my wife does.", "Cash only. Venmo? I don't use it, my husband does."]) mayRefuse(n);
    for (const n of ["We don't accept Venmo except from friends & family.", "I don't take Zelle except from family and friends.",
      "Cash only. I don't use Venmo except with friends and family."]) expect([n, verdict(n, 150)]).not.toEqual([n, "refuse"]);
  });

  it("no_paypal_cash_only_holds (Joshua, 2026-10-28): the exact note holds as cash, on every reading; an app beside it refuses", () => {
    const n = "No PayPal, cash only";
    expect(rules(n)).toEqual(["asks-for-cash"]);
    for (const reading of READINGS) expect([reading, verdictOf(watch({ quoted: quoteNote(n), history: 150, reading }))]).toEqual([reading, "hold"]);
    expect(verdict("No PayPal, cash or Zelle", 150)).toBe("refuse");
  });

  it("cash_sent_is_not_cash_alone (security review after 1fb3613): mailed, shipped or couriered cash isn't in person", () => {
    const onReading = (n: string, reading: Reading | null, merchant?: string) =>
      verdictOf(watch({ quoted: quoteNote(n), ...(merchant === undefined ? {} : { merchant }), history: 150, reading }));
    // PayPal set aside beside sent cash: hold by rule, refused when the reader says refuse; never refused by code (the
    // lead, after review round 4: no send word makes code refuse).
    for (const n of ["No PayPal. Cash only, mail it and I'll ship.", "No PayPal, cash only, shipped after payment.",
      "No PayPal, cash only, I'll post it to you.", "No PayPal, cash only, courier delivery."]) {
      expect([n, rules(n)]).toEqual([n, ["lists-off-paypal"]]);
      expect([n, onReading(n, null), onReading(n, REFUSE)]).toEqual([n, "hold", "refuse"]);
    }
    // Sent cash alone holds by rule, outside `NEVER_REFUSE`, so the reader may refuse it; in any field.
    for (const n of ["Cash only, mail it and I'll ship.", "Cash only, shipped after payment.", "Cash only. Send cash in an envelope to my address."]) {
      expect([n, rules(n)]).toEqual([n, ["lists-off-paypal"]]);
      expect([n, onReading(n, null), onReading(n, REFUSE)]).toEqual([n, "hold", "refuse"]);
    }
    // Review: other acts of sending, and leetspeak.
    for (const n of ["Cash only, m@il it and I'll sh1p.", "Cash only, UPS it to you.", "Cash only, goes in the post.", "Cash only, overnight it to my PO Box.",
      "Cash only, I'll dispatch it.", "Cash only, we can mail it to you.", "Cash only, I'll ship.",
      // Second security review: fail closed on shipping offered, "shipped", a carrier by name.
      "Cash only, free shipping.", "Cash only. Shipping available.", "Cash only, shipping $10.", "Cash only, $8 shipping.", "Cash only, will ship.",
      "Cash only, can ship.", "Cash only, shipped.", "Cash only, DHL."]) expect([n, onReading(n, null), onReading(n, REFUSE)]).toEqual([n, "hold", "refuse"]);
    expect(onReading("Mail it and I'll ship.", REFUSE, "Cash only")).toBe("refuse");
    // Joshua's answers via the lead, 2026-10-28: a store name or item title alone never lifts cash-alone protection, only the
    // note's own words do.
    for (const reading of READINGS) expect([reading, onReading("Cash only.", reading, "Ships nationwide")]).toEqual([reading, "hold"]);
    expect(onReading("Cash only. Send me the cash first.", REFUSE)).toBe("refuse");
    // Cash in person, and shipping turned down, stay cash alone: hold on every reading. Cash on delivery at the door is
    // read as in person (a question for Joshua, 025).
    for (const n of ["No PayPal, cash only", "No PayPal, cash at pickup.", "Cash only", "Local pickup only, cash only.", "Cash on delivery at your door",
      "Local pickup only, no shipping, cash only.", "Cash only. I don't ship.", "Cash only, shipping not available.",
      // Review: a noun sends nothing, and a turned-down act isn't one.
      "No PayPal, cash at pickup. E-mail me.", "No PayPal, cash at pickup, still in shipping box.", "No PayPal, cash only, pickup. Not able to ship.",
      "No PayPal, cash only. Shipping? No.", "Cash only, pickup. Postal code 94110.", "Cash at pickup; receipt given after payment.",
      "Pickup only (no mail or shipping), cash only.", "No shipping/mailing. Cash only.", "Cash only. Shipping: not available.", "Cash only, I'm unable to ship.",
      "Cash only, pickup. Ships? Nope.", "Cash at pickup. Posted it here last week.", "I can deliver it to your door, cash only.", "Cash only. I won't ship it.",
      "Cash only, pick-ups after 5pm.", "Cash only. I'll post more photos tonight.",
      "Cash only, I'm unable to ship it.", "Cash only; shipping to you is not available.",
      "Cash only. Never shipped, brand new.", "Cash only, can ship? No.", "Cash only, no free shipping, pickup.", "Cash only. Shipped from Japan originally.",
      "Cash only. Will not ship."]) {
      for (const reading of READINGS) expect([n, reading, onReading(n, reading)]).toEqual([n, reading, "hold"]);
    }
    expect(onReading("See you at pickup.", REFUSE, "Cash only")).toBe("hold");
    // Review round 2. Fair, on every reading: a past event, directions or an address mailed, shipping only through
    // checkout, a send turned down after it.
    for (const n of ["No PayPal, cash at pickup. I'll mail you directions.", "No PayPal, cash only. It was shipped to me new.",
      "No PayPal, cash at pickup, or I can ship it through checkout.", "Cash at pickup, or I can ship it if you buy through checkout.",
      "Local pickup, cash. I'll ship only if you pay through PayPal checkout.", "Bought it new, shipped to me last month. Cash at pickup.",
      "Cash only, pickup. It was mailed to me as a gift.", "Cash only at pickup. I'll mail you my address.", "Cash only, pickup. I'll ship? Nope.",
      "Cash only, pickup; we can mail? no.", "Cash only. Sorry, shipping it won't happen.", "Cash at pickup. Shipping it is a pain, so no.",
      "Cash only, pickup. Was going to ship it but no.", "Cash at pickup, I'm posting off to college next week.", "Cash only, pickup. It was shipped once before."]) {
      for (const reading of READINGS) expect([n, reading, onReading(n, reading)]).toEqual([n, reading, "hold"]);
    }
    // Sent, so the reader may refuse: cheap bypasses from round 2.
    for (const n of ["Cash only, I ship.", "Cash only, we ship.", "Cash only, will FedEx.", "Cash only, I'll send it after.", "Cash only, send it once paid.",
      "Cash only, shipping is $8.", "Cash only, I'll have it delivered.", "Cash only, delivery after payment.", "Cash only, posting it Monday.",
      "Cash only, mailing Monday.", "Cash only, UPS ground.", "Cash only, mail it to me.", "Cash only, mailed once paid."]) expect([n, onReading(n, null), onReading(n, REFUSE)]).toEqual([n, "hold", "refuse"]);
    for (const n of ["No PayPal, cash only, I'll send it after.", "No PayPal, cash only, I'll have it delivered."]) {
      expect([n, onReading(n, null), onReading(n, REFUSE)]).toEqual([n, "hold", "refuse"]);
    }
    // Review round 4: fair "No PayPal, cash" notes that name a send are held, never refused by code (the reader may).
    // Two more refuse by code through older W51 acts, at HEAD too, not the send words (025 follow-up): "Scammers ask you
    // to send cash by mail. Pay at pickup." and "Warranty card goes in the mail tomorrow."
    for (const n of ["No PayPal. Beware sellers who want you to send cash. Cash at pickup only.", "No PayPal, cash only. If you send me money first, it's a scam, don't.",
      "No PayPal, cash only. It came by mail from the manufacturer.", "No PayPal, cash at pickup. Bought online, arrived via UPS, never used.",
      "No PayPal, cash at pickup. I'll mail the rebate form myself.", "No PayPal, cash only. Shipping it? Pickup only.", "No PayPal, cash at pickup. I'll ship? Not this one."]) expect([n, verdict(n, 150)]).toEqual([n, "hold"]);
    // Review round 3: the wide forms (shipping offered, "will FedEx", a carrier, "shipped") never make code refuse a
    // "No PayPal, cash" note, only let the reader. A fair note may name them: "Comes in its original FedEx box."
    for (const n of ["No PayPal, cash only, free shipping.", "No PayPal, cash only, will FedEx.", "No PayPal, cash only. Comes in its original FedEx box.",
      "No PayPal, cash at pickup. Unopened, shipped sealed from the factory.", "No PayPal, cash only at pickup. We ship other items, not this one.",
      "No PayPal, cash at pickup. USPS tracking from when I bought it is included."]) expect([n, onReading(n, null), onReading(n, REFUSE)]).toEqual([n, "hold", "refuse"]);
    // Fair on every reading: a past event, shipping only through checkout or Goods and Services.
    for (const n of ["No PayPal, cash at pickup. I shipped it back to the maker for repair last year, works great.",
      "No PayPal, cash at pickup. Can ship if you'd rather pay with Goods and Services.", "No PayPal, cash only. Will ship? Only if you pay at checkout.",
      "No PayPal, cash at pickup. Shipped to my house last week, never used."]) {
      for (const reading of READINGS) expect([n, reading, onReading(n, reading)]).toEqual([n, reading, "hold"]);
    }
    // A checkout turned down voids nothing: still sent.
    expect(onReading("Cash only. I'll ship it once paid, never pay through PayPal.", REFUSE)).toBe("refuse");
    expect(onReading("No PayPal, cash only, I'll ship it, skip paying with checkout.", REFUSE)).toBe("refuse");
    // A store name or item title that names a thing sends nothing.
    for (const m of ["Ship in a bottle model", "Desk mail sorter", "Postage scale", "Harbor Ship Supply", "Postal Pete's Antiques"]) expect([m, onReading("Cash only.", REFUSE, m)]).toEqual([m, "hold"]);
  });

  it("joshuas_cash_answers (via the lead, 2026-10-28): a deposit, Apple Pay, a courier at the door, the note's own words, checkout shipping, \"cash is fine\"", () => {
    const on = (n: string, reading: Reading | null, more: { merchant?: string; item?: string } = {}) =>
      verdictOf(watch({ quoted: quoteNote(n), ...more, history: 150, reading }));
    const holdsAlways = (n: string, more: { merchant?: string; item?: string } = {}) => {
      for (const reading of READINGS) expect([n, more, reading, on(n, reading, more)]).toEqual([n, more, reading, "hold"]);
    };
    const mayRefuse = (n: string) => expect([n, on(n, null), on(n, REFUSE)]).toEqual([n, "hold", "refuse"]);
    // 1. A deposit sent before pickup ends cash-alone protection: a hold by rule the reader may refuse, never code.
    for (const n of ["Cash at pickup. Send a $20 deposit first to hold it.", "Cash at pickup, deposit required before pickup.",
      "Cash only, half up front.", "Cash at pickup, pay first to reserve it."]) mayRefuse(n);
    for (const n of ["Cash at pickup, no deposit needed.", "Cash at pickup. Deposit not required.", "Cash at pickup, no need for a deposit.",
      // Security review of 8478354: words that ask for no money.
      "Cash at pickup. Thanks in advance!", "Cash at pickup, text me in advance.", "Cash at pickup, happy to hold it for you until Saturday.",
      "Cash at pickup, nothing upfront.", "Cash at pickup, zero deposit.", "Cash at pickup, bottle deposit included in price.",
      // Re-review of 0733e83.
      "Cash at pickup. Send a text first.", "Cash at pickup, leave a message first.", "Cash at pickup, send a text before we meet.", "Pay cash, glad to hold it.",
      "Cash at pickup, no deposit needed.", "Cash at pickup, I'll deposit the cash later.", "Cash at pickup. Message me first."]) holdsAlways(n);
    for (const n of ["Cash at pickup, $20 deposit to hold it.", "Cash at pickup, pay half up front.", "Cash at pickup, leave a deposit first.",
      "Cash at pickup, send $20 to hold it.", "Cash at pickup, just leave a deposit.",
      "Cash only. $20 to hold it.", "Cash only. $20 up front.", "Cash only, $20 deposit holds it.", "Cash only, I need a deposit.", "Cash only. Deposit then pickup.", "Cash only, put a deposit down.", "Cash only. $50 upfront.", "Cash only, I require a $20 deposit."]) mayRefuse(n);
    // 2. Apple Pay is another app beside cash, like Google Pay; turned down, it is cash alone.
    mayRefuse("Cash or Apple Pay at pickup.");
    expect(rules("Cash or Apple Pay at pickup.")).toContain("lists-off-paypal");
    holdsAlways("Cash at pickup, no Apple Pay.");
    // 3. "except with friends and family" names people: it holds, as built.
    holdsAlways("I don't use Venmo except with friends and family. Cash at pickup.");
    // 4. Cash to a courier at the door is in person; a courier with no cash at the door, or cash on delivery turned down, still sends.
    for (const n of ["Courier delivery, cash to the courier at the door.", "Cash on delivery: pay the courier at the door.", "Courier delivery, cash on delivery.",
      "I'll have it delivered, cash on delivery.", "Pay the courier $60 cash."]) {
      holdsAlways(n);
      expect([n, rules(n)]).toEqual([n, ["asks-for-cash"]]);
    }
    for (const n of ["Cash only, courier delivery.", "Cash only, courier delivery, no cash on delivery.",
      // Security review of 8478354: cash on delivery turned down after it.
      "Cash only, courier delivery. Cash on delivery is not available.", "Cash only, courier delivery. Cash on delivery won't happen."]) mayRefuse(n);
    // 5. A store name or item title alone never lifts cash-alone protection; the note's own send words do, whatever names it.
    holdsAlways("Cash only, local pickup.", { item: "Kettle (ships nationwide)" });
    holdsAlways("Cash only, local pickup.", { merchant: "Ships Anywhere Co", item: "Kettle, will ship" });
    expect(on("Cash only, mail it and I'll ship.", REFUSE, { merchant: "Pickup Only Kettles" })).toBe("refuse");
    // 6. Shipping offered only through PayPal checkout keeps cash pickup's full protection.
    for (const n of ["Cash at pickup. Shipping available through PayPal checkout.", "Cash at pickup, or I can ship it if you pay through PayPal checkout."]) holdsAlways(n);
    // 7. "Cash is fine" and "No worries cash works" hold, never clear (decision 1); "no worries" negates nothing.
    for (const n of ["Cash is fine", "Cash is fine.", "No worries cash works", "No worries, cash works.", "No problem cash is fine"]) {
      holdsAlways(n);
      expect([n, rules(n)]).toEqual([n, ["asks-for-cash"]]);
    }
    expect(rules("Never pay with cash, it's fine to use checkout")).not.toContain("asks-for-cash");
  });

  it("cash_alone_is_only_cash (security review of the push, 2026-10-28, decided by default): money aimed elsewhere, or a deposit asked for in any field, may refuse", () => {
    const on = (n: string, reading: Reading | null, more: { merchant?: string; item?: string } = {}) =>
      verdictOf(watch({ quoted: quoteNote(n), ...more, history: 150, reading }));
    const holdsAlways = (n: string, more: { merchant?: string; item?: string } = {}) => {
      for (const reading of READINGS) expect([n, more, reading, on(n, reading, more)]).toEqual([n, more, reading, "hold"]);
    };
    const mayRefuse = (n: string, more: { merchant?: string; item?: string } = {}) => expect([n, more, on(n, null, more), on(n, REFUSE, more)]).toEqual([n, more, "hold", "refuse"]);
    // 1. Beside cash, money aimed elsewhere (a link, an account, a person, beforehand): the reader keeps its refusal.
    // Re-review of 1ce075e: commas, a cash word in the same sentence and "unless you pay" no longer excuse it.
    for (const n of ["No PayPal, cash only. My assistant will text you how to pay.", "Cash at pickup (I don't have Venmo). Payment details will be texted to you.",
      "Cash only. Settle the balance with my cousin beforehand.", "Cash only. My cousin handles the payment.",
      "Pay through the PayPal checkout, then settle the rest with my cousin beforehand. Cash at pickup.", "Cash only. Pay me through the checkout link I text you.",
      "No PayPal, cash only, my assistant will text you how to pay", "No PayPal; cash only; my assistant will text you how to pay",
      "Cash only, pay through the link I text you.", "Cash only - pay through the link I text you.",
      "Cash in person, but first pay the transfer fee to my account.", "Cash only. Pay the cash via the link I text you.",
      "Cash only. Pay through the link I text you, then pick up.", "Cash only. Settle up with my cousin beforehand, then pick up.",
      "Cash only. Cash to my cousin's account before pickup.", "Cash only. I can't hold it unless you pay me tonight.",
      "Cash only. A $20 holding fee is due tonight via the link.", "Cash only. Reimburse my cousin tonight.",
      "Cash only. Leave $50 with my neighbor tonight to reserve.", "Cash only. We'll deposit the cash you send tonight.",
      "Cash only. I will deposit the check, you send it.", "Cash only. Pay beforehand, then pick up.",
      // Each only one check reads: a web channel or a link beside a placed word.
      "Cash at pickup, or pay online at my website.", "Cash at pickup, book your slot at kettles.co/hold."]) expect([n, on(n, REFUSE)]).toEqual([n, "refuse"]);
    // Cash in person and nothing else stays protected, a pay word at the meeting, about the item or turned down included.
    for (const n of ["Cash only. Payment at pickup.", "Cash at pickup. Pay when you see it.", "Cash at pickup; receipt given after payment.",
      "Cash at pickup. Text me your number and I'll send the address.", "Cash on delivery. I do NOT take payment apps, so no cashapp",
      "Cash at pickup (I don't have Venmo).", "No PayPal, cash only.", "Cash only. Message me with any questions.",
      "Cash only. Paid $400 for it new.", "Cash only. Bring the money.", "Cash only. I accept payment in small bills.",
      "Cash only. Card payments not accepted.", "Cash only, when you arrive. Payment plans not available.",
      "Cash only. My account has 200 positive reviews.", "Cash only. Comes with the original box and a leather wallet.",
      "Cash only. Title transfer done together at the DMV.", "Cash only. You can pay in twenties.",
      "Cash only, first come first served.",
      "Cash only, cash payment when you come.", "Cash only. Paid good money for it.", "Cash only. Never pay through a link.", "Cash at pickup. Don't send money to my account.",
      "Payment? Cash in person only.", "Cash only. Bring the payment with you."]) holdsAlways(n);
    // 2. A deposit asked for in the store name or title lifts it; a send word, a deposit turned down or a product's name doesn't.
    mayRefuse("No PayPal, cash only.", { item: "Kettle, $20 deposit to hold" });
    mayRefuse("Cash only.", { merchant: "Deposit Required Kettles" });
    mayRefuse("Cash only.", { item: "Kettle (pay half up front)" });
    holdsAlways("Cash only.", { merchant: "Ships nationwide" });
    holdsAlways("Cash only.", { item: "Kettle, no deposit needed" });
    holdsAlways("Cash only.", { item: "Cash on pickup. No holds without a deposit." });
    for (const item of ["Safety deposit box", "Night deposit bags"]) holdsAlways("Cash only.", { item });
    // Commit review of 36a9f54: fail closed on any other deposit ask in a field.
    for (const item of ["Kettle, deposit holds it", "Kettle - prepaid only", "Pay first t-shirt"]) mayRefuse("Cash only.", { item });
    holdsAlways("Cash only. Pick up only.", { item: "Security deposit envelope set" });
    holdsAlways("Cash only.", { merchant: "Deposit Street Antiques" });
    // The re-reviewers' own probes (fixtures/cash-away.json): every scam may refuse, every fair note never. Re-review of
    // 0d2996f: a bare site, a texted link, a form, a code; a product's "wire", a warranty "transfer", "payment on site".
    const away = JSON.parse(readFileSync(new URL("./fixtures/cash-away.json", import.meta.url), "utf8")) as Record<"scam" | "fair", string[]> & Record<"fieldAsk" | "fieldFair", Array<{ field: "item" | "merchant"; text: string; note: string }>>;
    expect([away.scam.length, away.fair.length]).toEqual([86, 93]);
    for (const n of away.scam) expect([n, on(n, REFUSE)]).toEqual([n, "refuse"]);
    for (const n of away.fair) holdsAlways(n);
    for (const f of away.fieldAsk) mayRefuse(f.note, { [f.field]: f.text });
    for (const f of away.fieldFair) holdsAlways(f.note, { [f.field]: f.text });
    // 3. The automated review of b726fb3: money before the meeting by its verb, and "deposit the cash" only from the seller.
    for (const n of ["Cash at pickup, pay before pickup.", "Cash only, send it before we meet.", "Cash only. Deposit the cash in my account before pickup.",
      "Cash only, Zelle me first."]) expect([n, on(n, REFUSE)]).toEqual([n, "refuse"]);
    holdsAlways("Cash at pickup. We'll deposit the cash at the bank.");
    // 4. The lead's push review of b726fb3: a send verb with any object but a message, ahead of the meeting.
    for (const n of ["Cash at pickup, but send me something first.", "Cash only. Put something down before we meet.", "Cash only, leave it in my mailbox first.", "Cash at pickup. Send it first.", "Cash only. Send it up front and I'll hold it.", "Cash only. Paid in advance only.", "Cash at pickup. Send anything first and I'll hold it.", "Cash only. Put $20 down to hold it.", "Cash only. Zelle it before pickup.", "Cash only. Leave something with my neighbor first."]) expect([n, on(n, REFUSE)]).toEqual([n, "refuse"]);
    for (const n of ["Cash at pickup. Send a text first.", "Cash only, leave a message first.", "Cash only. Send me a photo first if you want it.", "Cash only. Send your address first.", "Cash only. Send me a note before we meet.", "Cash only. Leave a msg first.", "Cash only. Send the location before we meet.", "Cash only. Put it down first and look it over.", "Cash only, first come first served.", "Cash only. Send me a pic first.", "Cash only. Left handed first baseman glove.", "Cash only. Pay cash first come first served."]) holdsAlways(n);
    mayRefuse("Cash only.", { item: "Kettle, send something first to hold" });
    holdsAlways("Cash only.", { item: "Left handed first baseman glove" });
    // 6. The lead's default for a third party (2026-10-28, flip if Joshua says): paid at the meeting, cash in person;
    // paid remotely, through an app or an account, or ahead of time, still refused by code. Unplaced, the reader may.
    for (const n of ["Pay my dad at pickup, he's home all day.", "Hand the money to my roommate if I'm not around.", "Cash only. Pay my brother at pickup.",
      "Cash only. Pay my wife when you come.", "Cash only. Pay to my dad at pickup.", "Payment at pickup to my brother.",
      "Cash only. Pay my dad at pickup, he'll hold it for you."]) holdsAlways(n);
    for (const n of ["Send the money to my cousin.", "Pay my cousin through his Venmo.", "Pay my dad before pickup.", "Cash only. Pay my brother tonight, pick up tomorrow.",
      "Cash at pickup. Send the money to my wife's account.", "Cash at pickup. Please Apple Pay my wife $50 to lock it in.", "Cash at pickup. Pay my wife $20 to hold it.",
      "Cash at pickup. Pay my wife $50 to lock it in.", "Cash at pickup. Please Apple Pay my wife $50."]) expect([n, on(n, null)]).toEqual([n, "refuse"]);
    for (const n of ["Cash only. Pay my cousin.", "Cash only. Settle up with my cousin.", "Cash only. Settle up with my cousin at the front desk."]) mayRefuse(n);
    // Each meeting sign on its own: code holds, never refuses (the reader may where nothing places the money).
    for (const n of ["Hand the money to my sister.", "Pay my dad, he's home all day.", "Pay my dad if I'm not around.", "Pay my dad in person.",
      "Pay my mom at the door.", "Cash only. Pay COD."]) expect([n, on(n, null)]).toEqual([n, "hold"]);
    holdsAlways("Cash only. Pay COD.");
    // Security review of e322f04: an account, a cashtag, a phone number, a check or "where to pay" names no one met; a
    // time away from the meeting in the person's own sentence pays ahead; COD places "pay COD", never a wire or transfer.
    for (const n of ["Pickup only. Pay to 555 123 4567.", "Pickup only. Write me a check.", "Meet in person. Pay my cousin $johnny88.",
      "Cash only. Pay my wife (555) 123-4567.", "Cash only. Pay my wife 555-1234.", "Pickup only. Tell me where to pay my cousin.",
      "Cash only. Pay my cousin, I'll text you where to.",
      "Pickup Saturday. Pay my cousin today.", "Pickup Saturday. Pay my cousin asap.", "Pickup Saturday. Pay my cousin $40 today.",
      // Its re-review: the time is read in the payment's own clause, so a meeting in the next clause doesn't place it.
      "Pay my cousin today, pickup Saturday.", "Pay my cousin now; cash at pickup.", "Pickup Saturday, pay my cousin today.",
      "Pickup Saturday. Pay my cousin, today.", "Cash only. Pay my wife - asap."]) expect([n, on(n, null)]).toEqual([n, "refuse"]);
    // The lead's fail-closed default (2026-10-29): a time word anywhere, or "payable to" with no meeting, may refuse.
    for (const n of ["Pay my dad today at pickup.", "Pickup only, cash. Payable to my cousin.", "Cash only. Pay my dad at pickup, he's home today."]) mayRefuse(n);
    for (const n of ["Cash only. Wire the balance COD.", "Cash only. Transfer the rest COD."]) mayRefuse(n);
    // 5. Commit review of 7b57ac8: money moved at a time away from the meeting skips the mover's exemptions and is
    // placed only by the meeting itself.
    for (const n of ["Cash only. After payment tonight I'll release it.", "Cash only. Had a bad experience with payment so send funds now.", "Cash only. Funds due tonight.", "Cash only. Wire your half tonight.", "Cash only. Pay tonight and take it home Sunday.", "Cash only. Pay at the front desk tonight.", "Cash only. Load it after you pay today.", "Cash only. Upon payment today you get the address."]) expect([n, on(n, REFUSE)]).toEqual([n, "refuse"]);
    for (const n of ["Cash only. Pay today when you come.", "Cash only. Available now, payment at pickup.", "Cash only. No payment needed up front.", "Cash only. Pay when we meet tonight.", "Cash only. Wire shelving unit, available now.", "Cash only. Payment today in person."]) holdsAlways(n);
  });

  it("in_person_fails_closed (the lead's default after three push reviews, 2026-10-29): a third party is cash in person only when tied to the meeting and nothing in the note pays elsewhere", () => {
    const on = (n: string, reading: Reading | null) => verdictOf(watch({ quoted: quoteNote(n), history: 150, reading }));
    const holdsAlways = (n: string) => { for (const reading of READINGS) expect([n, reading, on(n, reading)]).toEqual([n, reading, "hold"]); };
    const mayRefuse = (n: string) => expect([n, on(n, null), on(n, REFUSE)]).toEqual([n, "hold", "refuse"]);
    const refuses = (n: string) => expect([n, on(n, null)]).toEqual([n, "refuse"]);
    // 1. Tied in the payment's own clause, nothing else: cash in person, never refused.
    for (const n of ["Cash only. Pay my brother at pickup.", "Cash only. Pay my wife when you come.", "Payment at pickup to my brother.", "Hand the money to my roommate if I'm not around.", "Cash in person. Money from the sale goes to my daughter's school trip."]) holdsAlways(n);
    // Untied ("payable to", a bare "pay my cousin"), or a time word beside the meeting: the reader may refuse.
    for (const n of ["Cash only. Make it payable to my cousin.", "Cash only. Pay my cousin asap at pickup.", "Cash only. Pay my dad Saturday at pickup."]) mayRefuse(n);
    // 2. The whole note, not the punctuation sentence: a remote sign elsewhere may refuse; an app named after an
    // abbreviation's period is still in the payment's sentence, refused by code; no meeting anywhere refuses as before.
    for (const n of ["Meet in person. Pay my dad at pickup. He'll send you the link.", "Cash at pickup. Pay my brother at pickup. Use the number below."]) mayRefuse(n);
    for (const n of ["Cash only. Pay my cousin Mr. Lee at pickup via Zelle.", "Cash only. Pay my cousin at pickup St. Louis Zelle johnny88.", "Cash only. Pay my cousin at pickup, i.e. Zelle him first.", "Cash only. Pay my cousin at pickup approx. 2 hrs before via Zelle.", "Make it payable to J. Alvarez."]) refuses(n);
    // The widened time away, in the payment's own sentence and not met there: refused by code, as "today" is.
    for (const n of ["Cash only. Pay my cousin tomorrow, pickup Saturday.", "Cash only. Pay my cousin this morning, pickup Sunday.", "Cash only. Pay my cousin by Friday. Pickup Sunday.", "Cash only. Pay my cousin later, I'll meet you at pickup.", "Cash only. Pay my cousin Friday. Pickup Sunday."]) refuses(n);
    // 3. Money sent or moved is placed only by the meeting, never by the item seen or handed over; a plain pay still is.
    for (const n of ["Cash only. Send $50, then take it home.", "Cash only. Send $20 once you've seen it.", "Cash only. Send the money, grab it at the front desk.", "Cash only. Transfer the rest and load it up."]) mayRefuse(n);
    for (const n of ["Cash only. Feel free to test it before you pay.", "Cash only. Pay at the front desk of my building.", "Cash only. You pay, you take it home same day.", "Cash only. Transfer the balance in person."]) holdsAlways(n);
    // Money moved at the widened time away, with no person: the reader may refuse; met there, it's cash still.
    for (const n of ["Cash only. Funds due tomorrow.", "Cash only, balance due later."]) mayRefuse(n);
    holdsAlways("Cash only. Pay tomorrow when you come.");
  });

  it("wire_holds_cod_is_cash (the lead's defaults, 2026-10-29): \"Wire the balance.\" holds and may refuse; \"COD available.\" holds and never refuses", () => {
    const on = (n: string, reading: Reading | null) => verdictOf(watch({ quoted: quoteNote(n), history: 150, reading }));
    for (const n of ["Wire the balance.", "Cash only. Wire the balance.", "Please wire me the rest.", "Wire the remainder after pickup."]) expect([n, on(n, null), on(n, REFUSE)]).toEqual([n, "hold", "refuse"]);
    for (const n of ["COD available.", "Cash only. COD available.", "COD only.", "COD is fine."]) for (const reading of READINGS) expect([n, reading, on(n, reading)]).toEqual([n, reading, "hold"]);
    // Turned down, or the game's name: nothing asked.
    for (const n of ["COD not available.", "No COD available.", "Selling COD Black Ops disc.", "Please don't wire the balance."]) expect([n, on(n, null)]).toEqual([n, "clear"]);
    // Beside an app, COD is no longer cash alone.
    expect(on("COD available. Zelle accepted.", REFUSE)).toBe("refuse");
  });

  it("money_moved_to_a_cause_never_clears (the Lead, Thu Oct 29): the cause words spare only a note that moves no money", () => {
    const on = (n: string, reading: Reading | null) => verdictOf(watch({ quoted: quoteNote(n), history: 150, reading }));
    for (const n of ["Send $50 to my daughter's school fund first.", "Transfer the money to my church before pickup.", "Deposit to my company account, cash not accepted.", "Wire the deposit to my brother's shop account.", "Send $50 to my son's fund first."]) {
      expect([n, on(n, null) === "clear"]).toEqual([n, false]);
      expect([n, on(n, REFUSE)]).toEqual([n, "refuse"]);
      // Two layers hold these since the plain-word asks (Nov 4). This rule must still say it itself, or its own break hides behind theirs.
      expect([n, watch({ quoted: quoteNote(n), history: 150, reading: null }).some((f) => !(ASK_RULES as readonly string[]).includes(f.rule))]).toEqual([n, true]);
    }
    for (const n of ["Money from the sale goes to my daughter's school trip.", "Proceeds go to my church's food drive.", "I'm selling it for my son's team fundraiser."]) expect([n, on(n, null)]).toEqual([n, "clear"]);
  });

  it("unleet reads leetspeak only inside words: amounts, sentence marks and plain words stay as written", () => {
    expect(unleet("Pay w/ g1ft crd, venm0 or z3lle")).toBe("Pay w/ gift crd, venmo or zelle");
    expect(unleet("Only 2 left! $40 today.")).toBe("Only 2 left! $40 today.");
    expect(unleet("c@sh app")).toBe("cash app");
  });
});
