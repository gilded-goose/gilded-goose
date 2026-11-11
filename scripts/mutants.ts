// Mutants (shared Lesson 2, project Lesson 27): each rule broken on purpose, one at a time, must fail its test file.
// The source is restored after each, and on Ctrl-C. Re-runnable from the repo root, one set or all:
// corepack pnpm mutants [set]
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

type Mutant = [name: string, from: string, to: string];
type Set = { file: string; test: string; cwd?: string; mutants: Mutant[] };

// The reader's line stands in both AI routes, word for word; these lines before it say which one a mutant means.
const TRICK_ROUTE = `takeOrWhy(key, ip);
    if (hit) return c.json({ error: "Today's counted tries from here are used up. Nothing was placed.", cap: hit }, 429);
  }
  const reader = aiState === "on" && parsed.value.mode === "ai" && JUDGE_READER`;
const JUDGE_ROUTE = `takeOrWhy(token, ip);
    if (hit) return c.json({ error: "Today's counted tries from here are used up. Nothing was placed.", cap: hit }, 429);
  }
  const reader = aiState === "on" && parsed.value.mode === "ai" && JUDGE_READER`;

const SETS: Record<string, Set> = {
  // Track C's plain-word asks: every row is seen by a test, and none of it can refuse. Rows are read from the file, so a new one is covered.
  asks: {
    file: "trust/src/asks.ts",
    test: "test/watch-asks.test.ts",
    cwd: "core",
    mutants: [
      ...readFileSync("trust/src/asks.ts", "utf8").split("\n").filter((l) => l.startsWith('  ask("')).map((l, i): Mutant => [`no row ${i + 1} of the asks`, `${l}\n`, ""]),
      ["a turn-down no longer excuses", "if (!a.bare && TURNED_DOWN.test(text.slice(Math.max(0, m.index - 60), m.index))) continue;", ""],
      ["PayPal's own host counts as a site", "const SITE = String.raw`\\b${NOT_PAYPAL}", "const SITE = String.raw`\\b"],
      ["a sentence at checkout no longer excuses", 'if (a.rule === "asks-money-away" && !a.bare && AT_CHECKOUT.test(own)) continue;', ""],
      ["\"not through checkout\" excuses again", String.raw`(?<!\b(?:not|never|than|skip|avoid)\s+)\b(?:through|via`, String.raw`\b(?:through|via`],
      ["\"so\" no longer closes a turn-down", String.raw`(?:(?!so\b|but\b|if\b|problem\b|worries\b)[\w']+\s+){0,3}$`, String.raw`(?:[\w']+\s+){0,3}$`],
      ["any remote word reads as remote access", "\\bremote\\s+(?:help|access|support|desktop|app|tool|session)\\b|\\bremote\\s+(?:help", "\\bremote\\b|\\bremote\\s+(?:help"],
      ["a 4 pin plug reads as a secret", "\\s+(?:digit\\s+(?:code|password|passcode|pin|number)|code|password|passcode)\\b", "\\s+(?:digit\\s+)?(?:code|password|passcode|pin|number)\\b"],
      ["a parcel's confirmation number reads as a secret", "\\bconfirmation\\s+(?:digit\\s+)?(?:code|password|passcode|pin)\\b", "\\bconfirmation\\s+(?:digit\\s+)?(?:code|password|passcode|pin|number)\\b"],
      ["\"don't click it twice\" reads as the ask", "(?![^.!?;,]*\\b(?:again|twice|more\\s+than\\s+once|until|before)\\b)", ""],
      ["a later clause excuses \"don't use checkout\"", "(?![^.!?;,]*\\b(?:again|", "(?![^.!?;]*\\b(?:again|"],
      ["a plain delivery fee reads as asked for", "\\b${FEE_PLAIN}\\b[^.!?]{0,60}?\\b(?:sent|", "\\b${FEE_PLAIN}\\b[^.!?]{0,60}?\\b(?:applies|pay|sent|"],
    ],
  },
  // What counts as an ask (Round 5, nit 3): the noise and the bills must stop, and real asks must still shop.
  "is-ask": {
    file: "core/src/ask/is-ask.ts",
    test: "test/is-ask.test.ts",
    cwd: "core",
    mutants: [
      ["a bill shops", "if (MONEY_AWAY.some((re) => re.test(folded))) return NOT_SHOPPING;", ""],
      ["medicine shops", "if (MEDICINE.test(folded)) return HOLD_MEDICINE;", ""],
      ["a pill organizer holds", "\\\\b(?!(?:\\\\s+[a-z'-]+)?\\\\s+(?:${GOES_WITH})\\\\b)`);", "\\\\b`);"],
      ["someone asking shops", "if (SOMEONE_ASKS.test(folded) || RUSHED", "if (RUSHED"],
      ["a rush shops", "SOMEONE_ASKS.test(folded) || RUSHED.some((re) => re.test(folded)) || ", "SOMEONE_ASKS.test(folded) || "],
      ["paying that way shops", " || PAYS_THAT_WAY.some((re) => re.test(folded))) return HOLD_PRESSURE;", ") return HOLD_PRESSURE;"],
      ["a money clip she was asked for holds", "|money\\\\b(?!\\\\s+(?:clip|box|tree|belt))", "|money\\\\b"],
      ["filler names something", "!FILLER.has(t) && ", ""],
      ["a bare number names something", " && !/^\\d[\\d,.]*$/.test(t)", ""],
      ["a question shops", "if (isQuestion(tokens)) return namesAnItem() ? null : A_QUESTION;", ""],
      ["a question with an item gets the line", "if (isQuestion(tokens)) return namesAnItem() ? null : A_QUESTION;", "if (isQuestion(tokens)) return A_QUESTION;"],
      ["no sign of shopping needed", "SHOPPING.test(folded) && named.some", "named.some"],
      ["a question's own words read as an item", "!NOT_THE_ITEM.has(t) && !isNoise(t)", "!isNoise(t)"],
      ["a why shops", "if (isWhy(tokens)) return A_QUESTION;", ""],
      ["a caller shops", "if (SOMEONE_CALLED.test(folded) || ONLY_KIN.test(folded)) return NO_ITEM;", ""],
      ["\"my grandson\" alone shops", "SOMEONE_CALLED.test(folded) || ONLY_KIN.test(folded)", "SOMEONE_CALLED.test(folded)"],
      ["a sentence about her day shops", "if (ABOUT_HER_DAY.test(folded)) return namesAnItem() ? null : NO_ITEM;", ""],
      ["a sentence about her day never shops", "if (ABOUT_HER_DAY.test(folded)) return namesAnItem() ? null : NO_ITEM;", "if (ABOUT_HER_DAY.test(folded)) return NO_ITEM;"],
      ["\"scared\" alone shops", "if (named.length > 0 && named.every((t) => ONLY_TALK.has(t))) return NO_ITEM;", ""],
      ["a bare \"safe?\" shops", "if (folded.endsWith(\"?\") && named.length > 0 && named.every((t) => NOT_THE_ITEM.has(t))) return A_QUESTION;", ""],
      ["a bare \"safe\" stops, with no question mark", "if (folded.endsWith(\"?\") && named.length > 0", "if (named.length > 0"],
      ["\"can opener\" reads as a question", "VERB.has(first) && (next === undefined || SUBJECT.has(next))", "VERB.has(first)"],
      ["\"what size tv\" reads as a question", "next === undefined || VERB.has(next) || WH_NEXT.has(next)", "true"],
      ["\"my grandson needs money\" shops", "/\\b(?:needs?|wants?|ask(?:s|ing|ed)\\s+for)\\s+(?:some\\s+|more\\s+)?(?:money|cash|funds)\\b/,", ""],
      ["\"a man called ove\" stops", "(?=[\\\\s,.!?]*$|[\\\\s,.!?]+(?:me|us|and|from|to|about|saying|said|today|yesterday|again|my|the|last|this|just|but|he|she|they|i)\\\\b)", ""],
      ["\"hello\" and \"test\" shop", "if (NOT_AN_ITEM.has(named.join(\" \"))) return NOT_UNDERSTOOD;", ""],
      ["one real word doesn't let the ask through", "return named.every(isNoise) ? NOT_UNDERSTOOD : null;", "return named.some(isNoise) ? NOT_UNDERSTOOD : null;"],
      ["no noise is read at all", "return named.every(isNoise) ? NOT_UNDERSTOOD : null;", "return null;"],
      ["a foreign word reads as noise", "if (!/^[a-z0-9']+$/.test(token)) return false;", "if (!/^[a-z0-9']+$/.test(token)) return true;"],
      ["a short code reads as noise", "if (w.length < 3) return false;", ""],
      ["a keyboard run shops", "if (keyboardRun(w)) return true;", ""],
      ["five letters with no vowel shop", "if (w.length >= 5 && !/[aeiouy]/.test(w)) return true; // \"dfgsk\"", ""],
      ["a scramble shops", "return scrambled(w); // \"aksjdh\"", "return false;"],
      ["a rare pair alone reads as noise, \"fjord\" with it", "run.length >= 4 && RARE_PAIR.test(run)", "RARE_PAIR.test(run)"],
      ["the top row's real endings read as noise", "(ROWS[0].includes(run[0]!) ? 5 : 4)", "4"],
      ["a repeat shops", "if (/^(.)\\1+$/.test(w) || /^(..)\\1{2,}$/.test(w) || /(.)\\1{3}/.test(w)) return true; // \"aaa\", \"lololo\", \"hmmmm\"", ""],
    ],
  },
  "is-ask-route": {
    file: "server/src/main.ts",
    test: "test/abuse.test.ts -t not_an_ask",
    cwd: "core",
    mutants: [
      ["the card doesn't ask the gate", "if (notAsk) return c.json({ error: notAsk });", ""],
      ["the market doesn't ask the gate", "if (words.length >= 2 && notAsk) return c.json({ kind: \"failed\", reason: notAsk });", ""],
    ],
  },
  "asks-hold": {
    file: "trust/src/notes.ts",
    test: "test/watch-asks.test.ts",
    cwd: "core",
    mutants: [
      ["an ask can refuse", '"mentions-upfront", ...ASK_RULES]);', '"mentions-upfront"]);'],
      ["an ask can be refused: a reader's refuse sets it aside", 'new Set(["asks-for-cash", ...ASK_RULES]);', 'new Set(["asks-for-cash"]);'],
      ["asks speak beside an act", "if (acts(best) > 0) return best;", ""],
      ["leetspeak isn't read for asks", "...readAsks(unleet(plain))", ""],
      ["no asks at all", "[...new Set([...readAsks(plain), ...readAsks(unleet(plain))])]", "([] as AskRule[])"],
      ["an ask takes the last-resort hold's place", "return last ? [{ rule: last, field, said: phrase(last, HOLD_SAID[last]!, field) }, ...asks] : asks;", "return asks.length ? asks : last ? [{ rule: last, field, said: phrase(last, HOLD_SAID[last]!, field) }] : asks;"],
    ],
  },
  // Lead-10's question, Nov 4: a gift card merely named beside cash is still cash alone; one offered beside cash may refuse.
  "reader-cash": {
    file: "trust/src/reader.ts",
    test: "test/reader.test.ts",
    cwd: "core",
    mutants: [
      ["a card merely named beside cash refuses", ' && !(cash && cardAside && f.rule === "mentions-gift-card")', ""],
      ["any card beside any note can't refuse", '!(cash && cardAside && f.rule === "mentions-gift-card")', '!(cardAside && f.rule === "mentions-gift-card")'],
      ["any mention beside cash can't refuse", '!(cash && cardAside && f.rule === "mentions-gift-card")', '!(cash && f.rule === "mentions-gift-card")'],
      ["a word other than cash protects the note", 'const cash = flags.some((f) => f.rule === "asks-for-cash");', "const cash = flags.length > 0;"],
    ],
  },
  // The card's aside and the negated list, from a security review of the first version (Nov 4).
  "card-aside": {
    file: "trust/src/notes.ts",
    test: "test/peer.test.ts",
    cwd: "core",
    mutants: [
      ["a card that comes with the item isn't an aside", '\\b(?:comes?|came|ships?|arrives?|bundled|packed|boxed|free)\\s+with\\b[^.!?]{0,30}\\b${CARD}\\b|', ""],
      ["a card included isn't an aside", '|\\b${CARD}\\s+(?:(?:is|are)\\s+)?(?:included|thrown\\s+in|as\\s+a\\s+(?:bonus|gift|thank\\s+you))\\b', ""],
      ["a card that must be included is an aside", '\\b${CARD}\\s+(?:(?:is|are)\\s+)?(?:included', '\\b${CARD}\\b[^.!?]{0,20}\\b(?:included'],
      ["one more card beside the aside doesn't count", 'return rest !== text && !new RegExp(String.raw`\\b${CARD}\\b`, "i").test(rest);', "return rest !== text;"],
      ["a note with no card is an aside", "return rest !== text && !new RegExp", "return !new RegExp"],
      ["a negated list takes the mention's hold with it", "!p.mention && !p.holdAs && !p.leavesMention", "!p.mention && !p.holdAs"],
      ["a turned-down list holds anyway", 'cash\\b(?!\\s?app)`, "gi"), negatable: true, holds: true, leavesMention: true },', 'cash\\b(?!\\s?app)`, "gi"), negatable: false, holds: true, leavesMention: true },'],
    ],
  },
  // The in-person exemption fails closed (the lead's default after three push reviews, 2026-10-29), and Wire and COD.
  // Track S (Tier 2c): Friends & Family named, a fair seller's words never refused, and the PayPal line only beside it.
  // PayPal's own host is one guard now, in `asks.ts`, read by the refusing rules in `notes.ts` too.
  "peer-host": {
    file: "trust/src/asks.ts",
    test: "test/peer.test.ts",
    cwd: "core",
    mutants: [
      ["paypal.com read as off-site", "const NOT_PAYPAL = String.raw`(?!(?:www\\.)?paypal\\.com(?=$|[\\/?#\\s]|[.,;:!)]+(?:\\s|$)))`;", "const NOT_PAYPAL = String.raw``;"],
      ["a lookalike of paypal.com is exempt", "paypal\\.com(?=$|[\\/?#\\s]|[.,;:!)]+(?:\\s|$)))", "paypal\\.com\\b)"],
      ["paypal.com;x@ is exempt", "[.,;:!)]+(?:\\s|$)))`;", "[.,;:!)]))`;"],
    ],
  },
  peer: {
    file: "trust/src/notes.ts",
    test: "test/peer.test.ts",
    cwd: "core",
    mutants: [
      ["a warning frame refuses", 'FF_FRAMED.test(text.slice(0, m.index)) && !NOT.test(text.slice(0, m.index))) return "hold";', 'FF_FRAMED.test(text.slice(0, m.index)) && !NOT.test(text.slice(0, m.index))) return "act";'],
      ["\"won't take PayPal friends and family\" refuses again", String.raw`(?:take|accept|use)\s+paypal\b(?!\s+(?:friends?|family|f ?& ?f|f ?n ?f|f and f|ff|personal)\b)`, String.raw`(?:take|accept|use)\s+paypal\b`],
      ["F&F said as a generic ask", "add(r.rule, ff ? FF_SAID : own ?", "add(r.rule, false ? FF_SAID : own ?"],
      ["no kind on the row", "if (kind) out.at(-1)!.kind = kind;", ""],
      ["a note naming another way still says F&F", "const ff = ffActs > 0 && siteActs === 0 && otherActs === 0;", "const ff = ffActs > 0;"],
      ["\"friends/family\" no longer read", String.raw`fr(?:ie|ei|e)nds?\s*(?:and|&|n|\+|\/)?\s*(?:famil?y|famly|fam\b)`, String.raw`friends? ?(?:and|&|n|\+) ?family`],
      ["refused payments read as an ask", "${FF_REFUSED}|\\bpersonal", "|\\bpersonal"],
      ["PayPal's word softens an F&F ask", "const listAfter = !ffOnPayPal && LIST_AFTER", "const listAfter = LIST_AFTER"],
      ["\"Friends and family is the only way\" no longer read", String.raw`(?:only|best|easiest|cheapest)\s+(?:way|option|method|choice|route)\b(?!`, String.raw`(?:best|easiest|cheapest)\s+(?:way|option|method|choice|route)\b(?!`],
      ["dotted letters not joined", String.raw`(m) => m.replace(/\./g, ""))`, "(m) => m)"],
      // The other three (Nov 4): a fair seller's words never refused, the planted notes named, and the red team's site read.
      ["a seller's own page not named as one", 'const kind = ff ? "friends-family" : own ? "pay-off-site" : r.kind;', 'const kind = ff ? "friends-family" : r.kind;'],
      ["off-site said as a generic ask", "own ? OFF_SITE_SAID : r.said", "r.said"],
      ["a site turned down refuses", 'if (downBefore) return TURNS_DOWN.test(downBefore[1]!) ? null : "hold";', ""],
      ["a framed site or shipment refuses", "if ((site || r.framed || (r.rule", "if (((r.rule"],
      ["an overpay turned down refuses", 'if (r.framed && NOT.test(text.slice(0, m.index))) return "hold";', ""],
      ["a shipment to me read as a claim", "const NOT_TO_ME = String.raw`(?!\\s+(?:to|from)\\s+(?:me|us)\\b)`;", "const NOT_TO_ME = String.raw``;"],
      ["a shipping claim alone clears", '{ re: new RegExp(SHIP_CLAIM, "gi"), negatable: true, holds: true },', ""],
      ["a shipping claim alone refuses", '{ re: new RegExp(SHIP_CLAIM, "gi"), negatable: true, holds: true },', '{ re: new RegExp(SHIP_CLAIM, "gi"), negatable: true },'],
      ["a list reads the wide opens across commas", "const open = [...clause.matchAll(LIST_OPEN)].at(-1);", "const open = [...clause.matchAll(NOT_OPEN)].at(-1);"],
      ["paying at a place you can stand in refuses", 'if (site && (AT_CHECKOUT.test(text) || PLACE_MET.test(text))) return "hold";', ""],
      ["a shipment beside a checkout refuses", 'if (r.framed && (AT_CHECKOUT.test(text) || WITH_PAYPAL.test(text))) return "hold";', ""],
      ["\"Shipped by UPS\" read as in motion", "|many|about|by|via", "|many|about|via"],
      ["a hyphened domain not read", "|(?:[a-z0-9.]+[-\\s])?${NOT_PAYPAL}", "|${NOT_PAYPAL}"],
      ["\"owner pre-approved\" not read", "const CLAIM = String.raw`${HOLDER_YES}|${WHO}", "const CLAIM = String.raw`${WHO}"],
      ["\"previous owner approved\" read as your yes", "(?<!\\b(?:previous|prior|former|original|first|last|second|one|single|new|store|shop|business|home)\\s+)\\b${HOLDER}", "\\b${HOLDER}"],
      ["Spanish and French turn-downs refuse", "const NOT_ES_FR = String.raw`(?<!\\b(?:(?:no|nunca|jamas|ni|ne|jamais|sin|pas)\\s+|n')(?:\\w+\\s+){0,2})", "const NOT_ES_FR = String.raw`"],
      ["a warning in Spanish or French refuses", "(?<!\\b(?:quien|quienes|alguien|celui\\s+qui|ceux\\s+qui|quelqu'un|cuidado|attention)\\b[^.!?;]{0,40})", ""],
      ["a scam word near the ask softens it", "(?<!\\bno\\s)\\b(?:es|son|c'est|est|sont)\\s+(?:una?\\s+|une\\s+)?(?:estafa|arnaque|fraude|escroquerie)\\b", "\\b(?:estafa|arnaque|fraude)\\w*\\b"],
      ["a negation reads into longer words", "(?:(?:no|nunca|jamas|ni|ne|jamais|sin|pas)\\s+|n')(?:\\w+\\s+){0,2}", "(?:no|nunca|jamas|ni|ne|jamais|n'|sin|pas)\\s*(?:\\w+\\s+){0,2}"],
      ["a bare link in my bio refuses", "(?<=\\b(?:pay|paying|payment|buy|order|purchase|check ?out|label)\\b[^.!?;]{0,60})\\blink\\s+in\\s+my\\s+bio\\b", "\\blink\\s+in\\s+my\\s+bio\\b"],
      ["a comma doesn't end the ask", "excepto|si)\\b)[^.!?;,]){0,60}", "excepto|si)\\b)[^.!?;]){0,60}"],
      ["a turn-down runs past its sentence", "(?:outside\\b[^.!?;:,]*)?$/i.test(", "(?:outside\\b.*)?$/i.test("],
      ["a card offered beside cash is a mere mention", '|\\b${CARD}\\b\\s*(?:,?\\s*(?:or|and)\\b|[\\/&])\\s*(?:(?:by|with|in)\\s+)*cash\\b(?!\\s?app)', ""],
      ["cash or a card is a mere mention", '\\bcash\\b(?!\\s?app)\\s*(?:,?\\s*(?:or|and)\\b|[\\/&])\\s*(?:(?:a|an|by|with)\\s+)*${CARD}\\b|', ""],
      ["a clipped card ask isn't read", 'cards?|e\\s?gift\\s+cards?|${CARD})`), "gi"), negatable: false },', 'cards?|e\\s?gift\\s+cards?|${CARD})zzz`), "gi"), negatable: false },'],
      ["a clipped ask needs no push", "(?=${lead}${CLIP_PUSH})", ""],
      ["a clipped ask needs no card", "(?=${lead}${named})", ""],
      ["a clipped ask needs no sentence end", "(?=\\s*[^\\w\\s]*\\s*$|\\s*[.!?;:])`;", "`;"],
      ["a clipped ask starts anywhere", "(?<=^|[.!?;:]\\s*)", ""],
      ["a store name or voucher alone refuses", 'store\\s+credit)`), "gi"), negatable: false, mention: "mentions-gift-card" },', 'store\\s+credit)`), "gi"), negatable: false },'],
      ["a store name or voucher alone isn't read", "vouchers?|store\\s+credit)`)", "zzz)`)"],
      ["a question reads as a turn-down", "(?<!${ASKED}|\\b(?:or|if)\\s+)\\b(?:not|never|doesn't", "\\b(?:not|never|doesn't"],
      ["a question word only reaches the next word", "what\\s+about)\\b[^.!?;:]*|", "what\\s+about)\\b\\s+|"],
      ["a comma ends a question", "what\\s+about)\\b[^.!?;:]*|", "what\\s+about)\\b[^.!?;:,]*|"],
      ["could you not reads as a turn-down", "|\\b(?:would|will|could|can|should|shall|do|did)\\s+(?:you|u|anyone|buyers?)\\s+(?:\\w+\\s+){0,2})`;", ")`;"],
      ["a question turns a page down", "site && !ASKED_HERE.test(text.slice(0, m.index)) ?", "site ?"],
      ["a question turns a list down", "function negatedList(before: string): boolean {\n  if (ASKED_HERE.test(before)) return false;", "function negatedList(before: string): boolean {"],
      ["won't you reads as a turn-down", "/^\\s*(?!(?:you|u|anyone|people|buyers?)\\b)(?:(?:ever|", "/^\\s*(?:(?:ever|"],
      ["any words after a negation turn a page down", 'return TURNS_DOWN.test(downBefore[1]!) ? null : "hold";', "return null;"],
      ["a list can't be turned back on", "|is fine|are fine|unless|but|only|except)\\b/i.test(after)", "|is fine|are fine)\\b/i.test(after)"],
      ["if you overpay excuses a later ask", "\\b(?:(?!\\b(?:send|pay|wire|transfer|add|include)\\b)[^.!?]){0,60})`;", "\\b[^.!?]{0,60})`;"],
      ["a turn-down survives the clause moving on", "((?:(?!\\b(?:so|then|just|instead|but|and|worry|fear|forget|hesitate|mind)\\b)[^.!?;:,])*)$/i", "([^.!?;:,]*)$/i"],
      ["a link's scheme hides it", "|https?:\\/\\/(?:www\\.)?${NOT_PAYPAL}[a-z0-9-]+\\.[a-z0-9.-]+|", "|"],
      ["a link with no ask clears", 'field !== "merchant" && carriesLink(plain, raw) ? "mentions-link"', 'false ? "mentions-link"'],
      ["no last holds", 'field === "note" && LAST_HOLDS.find(([, re]) => re.test(plain))?.[0]', 'false'],
      ["we'll text you a delivery code holds", String.raw`\b(?!\s+you\s+a\s+code\s+to\s+confirm\s+delivery\b)`, String.raw`\b`],
      ["a later paypal excuses sending money", String.raw`(?!\s+(?:to\s+(?:us|me|our\s+account)\s+)?(?:through|via|using)\s+(?:the\s+)?(?:paypal`, String.raw`(?![^.!?]*(?:through|via|using)\s+(?:the\s+)?(?:paypal`],
      ["a request for a login clears", String.raw`|\byour\s+(?:full\s+name|login|password|pin)\b|\bpasscode\b|\bdate\s+of\s+birth\b|\blast\s+(?:four|4)\s+(?:digits|of)\b`, ""],
      ["leaving the app's chat clears", String.raw`|\b(?:don't|dont|do\s+not)\s+use\s+(?:the\s+)?(?:app|site|marketplace|chat)\b|\bdeal(?:\s+\w+)?\s+outside\b|\bmove\s+to\s+(?:text|e-?mail|chat)\b`, ""],
      ["pay me clears", String.raw`\bpay\s+me\b(?!\s+(?:at|through|via|in|on)\s+(?:the\s+|paypal`, String.raw`\bnever-a-word\b(?!\s+(?:at|through|via|in|on)\s+(?:the\s+|paypal`],
      ["a gift transfer clears", String.raw`|\bpayment\s+as\s+a\s+gift\b|\bfamily\s+transfer\b`, ""],
      ["money up front clears", '\\bjust\\s+(?:pay|cover)\\b', '\\bnever-a-word\\b'],
      ["pay first at checkout holds", String.raw`\s+(?:first|up\s?front|in\s+advance|ahead)\b(?!\s+(?:at|through|via|in|on)\s+(?:the\s+|paypal\s+)?(?:check\s?out|app|platform|site))`, String.raw`\s+(?:first|up\s?front|in\s+advance|ahead)\b`],
      ["no money up front holds", String.raw`(?<!\bno\s)\b(?:pay(?:ment)?|money`, String.raw`\b(?:pay(?:ment)?|money`],
      ["pay me first clears", String.raw`\s+(?:first|up\s?front|in\s+advance|ahead)\b(?!`, String.raw`\s+(?:never-a-word)\b(?!`],
      ["send the money clears", String.raw`\bsen[dt]s?\s+(?:me\s+|us\s+|him\s+|them\s+)?(?:(?:the|a|an|your|my)\s+)?(?:\w+\s+){0,2}?(?:money|payment(?!`, String.raw`\bnever-a-word\s+(?:me\s+|us\s+|him\s+|them\s+)?(?:(?:the|a|an|your|my)\s+)?(?:\w+\s+){0,2}?(?:money|payment(?!`],
      ["never send money holds", String.raw`(?<!(?<!\b(?:why|or|if)\s)\b(?:not|never|don't|dont)\s(?:ask\s+you\s+to\s)?)\bsen[dt]s?`, String.raw`\bsen[dt]s?`],
      ["why not send money clears", String.raw`(?<!(?<!\b(?:why|or|if)\s)\b(?:not|never|don't|dont)\s(?:ask\s+you\s+to\s)?)\bsen[dt]s?`, String.raw`(?<!\b(?:not|never|don't|dont)\s(?:ask\s+you\s+to\s)?)\bsen[dt]s?`],
      ["a deposit clears", String.raw`|(?<!\bno\s)\bdeposit\b[^.!?]{0,30}\b(?:to\s+(?:hold|reserve)|(?<!\bnot\s)required|non-?refundable|first|now)\b|\bdeposit\s+(?:of\s+)?\$?\d`, ""],
      ["no deposit required holds", String.raw`|(?<!\bno\s)\bdeposit\b`, String.raw`|\bdeposit\b`],
      ["a hyphenated host at an unlisted ending clears", ' || HYPHEN_HOST.test(raw.replace(EMAIL, " "))', ""],
      ["an email at a hyphenated host reads as a link", 'HYPHEN_HOST.test(raw.replace(EMAIL, " "))', "HYPHEN_HOST.test(raw)"],
      ["customs fees may apply holds", String.raw`\bcustoms\s+fees?\b(?!\s+may\s+apply)`, String.raw`\bcustoms\s+fees?\b`],
      ["any fee that may apply clears", String.raw`clearance|registration|lease)\s+(?:fees?|charges?)\b|`, String.raw`clearance|registration|lease)\s+(?:fees?|charges?)\b(?!\s+may)|`],
      ["a request for your ID clears", String.raw`|\b(?:photo|picture|pic|copy|scan)\s+of\s+(?:your\s+|ur\s+)?(?:drivers?|id\b|licen[cs]e|passport)|\bssn\b|\bsocial\s+security\b|\benter\s+(?:your\s+|ur\s+)?card\b`, ""],
      ["\"label's made, waiting on you\" clears", String.raw`\bwaiting\s+(?:on|for)\s+(?:you|your)\b[^.!?]{0,15}\bpay|`, ""],
      ["\"you refund me the difference\" clears", String.raw`(?:refund|return|send\s+back|wire\s+back|give\s+back|forward)\s+(?:me\s+|us\s+)?(?:the\s+|my\s+)?(?:difference|extra|rest|balance|remainder|excess|overage)\b|`, "(?:zzz)|"],
      ["\"I'll refund the difference\" holds", String.raw`(?<!\b(?:i|we|i'll|we'll|ill|will|can|happy\s+to|gladly)\s+)\b(?:refund|return`, String.raw`\b(?:refund|return`],
      ["a chat app clears", String.raw`\b(?:message|msg|text|dm|add|contact|reach|hmu|chat|call|ping|talk)\b[^.!?]{0,25}\b(?:telegram|whats\s?app|kik|hangouts|wechat|snap(?:chat)?|instagram|insta|signal)\b|`, ""],
      ["a named fee clears", String.raw`\b(?:verification|insurance|hold|holding|release|protection|activation|upgrade|clearance|registration|lease)\s+(?:fees?|charges?)\b|`, ""],
      ["escrow clears", String.raw`\bbefore\b|\bescrow\b|`, String.raw`\bbefore\b|`],
      ["a code by text clears", String.raw`\b(?:text|sms|reply|tell|send|sent)\b(?!\s+you\s+a\s+code\s+to\s+confirm\s+delivery\b)[^.!?]{0,30}(?<!\b(?:zip|promo|discount|post|postal|area)\s+)\bcode\b|`, ""],
      ["a zip code holds", String.raw`[^.!?]{0,30}(?<!\b(?:zip|promo|discount|post|postal|area)\s+)\bcode\b|`, String.raw`[^.!?]{0,30}\bcode\b|`],
      ["\"money is waiting\" clears", String.raw`\b(?:money|funds?|payment)\b[^.!?]{0,15}\b(?:waiting|on\s+hold|pending|released?|secured)\b|`, ""],
      ["pay my agent clears", String.raw`|\bpay\s+(?:my|his|her)\s+(?:\w+\s+)?(?:agent|shipper|courier|driver|mover)\b`, ""],
      ["an email address reads as a link", 'const text = plain.replace(EMAIL, " ");', "const text = plain;"],
      ["paypal's own link holds", String.raw`\bh[tx]{2}ps?:\/\/(?:www\.)?${"$"}{NOT_PAYPAL}|`, String.raw`\bh[tx]{2}ps?:\/\/|`],
      ["evil dot com isn't a link", String.raw`|\b[a-z0-9-]+\s*(?:\s\.\s|\(\.\)|\(dot\)|\bdot\b)\s*${"$"}{LINK_TLD}\b`, ""],
      ["bit.ly isn't a link", "|me|ru|cn|uk|us|de|ly|gg|", "|me|ru|cn|uk|us|de|gg|"],
      ["a link at any ending isn't read", String.raw`|[a-z]{2,}\/\S)`, ")"],
      ["paypal.com@ dressed up isn't a link", String.raw`/paypal\s+dot\s+com(?:\s+dot\s+)?@/i.test(plain) || `, ""],
      ["3vil.c0m isn't a link", " || A_LINK.test(unleet(text)) ||", " ||"],
      ["an address's @ isn't read in a link", "(?:https?:\\/\\/[^\\s\\/?#@]+(?:\\s+dot\\s+[^\\s\\/?#@]*)*@|(?:www\\s+dot\\s+)?paypal\\s+dot\\s+com(?:\\s+dot\\s+)?@|https?", "(?:https?"],
      ["pay here: a link isn't read", "\\b(?:pay(?:ment)?|check ?out)\\s+(?:here|link|page|site)\\s*:?\\s+${A_DOMAIN}|", ""],
      ["checkout at a link isn't read", "\\b(?:check ?out|order|buy|purchase)\\b[^.!?,;]{0,40}\\b(?:on|at|via|through)\\s+${A_DOMAIN}|", ""],
      ["any if softens an overpay ask", "(?<!\\b(?:if|when|should)\\s+(?:[\\w']+\\s+){0,3}?(?:over-?pa(?:y|ys|id|ying)|over-?charged?|pa(?:y|ys|id)\\s+(?:too\\s+much|more\\s+than)|sen[dt]\\s+(?:too\\s+much|more\\s+than))\\b(?:(?!\\b(?:send|pay|wire|transfer|add|include)\\b)[^.!?]){0,60})", "(?<!\\b(?:if|when)\\b[^.!?]{0,60})"],
      ["the account holder agreeing isn't read", "\\s+(?:has\\s+|had\\s+)?(?:already\\s+)?(?:agreed|consented|said\\s+yes|approved|authori[sz]ed|okayed)\\b|\\bowner", "\\s+nevermatch\\b|\\bowner"],
      ["\"Je n'accepte que\" not read", "(?:\\bn'accepte\\s+que\\b|", "(?:\\bzzaccepte\\s+que\\b|"],
      ["a misspelled tarjeta not read", "t[ae]r[gj]etas?", "tarjetas?"],
      ["\"if you overpay I'll refund\" refuses", "const NOT_IF = String.raw`(?<!\\b(?:if|when|should)\\s+(?:[\\w']+\\s+){0,3}?(?:over-?pa(?:y|ys|id|ying)|over-?charged?|pa(?:y|ys|id)\\s+(?:too\\s+much|more\\s+than)|sen[dt]\\s+(?:too\\s+much|more\\s+than))\\b(?:(?!\\b(?:send|pay|wire|transfer|add|include)\\b)[^.!?]){0,60})`;", "const NOT_IF = String.raw``;"],
    ],
  },
  "in-person": {
    file: "trust/src/notes.ts",
    test: "test/off-paypal.test.ts",
    cwd: "core",
    mutants: [
      ["tie not needed", "return TIED.test(clause) && !REMOTE", "return true && !REMOTE"],
      ["own sentence only", "!REMOTE.test(text) && !off.test(text) && !TIME_AWAY.test(text)", "!REMOTE.test(own) && !off.test(own) && !TIME_AWAY.test(own)"],
      ["an abbreviation ends a sentence", "const END = /(?<!\\b(?:mr|mrs", "const END = /(?<!\\b(?:zzz|mrs"],
      ["widened time not away", "((TIME_AWAY.test(own) || WEEKDAY", "((WHEN_AWAY.test(own) || WEEKDAY"],
      ["weekday not away", "|| WEEKDAY.test(clause)) && !MET", ") && !MET"],
      ["no meeting is in person", "if (!IN_PERSON.test(text) || REMOTE", "if (REMOTE"],
      ["hold read as cash", 'if (paid === "hold") return "hold";', 'if (paid === "hold") { held.add("asks-for-cash"); return null; }'],
      ["send not a mover", "|\\b(?:send|deposit)\\s+(?:(?:me|us|him|her|them)\\s+)?", "|\\b(?:zzsend|zzdeposit)\\s+(?:(?:me|us|him|her|them)\\s+)?"],
      ["the item seen places a send", "!(SEEN.test(x) && !MOVED.test(x))", "!SEEN.test(x)"],
      ["TIMED not widened", "TIMED.test(x) && TIME_AWAY.test(x)", "TIMED.test(x) && WHEN_AWAY.test(x)"],
      ["wire the balance unread", "(?:balance|rest|remainder|difference|deposit|half)\\b/gi, negatable: true, holds: true }", "(?:zzbalance)\\b/gi, negatable: true, holds: true }"],
      ["money to a cause clears", "(?:shop|store|business|company|school|college|tuition|fund|charity|church|team|club|band)\\b/gi, negatable: true, inPerson: true },", "(?:zzshop)\\b/gi, negatable: true, inPerson: true },"],
      ["a school fund is no cause", "tuition|fund|charity|church|team|club|band)\\b/gi, negatable: true, inPerson: true },", "tuition|charity|church|team|club|band)\\b/gi, negatable: true, inPerson: true },"],
      ["a church is no cause", "|fund|charity|church|team|club|band)\\b/gi, negatable: true, inPerson: true },", "|fund|charity|team|club|band)\\b/gi, negatable: true, inPerson: true },"],
      ["a company is no cause", "(?:shop|store|business|company|school|college|tuition|fund", "(?:shop|store|business|school|college|tuition|fund"],
      ["a transfer moves nothing", "\\b(?:send|sent|transfer(?:red)?|wire[ds]?|deposit(?:ed)?)\\b[^.!?]{0,40}?\\b(?:to|into|at|in)\\s+(?:my|our|her|his|their)\\s+(?:own\\s+)?(?:[a-z]+", "\\b(?:send|sent|wire[ds]?|deposit(?:ed)?)\\b[^.!?]{0,40}?\\b(?:to|into|at|in)\\s+(?:my|our|her|his|their)\\s+(?:own\\s+)?(?:[a-z]+"],
      ["COD available unread", "|\\bcod\\s*,?\\s*(?:is\\s+)?(?:available", "|\\bzzcod\\s*,?\\s*(?:is\\s+)?(?:available"],
    ],
  },
  // Item 10: voice prepares, only the tap pays (code review of item 10).
  "voice": {
    file: "web/src/App.tsx",
    test: "test/voice.test.ts",
    cwd: "core",
    mutants: [
      ["press on focus", "onClick={press} disabled", "onClick={press} onFocus={press} disabled"],
      ["voice focuses Approve", 'const c = document.getElementById("cart");', 'const c = document.getElementById("approve");'],
      ["a no while haggling dropped", "if (busy) { asideNext.current = true; voiced.current = null; return", "if (busy) { return"],
      ["a ledger Go is a voice run", "onGo={() => void start()}", "onGo={start}"],
      ["focus taken from a field", "if (late && el instanceof", "if (false && el instanceof"],
    ],
  },
  // The spoken answer names the refused seller (Joshua, Thu Oct 29).
  "ladder-said": {
    file: "core/src/ask/ladder.ts",
    test: "test/ladder.test.ts",
    mutants: [
      ["the refused seller unsaid", "const saidRefused = first ? `${spokenStore(first.name)} was refused:", "const saidRefused = false ? `${spokenStore(first.name)} was refused:"],
    ],
  },
  // Track F moved the refusal words out of ladder.ts, to keep them out of the wallet and classic bundles.
  "ladder-words": {
    file: "core/src/ask/ladder-words.ts",
    test: "test/ladder.test.ts",
    mutants: [
      ["the instruction said before the payment ask", '["gift-card", "it asked for a gift card"], ["off-paypal", "it asked to be paid off PayPal"],\n  ["instructs-agent", "it tried to instruct Goose"],', '["instructs-agent", "it tried to instruct Goose"], ["gift-card", "it asked for a gift card"], ["off-paypal", "it asked to be paid off PayPal"],\n'],
    ],
  },
  // Lead-10, Nov 4: no note, however worded, can raise a limit or spend without the tap. Each mutant is that bug, written
  // the way it would really arrive. S's rules sit right beside these lines, in guard.ts's decide.
  "note-cant-spend": {
    file: "trust/src/guard.ts",
    test: "test/money-paths.prop.test.ts",
    cwd: "core",
    mutants: [
      ["a note lifts the category limit", "const limit = categoryLimitFor(this.policy, entry?.category);", 'const limit = /limit|budget/i.test(String((evidence as { quoted?: string } | null)?.quoted)) ? Number.MAX_SAFE_INTEGER : categoryLimitFor(this.policy, entry?.category);'],
      ["a note lifts the want's max", 'if (!withinLimit(cart.price, want.maxPrice)) return refuse("max"', 'if (!withinLimit(cart.price, want.maxPrice) && !/limit|budget/i.test(String((evidence as { quoted?: string } | null)?.quoted))) return refuse("max"'],
      ["a store's name lifts the cap", 'if (!withinLimit(cart.price, this.policy.perPurchaseCap)) return refuse("cap"', 'if (!withinLimit(cart.price, this.policy.perPurchaseCap) && !/limit|budget/i.test(cart.merchant)) return refuse("cap"'],
      ["a note writes the policy", "const flags = watch({ ...ev, merchant: cart.merchant, item: cart.item });", 'if (/limit|budget/i.test(String(ev.quoted))) (this.policy as { weeklyLimit: number }).weeklyLimit = 1e12;\n    const flags = watch({ ...ev, merchant: cart.merchant, item: cart.item });'],
      ["a shipped claim stops holding", "const flags = watch({ ...ev, merchant: cart.merchant, item: cart.item });", 'const flags = watch({ ...ev, merchant: cart.merchant, item: cart.item }).filter((f) => f.rule !== "mentions-shipped");'],
      ["an overpay scam is only held", "const flags = watch({ ...ev, merchant: cart.merchant, item: cart.item });", 'const flags = watch({ ...ev, merchant: cart.merchant, item: cart.item }).map((f) => (f.rule === "overpay-refund" ? { ...f, severity: "hold" as const } : f));'],
      ["a store's name stands in for the tap", "const check = checkBoundCart(bound, snap, this.deps.clock.now());", 'const check = checkBoundCart(bound, /tap|approved|paid/i.test(bound.cart.merchant) ? { ...snap, status: "APPROVED" } : snap, this.deps.clock.now());'],
    ],
  },
  "voice-words": {
    file: "core/src/ask/voice.ts",
    test: "test/voice.test.ts",
    mutants: [
      ["a buy may name an item", "|the\\s+goldfeather(?:\\s+kettle)?)", "|the\\s+goldfeather(?:\\s+kettle)?|a\\s+\\w+(?:\\s+\\w+)?)"],
      ["one clause decides a no", "said.every((c) => NO_ONE.test(c) || FILLER.test(c))", "said.some((c) => NO_ONE.test(c) || FILLER.test(c))"],
    ],
  },
  // W49c (item 11): chips steer the run, and code refuses a contradicting colour or holds an unsaid one.
  "w49c-engine": {
    file: "core/src/haggle/engine.ts",
    test: "test/market.test.ts",
    mutants: [
      ["steering off", "const asked = askedSellers(o.sellers, chips);", "const asked = o.sellers;"],
      ["the colour left off the cart", "...(wanted.length > 0 && listed ? { attributes: listed } : {})", "...({})"],
      ["the colour on every cart", "...(wanted.length > 0 && listed ? { attributes: listed } : {})", "...(listed ? { attributes: listed } : {})"],
      ["the guard never sees the chips", "o.guard.decide(o.want, cart, chips,", "o.guard.decide(o.want, cart, [],"],
    ],
  },
  "w49c-guard": {
    file: "trust/src/guard.ts",
    test: "test/guard.test.ts",
    cwd: "core",
    mutants: [
      ["a wrong colour passes", "if (attr.wrong) return refuse(", "if (false) return refuse("],
      ["an unsaid colour buys", "if (attr.unsaid) {", "if (false) {"],
    ],
  },
  "w49c-chips": {
    file: "trust/src/chips.ts",
    test: "test/guard.test.ts",
    cwd: "core",
    mutants: [["the seller's own colour words count", "if (v === undefined || !(vocabulary?.[name] ?? []).includes(v)) {", "if (v === undefined) {"]],
  },
  "w49c-asked": {
    file: "trust/src/chips.ts",
    test: "test/market.test.ts",
    cwd: "core",
    mutants: [
      ["no match asks no one", "return wanted.length > 0 && matching.length > 0 ? matching : sellers;", "return wanted.length > 0 ? matching : sellers;"],
      ["an unsaid listing left out", "s.attributes?.[name] === undefined || s.attributes[name] === v", "s.attributes?.[name] === v"],
    ],
  },
  "w49c-cart": {
    file: "trust/src/cart.ts",
    test: "test/guard.test.ts",
    cwd: "core",
    mutants: [["the hash skips the colour", "...named, ...attrs, nonce", "...named, nonce"]],
  },
  "w49c-server": {
    file: "server/src/main.ts",
    test: "test/ask.test.ts",
    cwd: "core",
    mutants: [
      ["the page's chips ignored", "const checked = body.replayOnly === true || body.chips === undefined ? null : validateChips(body.chips, CATALOG);", "const checked = null as ReturnType<typeof validateChips> | null;"],
      ["the page's chips unchecked", "const chips = checked?.kind === \"accepted\" ? checked.chips : [];", "const chips = (body.chips ?? []) as Chip[];"],
      ["a steered recording replays", "planFor(asked, maxPrice, body.pace !== false, token, ip, chips)", "planFor(asked, maxPrice, body.pace !== false, token, ip, [])"],
    ],
  },
  "w49c-plan": {
    file: "core/src/buyer/plan.ts",
    test: "test/market.test.ts",
    mutants: [["a steered recording replays", "return r.steers?.(market) ? { kind: \"rule\", market, note: steered }", "return false ? { kind: \"rule\", market, note: steered }"]],
  },
  // Item 12: snap a photo. The image is seller-grade input: F4 decides every chip, and the tag is cents or nothing.
  photo: {
    file: "core/src/ask/photo.ts",
    test: "test/photo.test.ts",
    mutants: [
      ["the photo skips F4", 'const { chips, refused, reasons } = keepLegal(list, o.catalog, "");', "const { chips, refused, reasons } = { chips: list as Chip[], refused: 0, reasons: [] as string[] };"],
      ["the tag may be text", "return Number.isSafeInteger(v) && (v as number) > 0", "return Number.isSafeInteger(Number(v)) && (v as number) > 0"],
      ["the tag skips the bounds", "(v as number) <= MAX_SAW_CENTS ? (v as Cents) : null;", "true ? (v as Cents) : null;"],
      ["a miss guesses", 'const found = chips.some((c) => c.kind === "item" || c.kind === "category");', "const found = true;"],
      ["the page away is ignored", 'if (o.why || !o.port) return off(o.why ?? "off");', 'if (!o.port) return off("off");'],
      ["a cap is ignored", "if (hit) return off(hit);", ""],
      ["the cap is taken with no key", 'if (o.why || !o.port) return off(o.why ?? "off");\n  const hit = o.live.takeOrWhy(o.who.token, o.who.ip);', 'const hit = o.live.takeOrWhy(o.who.token, o.who.ip);\n  if (o.why || !o.port) return off(o.why ?? "off");'],
      ["any file type is read", "if (typeof b.mediaType !== \"string\" || !TYPES.includes(b.mediaType as PhotoType))", "if (typeof b.mediaType !== \"string\")"],
    ],
  },
  // Joshua's 8:57 AM, Nov 4: the Watcher on its own. It calls `watch`, so these break what's around the call: what it leaves out, and what it admits it can't see.
  "read-seller": {
    file: "trust/src/seller.ts",
    test: "test/read-seller.test.ts",
    cwd: "trust",
    mutants: [
      ["the record's own hold counts", '.filter((f) => f.rule !== "no-record")', ""],
      ["an unread tail reads clear", "if (note.length > MAX_QUOTE_CHARS) return", "if (false) return"],
      ["a note exactly at the cap held", "note.length > MAX_QUOTE_CHARS", "note.length >= MAX_QUOTE_CHARS"],
      ["no note reads clear", 'if (typeof note !== "string") return { verdict: "hold"', 'if (typeof note !== "string") return { verdict: "clear"'],
      ["the note goes in unfenced", "quoted: quoteNote(note)", "quoted: note"],
      ["an empty note said as no rule matched", 'note.trim() === ""', "false"],
      ["the reason is only the rule's name", 'reason: watchWhy("this seller", flags)', "reason: deciding.rule"],
      ["clear says nothing about what it isn't", '"No rule matched these words. That isn\'t proof the seller is honest: a scam in words no rule knows reads clear too."', '"No rule matched these words."'],
      ["a clear note doesn't say what it can't see", 'reads clear too.", cantSee };', 'reads clear too.", cantSee: "" };'],
      ["the rule named is the softer flag", "flags.find((f) => f.severity === verdict)!", "flags[flags.length - 1]!"],
    ],
  },
  // §15A, the price watch: only a cleared offer is a deal, a moved price is never charged, Goose never raises a max.
  "pricewatch": {
    file: "trust/src/pricewatch.ts",
    test: "test/pricewatch.test.ts",
    cwd: "trust",
    mutants: [
      ["an uncleared offer counts as a deal", 'const cleared = cheapest(mine.filter((o) => verdict(o) === "clear"));', "const cleared = cheapest(mine);"],
      ["really-wants not first", "|| Number(b.w.really) - Number(a.w.really) ||", "||"],
      ["a moved price within the max is charged", "if (now.total === alert.offer.total) return { ok: true, total: now.total };", "if (now.total <= alert.max) return { ok: true, total: now.total };"],
      ["the tap skips the Watcher", "const v = verdict(now);", 'const v = "clear" as string;'],
      ["the close band widened", "Math.floor((max * CLOSE_BAND_PCT) / 100)", "Math.floor((max * CLOSE_BAND_PCT) / 100) + 1"],
      ["the category limit ignored", "const max = Math.min(want.maxPrice, limit);", "const max = want.maxPrice;"],
      ["a held seller before a deal", "under: 0, held: 1,", "under: 2, held: 1,"],
      ["any total is a price", "Number.isSafeInteger(o.total) && o.total > 0", "true"],
      ["the close band rounded up", "Math.floor((max * CLOSE_BAND_PCT) / 100)", "Math.ceil((max * CLOSE_BAND_PCT) / 100)"],
      ["an unread seller clears", 'o.flags === null ? "hold" : verdictOf(o.flags)', 'o.flags === null ? "clear" : verdictOf(o.flags)'],
      ["a hold at the tap said as a refusal", 'if (v === "refuse") return', 'if (v !== "clear") return'],
      ["a refused seller before a close price", "close: 2, refused: 3,", "close: 3, refused: 2,"],
    ],
  },
  // §15B, prices that move: the watch compares the total, the Watcher reads every listing, a curve's latest point holds.
  "moving": {
    file: "core/src/sellers/moving.ts",
    test: "test/moving.test.ts",
    cwd: "core",
    mutants: [
      ["the base price compared, not the total", "total: p.total, flags:", "total: p.base, flags:"],
      ["the Watcher skipped", "flags: watch({ quoted: s.note, merchant: s.name, history: s.history })", "flags: []"],
      ["a seller's record ignored", "history: s.history })", "history: 100 })"],
      ["the first point holds forever", "if (p.day <= day) at = p;", "if (p.day <= day && !at) at = p;"],
      ["fees dropped from the total", "total: at.base + at.fees", "total: at.base"],
      ["fees subtracted", "total: at.base + at.fees", "total: at.base - at.fees"],
    ],
  },
  "trust-items": {
    file: "trust/src/guard.ts",
    test: "test/library.test.ts",
    cwd: "trust",
    mutants: [
      ["items compare as bytes again", 'return words(a) !== "" && words(a) === words(b);', "return a === b;"],
      ["two empty names match", 'return words(a) !== "" && words(a) === words(b);', "return words(a) === words(b);"],
      ["items compare by substring", 'return words(a) !== "" && words(a) === words(b);', 'return words(a) !== "" && (words(a).includes(words(b)) || words(b).includes(words(a)));'],
      ["the entry still compares as bytes", "if (entry && !sameItem(cart.item, entry.item))", "if (entry && cart.item !== entry.item)"],
      ["the clock read in the pure entry", "const now = this.deps.clock.now();\n    // A price that isn't whole cents", "const now = Date.now();\n    // A price that isn't whole cents"],
    ],
  },
  "trust-node": {
    file: "trust/src/node.ts",
    test: "test/library.test.ts",
    cwd: "trust",
    mutants: [
      ["an unlimited week by default", "weeklyLimit: o.weeklyLimit ?? o.perPurchaseCap,", "weeklyLimit: o.weeklyLimit ?? Number.MAX_SAFE_INTEGER,"],
      ["the injected clock ignored", "clock: over.clock ?? { now: () => Date.now() },", "clock: { now: () => Date.now() },"],
      ["a weak hash by default", 'hash: over.hash ?? ((s) => createHash("sha256").update(s).digest("hex")),', 'hash: over.hash ?? ((s) => createHash("md5").update(s).digest("hex")),'],
    ],
  },
  "photo-saw": {
    file: "core/src/ask/saw.ts",
    test: "test/saw.test.ts",
    mutants: [
      ["a tag replaces a typed price", 'return kept.value === "" ? { ...SAW_EMPTY, value: fromCents(tag) } : { ...SAW_EMPTY, choices: [tag], note: "maybe" };', "return { ...SAW_EMPTY, value: fromCents(tag) };"],
      ["a new item keeps the old price", "const kept = wasItem !== null && item !== null && wasItem !== item ? SAW_EMPTY : was;\n  return kept.value", "const kept = was;\n  return kept.value"],
    ],
  },
  "photo-server": {
    file: "server/src/main.ts",
    test: "test/ask.test.ts",
    cwd: "core",
    mutants: [["the route skips the caps", "PHOTO_AI, live: ASK_CAPS,", "PHOTO_AI, live: { takeOrWhy: () => null },"], ["a photo is logged", "const parsed = parsePhoto(await c.req.json().catch(() => null));", "const parsed = parsePhoto(await c.req.json().catch(() => null)); console.log(JSON.stringify(parsed));"]],
  },
  // Joshua, Thu Oct 29: a want card leads with the scam warning, and the sell-out line states facts, never urgency.
  "want-warning": {
    file: "core/src/ask/watching.ts",
    test: "test/watching.test.ts test/history.test.ts test/pile.test.ts",
    mutants: [
      ["no warning", "return refused.length ? [...refused", "return false ? [...refused"],
      ["a held seller warned", "o.flags !== null && verdictOf(o.flags) === \"refuse\"", "o.flags !== null && verdictOf(o.flags) !== \"clear\""],
      ["the pile hides its color", "pile: pileFor(offers, colorFor(w)) }", "pile: pileFor(offers) }"],
      ["the pile counts a seller twice", "const sellers = offers.filter((o, i) => offers.findIndex((p) => p.sellerId === o.sellerId) === i);", "const sellers = offers;"],
      ["a seller warned twice", " && offers.findIndex((p) => p.sellerId === o.sellerId) === i", ""],
      ["9.1's line on every card", "if (warning && onlyCheckoutSaid) warning", "if (false) warning"],
      ["the refusal said twice", "const said = p?.kind === \"refused\" ?", "const said = false ?"],
      ["the urge back", "never went on sale, in Goose's record of the fictional market.${dropped ? ` This season, from sellers not set aside, its lowest price has dropped ${dropped}.` : \"\"} Your call.`", "never went on sale, in Goose's record of the fictional market.${dropped ? ` This season, from sellers not set aside, its lowest price has dropped ${dropped}.` : \"\"} If you really want it, now's the time. Your call.`"],
    ],
  },
  // Ladder layer 5: a look-alike only cleared, in every option asked, cheaper than both prices, never over her limit.
  "similar": {
    file: "core/src/ask/ladder.ts",
    test: "test/jacket.test.ts",
    cwd: "core",
    mutants: [
      ["a held look-alike", ".filter((o) => o.verdict === \"clear\" && o.price < saw", ".filter((o) => o.verdict !== \"refuse\" && o.price < saw"],
      ["dearer than she saw", "&& o.price < saw && o.price < sameBest", "&& o.price <= saw + 9999 && o.price < sameBest"],
      ["dearer than the same item", "&& o.price < sameBest && limit", "&& o.price <= sameBest && limit"],
      ["over her limit", "limit !== null && o.price <= limit)", "limit !== null)"],
      ["an unread limit shows one", "limit !== null && o.price <= limit)", "(limit === null || o.price <= limit))"],
      ["not the cheapest", ".sort((x, y) => x.price - y.price)[0]", ".sort((x, y) => y.price - x.price)[0]"],
      ["not labeled not the same", "not the same item: the ${look.item}.`", "the ${look.item}.`"],
      ["the item asked as its own look-alike", "JACKETS.filter((o) => o.id !== m.id &&", "JACKETS.filter((o) =>"],
    ],
  },
  "similar-words": {
    file: "core/src/ask/ask.ts",
    test: "test/jacket.test.ts test/catalog.test.ts test/ask.test.ts",
    cwd: "core",
    mutants: [
      ["first entry wins", "const oneCategory = tied.length > 1 &&", "const oneCategory = false &&"],
      ["a name word not counted", ".filter((w) => w.length >= 4 && w !== \"fictional\").filter(has).length", ".filter((w) => w.length >= 99).filter(has).length"],
      ["the session's limit not read", "categoryLimitFor(shoppers.peek(token, at)?.policy ?? demoPolicy(), entry.category)", "categoryLimitFor(demoPolicy(), entry.category)"],
    ],
  },
  "listings": {
    file: "core/src/sellers/moving.ts",
    test: "test/jacket.test.ts",
    cwd: "core",
    mutants: [
      ["any option reads", "Object.entries(asked).every(", "Object.entries(asked).some("],
      ["the options ignored", "item.sellers.filter((s) => listsAll(s, asked))", "item.sellers"],
    ],
  },
  // W41 part 3 follow-up: the reader's call takes its own count from LIVE_AI_CAP, and the card says when it didn't read.
  "reader-cap": {
    file: "server/src/main.ts",
    test: "test/abuse.test.ts -t judge_reader_draws",
    cwd: "core",
    mutants: [
      ["reader takes no count", `${JUDGE_ROUTE} && JUDGE_CAPS.global.take("all") ? JUDGE_READER`, `${JUDGE_ROUTE} ? JUDGE_READER`],
      ["reader past the cap", `${JUDGE_ROUTE} && JUDGE_CAPS.global.take("all") ? JUDGE_READER`, `${JUDGE_ROUTE} && (JUDGE_CAPS.global.take("all") || true) ? JUDGE_READER`],
    ],
  },
  "reader-cap-trick": {
    file: "server/src/main.ts",
    test: "test/abuse.test.ts -t trick_reader_draws",
    cwd: "core",
    mutants: [
      ["reader takes no count", `${TRICK_ROUTE} && JUDGE_CAPS.global.take("all") ? JUDGE_READER`, `${TRICK_ROUTE} ? JUDGE_READER`],
      ["reader past the cap", `${TRICK_ROUTE} && JUDGE_CAPS.global.take("all") ? JUDGE_READER`, `${TRICK_ROUTE} && (JUDGE_CAPS.global.take("all") || true) ? JUDGE_READER`],
    ],
  },
  "reader-row": {
    file: "core/src/judge/judge.ts",
    test: "test/reader.test.ts -t judge_card_says",
    cwd: "core",
    mutants: [
      ["a rule round names the reader", "readerSaid: useAi ? READER_ROW", "readerSaid: true ? READER_ROW"],
      ["a miss reads as read", "READER_ROW[miss ?? \"read\"]", "READER_ROW[\"read\"]"],
      ["no line in an AI round", "readerSaid: useAi ? READER_ROW[miss ?? \"read\"] : null", "readerSaid: null"],
    ],
  },
  // Track F (Nov 6, Q on merchants 670143b0): For merchants says only what the rows prove. "Signed" needs a verified,
  // matched event of the kind the outcome expects; a refusal is never timed as seen approved; a list read is never signed.
  merchants: {
    file: "core/src/view/merchants.ts",
    test: "test/merchants.test.ts",
    cwd: "core",
    mutants: [
      ["a refusal timed as seen approved", 'e.actor === "paypal" && AFTER_CHECK.has(String(e.action))', '(AFTER_CHECK.has(String(e.action)) || is(e, "cart", "refuse"))'],
      ["signed without verified", "data(e).verified === true && ", ""],
      ["signed without matched", "data(e).matched === true && ", ""],
      ["any kind signed", " && want.includes(String(data(e).eventType))", ""],
      ["a list read called signed", "word: r.event ? MERCHANT_WORDS.listed(r.event.type)", "word: r.event ? MERCHANT_WORDS.signed(r.event.type)"],
      ["paid says not yet", ": paid ? MERCHANT_WORDS.dash : ", ": "],
      ["paid never shows its capture event", "captured || paid ? [\"PAYMENT.CAPTURE.COMPLETED\"]", "captured ? [\"PAYMENT.CAPTURE.COMPLETED\"]"],
      ["unsure says nothing taken", "stopped && !unsure && !captured", "stopped && !captured"],
      ["a bent record drawn", "  if (event === undefined) return null;\n", ""],
    ],
  },
  "merchant-event": {
    file: "scripts/merchant-event.ts",
    test: "test/merchants.test.ts",
    cwd: "core",
    mutants: [
      ["a hash-less event taken", "f.customId !== cart.hash || ", ""],
      ["another capture's event taken", "f.resourceId !== cart.captureId || ", ""],
      ["another order's event taken", " || !webhookMatches(f, cart)", ""],
    ],
  },
  // W72/W73 (027): the home's refusal card marks only what the Watcher refused, and the judge's path names PayPal's
  // sandbox only where the server makes PayPal's order.
  "home-refusal": {
    file: "core/src/view/wallet.ts",
    test: "test/wallet.test.ts",
    cwd: "core",
    mutants: [
      ["every sentence marked", ".some((f) => rules.includes(f.rule)) }))", ".length >= 0 }))"],
      ["any flag marks", ".some((f) => rules.includes(f.rule)) }))", ".length > 0 }))"],
      ["no card", "  if (!e) return null;\n  const offer", "  if (e) return null;\n  const offer"],
      ["fake says sandbox", ": payment === \"sandbox\"\n", ": payment !== \"off\" && payment !== \"none\" && payment !== \"checking\"\n"],
      ["a picture promises a receipt", "payment === \"off\" ? \"Payments are off", "false ? \"Payments are off"],
    ],
  },
  // Design B: the desk counts and orders only what the rows say (the refused sellers, the notes, what came again, and
  // which rounds code caught, with whose proposal).
  "wallet-desk": {
    file: "core/src/view/wallet.ts",
    test: "test/wallet.test.ts",
    cwd: "core",
    mutants: [
      ["a hold counts as refused", 'w.some((e) => e.action === "refuse") ? "refused" : w.some((e) => e.action === "hold") ? "held"', 'w.some((e) => e.action === "refuse" || e.action === "hold") ? "refused" : w.some((e) => e.action === "hold") ? "held"'],
      ["every seller refused", "refused: refusedIds.length,", "refused: ids.length,"],
      ["again counts the refused round", "e.sellerId === refusal.sellerId && e.seq > refusal.seq", "e.sellerId === refusal.sellerId && e.seq >= 0"],
      ["the fallback read as AI", 'src === "rule" || src === "rule-fallback" ? false : null', 'src === "rule" ? false : true'],
      ["an unknown source read as AI", 'ai: src === "ai" || src === "recorded" ? true', 'ai: src !== "rule" ? true'],
      ["notes counted per offer", '.map((e) => `${e.sellerId}\\n${e.quoted!.trim()}`)).size', '.map((e) => `${e.seq}`)).size'],
      ["a code counter not caught", 'kind: "caught", proposed', 'kind: "counter", proposed'],
      ["slips from every round", "slips: offers.filter((e) => e.round === 1)", "slips: offers.filter((e) => e.round! >= 1)"],
      ["no offers still a desk", "  if (offers.length === 0) return null;\n  const verdict", "  const verdict"],
    ],
  },
  // Dial proper (QUEUE M3): the grant only at a strong record, its tap time, a bad pick at or after it turning the dial
  // back (the shopper's own rows only), Settings' turn-back keeping the record, and the guard and screens reading it.
  "dial-policy": {
    file: "trust/src/policy.ts",
    test: "test/dial.test.ts",
    cwd: "core",
    mutants: [
      ["grant at 2", "if (!(clean >= STRONG_RECORD))", "if (!(clean >= STRONG_RECORD - 1))"],
      ["no tap time", "dialSince: { ...policy.dialSince, [category]: at } };", "dialSince: { ...policy.dialSince } };"],
      ["turn-back resets the record", "  return { ...policy, dial: { ...policy.dial, [category]: \"ask-first\" } };\n}", "  return { ...policy, dial: { ...policy.dial, [category]: \"ask-first\" }, recordSince: { ...policy.recordSince, [category]: 0 } };\n}"],
    ],
  },
  "dial-settle": {
    file: "core/src/view/lanes.ts",
    test: "test/dial.test.ts",
    cwd: "core",
    mutants: [
      ["a bad pick at the tap's moment stands", "at >= (policy.dialSince?.[c] ?? -Infinity)", "at > (policy.dialSince?.[c] ?? -Infinity)"],
      ["no tap time never falls", "?? -Infinity));", "?? Infinity));"],
      ["seeded rows reach the dial", "  const events = all.filter(isShoppers);\n  const end = badPickEnd(events);", "  const events = all;\n  const end = badPickEnd(events);"],
      ["screens read the stored setting", "const policy = settleDial(given, all);", "const policy = given;"],
      ["offered at 2", "const canTurnOn = !on && p.clean >= p.needed;", "const canTurnOn = !on && p.clean >= p.needed - 1;"],
    ],
  },
  "dial-store": {
    file: "core/src/scenario.ts",
    test: "test/dial.test.ts",
    cwd: "core",
    mutants: [
      ["the guard reads the stored setting", "settleDial(policy, (ledger instanceof RunLedger ? ledger.shopper : ledger).read())", "policy"],
      ["the store trusts any record", "dialPreview(rows, h.policy, category, demoCatalogItems()).clean", "3"],
    ],
  },
  "dial-route": {
    file: "server/src/main.ts",
    test: "test/abuse.test.ts -t dial_proper_booted",
    cwd: "core",
    mutants: [
      ["no 409 under the record", "if (on && !row.on && !row.canTurnOn) return", "if (false) return"],
      ["no dial in the body", "dial: dialRows(session ? session.shopper.read() : [], session?.policy ?? demoPolicy(), CATALOG),", "dial: [],"],
    ],
  },
  // §17: the one honest line beside a cart, from her own wants, limits and week; her switch silences it.
  "tradeoff": {
    file: "core/src/ask/tradeoff.ts",
    test: "test/tradeoff.test.ts",
    cwd: "core",
    mutants: [
      ["the switch ignored", "if (!i.on) return null;", "if (false) return null;"],
      ["a really-want cart weighed", 'w.catalogId === i.cart.catalogId && w.priority === "really")) return null;', 'false)) return null;'],
      ["left exactly the max pushes out", "max <= before && max > after", "max <= before && max >= after"],
      ["a want that never fit is blamed", "max <= before && max > after", "max > after"],
      ["a nice-to-have named", 'return w.priority === "really" && w.catalogId', "return w.catalogId"],
      ["the cart's own want named", "&& w.catalogId !== i.cart.catalogId && max", "&& max"],
      ["the saved max not read at today's limit", "const max = wantMax(w, i.catalog, i.policy);", "const max = w.max;"],
      ["newest-first order ignored", "byPriority(i.wants).find(", "i.wants.find("],
    ],
  },
  "tradeoff-server": {
    file: "server/src/main.ts",
    test: "test/abuse.test.ts",
    cwd: "core",
    mutants: [
      ["another browser sees the line", "run.bound!.expiresAt <= Date.now() || !isOwner(run, c)) return null;", "run.bound!.expiresAt <= Date.now()) return null;"],
      ["a paid cart keeps the line", "!paypal || run.settled || run.bound?.spent ||", "!paypal || run.bound?.spent ||"],
      ["the server ignores the switch", "on: session.tradeoffs })?.line", "on: true })?.line"],
      ["the switch takes any value", 'if (typeof on !== "boolean") return c.json({ error: "Tradeoffs are on or off.', 'if (on === undefined) return c.json({ error: "Tradeoffs are on or off.'],
    ],
  },
  "tradeoff-session": {
    file: "core/src/scenario.ts",
    test: "test/tradeoff.test.ts",
    cwd: "core",
    mutants: [
      ["a restart turns it back on", "tradeoffs: saved.tradeoffs !== false,", "tradeoffs: true,"],
      ["an old record reads off", "tradeoffs: saved.tradeoffs !== false,", "tradeoffs: saved.tradeoffs === true,"],
      ["the switch alone is never saved", "h.wants.length > 0 || !h.tradeoffs ||", "h.wants.length > 0 ||"],
      ["another browser's switch shared", "h.tradeoffs = on;", "h.tradeoffs = on; for (const o of this.held.values()) o.tradeoffs = on;"],
    ],
  },
  "memory": {
    file: "core/src/ask/memory.ts",
    test: "test/memory.test.ts",
    cwd: "core",
    mutants: [
      ["attack rows count", " || e.source === \"attack\") continue;", ") continue;"],
      ["a refund is remembered", "if (typeof e.data?.captureId === \"string\" && refunded.has(e.data.captureId)) continue;", ""],
      ["older than the week counts", "if (!(e.t > now - WEEK_MS && e.t <= now)) continue;", "if (!(e.t <= now)) continue;"],
      ["forgetting the seeded color is ignored", "(memory.seededOff ? null : colorOf(", "(false ? null : colorOf("],
      ["any color word is remembered", ".includes(color) ? color : null", ".length >= 0 ? color : null"],
      ["a color the cart didn't list is confirmed", "cart.attributes?.color !== asked || ", ""],
      ["a turned-down color is added", " && !negated(f.color)", ""],
      ["another item's color without match words", "(MATCH.test(words) ? usable[0] : undefined)", "usable[0]"],
      ["memory overrides her own color", " || chips.some((c) => c.kind === \"attribute\" && c.name === \"color\") ||", " ||"],
      ["a color no chip caught gets memory's", " || asksOwnColor(words, colors)) return null;", ") return null;"],
      ["only catalog-less color words count", "!colors.includes(w) && new RegExp", "colors.includes(w) && new RegExp"],
      ["forget everything keeps the seeded color", "if (key === \"all\") return { confirmed: Object.freeze([]), seededOff: true };", "if (key === \"all\") return MEMORY_EMPTY;"],
      ["forget one forgets nothing", "memory.confirmed.filter((c) => c.hash !== key)", "memory.confirmed"],
      ["a stored non-catalog color survives", " && words.has(c.color))", ")"],
    ],
  },
  "memory-session": {
    file: "core/src/scenario.ts",
    test: "test/memory.test.ts",
    cwd: "core",
    mutants: [
      ["a restart forgets memory", "memory: readMemory(saved.memory, demoCatalogItems()), seen: saved.seen", "memory: MEMORY_EMPTY, seen: saved.seen"],
      ["forgetting the seeded color alone is never saved", " || h.memory.seededOff ||", " ||"],
      ["memory is never written", "memory: { confirmed: [...h.memory.confirmed], seededOff: h.memory.seededOff }, seen: h.seen", "seen: h.seen"],
    ],
  },
  // Your price on real products (Track P, Nov 5): the server's site cap, once a day a watch, her store only, five per
  // browser, and kept across a restart.
  "real-reads": {
    file: "server/src/adapters/channel3-product.ts",
    test: "test/channel3-product.test.ts",
    cwd: "core",
    mutants: [
      ["no cap taken", "    if (!this.deps.caps.take(who.token, who.ip)) return w;\n", ""],
      ["the address not counted", "this.deps.caps.take(who.token, who.ip)", "this.deps.caps.take(who.token, who.token)"],
      ["a watch read on every visit", "last && at - last.checkedAt < DAY_MS", "false"],
      ["a read in flight not joined", "const going = this.flying.get(k);", "const going = undefined as Promise<Read | null> | undefined;"],
      ["today's read forgotten", "const known = this.recent.get(k);", "const known = undefined as Read | undefined;"],
      ["another store's price counted", '.replace(/^www\\./, "") !== domain) continue;', '.replace(/^www\\./, "") === "") continue;'],
    ],
  },
  "real-session": {
    file: "core/src/scenario.ts",
    test: "test/real-watch.test.ts",
    cwd: "core",
    mutants: [
      ["a restart forgets real watches", "real: Object.freeze(readReal(saved.real, saved.seen)),", "real: [],"],
      ["no cap per browser", "(this.peek(token, at)?.real.length ?? 0) >= REAL_WATCHES_MAX", "false"],
      ["a sent last read is kept", "const { last: _sent, ...mine } = check.watch;", "const mine = check.watch;"],
    ],
  },
  "memory-server": {
    file: "server/src/main.ts",
    test: "test/abuse.test.ts",
    cwd: "core",
    mutants: [
      ["a paid color is never learned", "run.paidAt = Date.now(); rememberPaid(run);", "run.paidAt = Date.now();"],
      ["any key is accepted", "!/^(?:all|seeded|[0-9a-f]{16,128})$/.test(key)", "false"],
      ["no session shows nothing", "session ? session.shopper.read() : seededRows(Date.now())", "session ? session.shopper.read() : []"],
    ],
  },
  "w49c-local": {
    file: "core/src/view/local.ts",
    test: "test/static-demo.test.ts",
    mutants: [["the page's chips unchecked", "const chips = checked?.kind === \"accepted\" ? checked.chips : [];", "const chips = (o.chips ?? []) as Chip[];"]],
  },
  // The quality ratchet's money paths (Joshua, Nov 3, 1(d)): each rule broken, one at a time, must fail the properties, which
  // can only fail if they can actually see "paid more than the limit, a different cart, or without the tap".
  // Track X: Goose's Read and the year plan. Advice that can't be talked up, and a plan that can't pass the total.
  "gooses-read": {
    file: "core/src/view/gooses-read.ts",
    test: "test/gooses-read.test.ts",
    cwd: "core",
    mutants: [
      ["a set-aside seller reads BUY NOW", 'if (s.seller === "refuse") return { call: "SKIP", because: "Goose set aside every seller it found." };', ""],
      ["a passed day reads on", "if (s.daysLeft !== null && s.daysLeft < 0) return", "if (false) return"],
      ["past the total can say BUY NOW", "if (s.leftCents !== null && s.priceCents > s.leftCents) {", "if (false) {"],
      ["over the max can say BUY NOW", "if (s.maxCents !== null && s.priceCents > s.maxCents) return", "if (false) return"],
      ["a held seller can say BUY NOW", 'if (s.seller !== "clear") return', "if (false) return"],
      ["no trend claims one", "const trend = !s.trend ? NO_TREND", 'const trend = !s.trend ? "Fell a bit."'],
      ["the trend stops saying whose", 'export const TREND_WHOSE = "Sellers not set aside: lowest price";', 'export const TREND_WHOSE = "It";'],
      ["an AI's clear raises the call", 'if (!r || r.verdict === "clear") return read;', 'if (!r) return read; if (r.verdict === "clear") return { ...read, call: "BUY NOW" };'],
      ["an unread answer raises the call", 'if (!r || r.verdict === "clear") return read;', 'if (!r) return { ...read, call: "BUY NOW" }; if (r.verdict === "clear") return read;'],
      ["a hold drops two steps", 'read.call === "BUY NOW" ? "WAIT" :', 'read.call === "BUY NOW" ? "SKIP" :'],
    ],
  },
  // One real price in the Read (Joshua, Fri Nov 6 1:10 PM): a reference line only, never a change to the call, never a made-up line.
  "real-reference": {
    file: "core/src/view/real-reference.ts",
    test: "test/real-reference.test.ts",
    cwd: "core",
    mutants: [
      ["a cheaper real store turns BUY NOW into WAIT", "return line ? { call: read.call, because", 'return line ? { call: read.call === "BUY NOW" && /\\$/.test(line.said) ? "WAIT" : read.call, because'],
      ["the reference line gives the reason", "because: read.because, lines", "because: line.said, lines"],
      ["no answer still makes a line", "if (priced.length === 0) return null;", 'if (priced.length === 0) return { name: REAL_REF_NAME, said: `Real stores start at $0.00. ${REAL_REF_ONLY}` };'],
      ["an unknown source makes a line", '(a.source !== liveSource && a.source !== "recorded") || !liveSource', "false"],
      ["the dearest store is named, not the lowest", "(p.n < m.n ? p : m)", "(p.n > m.n ? p : m)"],
      ["a recorded price reads as live", 'a.source === liveSource\n    ? `start at', 'a.source !== "none"\n    ? `start at'],
    ],
  },
  "year-plan": {
    file: "core/src/view/year-plan.ts",
    test: "test/year-plan.test.ts",
    cwd: "core",
    mutants: [
      ["a plan can pass the total", "else if (left !== null && best.c > left) {", "else if (false) {"],
      ["the plan forgets what it spent", "if (left !== null) left -= best.c;", ""],
      ["a plan can pass the max", "if (!best || best.c > g.maxCents) {", "if (!best) {"],
      ["a plan can pick a past month", "window.filter((m) => m >= nowMonth && m <= ymdMonth(g.neededBy!))", "window.filter((m) => m <= ymdMonth(g.neededBy!))"],
      ["a plan can pick after the day", "window.filter((m) => m >= nowMonth && m <= ymdMonth(g.neededBy!))", "window.filter((m) => m >= nowMonth)"],
      ["a bought gift is planned again", 'g.bought ? { status: "bought", said: "Bought." }\n    : ', ""],
      ["the plan argues with BUY NOW", "const open = g.buyNow ? [nowMonth] : window", "const open = window"],
      ["a pick this month reads as a later month's", "best.m === nowMonth ? `Later in", "false ? `Later in"],
      ["the header dims nothing", "monthsPast: window.filter((m) => m < nowMonth).length", "monthsPast: 0"],
    ],
  },
  "money-guard": {
    file: "trust/src/guard.ts",
    test: "test/money-paths.prop.test.ts",
    cwd: "core",
    mutants: [
      ["the wrong item passes", "if (!sameItem(cart.item, want.item)) return refuse(", "if (false) return refuse("],
      ["any quantity passes", "if (cart.qty !== want.qty) return refuse(", "if (false) return refuse("],
      ["a bad price passes", "const priced = Number.isSafeInteger(cart.price) && cart.price > 0;", "const priced = true;"],
      ["over the max passes", "if (!withinLimit(cart.price, want.maxPrice)) return", "if (false) return"],
      ["over the cap passes", "if (!withinLimit(cart.price, this.policy.perPurchaseCap)) return", "if (false) return"],
      ["over the category limit passes", "if (!withinLimit(cart.price, limit)) return", "if (false) return"],
      ["over the week passes, at the cart", "if (!withinLimit(week + cart.price, this.policy.weeklyLimit)) return", "if (false) return"],
      ["past the deadline passes", "if (!(now <= want.deadline)) return", "if (false) return"],
      ["past the list's total passes, at the cart", "const over = this.overTotal(cart.price);\n    if (over) return", "const over = this.overTotal(cart.price);\n    if (false) return"],
      ["past the list's total passes, at capture", "const over = this.overTotal(bound.cart.price);\n    if (over) return", "const over = this.overTotal(bound.cart.price);\n    if (false) return"],
      ["the total ignores what's spent", "return withinLimit(spent + price, on.total) ?", "return withinLimit(price, on.total) ?"],
      ["a return for another order settles", "if (bound.orderId !== orderId) return refuse(", "if (false) return refuse("],
      ["an expired approval settles", "if (!(now <= bound.expiresAt)) return refuse(", "if (false) return refuse("],
      ["over the week passes, at capture", "if (!withinLimit(this.weekSpend(now) + bound.cart.price, this.policy.weeklyLimit)) return", "if (false) return"],
      ["an edited cart settles", "if (bindingHash(bound.cart, bound.nonce, bound.expiresAt, this.deps.hash) !== bound.hash) return", "if (false) return"],
      ["the order's re-read is ignored", "if (!check.ok) return refuse(check.reason, undefined, check.quoted);", "if (false) return refuse(\"x\");"],
      ["another amount reads as paid", "if (cap.amount !== bound.cart.price || cap.currency !== bound.cart.currency) {", "if (false) {"],
      ["an unread decline says nothing moved", ": after === null ? [\"unknown\", UNREAD_REASON, UNREAD_WHY]", ": false ? [\"unknown\", UNREAD_REASON, UNREAD_WHY]"],
      ["the week forgets a capture in flight", " || (e.actor === \"guard\" && e.action === \"capturing\" && !answered.has(e.seq))", ""],
      ["the week forgets an unconfirmed capture", " || (e.action === \"capture-failed\" && e.data?.code === \"unknown\")", ""],
      ["the week forgets a wrong-amount capture", " || e.action === \"capture-mismatch\"", ""],
      ["the week counts another shopper", "const mine = rows.filter((e) => e.shopperId === shopperId && isShoppers(e));", "const mine = rows.filter((e) => isShoppers(e));"],
      ["the week never ends", "return moneyOutAfter(rows, shopperId, now - WEEK_MS);", "return moneyOutAfter(rows, shopperId, -1);"],
    ],
  },
  // The cart's single use has locks that back each other up (the object, the ledger, the claim before the call): breaking one
  // alone may change nothing a shopper can see. A survivor here is read by hand, not assumed either way.
  "money-once": {
    file: "trust/src/guard.ts",
    test: "test/money-paths.prop.test.ts",
    cwd: "core",
    mutants: [
      ["a used cart pays again (object's lock)", "if (bound.spent) return refuse(\"cart already used\");", ""],
      ["a reloaded cart pays again (ledger's lock)", "if (this.ledger.read().some((e) => e.actor === \"guard\" && e.action === \"capturing\" && e.data?.hash === bound.hash)) return refuse(\"cart already used\");", ""],
      ["the cart isn't claimed before the call", "bound.spent = true; // ...then claim", "// ...then claim"],
    ],
  },
  "money-cart": {
    file: "trust/src/cart.ts",
    test: "test/money-paths.prop.test.ts",
    cwd: "core",
    mutants: [
      ["expired reads as live", "if (!(now <= b.expiresAt)) return refused(\"expired\");", ""],
      ["another order passes", "if (snap.id !== b.orderId) return refused(", "if (false) return refused("],
      ["another custom_id passes", "if (snap.customId !== b.hash) return refused(", "if (false) return refused("],
      ["another amount passes", "if (snap.amount !== b.cart.price) return refused(", "if (false) return refused("],
      ["another currency passes", "if (snap.currency !== b.cart.currency) return refused(", "if (false) return refused("],
      ["another payee passes", "if (b.cart.payee !== undefined && snap.payee !== b.cart.payee) return refused(", "if (false) return refused("],
      ["another intent passes", "if (snap.intent !== undefined && snap.intent !== (b.intent ?? \"CAPTURE\")) return refused(", "if (false) return refused("],
      ["not approved passes: no tap needed", "if (snap.status !== \"APPROVED\") return refused(", "if (false) return refused("],
      ["the hash doesn't cover the price", "fromCents(c.price), c.currency, c.shape", "c.currency, c.shape"],
    ],
  },
  "money-money": {
    file: "trust/src/money.ts",
    test: "test/money-paths.prop.test.ts",
    cwd: "core",
    mutants: [
      ["a broken limit reads as no limit", "Number.isSafeInteger(limit) && c <= limit", "!(c > limit)"],
      ["a cent over the limit passes", "Number.isSafeInteger(limit) && c <= limit", "Number.isSafeInteger(limit) && c <= limit + 1"],
      ["the limit itself refuses", "Number.isSafeInteger(limit) && c <= limit", "Number.isSafeInteger(limit) && c < limit"],
      ["a huge amount rounds quietly", "if (!Number.isSafeInteger(cents)) throw", "if (false) throw"],
      ["cents read wrong", "whole * 100 + Number(frac)", "whole * 100"],
    ],
  },
  "reason-words": { file: "core/src/judge/attempts.ts", test: "test/watch-asks.test.ts", cwd: "core", mutants: [
    ["the board says the seller asked for a gift card", '"gift-card": "Reads like a gift card ask"', '"gift-card": "Asks to be paid by gift card"'],
    ["the board says the seller asked to pay outside PayPal", '"off-paypal": "Reads like paying outside PayPal"', '"off-paypal": "Asks to be paid outside PayPal"'],
    ["the board says the seller tries to give orders", '"instructs-agent": "Reads like orders to Goose"', '"instructs-agent": "Tries to give Goose orders"'],
  ] },
  "reason-words-session": { file: "core/src/view/session.ts", test: "test/watch-asks.test.ts", cwd: "core", mutants: [
    ["the ledger says the seller asked for gift cards", '"gift-card": "Read like a gift card ask"', '"gift-card": "Asked for gift cards"'],
    ["the ledger says the note rewrote memory", '"writes-memory": "Read like rewriting Goose\'s memory"', '"writes-memory": "Rewrote Goose\'s memory"'],
  ] },
  "money-undo": {
    file: "trust/src/undo.ts",
    test: "test/money-paths.prop.test.ts",
    cwd: "core",
    mutants: [
      ["a second Undo refunds again", "if (run.refund) return run.refund;", ""],
      ["two Undos at once both refund", "if (run.refunding) return run.refunding;", ""],
      ["an unpaid run refunds", "if (!run.bound || !(run.settled?.ok || wrong)) return", "if (!run.bound) return"],
      ["each try gets its own refund id", "const requestId = refundRequestId(run.id);", "const requestId = refundRequestId(run.id + Math.random());"],
    ],
  },
  // The server's own locks, through real requests against a real local server on the fake port.
  "money-routes": {
    file: "server/src/main.ts",
    test: "test/money-routes.prop.test.ts",
    cwd: "core",
    mutants: [
      ["a stranger's tap counts", "const back = run && isOwner(run, c) ? fake.tap(order) : null;", "const back = run ? fake.tap(order) : null;"],
      ["a return needs no secret", "if (!timingSafeEq(sha256(c.req.query(\"k\") ?? \"\"), run.secretHash)) return c.text(\"not this run's return\", 403);", ""],
      ["a return for another order settles", "if (!token || !run.bound.orderId || !timingSafeEq(token, run.bound.orderId)) return c.text(\"not this run's order\", 403);", ""],
      // Two locks back each other up here (a settled run, and the settling promise it keeps), so a replay needs both gone.
      ["a replayed return settles again", "if (run.settled) return back(c, run, run.answered);\n  // A return that arrives while another is settling must not record \"cart already used\" over the real result.\n  if (run.settling) { await run.settling; return back(c, run); }", ""],
      ["anyone is the owner", "return Boolean(have) && timingSafeEq(shopperKey(have!), run.owner);", "return true;"],
      ["a shopper's answer can sit in a cache", 'app.use("/api/runs/*", async (c, next) => { await next(); c.header("Cache-Control", "no-store"); });', ""],
    ],
  },
};

// `--stale`: every mutant still names text that's there, in a blink, with no test run. A refactor can move a line out from
// under a mutant, and it then guards nothing until the next full run says so (seen: "the week never ends", Nov 4).
if (process.argv[2] === "--stale") {
  const stale = Object.entries(SETS).flatMap(([setName, set]) => {
    const src = readFileSync(set.file, "utf8");
    return set.mutants.flatMap(([name, from]) => { const n = src.split(from).length - 1; return n === 1 ? [] : [`${setName}: "${name}" matches ${n} places, not 1`]; });
  });
  for (const line of stale) console.error(line);
  console.log(stale.length ? `${stale.length} stale mutant(s)` : "ok: every mutant names its line");
  process.exit(stale.length ? 1 : 0);
}

// A mutant run is heavy: it takes the one lock (scripts/heavy-lock.sh), and goes through it once, so a run inside a check or typed
// under `lockf` by hand doesn't wait for itself.
if (!process.env.GOOSE_MUTANTS_LOCKED) {
  const r = spawnSync("sh", ["scripts/heavy-lock.sh", process.execPath, ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, GOOSE_MUTANTS_LOCKED: "1" } });
  process.exit(r.status ?? 1);
}

const want = process.argv[2];
const sets = want ? { [want]: SETS[want] } : SETS;
if (want && !SETS[want]) { console.error(`no mutant set "${want}" (${Object.keys(SETS).join(", ")})`); process.exit(1); }
let survived = 0;
// A stopped run puts the live set's source back. One handler for every signal a stop sends: Ctrl-C is INT, but a stop from
// the app or a script is TERM, and a closed terminal is HUP (Nov 5: a TERM left "the address not counted" in a server file
// until a security review read it). One handler, not one per set: with `once` per set, set 1's ran first and exited.
let restoreLive: (() => void) | null = null;
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(sig, () => { restoreLive?.(); process.exit(130); });
for (const [setName, set] of Object.entries(sets) as [string, Set][]) {
  // A red test "catches" every mutant, so a set whose test is already red proves nothing (seen Nov 4: 7 of 7 "caught" on a
  // test a merge had turned red). Before the source is touched, its test has to pass.
  const clean = spawnSync("corepack", ["pnpm", "exec", "vitest", "run", ...set.test.split(" ")], { cwd: set.cwd ?? set.file.split("/")[0], encoding: "utf8" });
  if (clean.status !== 0) { console.error(`RED BEFORE ANY MUTANT ${setName}: ${set.test} fails unchanged, so a catch here means nothing`); survived += set.mutants.length; continue; }
  const src = readFileSync(set.file, "utf8");
  const restore = () => writeFileSync(set.file, src);
  restoreLive = restore;
  try {
    for (const [name, from, to] of set.mutants) {
      const n = src.split(from).length - 1;
      if (n !== 1) { console.error(`${setName}: "${name}" matches ${n} places, not 1`); survived++; continue; }
      writeFileSync(set.file, src.replace(from, to));
      const r = spawnSync("corepack", ["pnpm", "exec", "vitest", "run", ...set.test.split(" ")], { cwd: set.cwd ?? set.file.split("/")[0], encoding: "utf8" });
      const caught = r.status !== 0;
      if (!caught) survived++;
      console.log(`${caught ? "caught  " : "SURVIVED"} ${setName}: ${name}`);
    }
  } finally { restore(); restoreLive = null; }
}
console.log(survived ? `${survived} mutant(s) survived` : "every mutant caught");
process.exit(survived ? 1 : 0);
