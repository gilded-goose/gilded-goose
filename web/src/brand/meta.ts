// The share card's head meta (brand.md §10.8). Link scrapers run no script, so every address shares this one card, from
// each HTML entry's <head> (index.html, safe.html, 404.html carry SHARE_META_HTML verbatim; core/test/brand.test.ts holds
// them to it, and scripts/share-meta-probe.ts reads them off the served pages and fetches the image).

export const SITE = "https://gilded-goose.onrender.com";
/** The public repo, public from Wed Nov 11 (docs/launch/nov9-runbook.md). Every link to the repo is built from this one, and
 * core/test/repo-links.test.ts fails on any other github.com address for Gilded Goose in the code or the README. */
export const REPO = "https://github.com/gilded-goose/gilded-goose";
/** False until Joshua makes the repo public (runbook step 4): till then a judge who opened a repo link would get a 404, so the
 * site draws none (Proof names docs/claims.md as plain text). The Lead turns it on with NPM_PUBLISHED, in runbook step 12. */
export const REPO_PUBLIC: boolean = false;
export const SHARE = {
  title: "Gilded Goose",
  // Track C's ruling (docs/launch/surface-words.md, "The share headline"), confirmed by the DD; claims rows b11-share-*.
  description: "Goose can't be fooled into paying, can't overspend and can't hide anything. Practice only: no real money.",
  image: `${SITE}/og/share.png`,
  imagePath: "/og/share.png",
  width: 1200,
  height: 630,
  alt: "A gold egg beside the words: Nothing is paid until you tap.",
  /** The headline on the image: the promise's second sentence, which stands on its own. */
  headline: "Nothing is paid until you tap.",
  themeColor: "#2c1520",
} as const;

/** Each tag the probe requires on every page: [attribute, key, value]. */
export const SHARE_TAGS: readonly (readonly ["name" | "property", string, string])[] = [
  ["name", "description", SHARE.description],
  ["property", "og:type", "website"],
  ["property", "og:title", SHARE.title],
  ["property", "og:description", SHARE.description],
  ["property", "og:image", SHARE.image],
  ["property", "og:image:width", String(SHARE.width)],
  ["property", "og:image:height", String(SHARE.height)],
  ["property", "og:image:alt", SHARE.alt],
  ["name", "twitter:card", "summary_large_image"],
  ["name", "theme-color", SHARE.themeColor],
];

const attr = (s: string): string => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
export const SHARE_META_HTML =
  SHARE_TAGS.map(([a, k, v]) => `<meta ${a}="${k}" content="${attr(v)}" />`).join("\n    ") +
  `\n    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />`;
