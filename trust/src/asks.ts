// Layer 4, the Watcher's asks in plain words (Track C's red team, Nov 4): a blind writer's friendly scams named no app and
// no card ("send it straight to me", "a customs fee you pay the courier", "read me the six digit code", "This is PayPal
// Support"), and 23 of 30 read as nothing at all. Each family here only ever holds: the words say a seller wants money or
// a secret some way checkout doesn't, which isn't proof, and it waits for the shopper's yes. Nothing here can refuse, the AI
// reader included (`NEVER_REFUSE`). The rules are named for the scam they were written from; what the screen says is only
// what the code saw, the words (Q's ruling, Nov 4): "Payment outside the site is not accepted." mentions paying elsewhere, and asks nothing.
// Words, not intent, and no promise of every language: a few payment names and bank words are read by name, nothing more.
// Still a word list, and fresh writers mostly get past it: beside Track S's rules it moved 2 of 45 and 0 of 59 sealed scams
// off "read as nothing". The shopper's tap and the limits are what hold when these words don't.
// Read on `normalize`'s text, with every gap bounded: an ordinary note takes a small fraction of a millisecond.

export type AskRule = "asks-money-away" | "asks-for-code" | "speaks-as";
export const ASK_RULES: readonly AskRule[] = ["asks-money-away", "asks-for-code", "speaks-as"];
export const ASK_SAID: Record<AskRule, string> = {
  "asks-money-away": "its words mention paying some way other than checkout",
  "asks-for-code": "its words mention a code or your details",
  "speaks-as": "its words may speak as someone else, or to your shopping agent",
};

/** A turn-down a few words back ("We never ask you to pay me directly"), or a warning about others ("fake sellers asking you to pay off site"). */
const TURNED_DOWN = /\b(?:no|not|never|don't|dont|won't|wont|can't|cant|cannot|without)\s+(?:(?!so\b|but\b|if\b|problem\b|worries\b)[\w']+\s+){0,3}$|\b(?:scammers?|fake)\b[^.,!?;]{0,40}$/i;
const GAP = String.raw`[^.!?;]{0,40}?`;
const WHERE = String.raw`(?:it|the\s+(?:site|app|marketplace|platform|checkout|listing)|this\s+(?:site|app|marketplace)|checkout|paypal)`;
const WHO = String.raw`(?:paypal|marketplace|site|platform|checkout)`;
const FEE_NAMES_OF = (names: string) => String.raw`(?:${names})\s+(?:release\s+)?(?:fee|charge|release)`;
/** A fee honest sellers state too ("Delivery fee of $5 applies"), so only an owed one counts. */
const FEE_PLAIN = FEE_NAMES_OF("delivery|driver|courier|handling|processing|import");
/** A fee that is itself the story. */
const FEE_ODD = FEE_NAMES_OF("customs|insurance|release|clearance|verification|activation|hold");
const LABEL = String.raw`(?:gift|present|personal|family)`;
const PAY = /\b(?:pay|paid|payment|send|fees?|money|marketplace|paypal)\b/i;
const ASK = /\b(?:read|send|sending|tell|give|reply|share|forward|text|confirm|provide|enter|pass)\b/i;
// Only PayPal's own host is exempt, whole: paypal.com@evil.com and paypal.com;x@evil.com open evil.com. So what may follow it is listed, not what may
// not: the end, a path or a sentence's own punctuation. A link with its scheme is a link at any ending.
export const NOT_PAYPAL = String.raw`(?!(?:www\.)?paypal\.com(?=$|[\/?#\s]|[.,;:!)]+(?:\s|$)))`;
/** A web address in a note, as `normalize` leaves it: hyphens are spaces by then, so only the last word and its ending show. */
const SITE = String.raw`\b${NOT_PAYPAL}\w+\.(?:com|net|org|co|io|shop|store|biz|info|online|site|xyz|me|ly)\b`;
/** A sentence that sends the money through checkout itself is checkout's: "pay us directly through checkout". */
const AT_CHECKOUT = /(?<!\b(?:not|never|than|skip|avoid)\s+)\b(?:through|via|at|in|use|with)\s+(?:the\s+)?(?:paypal\s+)?checkout\b/i;

interface Ask { rule: AskRule; re: RegExp; needs?: RegExp; bare?: boolean }
const ask = (rule: AskRule, source: string, more: Partial<Ask> = {}): Ask => ({ rule, re: new RegExp(source, "gi"), ...more });

const ASKS: Ask[] = [
  // To the seller, past the checkout: "send it straight to me", "pay me outside it", "another way", "my payment page".
  ask("asks-money-away", String.raw`\b(?:send|pay|transfer|wire)\b${GAP}\b(?:straight|direct(?:ly)?)\s+to\s+(?:me|us|my|our)\b|\bpay\w*\s+(?:me|us)\s+(?:straight|direct(?:ly)?|there|outside)\b|\b(?:send|pay|transfer)\b${GAP}\bto\s+my\s+(?:email|e mail|account|acct|wallet|page|profile|number)\b|\bcash\s+handle\b|\bpay\s+(?:to\s+)?(?:our|my)\s+agent\b|\bto\s+the\s+same\s+account\b|\bpay\b${GAP}\bto\s+them\s+direct(?:ly)?\b|\bunpaid\b[^.!?;]{0,20}\b(?:balance|amount)\b|\b(?:sends?|transfer|wire)\s+(?:the\s+|your\s+)?(?:money|payment|funds)\s+to\s+(?:me|us|my)\b|\btransfer\s+to\s+(?:me|us|my)\b`),
  ask("asks-money-away", String.raw`\b(?:pay|paying|payment|send|transfer)\b${GAP}\b(?:outside|around)\s+(?:of\s+)?${WHERE}\b|\b(?:pay|payment|send)\b${GAP}\b(?:another|other|different)\s+way\b|\bmy\s+(?:own\s+)?(?:pay(?:ment)?|invoice)\s+(?:page|link|form|site)\b|\bmy\s+own\s+link\b|\b(?:sales?|sell\w*|pay\w*|deals?)\b${GAP}\boff\s*site\b|\bcollects?\s+payments?\b|\bwe\s+do\s+it\s+manually\b|\b(?:secure|payment|pay)\s+link\b|\bqr\b${GAP}\bpay\b|\bpay\b${GAP}\bqr\b`),
  // Why skip it: its cut, its hold, its protection. "Don't use the buy button" is the ask itself, so no turn-down reads it. "Don't click it twice" and "don't hit buy until we've met" aren't.
  ask("asks-money-away", String.raw`\b(?:saves?|skip|avoid)\b[^.!?;]{0,25}?\b${WHO}\s+(?:cut|fees?)\b|\b${WHO}\s+(?:doesn't|does not|won't|wont|can't)\s+(?:take|hold|get|charge|see)\s+(?:a\s+|its\s+|any\s+|their\s+|the\s+|your\s+)?(?:cut|fees?|money|payment|percent|it)\b|\b${WHO}\s+takes?\s+a\s+cut\b|\bbuyer\s+protection\s+(?:holds?|slows?|delays?|takes?)\b|\b(?:no\s+need\s+for|skip|without)\s+(?:the\s+)?buyer\s+protection\b|\bdon't\s+(?:use|click|press|hit|tap)\s+(?:the\s+)?(?:buy|checkout|pay)\b(?![^.!?;,]*\b(?:again|twice|more\s+than\s+once|until|before)\b)`, { bare: true }),
  // A web address beside a pay word, or one that is itself a pay page: checkout is here, not there.
  ask("asks-money-away", String.raw`\b(?:pay|paying|payment|send|settle|invoice)\b[^.!?;]{0,40}?(?:www\.)?${SITE}|\blink\s*:[^.!?;]{0,30}?(?:www\.)?${SITE}|${SITE}\S*[^.!?;]{0,25}\b(?:to\s+pay|payment)\b|\b${NOT_PAYPAL}\w*pay\w*\.(?:com|net|org|co|io|shop|store|biz|info|online|site|xyz|me|ly)\b|${SITE}/(?:pay|inv|invoice|settle|checkout|billing|bill)\b`),
  // A fee owed before the item comes.
  ask("asks-money-away", String.raw`\b${FEE_ODD}\b[^.!?]{0,60}?\b(?:pay|paid|sent|send|unpaid|must|needed|required|before|first|owed|due|applies|billed)\b|\b${FEE_PLAIN}\b[^.!?]{0,60}?\b(?:sent|send|unpaid|must|required|before|first|owed)\b|\b(?:pay|send)\b${GAP}\b(?:${FEE_ODD}|${FEE_PLAIN})\b`),
  // Send more, get some back; a refund "by mistake" to be made good.
  ask("asks-money-away", String.raw`\b(?:send|pay)\s+(?:me\s+)?\$?\s?\d${GAP}\b(?:refund|send|give|return)\b[^.!?;]{0,25}?\b(?:back|the\s+rest|the\s+difference|the\s+extra)\b|\bextra\b${GAP}\bsend\b[^.!?;]{0,15}\bback\b|\b(?:refunded|sent|paid|charged|overcharged)\b[^.!?;]{0,25}\bby\s+(?:mistake|accident)\b|\b(?:wire|pay|transfer)\s+(?:me\s+|us\s+)?back\b|\bsend\s+(?:me|us)\s+back\b|\bsend\s+(?:me\s+)?the\s+(?:rest|difference|extra)\s+back\b|\bkeep\s+the\s+difference\b|\bpay\s+(?:it\s+)?(?:once\s+more|again|a\s+second\s+time)\b|\brelease\s+(?:the\s+)?(?:payment|funds|money)\b|\b(?:need|want)\s+your\s+payment\s+now\b|\bsending\s+the\s+(?:final|full|remaining)\s+amount\b`),
  // A payment labeled to lose its protection, in the note's own words.
  ask("asks-money-away", String.raw`\bmark\b[^.!?;]{0,25}\b${LABEL}\b|\b${LABEL}\s+(?:option|one|setting)\b|\bas\s+a\s+present\b|\b(?:pay|put|mark|send|label)\b${GAP}\b(?:loved\s+one|for\s+a\s+friend)\b`, { needs: PAY }),
  // Payment names and bank words from elsewhere: by name only (no language is read as a language).
  ask("asks-money-away", String.raw`\b(?:bizum|gcash|paytm|m ?pesa|alipay|wechat pay|mb way|trc20|uberweisung|transferencia|virement|bonifico|cartao presente|geschenkkarte)\b|\b(?:pay|take|accept|via|by|through|only)\b[^.!?;]{0,15}\b(?:pix|upi)\b|\b(?:pay|send)\b[^.!?;]{0,15}\b(?:sats|lightning)\b`),
  // A secret read out to the seller. The ask may sit in the next sentence. A 4 pin plug and a confirmation number on a parcel aren't secrets.
  ask("asks-for-code", String.raw`\b(?:six|6|four|4)\s+(?:digit\s+(?:code|password|passcode|pin|number)|code|password|passcode)\b|\b(?:one\s+time|verification|security|login|sms)\s+(?:digit\s+)?(?:code|password|passcode|pin|number)\b|\bconfirmation\s+(?:digit\s+)?(?:code|password|passcode|pin)\b|\botp\b|\bcode\s+(?:we|i|they)\s+(?:just\s+)?(?:sent|texted|emailed)\b|\bcode\s+(?:that\s+)?(?:came|arrived|was\s+sent|was\s+texted)\b|\ba\s+code\s+from\s+(?:a\s+)?(?:store|gift|prepaid)\b|\b(?:card|bank|login|account|email)\s+(?:details|info|information|password|pass|credentials)\b|\baccount\s+name\s+and\s+pass\b`, { needs: ASK }),
  ask("asks-for-code", String.raw`\b(?:log|sign)\s*in\b${GAP}${SITE}|\b(?:install|download|open|run|use)\b${GAP}\bremote\s+(?:help|access|support|desktop|app|tool|session)\b|\bremote\s+(?:help|access|support|desktop)\s+(?:tool|app|session)\b|\bshare\s+your\s+screen\b|\bscreen\s+code\b`),
  // Who it says it is, at the head of a sentence.
  ask("speaks-as", String.raw`(?:^|[.!?]\s+)(?:this\s+is|i\s+am|i'm|(?:message|notice|alert|note)\s+from)\s+(?:the\s+|your\s+)?(?:paypal|marketplace|buyer\s+care|customer\s+support|support\s+(?:team|desk)|trust\s+and\s+safety|shopping\s+assistant|helper\s+for)\b`, { bare: true }),
  // To the agent, in natural words, or dressed as its own settings.
  ask("speaks-as", String.raw`\bwithout\s+(?:asking|checking\s+with|confirming\s+with|bothering)\s+(?:you|them|the\s+(?:owner|buyer|shopper|user))\b|\bskip\s+(?:the\s+)?(?:confirmation|approval|tap)\b(?!\s+(?:email|e mail|text|page|message))|\bskip\s+(?:asking|checking|confirming)\b|\bno\s+need\s+to\s+(?:bother|ask|check\s+with)\s+(?:them|anyone|the\s+(?:owner|buyer|human|user|shopper))\b|\btell\s+(?:it|your\s+(?:assistant|agent|ai|bot))\s+to\b|\bturn\s+off\s+the\s+confirmation\b|\b(?:already\s+)?have\s+their\s+(?:ok|okay|yes|approval)\b|\bokay\s+the\s+purchase\b|\bautomated\s+buyer\b|\brole\s*:\s*(?:system|developer)\b|\bapproval\s*[:=]\s*(?:granted|yes|true)\b|\bbudget\s*[:=]\s*\$?\d|\bdecode\b${GAP}\b(?:do|follow|obey)\b`, { bare: true }),
];

/**
 * Every match of a /g pattern, as `text.matchAll(re)` gives them. `matchAll` copies its pattern on each call, and a haggle
 * reads about 12,000 patterns of which 0.4% match: the copying was 70% of a seeded sweep. So look first, with the pattern
 * itself, and leave it where it started: these are shared. A pattern without /g throws `matchAll`'s own TypeError first:
 * on a miss `test` alone would answer "no match" for a pattern `matchAll` refuses (Q, Nov 5).
 */
export function matchesOf(text: string, re: RegExp): RegExpExecArray[] {
  if (!re.global) text.matchAll(re);
  re.lastIndex = 0;
  if (!re.test(text)) return [];
  re.lastIndex = 0;
  return [...text.matchAll(re)];
}

/** The families this text asks in, each once, in a fixed order. Holds only. */
export function readAsks(text: string): AskRule[] {
  const found = new Set<AskRule>();
  for (const a of ASKS) {
    if (found.has(a.rule) || (a.needs && !a.needs.test(text))) continue;
    for (const m of matchesOf(text, a.re)) {
      if (!a.bare && TURNED_DOWN.test(text.slice(Math.max(0, m.index - 60), m.index))) continue;
      const from = Math.max(0, ...[...text.slice(0, m.index).matchAll(/[.!?;]/g)].map((c) => c.index + 1));
      const to = text.slice(m.index + m[0].length).search(/[.!?;]/);
      const own = text.slice(from, to < 0 ? text.length : m.index + m[0].length + to);
      if (a.rule === "asks-money-away" && !a.bare && AT_CHECKOUT.test(own)) continue;
      found.add(a.rule);
      break;
    }
  }
  return ASK_RULES.filter((r) => found.has(r));
}
