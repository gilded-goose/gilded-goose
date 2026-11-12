// Track F: a page whose first render the build already drew (web/prerender-routes.ts). React adopts that HTML in place
// (`__firstIn`: the placing script put it there), so the words are never drawn twice; otherwise this is the same
// createRoot + render as ever, which also draws over the ledger's own first paint, a part of the page and not all of it.
// If a first render ever differs, React draws the page on the client itself; `__firstMiss` keeps the reason for the
// probe (scripts/first-routes-probe.ts fails on it), since a shopper sees nothing wrong and nothing else would tell us.
import { createRoot, hydrateRoot } from "react-dom/client";
import type { ReactNode } from "react";

export function mount(el: HTMLElement, page: ReactNode) {
  const w = window as unknown as { __firstIn?: number; __firstMiss?: string[] };
  if (!w.__firstIn || !el.firstChild) return createRoot(el).render(page);
  hydrateRoot(el, page, { onRecoverableError: (e) => { (w.__firstMiss ??= []).push(String(e).slice(0, 200)); } });
}
