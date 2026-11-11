// The one nav (Joshua, Fri Oct 30, 3:40 PM; S1): Gilded Goose · Practice only · Everything Goose does · Shopper ·
// Behind the scenes · Judge? Start here, on every route. The Desk, the judge tour and the back room (Behind the scenes,
// Proof, the haggle) draw it with this component; the wallet's first paint draws the same markup by hand
// (first-paint.tsx, on the phone's first-screen budget), and index.html and safe.html draw it before any JS. Its styles
// are nav.css. `here` marks the open view: "shop" (the Desk), "back" (the back room; exactly the page on Behind the
// scenes, the section on Proof and the haggle) or "tour" (the judge's start).
//
// On a phone (S1-13, brand.md §10.4) the bar is one sticky 56 px row, the brand, "Practice only" and "Menu"; there is no
// bottom rail. The views are the first row of the menu's sheet, and every room is Menu → its item (≤ 2 taps).

import { useRef, type MouseEvent } from "react";
import type { MenuAction } from "@goose/core/menu-hash";
import type { NavView } from "@goose/core/menu";
import { TOUR_HREF } from "@goose/core/menu-hash";
import { MenuButton } from "../menu/MenuButton.tsx";
import { appHref } from "../menu/href.ts";
import { Lockup } from "../brand/Lockup.tsx";
import "./nav.css";

/** The open view (core's NavView, which the phone menu also reads from an address). */
export type NavHere = NavView;

/** The views, in Joshua's order. */
const VIEWS: readonly { key: NavHere; href: string; label: string }[] = [
  { key: "shop", href: "?desk=1", label: "Shopper" },
  { key: "back", href: "?desk=ledger", label: "Behind the scenes" },
];

/** aria-current for a view: "page" on its own page, "true" on a page inside it (Proof and the haggle). */
const currentOf = (here: NavHere | undefined, exact: boolean) => (k: NavHere) => (k === here ? (exact ? "page" : "true") : undefined);

/** A plain click (no modifier, the main button) on a link the page handles in place. */
const plain = (e: MouseEvent) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);

export function SiteNav({ here, exact = true, onHome, onAction, room, current }: {
  here?: NavHere;
  /** false: the open view is the section, not this exact page (Proof and the haggle sit in the back room). */
  exact?: boolean;
  /** The Desk starts over in place on its brand and Shopper, instead of loading the page again. */
  onHome?: () => void;
  /** The Desk opens menu items in place; without it every item is a link. */
  onAction?: (a: MenuAction) => void;
  /** "back": the back room's Midnight colors (nav.css). */
  room?: "back";
  /** The menu item this page is showing (its id: "wants", "proof"…), for the menu's current-room dot. */
  current?: string | undefined;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const currentView = currentOf(here, exact);
  /** The underline glides to the view under the pointer or the focus, and back to the open one when either leaves. */
  const glide = (el: Element | null) => {
    const t = el as HTMLElement | null, box = layer.current;
    if (!t || !box) return;
    box.style.setProperty("--ux", `${t.offsetLeft}px`); box.style.setProperty("--uw", `${t.offsetWidth}px`);
  };
  const home = (e: MouseEvent<HTMLElement>) => {
    if (!onHome || !plain(e)) return;
    e.preventDefault(); onHome();
  };
  // Glass once the page scrolls under the bar (system.md section 6): the menu button marks its bar (MenuButton.tsx), so
  // the pages that draw the bar as markup (the wallet, the classic page, the market, safe.html) turn to glass too.
  return (
    <>
      <header className="gn dk-nav" data-room={room}>
        {/* S1-11 (Round 4's a11y fix 3, WCAG 2.4.1): the first Tab stop, so a keyboard reaches the page before the bar's
            links. Hidden until focused. */}
        <a className="gn-skip" href="#main" onClick={skipToMain}>Skip to content</a>
        <div className="dk-wrap dk-nav-in">
          {/* B-11's lockup (brand.md §10.1), the egg as the o of Goose. Its link takes no click handler, so the Desk's
              in-page home rides on this wrapper (display: contents: no box of its own; the click bubbles from the link). */}
          <span className="gn-home" onClick={home}><Lockup href={appHref("?desk=1")} /></span>
          <span className="dk-practice-ph">Practice only</span>
          <div className="dk-grow" />
          <MenuButton className="dk-menu" here={here} exact={exact} current={current} {...(onAction ? { onAction } : {})} />
          <div className="dk-layer" ref={layer} role="group" aria-label="View" onPointerLeave={() => glide(layer.current?.querySelector("[aria-current]") ?? null)}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) glide(layer.current?.querySelector("[aria-current]") ?? null); }}>
            {VIEWS.map((v) => (
              <a key={v.key} href={appHref(v.href)} aria-current={currentView(v.key)} onClick={v.key === "shop" ? home : undefined}
                ref={v.key === here ? (el) => { if (el) requestAnimationFrame(() => { glide(el); requestAnimationFrame(() => layer.current?.setAttribute("data-glide", "")); }); } : undefined}
                onPointerEnter={(e) => glide(e.currentTarget)} onFocus={(e) => glide(e.currentTarget)}>{v.label}</a>
            ))}
            <span className="dk-under" aria-hidden="true" />
          </div>
          <a className="dk-judge" href={appHref(TOUR_HREF)} aria-current={currentView("tour")}><span>Judge<span className="dk-jl">? Start here</span></span><span className="dk-jt"> tour</span> <span className="dk-arr" aria-hidden="true">›</span></a>
        </div>
        <span className="dk-intro" aria-hidden="true" />
      </header>
    </>
  );
}

/** "Skip to content": focus the page's own content (its <main>, else its heading), not the bar. */
function skipToMain(e: MouseEvent<HTMLAnchorElement>) {
  const to = document.querySelector<HTMLElement>("#main, main, [role=main]") ?? document.querySelector<HTMLElement>("h1");
  if (!to) return;
  e.preventDefault();
  if (!to.hasAttribute("tabindex")) to.setAttribute("tabindex", "-1");
  to.focus();
}
