// The menu's panel (its own chunk): one group per promise, each item a name, one plain line, and the feature it opens. A dropdown
// of velvet glass under the nav on a wide screen; a full-screen glass sheet on a phone. One spring brings it in (reduced
// motion: it is simply there). Esc closes, the arrow keys move between items, Tab stays inside, and closing returns
// focus to the button. The words and addresses are core's (`@goose/core/menu`), so the tests read the same items.
//
// S1-13 (brand.md §10.4): on a phone the sheet starts under the bar (the bar's own button reads "Close" and closes it,
// and it is in the Tab cycle), and shows first the three views, then each group's items as names only, the room you are
// in marked by a dot and aria-current="page". The lines return on a wide screen, where the bar carries the views.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { curly } from "@goose/core/promises";
import { MENU, MENU_LABEL, TOUR_HREF, addressRoom, type MenuAction, type NavView } from "@goose/core/menu";
import { anchorHere, hashNow, landOn } from "./land.ts";
import { appHref } from "./href.ts";
import "./menu.css";

/** The views, in the bar's order (SiteNav's, with the judge's door as the phone named it). */
const VIEWS: readonly { key: NavView; href: string; label: string }[] = [
  { key: "shop", href: "?desk=1", label: "Shopper" },
  { key: "back", href: "?desk=ledger", label: "Behind the scenes" },
  { key: "tour", href: TOUR_HREF, label: "Judge tour" },
];

const PHONE = "(max-width: 720px)";

export default function MenuPanel({ anchor, onClose, onAction, here, exact, current }: {
  anchor: RefObject<HTMLButtonElement | null>; onClose: (refocus: boolean) => void; onAction?: ((a: MenuAction) => void) | undefined;
  here?: NavView | undefined; exact?: boolean | undefined; current?: string | undefined;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(64);
  // The page says where it is (SiteNav); a bar drawn as markup leaves it to the address.
  const addr = addressRoom(location.search, location.hash);
  const view = here ?? addr.view, inside = here ? exact === false : !addr.exact, room = current ?? addr.room;

  // Under the header the button sits in, wherever that header is on the page right now.
  useLayoutEffect(() => {
    const measure = () => {
      const head = anchor.current?.closest("header");
      setTop(Math.max(0, Math.round((head ?? anchor.current)?.getBoundingClientRect().bottom ?? 64)));
    };
    measure();
    // The first thing in it you can see: the views row on a phone, the first item on a wide screen.
    [...(panel.current?.querySelectorAll<HTMLElement>(".gm-view, .gm-item") ?? [])].find((el) => el.getClientRects().length > 0)?.focus({ preventScroll: true });
    addEventListener("resize", measure); // a rotated phone or a resized window keeps it under the header
    // The case behind the glass is the panel's own size (S1, Joshua 3:15 PM: no page light may show through the blur).
    const el = panel.current, root = el?.parentElement;
    const ro = el && root ? new ResizeObserver(() => root.style.setProperty("--gm-h", `${el.offsetHeight}px`)) : null;
    if (el) ro?.observe(el);
    return () => { removeEventListener("resize", measure); ro?.disconnect(); };
  }, [anchor]);

  // The page under it holds still while it is open; Esc anywhere closes it. The focus trap is here too, on the window:
  // on a phone the bar's own button ("Close") is in the cycle, and focus on it is outside the panel.
  useEffect(() => {
    const html = document.documentElement, was = html.style.overflow;
    html.style.overflow = "hidden";
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(true); return; }
      if (e.key !== "Tab") return;
      const shown = (el: HTMLElement) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      // On a phone the sheet's own head (and its Close) is for a screen reader only (menu.css): the Tab cycle takes the
      // bar's "Close" instead, so no Tab stop is invisible (WCAG 2.4.7; S1-13's reviewer).
      const phone = matchMedia(PHONE).matches;
      const own = [...(panel.current?.querySelectorAll<HTMLElement>(phone ? ".gm-view, .gm-item" : ".gm-close, .gm-view, .gm-item") ?? [])].filter(shown);
      const btn = anchor.current;
      const all = phone && btn ? [btn, ...own] : own;
      if (all.length === 0) return;
      const i = all.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? all.length - 1 : i - 1) : (i + 1) % all.length;
      e.preventDefault(); all[next]!.focus();
    };
    addEventListener("keydown", onKey);
    return () => { html.style.overflow = was; removeEventListener("keydown", onKey); };
  }, [onClose, anchor]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...(panel.current?.querySelectorAll<HTMLElement>(".gm-item") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => { e.preventDefault(); items[(i + items.length) % items.length]?.focus(); };
    if (e.key === "ArrowDown" || e.key === "ArrowRight") go(at + 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") go(at < 0 ? items.length - 1 : at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
  }

  // The DD (part 3, brand.md §6): in the back room (its bar's data-room is the back: Behind the scenes, AG Studio, Proof, the
  // haggle, and How or the system in Midnight) the menu is Midnight glass on Midnight's opaque page, never Velvet's.
  const midnight = anchor.current?.closest("header.gn")?.getAttribute("data-room") === "back";

  return createPortal(
    <div className="gm-root" data-glass={midnight ? "midnight" : undefined} style={{ "--gm-top": `${top}px` } as React.CSSProperties}>
      <div className="gm-scrim" aria-hidden="true" onClick={() => onClose(true)} />
      {/* What the glass sits on: the velvet and the egg's one warm light, never the page (its buttons blur into spots). */}
      <div className="gm-case" aria-hidden="true" />
      <div ref={panel} className="gm-panel" role="dialog" aria-modal="true" aria-label={MENU_LABEL} onKeyDown={onKeyDown}>
        <div className="gm-head">
          <p className="gm-title dk-eyebrow">{MENU_LABEL}</p>
          <button type="button" className="gm-close" onClick={() => onClose(true)}>Close</button>
        </div>
        {/* A phone's views row (nav.css hides it on a wide screen, where the bar draws the views): the open view underlined. */}
        <nav className="gm-views" aria-label="Views">
          {VIEWS.map((v) => <a key={v.key} className="gm-view" href={appHref(v.href)} aria-current={v.key === view ? (inside ? "true" : "page") : undefined}>{v.label}</a>)}
        </nav>
        <div className="gm-groups">
          {MENU.map((g) => (
            <section key={g.name} className="gm-group" aria-labelledby={`gm-g-${g.name.replace(/\W+/g, "-")}`}>
              <h2 id={`gm-g-${g.name.replace(/\W+/g, "-")}`} className="gm-gname">{curly(g.name)}</h2>
              <ul>
                {g.items.map((i) => (
                  <li key={i.id}>
                    <a className="gm-item" href={appHref(i.href)} data-item={i.id} aria-current={i.id === room ? "page" : undefined}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        if (i.action && onAction) { e.preventDefault(); onClose(false); onAction(i.action); return; }
                        // S1-3: an anchor on this same page (Approve in PayPal or Pay Later, opened from the wallet) lands
                        // in place: a hash-only link wouldn't scroll (the spots are classes) or close the panel. Setting
                        // the hash fires hashchange, so the wallet leaves Settings for its Desk tab and land.ts lands once
                        // Approve is drawn (a task, after the panel lets the page scroll again). The same hash fires
                        // nothing, so that lands directly. The spot takes the focus.
                        const here = anchorHere(appHref(i.href));
                        if (here === null) return;
                        e.preventDefault();
                        onClose(false);
                        if (hashNow() === here) requestAnimationFrame(() => landOn(here));
                        else location.hash = here;
                      }}>
                      <span className="gm-name">{i.name}</span>
                      <span className="gm-line">{i.line}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
