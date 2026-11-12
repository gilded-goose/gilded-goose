// The lockup "Gilded G◯ose" (brand.md §10.1): the name in the display face with the vector egg as the first o of "Goose".
// One mark, no separate logo; one per screen. It links home; its accessible name is the plain name, so a screen reader
// never hears "G, image, ose"; its visible text says the same (a real space, and a real "o" kept transparent under the
// egg: WCAG 2.5.3), so voice control finds it by the name on screen. The egg is the page's #ggEgg symbol (each HTML entry carries EGG_SYMBOL at the top of its
// body). Hover changes nothing; :focus-visible takes the site's ring (nav.css). The same markup without React, for a bar
// drawn in HTML before any script: lockupHtml() (lockup-html.ts) and snippet.html.
import "./lockup.css";
import { BRAND_NAME } from "./title.ts";
import { appHref } from "../menu/href.ts";
import type { LockupSize } from "./lockup-html.ts";

export type { LockupSize } from "./lockup-html.ts";
export { lockupHtml } from "./lockup-html.ts";

export function Lockup({ href = appHref("?desk=1"), size = "bar", className }: { href?: string; size?: LockupSize; className?: string }) {
  return (
    <a className={`gg gg-${size}${className ? ` ${className}` : ""}`} href={href} aria-label={BRAND_NAME}>
      Gilded<span className="sp">{" "}</span>G<span className="o"><span className="oc">o</span><svg aria-hidden="true"><use href="#ggEgg" /></svg></span>ose
    </a>
  );
}
