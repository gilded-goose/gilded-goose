// Why this matters (Joshua, Wed Nov 4, section 1): right after the Challenge, the size of the problem and whom Goose is for.
// Every figure is on ftc.gov, quoted exactly in its claims row with the date it was read (Lead-10: what can't be confirmed
// there doesn't ship). No 2025 gift-card share is on ftc.gov, so the older one stays, with its years in its own words.
// The 46% is the FTC's own, note 93 of its older adults report, on the sentence about 2025's estimate: never computed here. It
// and the report's "over $3 billion" have different bases (the 46% includes IC3 data), so the two aren't shown together, neither is
// divided by the total, and the tile names its own base, the FTC's estimated $261.5 billion, not the reported $16 billion beside it. These size the problem; none is a result of ours. The scene is made up and says so: every
// tester so far is an 18+ classmate.

export const IMPACT_EYEBROW = "Why it matters";
export const IMPACT_HEAD = "Made to protect the people who get scammed online, especially those least able to spot it.";

export const IMPACT_FIGURES = [
  {
    row: "ftc-total", figure: "About $16 billion", say: "reported lost to fraud in 2025, “the highest on record,” says the FTC.",
    url: "https://www.ftc.gov/news-events/news/press-releases/2026/06/ftc-data-show-people-reported-losing-3-point-5-billion-imposter-scams-2025",
  },
  {
    row: "ftc-older", figure: "46%", say: "of losses with age data in 2025's estimated $261.5 billion: “reported by adults 60 and older.”",
    url: "https://www.ftc.gov/system/files/ftc_gov/pdf/2026-older-adults-report-10192026.pdf#page=34",
  },
  {
    row: "ftc-gift-share", figure: "About one in four", say: "people who lost money to fraud paid with a gift card, in FTC reports from 2018 to 2021.",
    url: "https://www.ftc.gov/news-events/data-visualizations/data-spotlight/2021/12/scammers-prefer-gift-cards-not-just-any-card-will-do",
  },
] as const;

/** The seller's note in the scene. A test runs it through the real Watcher: the scene can't show what the code wouldn't do. */
export const SCENE_NOTE = "Today only. Pay with a gift card, $19.";
export const SCENE_LABEL = "A made-up scene. Rose and the sellers are fictional, and no older shopper has tested Goose yet.";
export const SCENE_LINES = [
  "Rose asks Goose for a birthday gift for her grandson, up to $40.",
  `A seller writes: “${SCENE_NOTE}”`,
  "Goose sets that seller aside.",
  "Another seller has one for $31, through PayPal.",
  "Nothing is paid until Rose taps.",
] as const;

/** The video's end card still carries these two, word for word (row `c-impact-source`); `video-takes` adds them to its still. */
export const END_CARD_LINES = [IMPACT_HEAD, "In FTC reports from 2018 to 2021, about one in four people who lost money to fraud paid with a gift card."] as const;
