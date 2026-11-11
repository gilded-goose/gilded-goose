// "The missing layer" (Joshua, Nov 3, section 2): the industry gap and the research, one section on the landing and on
// Proof. Every quote is copied from its source, re-read at its address on the date below, and has its own row in
// docs/claims.md (`ml-*`), whose probe holds the words, the address and the date to this file.
//
// The Lead's three limits on the wording: "we didn't find", never "none" or "first ever", because our reading supports
// nothing wider; Goose adds a layer before the payment layer, which is a serious design and not wrong; and this file is
// the one place a cited source may be named, and only its sources list draws a name (the rule against naming rivals holds everywhere else:
// `NAMED_SECTION` in scripts/claims-placeholders.ts). Never a hackathon entrant.
//
// One source could not be read on the re-read day (its page refused the fetch), so it isn't cited or listed as checked.
import type { PromiseId } from "./promises.ts";

/** The day every source below was last read at its address. */
export const LAYER_READ = "Nov 4 2026";

export const LAYER_HEAD = "The missing layer";

/** Joshua's thesis (Nov 11), drawn first: the section's idea in his words. */
export const LAYER_THESIS = "A yes is only safe if what you approve is exactly what you asked for.";

/** What the reading supports, and no more. One literal, so row `ml-lede` finds it; it opens with the thesis (a test holds that). Names no source (Joshua, Nov 11: rivals are named only in the sources list). */
export const LAYER_LEDE = "A yes is only safe if what you approve is exactly what you asked for. Tokens, mandates and limits guard the payment. In what we read, we didn't find a check of the seller's own words before any order exists.";

/** Joshua's claim, as far as the code holds it: `watch` reads these three fields, and only the shopper's tap pays. */
export const LAYER_GOOSE = "Goose is the missing layer. Before any order exists, the Watcher's plain code reads each seller's note, store name and item title as data, never as orders. It can miss a scam. If a trick slips past, Goose still can't pay. Only your tap in PayPal does.";

/** The big idea, drawn on its own line at the lead quotes' size (the DD, Nov 4). Cut from `LAYER_GOOSE`, not typed again: the
 *  whole sentence stays one literal, which is what row `ml-goose` checks for in this file. */
export const LAYER_GOOSE_HEAD = LAYER_GOOSE.slice(0, LAYER_GOOSE.indexOf(". ") + 1);
export const LAYER_GOOSE_REST = LAYER_GOOSE.slice(LAYER_GOOSE_HEAD.length + 1);

/** The limit of "we didn't find", and what isn't new. */
export const LAYER_CAVEAT = "Not finding it isn't proof it doesn't exist: others may do something similar without publishing it. Limits kept outside the model, approval tied to one cart and a hold before capture are known ideas. The check of the seller's words is the part we didn't find.";

/** The lead quote's label: the standard is named only in the sources list below it. */
export const LEAD_GAP_WHO = "One agent-payment protocol's security notes";
export const AP2_NOTE = "A serious design that limits the damage, and PayPal has announced support for it. Goose adds a layer before that one.";
export const RESEARCH_NOTE = "So the risk depends on the model. Goose's limits and your tap don't.";

export interface LayerQuote {
  /** Its row in docs/claims.md. */
  row: string;
  /** The source's words, exactly. Under 15 words: a short quote, with the address to read the rest. */
  text: string;
}

export interface LayerSource {
  id: string;
  who: string;
  title: string;
  url: string;
  group: "gap" | "research";
  quotes: readonly LayerQuote[];
  /** What a reader needs so the quote doesn't say more than the source. Stands in the first quote's row. */
  note: string;
}

const AP2_URL = "https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/security_and_privacy_considerations.md";

export const LAYER_SOURCES: readonly LayerSource[] = [
  {
    id: "ap2", who: "Google's AP2", title: "Security and privacy considerations", url: AP2_URL, group: "gap",
    quotes: [
      { row: "ml-ap2-infeasible", text: "AP2 assumes that preventing prompt injection attacks is infeasible." },
      { row: "ml-ap2-bounded", text: "worst-case financial and logical impacts are strictly bounded." },
    ],
    note: "It treats every agent as a possible attacker and limits what one can do.",
  },
  {
    id: "paypal-ap2", who: "PayPal", title: "Agent Payments Protocol post", url: "https://developer.paypal.com/community/blog/PayPal-Agent-Payments-Protocol/", group: "gap",
    quotes: [{ row: "ml-paypal-ap2", text: "PayPal is committed to supporting AP2" }],
    note: "An announcement from Sept 16, 2025. We didn't confirm live use.",
  },
  {
    id: "paypal-services", who: "PayPal", title: "Agentic commerce services release", url: "https://newsroom.paypal-corp.com/2025-10-28-PayPal-Launches-Agentic-Commerce-Services-to-Power-AI-Driven-Shopping", group: "gap",
    quotes: [{ row: "ml-paypal-services", text: "will enable fraud detection, buyer protection, and dispute resolution" }],
    note: "From PayPal's release of Oct 28, 2025.",
  },
  {
    id: "visa", who: "Visa", title: "Intelligent Commerce release", url: "https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.21361.html", group: "gap",
    quotes: [{ row: "ml-visa", text: "easily set spending limits and conditions" }],
    note: "From Visa's release of Apr 30, 2025.",
  },
  {
    id: "acp", who: "Agentic Commerce Protocol", title: "Delegated payment spec, OpenAI's docs", url: "https://developers.openai.com/commerce/specs/payment.md", group: "gap",
    quotes: [{ row: "ml-acp", text: "cannot be used outside the defined limits of the user-approved purchase" }],
    note: "A token with a max amount and an expiry.",
  },
  {
    id: "magentic", who: "Microsoft Research", title: "Magentic Marketplace", url: "https://www.microsoft.com/en-us/research/wp-content/uploads/2025/10/multi-agent-marketplace.pdf", group: "research",
    quotes: [
      { row: "ml-magentic-risk", text: "fell victim to prompt injection attacks" },
      { row: "ml-magentic-frontier", text: "Frontier models demonstrate robust manipulation resistance." },
    ],
    note: "A simulated market, in a preprint of Oct 24, 2025. The models that fell: GPT-4o, GPT-OSS-20B and Qwen3-4B-2507.",
  },
  {
    id: "stakebench", who: "Wang et al.", title: "Who Pays the Price? (StakeBench)", url: "https://arxiv.org/abs/2606.13385", group: "research",
    quotes: [{ row: "ml-stakebench", text: "no attack objective is reliably resisted by current LLM-based web agents" }],
    note: "Four agent setups, 3,168 attacked runs. A preprint, revised Jul 27, 2026.",
  },
  {
    id: "risky-game", who: "Zhu et al.", title: "The Automated but Risky Game", url: "https://arxiv.org/html/2506.00073v4", group: "research",
    quotes: [{ row: "ml-risky-game", text: "deal-making with LLM agents is an inherently imbalanced game" }],
    note: "Its table lists out-of-budget rates of 11.76 for Qwen2.5-7B and 6.25 for GPT-3.5. A preprint.",
  },
  {
    id: "scamlexity", who: "Guardio Labs", title: "Scamlexity", url: "https://guard.io/labs/scamlexity-we-put-agentic-ai-browsers-to-the-test-they-clicked-they-paid-they-failed", group: "research",
    quotes: [{ row: "ml-scamlexity", text: "handed over personal and payment details directly to the scammer" }],
    note: "One agentic browser on the researchers' own fake store, Aug 20, 2025. Results varied: in other runs it refused or asked the person to finish.",
  },
  {
    id: "unit42", who: "Unit 42, Palo Alto Networks", title: "Who's Really Shopping?", url: "https://unit42.paloaltonetworks.com/retail-fraud-agentic-ai/", group: "research",
    quotes: [{ row: "ml-unit42", text: "Hidden in the html metadata or an invisible <span> tag is an instruction" }],
    note: "A constructed scenario, not an observed attack. Mar 20, 2026.",
  },
];

/** The two sources the landing leads with: the gap, and the research with its other half. */
export const LEAD_GAP = "ap2", LEAD_RESEARCH = "magentic";
export const sourceOf = (id: string): LayerSource => LAYER_SOURCES.find((s) => s.id === id)!;
/** Every quote with its source, one per row. */
export const LAYER_QUOTES = LAYER_SOURCES.flatMap((s) => s.quotes.map((q, i) => ({ ...q, source: s, first: i === 0 })));
export const LAYER_GROUPS = [
  { key: "gap", title: "What protects the payment", sources: LAYER_SOURCES.filter((s) => s.group === "gap") },
  { key: "research", title: "What research found", sources: LAYER_SOURCES.filter((s) => s.group === "research") },
] as const;

/** The three fears behind "Would you let AI shop for you?", Joshua's words, each answered by its promise. Here, not in
 *  promises.ts: only the landing's section draws them, and the first screen shouldn't carry them. */
export const FEARS: Readonly<Record<PromiseId, string>> = {
  fooled: "It'll get tricked.",
  overspend: "It'll overspend.",
  hide: "I won't know what it did.",
};

/** The same claim for the README, Devpost and the press release, where no source is named. */
export const LAYER_DOC_LINE = "Payment protections guard the payment. In what we read from a card network, PayPal and two agent-payment protocols, we didn't find a check of the seller's own words before any order exists. Goose is that missing layer.";
