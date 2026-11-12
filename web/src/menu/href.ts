// One place where an app address becomes a link (S1-13; WT's walkthrough found it). The menu's data (core's MENU, the
// views, TOUR_HREF and the tour's stops) names the app's pages by query alone ("?desk=1", "?wallet=1#approve"). A bare
// query resolves against the page it sits on, so on /safe.html or the 404 "Limits in code" went to /safe.html?desk=1
// and reloaded the same page. Each link takes the site's own root instead: "/" here, "/gilded-goose/" on the GitHub
// Pages mirror (vite's base), so a link never leaves the site either. scripts/one-nav.ts clicks every menu and view
// link from every route and holds where each lands; core/test/menu.test.ts holds that no renderer writes one raw.

/** An app address ("?desk=1#settings") as a link from any page: the site's root plus the query. Anything else (a whole
 *  address, a path, a bare hash) is returned as it is. */
export const appHref = (href: string): string => (href.startsWith("?") ? `${import.meta.env.BASE_URL}${href}` : href);
