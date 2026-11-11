// The one menu (spec §6): the same five places in the header and in the phone's sheet.
import { hrefOf, type Route } from "../route.ts";

export interface NavItem { label: string; href: string; route: Route; anchor: string | null }

export const NAV: readonly NavItem[] = [
  { label: "Shop", href: hrefOf("shop"), route: "shop", anchor: null },
  { label: "Under the hood", href: hrefOf("under-the-hood"), route: "under-the-hood", anchor: null },
  { label: "Try to trick it", href: hrefOf("home", "trick"), route: "home", anchor: "trick" },
  { label: "Proof", href: hrefOf("proof"), route: "proof", anchor: null },
  { label: "Builders", href: hrefOf("builders"), route: "builders", anchor: null },
];

/** Only a page is ever "current"; the home anchor is a place on a page, so it never claims the page. */
const isCurrent = (item: NavItem, route: Route) => item.anchor === null && item.route === route;

export function Nav({ route, variant, onGo }: { route: Route; variant: "bar" | "sheet"; onGo?: () => void }) {
  return (
    <ul className={`nav nav-${variant}`} role="list">
      {NAV.map((item) => (
        <li key={item.label}>
          <a href={item.href} className="nav-link" aria-current={isCurrent(item, route) ? "page" : undefined} onClick={onGo}>
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
