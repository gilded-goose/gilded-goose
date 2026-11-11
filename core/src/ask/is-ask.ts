// What counts as an ask (Round 5 consumer, nit 3, Nov 4). "asdf qwer" got an Approve-ready $11.99 and "pay my rent" $19.99,
// because the only gate was two characters: whatever came in, a market was made for it, and a model prices anything. This
// is the one gate in front of the card and the market, before any model call. Pure and fixed: words in, a line or null.
//
// Unsure means shop. It answers only for words that name nothing to buy: no item left once the money and filler are off,
// every word left being keyboard noise, or a bill or money sent, which is no purchase. One real word anywhere lets the
// ask through, and any letter outside ASCII counts as real, since these tables read only English. This decides nothing
// about money: the guard and the buyer never see it, and it can't clear a seller or raise a limit.
//
// The one exception to "one real word": a question or a sentence about her day (Round 5 consumer, B1). "is this safe?" got
// BUY NOW and "Paid $42.00", and a nervous first-timer's first words are often that. These read the shape of the words, and a
// shape gives way to a sign of shopping plus an item: "is there a kettle under $60" still shops. A person who calls is the one
// shape nothing lets through, since "my grandson called and wants gift cards" is a scam, not a shopping list.
//
// Two holds come before all of it (Lead-11, Nov 4). "my blood pressure pills" got BUY NOW from a fictional seller, and
// "my grandson needs gift cards" did too: both name a real thing, so "one real word" let them through. When unsure, hold.
// "Decided by default: hold. Flip if Joshua says." A thing that goes with medicine still shops ("pill organizer"), and so
// does a gift for someone ("a gift card for my mom"): it takes someone asking, or a rush, to make a gift card a hold.

import { A_QUESTION, HOLD_MEDICINE, HOLD_PRESSURE, NOT_SHOPPING, NOT_UNDERSTOOD, NO_ITEM } from "./copy.ts";

/** Words that name no item: an ask of only these says what she'd pay or how she asks, not what she wants. */
const FILLER = new Set(["a", "about", "an", "and", "any", "anything", "around", "at", "below", "best", "bucks", "buy", "can", "cheap", "cheapest", "dollar", "dollars", "find", "for", "get", "good", "i", "i'd", "i'm", "in", "is", "it", "less", "like", "looking", "max", "maximum", "me", "most", "my", "need", "new", "nice", "of", "on", "or", "over", "please", "show", "some", "something", "stuff", "than", "that", "the", "thing", "things", "this", "to", "under", "up", "usd", "used", "want", "with", "would", "you"]);
/** Whole asks people type to see what happens. Exact only: "test strips", "bar stool" and "hello kitty mug" still shop. */
const NOT_AN_ITEM = new Set(["abc", "abc123", "bar foo", "blah", "blah blah", "blah blah blah", "foo", "foo bar", "hello", "hello there", "hello world", "hey", "hey there", "hi", "hi there", "idk", "lol", "lorem ipsum", "nah", "no", "nope", "nothing", "ok", "okay", "test", "test test", "testing", "thank", "thanks", "thank you", "whatever", "xxx", "xyz", "yes", "yo", "hi goose", "hey goose", "hello goose", "huh", "legit", "really", "dunno"]);

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"] as const;
/** The step along a keyboard row from one letter to the next: 1, -1, or 0 when they aren't neighbors there. */
function rowStep(a: string, b: string): number {
  for (const row of ROWS) {
    const i = row.indexOf(a);
    if (i < 0) continue;
    const j = row.indexOf(b);
    return j >= 0 && Math.abs(j - i) === 1 ? j - i : 0;
  }
  return 0;
}
/** The top row spells real endings ("liberty", "property"), so it needs a longer run there, or the row's own ends. */
const longRun = (run: string): boolean => run.length >= (ROWS[0].includes(run[0]!) ? 5 : 4) || ["qwer", "rewq", "uiop", "poiu"].includes(run);
/** A hand sliding along the keyboard: a long run anywhere, or a word made wholly of runs of three ("asdasd", "qwe"). */
function keyboardRun(w: string): boolean {
  let covered = true;
  for (let i = 0; i < w.length;) {
    const dir = i + 1 < w.length ? rowStep(w[i]!, w[i + 1]!) : 0;
    let end = i + 1;
    while (dir !== 0 && end < w.length && rowStep(w[end - 1]!, w[end]!) === dir) end++;
    const run = w.slice(i, end);
    if (longRun(run)) return true;
    if (run.length < 3) covered = false;
    i = end;
  }
  return covered && w !== "poi"; // poi is a food
}
/** Pairs English keeps out of a word, read only inside four or more consonants in a row, so "fjord" and "django" stay words. */
const RARE_PAIR = /kj|jk|jh|hj|jd|dj|jf|fj|sj|js|jg|gj|qp|pq|qw|wq|zx|xz|vq|qv|fq|qf|xq|qx/;
const scrambled = (w: string): boolean => w.split(/[aeiouy]/).some((run) => run.length >= 4 && RARE_PAIR.test(run));

/** Keyboard noise, not a word. Digits are read off first ("asdf123"); a short word with no vowel may be a code, so it shops ("usb", "ps5"). */
function isNoise(token: string): boolean {
  if (!/^[a-z0-9']+$/.test(token)) return false; // letters these tables can't read count as real
  const w = token.replace(/[^a-z]/g, "");
  if (w.length < 3) return false;
  if (/^(.)\1+$/.test(w) || /^(..)\1{2,}$/.test(w) || /(.)\1{3}/.test(w)) return true; // "aaa", "lololo", "hmmmm"
  if (keyboardRun(w)) return true;
  if (w.length >= 5 && !/[aeiouy]/.test(w)) return true; // "dfgsk"
  return scrambled(w); // "aksjdh"
}

/** Question words that can start a question by themselves. A contraction carries its own verb. */
const WHY_WHO = new Set(["what's", "whats", "how's", "hows", "where's", "wheres", "when's", "who's", "whos"]);
/** These start a question only with a verb next: "how does this work" does, and "how the grinch stole christmas" and "what size tv" don't. */
const WH_THEN_VERB = new Set(["how", "what", "when", "where", "who"]);
const VERB = new Set(["is", "isn't", "isnt", "are", "aren't", "arent", "am", "was", "were", "can", "can't", "cant", "could", "couldn't", "would", "wouldn't", "will", "won't", "should", "shouldn't", "does", "doesn't", "doesnt", "do", "don't", "dont", "did", "didn't", "didnt", "has", "have"]);
/** After a verb only these make it a question: "can you", "is this". So "can opener", "am fm radio" and "will ferrell dvd" shop. */
const SUBJECT = new Set(["this", "that", "these", "those", "it", "there", "you", "i", "we", "they", "he", "she", "goose", "paypal", "my", "your", "the", "a", "an", "anyone", "anybody", "someone", "somebody", "anything", "everything", "all", "any", "people"]);
/** What can follow how, what, when, where or who, besides a verb. */
const WH_NEXT = new Set(["much", "many", "long", "about", "to", "it", "if", "now", "happens", "happen", "come", "made", "built", "runs", "owns", "makes", "created"]);

/** "why is it so cheap" asks about Goose whatever it names. "why nations fail" is a book. */
const isWhy = ([first, next]: readonly string[]) => (first === "why" || first === "why's") && (next === undefined || first === "why's" || VERB.has(next) || next === "so" || next === "not" || next === "no");

function isQuestion(tokens: readonly string[]): boolean {
  const [first, next] = tokens;
  if (!first) return false;
  if (WHY_WHO.has(first)) return true;
  if (WH_THEN_VERB.has(first)) return next === undefined || VERB.has(next) || WH_NEXT.has(next);
  return VERB.has(first) && (next === undefined || SUBJECT.has(next));
}

/** Signs she's shopping, in a question or a sentence about herself. Each needs an item with it (`namesAnItem`). */
const SHOPPING = /\b(?:buy(?:ing)?|purchase|order|shop(?:ping)?|find(?:ing)?|get(?:ting)?|got|sell(?:s|ing)?|need|want|recommend|suggest|carry|stock|have|good|best|cheap(?:er|est)?|nice|decent|great|there|after|how much|how about|what about|looking for|book|dvd|movie|film|poster)\b|\$\s?\d|\b\d[\d,.]*\s*(?:dollars|bucks|usd)\b|\b(?:under|below|less than)\s+\d/;
/** The question's own words, and what people ask about Goose: with these off, an item is what's left. "can i get a refund" has none. */
const NOT_THE_ITEM = new Set([...WHY_WHO, ...WH_THEN_VERB, ...VERB, ...SUBJECT, ...WH_NEXT,
  "account", "arrive", "arrived", "catch", "charge", "charges", "charged", "cost", "costs", "feel", "feeling", "fee", "fees", "forgot", "hacked", "help", "human", "just", "know", "legit", "lost", "never", "not", "really", "scammed", "stole", "stolen", "sure", "talk", "think", "took", "understand", "don't", "dont", "limit", "limits", "mean", "means", "money", "much", "my", "number", "password", "person", "problem", "question", "real", "refund", "refunds", "return", "returns", "risk", "safe", "scam", "scams", "started", "start", "trust", "use", "using", "way", "work", "working", "works", "order", "orders", "got", "ok", "okay", "worth",
]);
/** On their own, no shape needed: words about trouble, not things. Not "safe", since a safe is a thing she can buy. */
const ONLY_TALK = new Set(["help", "scam", "scammed", "hacked", "scared", "afraid", "worried", "confused"]);
const KIN = "grandson|granddaughter|grandchild|grandkid|grandma|grandpa|grandmother|grandfather|mom|mum|dad|mother|father|son|daughter|kid|husband|wife|brother|sister|nephew|niece|uncle|aunt|cousin|friend|neighbor|neighbour|caregiver|landlord|boss|bank|doctor";
const CALLER = `(?:(?:my|our)\\s+(?:${KIN})|someone|somebody|a\\s+(?:man|woman|guy|lady|person|stranger)|the\\s+(?:bank|irs|police|fbi|government|court)|they|he|she)`;
/** Someone reached her, or something happened. Nothing lets this shop: it's how a scam starts. "a book called dune" isn't a caller. */
const SOMEONE_CALLED = new RegExp(`^${CALLER}\\s+(?:just\\s+)?(?:called|calling|phoned|texted|emailed|messaged|contacted|threatened|hacked|scammed|arrested|stole|took|needs?\\s+help|is\\s+in\\s+(?:jail|trouble)|in\\s+(?:jail|trouble))(?=[\\s,.!?]*$|[\\s,.!?]+(?:me|us|and|from|to|about|saying|said|today|yesterday|again|my|the|last|this|just|but|he|she|they|i)\\b)`);
/** A sentence about herself or what someone said: shopping can still follow ("my doctor said i need a walker"). */
const ABOUT_HER_DAY = new RegExp(`^(?:i'm|im|i\\s+am|i\\s+feel|feeling|i\\s+was|i've\\s+been|ive\\s+been|i\\s+(?:lost|forgot|think|just|got|don't|dont|do\\s+not|need\\s+help)|not\\s+sure|my\\s+(?:order|package|delivery|refund|money|account|password|paypal)|${CALLER}\\s+(?:said|says|told|tells)\\b)\\b`);
const ONLY_KIN = new RegExp(`^(?:my|our)\\s+(?:${KIN})$`);

const PERSON = "landlord|friend|mom|mum|dad|mother|father|brother|sister|boss|contractor|babysitter|roommate|him|her|them|someone";
const BILL = "rent|mortgage|bills?|tuition|tax(?:es)?|debts?|loans?|fines?|invoices?|credit\\s+cards?|car\\s+payments?|insurance|utilities|dues|parking\\s+tickets?|speeding\\s+tickets?|traffic\\s+tickets?";
/** Paying a bill or a person, or sending money, in any place in the words ("can you pay my rent"). "pay for a kettle" and "rent a car" shop. */
const MONEY_AWAY = [
  new RegExp(`\\b(?:pay(?:ing)?(?:\\s+off)?|repay)\\s+(?:for\\s+)?(?:(?:my|our|the|his|her|their|this|next)\\s+)?(?:[a-z]+\\s+){0,2}?(?:${BILL})\\b`),
  new RegExp(`^(?:please\\s+)?(?:settle|cover)\\s+(?:(?:my|our|the)\\s+)?(?:[a-z]+\\s+){0,2}?(?:${BILL})\\b`),
  new RegExp(`\\bpay(?:ing)?\\s+(?:back\\s+)?(?:(?:my|the|that|this)\\s+)?(?:${PERSON})\\b`),
  /\b(?:send|wire|transfer|move|venmo|zelle|give|lend|loan)\s+(?:[a-z]+\s+){0,2}?(?:\$\s?\d[\d,.]*|\d[\d,.]*\s*(?:dollars|bucks|usd)\b|money\b(?!\s+(?:clip|box|tree|belt))|cash\b|funds\b)/,
  /\b(?:needs?|wants?|ask(?:s|ing|ed)\s+for)\s+(?:some\s+|more\s+)?(?:money|cash|funds)\b/,
  /^(?:my\s+|our\s+|the\s+)?(?:rent|rent money|mortgage|taxes|tuition|bills|(?:utility|electric|gas|water|phone|cable|internet|credit card|medical)\s+bills?|student loans?|car payment)$/,
];

/** Medicine by name, on the prescription and over the counter. Not "tablets" or "capsules", which are also iPads and coffee. */
const MEDICINE_WORD = "pills?|medicines?|medications?|meds|prescriptions?|painkillers?|pain\\s+killers?|antibiotics?|antacids?|antihistamines?|laxatives?|statins?|cough\\s+syrup|chemo(?:therapy)?|"
  + "insulin|metformin|lisinopril|atorvastatin|amoxicillin|warfarin|albuterol|epipen|ozempic|wegovy|mounjaro|semaglutide|viagra|cialis|xanax|valium|ambien|adderall|prozac|zoloft|lexapro|"
  + "oxycodone|oxycontin|hydrocodone|vicodin|percocet|tramadol|fentanyl|morphine|codeine|aspirin|ibuprofen|advil|tylenol|acetaminophen|aleve|naproxen|benadryl|nyquil|dayquil|claritin|zyrtec";
/** What goes with medicine and is no medicine. One word may sit between: "pill travel case". */
const GOES_WITH = "organi[sz]ers?|box(?:es)?|cases?|cabinets?|dispensers?|bottles?|balls?|cutters?|splitters?|crushers?|holders?|pouch(?:es)?|bags?|trays?|reminders?|chests?|pillows?|timers?|sorters?|jars?|coolers?|"
  + "glasses|sunglasses|lens(?:es)?|goggles|man|hat|books?|textbooks?|bugs?|wheels?|shows?|movie|film|posters?|shirts?|t-shirts?|costumes?|mugs?|stickers?|games?";
const MEDICINE = new RegExp(`\\b(?:${MEDICINE_WORD})\\b(?!(?:\\s+[a-z'-]+)?\\s+(?:${GOES_WITH})\\b)`);

/** How a scam asks to be paid. Each one is hard to get back. */
const PAID_LIKE_A_SCAM = "gift\\s?cards?|(?:apple|itunes|google\\s+play|steam|amazon|target|walmart|ebay|best\\s+buy|visa|vanilla|razer|psn|prepaid(?:\\s+(?:debit|visa))?)\\s+cards?|"
  + "bitcoins?|btc|crypto(?:currency)?|ethereum|western\\s+union|moneygram|wire\\s+transfers?|money\\s+orders?|zelle|venmo|cash\\s?app";
const ASKER = `(?:(?:my|our|the)\\s+(?:${KIN}|pastor|priest|coworker|co-worker|manager|lawyer|attorney|officer|sheriff|judge|irs|police|fbi|government|court|boyfriend|girlfriend|fianc[eé]|grandkid)s?(?:'s\\s+[a-z]+)?|`
  + "someone|somebody|a\\s+(?:man|woman|guy|lady|person|stranger)|they|he|she|grandson|granddaughter|grandchild|grandkids?|microsoft|tech\\s+support|customer\\s+support|geek\\s+squad|social\\s+security)";
const ASKS = "needs?|needing|wants?|wanted|asked|asks|asking|said|says|told|tells|texted|emailed|called|phoned|begged|begging|demanded|demands|insisted|instructed";
/** Someone asking for it. Any way it's said: "my boss asked me to buy 3 $100 gift cards", "my grandson called and needs money". */
const SOMEONE_ASKS = new RegExp(`\\b${ASKER}\\b(?:\\s+[a-z']+){0,3}?\\s+(?:${ASKS})\\b(?:\\s+\\S+){0,6}?\\s+(?:${PAID_LIKE_A_SCAM}|money\\b(?!\\s+(?:clip|box|tree|belt))|cash\\b(?!\\s+(?:register|box))|funds\\b)|\\b${ASKER}\\b(?:\\s+[a-z']+){0,3}?\\s+(?:${ASKS})(?:\\s+(?:me|us|to|send|wire|another|about|around|over))*\\s+\\$\\s?\\d`);
const RUSH = "urgent(?:ly)?|emergency|asap|right\\s+(?:now|away)|immediately|hurry|jail|arrested|hospital|stranded|stuck|accident|trouble|kidnapped|deported|warrant|lawsuit|irs|police|fbi|sheriff|court|don't\\s+tell|dont\\s+tell|keep\\s+it\\s+(?:a\\s+)?secret";
/** No one named, or only named as who it's for, but a rush beside it: "gift cards for my grandson in jail". */
const RUSHED = [new RegExp(`\\b(?:${PAID_LIKE_A_SCAM})\\b.*\\b(?:${RUSH})\\b`), new RegExp(`\\b(?:${RUSH})\\b.*\\b(?:${PAID_LIKE_A_SCAM})\\b`)];
/** Paying with one, reading out its numbers, bail, or a debt to someone who sends no such bill. */
const PAYS_THAT_WAY = [
  new RegExp(`\\bpay(?:ing)?\\s+(?:[a-z']+\\s+){0,3}?(?:with|in|by|using)\\s+(?:\\S+\\s+){0,2}?(?:${PAID_LIKE_A_SCAM})\\b`),
  /\b(?:send|read|give|text|email)\b.*\bcards?\s+(?:codes?|numbers?)\b/,
  /\bbail\s+(?:out\s+)?(?:money|for|my|our)\b/,
  /\bi\s+owe\s+(?:the\s+)?(?:irs|bank|police|court|government|fbi)\b/,
];

/**
 * Null when the words may be an ask. Otherwise the line that says why no market is made, with no model called and no deal
 * offered. The server asks this before the card and before the market (`server/src/main.ts`).
 */
export function notAnAsk(words: string): string | null {
  const folded = words.normalize("NFKC").toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
  if (SOMEONE_ASKS.test(folded) || RUSHED.some((re) => re.test(folded)) || PAYS_THAT_WAY.some((re) => re.test(folded))) return HOLD_PRESSURE;
  if (MEDICINE.test(folded)) return HOLD_MEDICINE;
  if (MONEY_AWAY.some((re) => re.test(folded))) return NOT_SHOPPING;
  // A price is off first, then each word by itself: what's left has to name something.
  const bare = folded.replace(/\$\s?\d[\d,.]*k?/g, " ");
  const tokens = bare.split(/[^\p{L}\p{M}\p{N}']+/u).map((t) => t.replace(/^'+|'+$/g, "")).filter(Boolean);
  const named = tokens.filter((t) => !FILLER.has(t) && !/^\d[\d,.]*$/.test(t));
  const namesAnItem = () => SHOPPING.test(folded) && named.some((t) => !NOT_THE_ITEM.has(t) && !isNoise(t));
  if (SOMEONE_CALLED.test(folded) || ONLY_KIN.test(folded)) return NO_ITEM;
  if (isWhy(tokens)) return A_QUESTION;
  if (isQuestion(tokens)) return namesAnItem() ? null : A_QUESTION;
  if (ABOUT_HER_DAY.test(folded)) return namesAnItem() ? null : NO_ITEM;
  if (folded.endsWith("?") && named.length > 0 && named.every((t) => NOT_THE_ITEM.has(t))) return A_QUESTION;
  if (named.length > 0 && named.every((t) => ONLY_TALK.has(t))) return NO_ITEM;
  if (NOT_AN_ITEM.has(named.join(" "))) return NOT_UNDERSTOOD;
  return named.every(isNoise) ? NOT_UNDERSTOOD : null; // nothing named at all is every word too
}
