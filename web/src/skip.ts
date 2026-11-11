// "Skip to content" on the pages that draw the bar as markup (W6; S1-11 put it on the Desk's SiteNav, Round 4's a11y
// fix 3, WCAG 2.4.1): the wallet (first-paint.tsx's WalletTop), the classic page and the market (index.html), safe.html.
// The link is the bar's first Tab stop; nav.css (S1's) keeps it off screen until focused. Its href is "#main" so it
// reads as a link with no script; this moves focus to the page's own first content (the bench's heading block, safe.html's
// hero, else the page's <main>) without touching the URL's hash, which the wallet's menu landings read (menu/land.ts).
// One listener on the document, so the markup bar works before and after the page's own script draws it again. A click
// another handler already took (the Desk's SiteNav, its own) is left alone.

let wired = false;

export function wireSkip(): void {
  if (wired) return;
  wired = true;
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a.gn-skip");
    if (!a || e.defaultPrevented) return;
    let to = document.querySelector<HTMLElement>(".page > .brand, .page > .hero, main, [role=main]");
    // The wallet draws its bar inside its <main>: then the content is what follows the bar.
    if (to?.contains(a)) {
      const n = a.closest("header")?.nextElementSibling ?? null;
      if (n instanceof HTMLElement) to = n;
    }
    if (!to) return;
    e.preventDefault();
    if (!to.hasAttribute("tabindex")) to.setAttribute("tabindex", "-1");
    to.focus();
  });
}
