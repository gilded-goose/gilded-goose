// A feature built before this site, shown inside it: the Desk's own page component, unchanged and still doing its own
// work, under this site's bar, heading and footer. The Desk's frame (bar, hero, footer) is hidden and its colour names are
// bridged to this site's tokens (hood/board.css), so it reads as one site. Used for the haggle, How it works and the list.
import { Suspense, useEffect, type ReactNode } from "react";
import "../home/sections.css";
import "../hood/board.css";

export function Room({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("hood-on");
    return () => document.documentElement.classList.remove("hood-on");
  }, []);
  return (
    <div className="wrap pg">
      <h1 className="sx-h sx-h-page">{title}</h1>
      <p className="sx-lede">{lede}</p>
      <div className="hood-board room">
        <Suspense fallback={<p className="hood-wait" aria-busy="true">Loading…</p>}>{children}</Suspense>
      </div>
    </div>
  );
}
