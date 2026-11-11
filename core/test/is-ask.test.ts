// What counts as an ask (Round 5 consumer, nit 3): "asdf qwer" got an Approve-ready deal and "pay my rent" another. Every
// real ask the site offers or a test reads must still shop, so the lists below come from those places, and the guard and
// the buyer never see this gate.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { notAnAsk } from "../src/ask/is-ask.ts";
import { demoCatalogItems } from "../src/scenario.ts";
import { MARKET_FAILED } from "../src/ask/fictional-market.ts";
import { NO_LIMIT } from "../src/ask/ladder.ts";
import { SAY_WHICH_SPOKEN } from "../src/ask/ask.ts";
import { A_QUESTION, DIDNT_SHOP, HOLD_MEDICINE, HOLD_PRESSURE, NOT_AN_ASK_LINE, NOT_SHOPPING, NOT_UNDERSTOOD, NO_ITEM } from "../src/ask/copy.ts";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const desk = read("web/src/desk/Desk.tsx");
/** The strings of a `const NAME = [...]` list in the Desk, read from the file, so a new chip or hint is covered by itself. */
const listIn = (name: string): string[] => {
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(desk);
  if (!m) throw new Error(`${name} isn't in Desk.tsx`);
  return [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!.replace(/[“”]/g, ""));
};

describe("what counts as an ask", () => {
  it("medicine holds, never BUY NOW, and says where to go", () => {
    for (const w of [
      "my blood pressure pills", "blood pressure medicine", "blood pressure meds", "sleeping pills", "diet pills", "a pill", "PILLS", "water pills for my dog", "my medication", "my prescription", "refill my prescription",
      "insulin", "cheap insulin under $40", "antibiotics", "ozempic", "xanax", "adderall", "oxycodone", "painkillers", "pain killers", "cough syrup", "aspirin", "ibuprofen", "tylenol for my mom",
      "can you find me my pills", "what's the best blood pressure medicine", "i need my meds",
    ]) expect(notAnAsk(w), w).toBe(HOLD_MEDICINE);
    expect(HOLD_MEDICINE).toContain("pharmacist");
  });

  it("what goes with medicine, and words that only sound like it, still shop", () => {
    for (const w of [
      "pill organizer", "pill box", "weekly pill organizer under $20", "pill travel case", "pill cutter", "medicine cabinet", "medicine ball", "a medicine bag", "medicine man costume", "blood pressure monitor", "blood pressure cuff",
      "prescription glasses", "prescription sunglasses", "insulin cooler", "pillow", "pillows", "a pillowcase", "tablets", "a drawing tablet", "coffee capsules", "capsule wardrobe", "vitamins", "first aid kit", "thermometer", "dr pepper",
    ]) expect(notAnAsk(w), w).toBeNull();
  });

  it("someone asking for gift cards or fast money holds, however it's said", () => {
    for (const w of [
      "my grandson needs gift cards", "my grandson called and wants gift cards", "grandson needs gift cards", "my granddaughter needs a gift card", "my grandkids need gift cards", "my grandson's friend needs gift cards",
      "my grandson needs money", "my grandson called and needs money", "my grandson needs $500", "someone wants cash", "he asked for money", "my son needs bitcoin", "my nephew wants $900 in steam cards",
      "my boss needs gift cards", "my boss asked me to buy 3 $100 gift cards", "my pastor asked me to get apple cards", "my boyfriend needs bitcoin", "my lawyer says to send a wire transfer",
      "the irs said to pay with gift cards", "the police told me to buy gift cards", "the bank told me to get bitcoin", "microsoft said to buy gift cards", "tech support asked for gift cards", "a man called and wants zelle",
      "gift cards for my grandson in jail", "gift cards right now", "urgent gift cards", "bitcoin asap", "gift cards don't tell my son", "steam cards for my nephew, he's stuck",
      "pay the irs with gift cards", "pay with bitcoin", "paying my nephew in gift cards", "read them the gift card numbers", "send the card codes", "bail money", "bail for my son", "bail out my grandson", "i owe the irs",
    ]) expect(notAnAsk(w), w).toBe(HOLD_PRESSURE);
    expect(HOLD_PRESSURE).toContain("a number you know");
  });

  it("a gift for someone, and a card with no one pressing, still shop", () => {
    for (const w of [
      "gift card", "a gift card", "gift card under $50", "a gift card for my mom", "a $50 gift card for my grandson", "gift cards for my grandson", "a steam card", "a visa gift card", "a gift for my grandson", "a birthday gift for my boss",
      "my mom wants a kettle", "my grandson needs a bike", "my grandson needs a bike under $200", "my boss wants a stapler", "my son needs a money clip", "my wife wants a cash register", "a gift card holder",
      "a police scanner", "a court shoe", "a money clip", "a secret santa gift card", "a book about bitcoin", "a hospital bed",
    ]) expect(notAnAsk(w), w).toBeNull();
  });

  it("both holds open the way the Desk reads them, and the Desk carries only the opening", () => {
    for (const line of [HOLD_MEDICINE, HOLD_PRESSURE, NOT_SHOPPING, NOT_UNDERSTOOD]) expect(NOT_AN_ASK_LINE.test(line), line).toBe(true);
    // Reasons where a market may yet come, or the trouble is ours: still "no market yet" or a retry, never "didn't shop".
    for (const line of [NO_LIMIT, MARKET_FAILED, SAY_WHICH_SPOKEN, "Goose couldn't judge that just now. Nothing was placed.", "Goose couldn't build that just now. Nothing changed."]) expect(NOT_AN_ASK_LINE.test(line), line).toBe(false);
    expect(desk).toContain('NOT_AN_ASK_LINE.test(failed ?? "")');
    expect(desk).not.toMatch(/HOLD_MEDICINE|HOLD_PRESSURE/);
  });

  it("nothing in the catalog holds", () => {
    const words = [...demoCatalogItems().values()].flatMap((e) => [e.item, e.category]);
    expect(words.length).toBeGreaterThan(3); // Control: an empty read passes anything, and one did by hand.
    expect(words.filter((w) => [HOLD_MEDICINE, HOLD_PRESSURE].includes(notAnAsk(w) ?? ""))).toEqual([]);
  });

  it("every chip and hint on the Desk shops", () => {
    const asks = [...listIn("CHIPS"), ...listIn("HINTS")];
    expect(asks.length).toBeGreaterThanOrEqual(7);
    for (const w of asks) expect(notAnAsk(w), w).toBeNull();
  });

  it("every ask the understood card's and the routes' tests read still shops", () => {
    const quoted = (path: string, re: RegExp) => [...read(path).matchAll(re)].map((m) => m[1]!);
    const asks = [
      ...quoted("core/test/understood.test.ts", /\bread\("([^"]+)"\)/g),
      ...quoted("core/test/understood.test.ts", /for \(const w of \[((?:"[^"]+",?\s*)+)\]/g).flatMap((l) => [...l.matchAll(/"([^"]+)"/g)].map((x) => x[1]!)),
      ...quoted("core/test/abuse.test.ts", /market\/ask", \{ words: "([^"]+)" \}/g),
    ];
    expect(asks.length).toBeGreaterThan(15);
    for (const w of asks) expect(notAnAsk(w), w).toBeNull();
  });

  it("real asks shop, however short, foreign or close to a stopped word", () => {
    for (const w of [
      "airpods", "flight to chicago", "a kettle", "cheap tv for my mom", "a ticket under $500", "a ticket under $20", "two concert tickets under $500",
      "tv", "usb", "usb c cable", "hdmi", "ps5", "mp3 player", "ssd", "bbq", "rtx 4090", "iphone 15", "xbox", "hat", "pen",
      "vodka", "fjord cruise", "schnapps", "pitchfork", "background music", "watchful owl figurine", "liberty print dress", "property deed frame", "poi", "yoyo", "tutu",
      "un regalo para mi mamá", "チケット", "咖啡机", "кофеварка", "قهوة",
      "rent a car", "a rental car", "pay for a kettle", "pay phone", "a money clip", "money box", "cash register", "gift card", "dollar bill", "tax software",
      "a gift for my landlord", "send flowers to my mom", "hello kitty mug", "test strips", "bar stool", "qwerty keyboard",
    ]) expect(notAnAsk(w), w).toBeNull();
  });

  // One real word lets an ask through, so a word rule is only tested by a word alone: "fjord cruise" passes with no rule at all.
  it("each word a noise rule could catch shops by itself", () => {
    for (const w of ["fjord", "django", "liberty", "property", "background", "watchful", "schnapps", "vodka", "pitchfork", "aa", "dd", "5'7"]) expect(notAnAsk(w), w).toBeNull();
  });

  it("keyboard noise and words that name nothing aren't understood", () => {
    for (const w of [
      "asdf qwer", "asdf", "ASDF", "qwer", "qwerty", "asdfghjkl", "zxcv", "hjkl", "lkjh", "sdfsdf", "asdasd", "asdf123", "aksjdh", "lkjasdlkj", "fjdksla", "dfgsk",
      "aaaa", "zzz", "lololo", "hmmmm", "12345", "$$$", "!!!", "???", "🎁",
      "under $50", "under 50 dollars", "I want something", "find me anything", "buy me a", "something cheap",
      "test", "testing", "hello", "hi there", "foo bar", "blah blah", "lorem ipsum", "nothing", "thanks",
    ]) expect(notAnAsk(w), w).toBe(NOT_UNDERSTOOD);
  });

  it("a bill or money sent isn't shopping", () => {
    for (const w of [
      "pay my rent", "PAY MY RENT", "pay rent", "Pay my rent please", "can you pay my rent", "help me pay my electric bill", "pay off my credit card", "pay my parking ticket",
      "pay my landlord", "pay back my brother", "cover my rent", "send money to my mom", "send my mom $50", "wire $500", "transfer 50 dollars", "venmo my friend 20 dollars",
      "my rent", "rent", "mortgage", "my taxes", "student loans", "phone bill",
    ]) expect(notAnAsk(w), w).toBe(NOT_SHOPPING);
  });

  it("a question gets a line, never a deal (Round 5, B1)", () => {
    for (const w of [
      "is this safe?", "Is this safe", "IS THIS SAFE?", "how does this work", "how does this work?", "how it works", "is it safe", "is this a scam", "are you real", "are you a person",
      "can i trust you", "can you help me", "does it cost money", "does this cost anything", "how much does it cost", "how much is it", "what is this", "what's this", "whats this", "what can you do",
      "what can i buy", "why is it so cheap", "why did my order not arrive", "why", "who are you", "who is this", "who made this", "what now", "what should i do", "what's the catch", "how do refunds work", "do you take paypal", "legit?", "really?", "safe?", "scam?", "is paypal safe", "is goose safe", "is there a catch", "is there a fee", "can i get a refund",
      "do i need an account", "do i need a paypal account", "how do i get started", "how do i buy something", "where do i start", "when does it charge me", "will you take my money", "should i trust this", "this safe?",
      // Each word alone: nothing else in the words could be the rule's reason.
      "is", "are", "can", "does", "how", "what", "who", "do", "did", "where", "when", "will", "could", "should",
    ]) expect(notAnAsk(w), w).toBe(A_QUESTION);
  });

  it("a question with something to buy in it still shops", () => {
    for (const w of [
      "is there a kettle under $60", "is there a kettle", "are there any kettles", "can you find me a kettle", "can you get me a kettle", "what's a good gift for my mum under $40", "what is the best tv",
      "how much is a kettle", "how much are airpods", "how about a kettle", "what about a kettle", "where can i buy a kettle", "do you have airpods", "do you sell kettles", "could i get a kettle",
      "can i buy a gift card", "is a kettle under $60 ok", "should i buy a kettle",
      // They start like a question and aren't one.
      "why nations fail", "how to cook book", "what if book", "can opener", "am fm radio", "will ferrell dvd", "do rag", "what size tv", "who moved my cheese", "how the grinch stole christmas", "where the wild things are book", "are airpods any good", "kettle?", "a safe", "gun safe", "safe", "work boots", "real leather wallet",
    ]) expect(notAnAsk(w), w).toBeNull();
  });

  it("words about her day get a line, never a deal: a person who called never shops", () => {
    for (const w of [
      "help me", "help", "please help", "i need help", "I'm scared", "im scared", "i am scared", "i'm worried", "i feel confused", "i'm not sure", "scared", "worried", "scammed", "i was scammed",
      "my grandson called", "my grandson", "my mom", "my grandson called me", "my bank called", "someone called me", "somebody texted me", "a man called", "the irs called", "the police called me", "my son is in trouble", "my grandson is in jail",
      "someone called and said i need a new computer", "my doctor said",
      "i got scammed", "i think i got scammed", "i forgot my password", "i don't know", "i don't understand", "not sure", "i just want to talk", "i need help with my account", "my order never arrived", "they took my money", "my grandson needs help",
    ]) expect(notAnAsk(w), w).toBe(NO_ITEM);
    for (const w of ["i need money", "send money", "i want cash"]) expect(notAnAsk(w), w).toBe(NOT_SHOPPING);
  });

  it("a sentence that goes on to name something to buy still shops", () => {
    for (const w of [
      "i'm looking for a kettle", "im shopping for a tv", "i am after a kettle", "i'm cold and need a blanket", "my doctor said i need a walker", "my mom wants a kettle", "my grandson's birthday gift", "a gift for my grandson",
      "a book called dune", "a movie called jaws", "a man called ove", "a man called ove book", "i think i need a new tv", "i just want a kettle", "i need help finding a kettle", "help me find a kettle", "my order of kettles under $60", "phone for my grandson", "i need a phone",
    ]) expect(notAnAsk(w), w).toBeNull();
  });

  it("a word it can't read shops: one real word lets the noise through", () => {
    expect(notAnAsk("asdf kettle")).toBeNull();
    expect(notAnAsk("asdf ケトル")).toBeNull();
  });

  it("the routes ask the gate before the card, before a cap and before a model, and the Desk says so with no deal", () => {
    const main = read("server/src/main.ts");
    const card = main.slice(main.indexOf('app.post("/api/runs/market/understand"'), main.indexOf('app.post("/api/runs/market/ask"'));
    expect(card.indexOf("notAnAsk(words)")).toBeGreaterThan(-1);
    expect(card.indexOf("notAnAsk(words)")).toBeLessThan(card.indexOf("understand(words, policy)"));
    const ask = main.slice(main.indexOf('app.post("/api/runs/market/ask"'));
    expect(ask.indexOf("notAnAsk(words)")).toBeGreaterThan(-1);
    for (const later of ["recordedMarket(words)", "ASK_CAPS.takeOrWhy", "makeFictionalMarket("]) expect(ask.indexOf("notAnAsk(words)"), later).toBeLessThan(ask.indexOf(later));
    expect(desk).toContain('isFailed && notAsk ? DIDNT_SHOP');
    expect([NOT_UNDERSTOOD, NOT_SHOPPING, DIDNT_SHOP, A_QUESTION, NO_ITEM]).toEqual([
      "Goose didn't understand that. Try naming something to buy.",
      "Goose only shops for things to buy. It can't pay a bill or send money.",
      "Goose didn't shop for that.",
      "That sounds like a question.",
      "Try naming something to buy.",
    ]);
    // Both go on to how it works, on the Desk's own line.
    expect(desk).toContain("failed === A_QUESTION || failed === NO_ITEM");
    expect(desk).toContain('talk && <> <LinkBtn to="?desk=how">How it works</LinkBtn></>');
  });

  it("the gate is words only: the guard and the buyer don't read it", () => {
    for (const f of ["trust/src/guard.ts", "core/src/buyer.ts", "core/src/haggle.ts"]) {
      let src: string;
      try { src = read(f); } catch { continue; }
      expect(src, f).not.toContain("notAnAsk");
    }
    expect(read("core/src/ask/is-ask.ts").match(/^import .*$/gm)).toEqual(['import { A_QUESTION, HOLD_MEDICINE, HOLD_PRESSURE, NOT_SHOPPING, NOT_UNDERSTOOD, NO_ITEM } from "./copy.ts";']);
  });
});
