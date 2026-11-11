// The lockup as plain HTML (brand.md §10.1), for a bar drawn before any script (index.html, safe.html, 404.html, the
// wallet's first paint) and for the share render. Lockup.tsx draws the same markup in React; snippet.html is this, with
// the bars' own href. No imports beyond the name, so Node scripts and tests read it too.
import { BRAND_NAME } from "./title.ts";

/** Where it stands: the bar (22 px, 20 at ≤720), the share image (40 px) or the video's end card (96 px, weight 300). */
export type LockupSize = "bar" | "share" | "end";

/** The site's base ("/", or "/gilded-goose/" on the Pages mirror) where vite gives one; "/" in Node. Never "./", which
 *  resolves against a nested path. */
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";

export const lockupHtml = (href = `${BASE}?desk=1`, size: LockupSize = "bar"): string =>
  `<a class="gg gg-${size}" href="${href}" aria-label="${BRAND_NAME}">Gilded<span class="sp"> </span>G<span class="o"><span class="oc">o</span><svg aria-hidden="true"><use href="#ggEgg"/></svg></span>ose</a>`;
