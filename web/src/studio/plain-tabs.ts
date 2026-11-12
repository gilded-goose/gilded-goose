// Tab through the dashboard the way it reads (Nov 5, the flip's keyboard walk). AG Studio's layout built for editing makes each card one
// stop of zero size with no name: Tab goes card to card, nothing drawn, and only Enter on that invisible stop goes inside, so in view mode
// a keyboard reached none of the card's buttons, links or rows. These stops are AG's own and it writes their tabindex back whenever
// focus moves, so from outside we hold them out of the order in view mode, and edit mode gets them back as AG set them.
// Only the card's own stops: a grid inside a card has tab guards of its own, deeper down, that it needs.

const STOPS = ".ag-studio-layout-widget > .ag-studio-layout-widget-focus-container, .ag-studio-layout-widget > .ag-tab-guard";
const WAS = "data-ag-tabindex";
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]';

export function plainTabs(root: HTMLElement): () => void {
  const hold = () => {
    for (const el of root.querySelectorAll<HTMLElement>(STOPS)) {
      const t = el.getAttribute("tabindex");
      if (t === null || t === "-1") continue;
      el.setAttribute(WAS, t);
      el.setAttribute("tabindex", "-1");
    }
  };
  // AG's stock pivots step Tab through every cell (130 stops at 1440, on the way to the tour's Next), and Studio passes them no option to
  // stop. In a grid, Tab leaves and the arrows move inside (the WAI-ARIA grid pattern, and what our own grids do).
  const leaveGrid = (e: KeyboardEvent) => {
    if (e.key !== "Tab" || !(e.target instanceof Element)) return;
    const grid = e.target.closest(".ag-root-wrapper");
    if (!grid || grid.closest(".st-card")) return; // Inside a card, the grid is ours and has its own say.
    const stops = [...document.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.getClientRects().length > 0 && !el.closest("[inert]") && !grid.contains(el));
    const after = (el: HTMLElement) => (grid.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const next = e.shiftKey ? stops.filter((el) => !after(el)).pop() : stops.find(after);
    if (!next) {
      // Nothing past it on the page: the browser's own Tab leaves, with the grid's guards out of the way for this one press.
      e.stopPropagation();
      const guards = [...grid.querySelectorAll<HTMLElement>('.ag-tab-guard[tabindex="0"]')];
      for (const g of guards) g.setAttribute("tabindex", "-1");
      setTimeout(() => { for (const g of guards) g.setAttribute("tabindex", "0"); });
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    next.focus();
  };
  root.addEventListener("keydown", leaveGrid, true);
  const watch = new MutationObserver(hold);
  watch.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["tabindex"] });
  hold();
  return () => {
    root.removeEventListener("keydown", leaveGrid, true);
    watch.disconnect();
    for (const el of root.querySelectorAll<HTMLElement>(`[${WAS}]`)) {
      el.setAttribute("tabindex", el.getAttribute(WAS)!);
      el.removeAttribute(WAS);
    }
  };
}
