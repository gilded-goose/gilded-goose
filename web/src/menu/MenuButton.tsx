// "Everything Goose does ▾" (Joshua, Fri Oct 30, item 1): the nav's one menu button, on every page's bar. Only the
// button ships with the page; the panel, its items and the limits from code are their own chunk, fetched when the
// pointer or focus reaches the button (or on the first press), so the first screen loads nothing new. Closing puts
// focus back on the button. Since it sits in every bar, it also marks its bar as scrolled (the bar's glass) and lands
// a menu item's anchor once the page is drawn (./land.ts, S1-3), and brings the judge tour's stepper in under its bar
// while this tab is on the tour (../tour/follow.ts, S1-6).
//
// S1-13 (brand.md §10.4): on a phone its visible words are "Menu", and "Close" while the sheet is open (the sheet starts
// under the bar, so this same button, in the same place, closes it). Both sets of words are in the button; nav.css shows
// one per width (display: none, so the accessible name is only the words you see).

import { Suspense, useEffect, useRef, useState } from "react";
import { lazyOr } from "../states/online.ts";
import type { MenuAction } from "@goose/core/menu-hash";
import { landOnAnchor, markScrolled } from "./land.ts";
import { followUnder } from "../tour/follow.ts";
import type { NavView } from "@goose/core/menu";
import "./menu-button.css";

const load = () => import("./MenuPanel.tsx");
const MenuPanel = lazyOr(load);

/** `onAction`: the page opens this item in place (the Desk's rooms and Ask box); without it every item is a link.
 *  `label`: the button's words where it isn't the bar's menu (the Desk's old rail says "More").
 *  `here`, `exact`: the open view, for the phone sheet's views row; `current`: the menu item this page shows (its dot).
 *  Without them the panel reads both from the address. */
export function MenuButton({ onAction, className, label, here, exact, current }: {
  onAction?: (a: MenuAction) => void; className?: string; label?: string;
  here?: NavView | undefined; exact?: boolean | undefined; current?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = (refocus: boolean) => { setOpen(false); if (refocus) requestAnimationFrame(() => btn.current?.focus()); };
  useEffect(() => markScrolled(btn.current), []);
  useEffect(() => { requestAnimationFrame(landOnAnchor); }, []);
  useEffect(() => followUnder(btn.current?.closest("header.gn") ?? null), []);
  return (
    <>
      <button ref={btn} type="button" className={`gm-btn${className ? ` ${className}` : ""}`} aria-haspopup="dialog" aria-expanded={open}
        onPointerEnter={() => void load()} onFocus={() => void load()} onClick={() => setOpen((o) => !o)}>
        {label ?? <>
          <span className="gm-w">Everything Goose does <svg viewBox="0 0 12 8" aria-hidden="true"><path d="m1 1.5 5 5 5-5" /></svg></span>
          <span className="gm-ph">{open ? "Close" : "Menu"}</span>
        </>}
        {label && <svg viewBox="0 0 12 8" aria-hidden="true"><path d="m1 1.5 5 5 5-5" /></svg>}
      </button>
      {open && <Suspense fallback={null}><MenuPanel anchor={btn} onClose={close} onAction={onAction} here={here} exact={exact} current={current} /></Suspense>}
    </>
  );
}
