// The site: one shell, the page for the hash route, and the jump to a route's anchor. A new page is one line in PAGES.
import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { lazyPage } from "./ui/lazy-page.tsx";
import { EggLoader } from "./ui/Egg.tsx";
import { type Route } from "./route.ts";
import { useRoute } from "./use-route.ts";
import { Shell } from "./shell/Shell.tsx";
import { Home } from "./home/Home.tsx";

// Each page beyond home is its own chunk, in its owner's file (plan: Shop T4, Under the hood T5, Proof and Builders T6).
const Shop = lazyPage(() => import("./shop/Shop.tsx").then((m) => ({ default: m.Shop })));
const HoodPage = lazyPage(() => import("./hood/Page.tsx").then((m) => ({ default: m.HoodPage })));
const Proof = lazyPage(() => import("./proof/Proof.tsx").then((m) => ({ default: m.Proof })));
const HagglePage = lazyPage(() => import("./legacy/Pages.tsx").then((m) => ({ default: m.HagglePage })));
const HowPage = lazyPage(() => import("./legacy/Pages.tsx").then((m) => ({ default: m.HowPage })));
const ListPage = lazyPage(() => import("./legacy/Pages.tsx").then((m) => ({ default: m.ListPage })));
const MarketPage = lazyPage(() => import("./legacy/Pages.tsx").then((m) => ({ default: m.MarketPage })));
const Builders = lazyPage(() => import("./builders/Builders.tsx").then((m) => ({ default: m.Builders })));

const PAGES: Readonly<Record<Route, () => ReactNode>> = {
  home: () => <Home />,
  shop: () => <Shop />,
  "under-the-hood": () => <HoodPage />,
  proof: () => <Proof />,
  builders: () => <Builders />,
  haggle: () => <HagglePage />,
  how: () => <HowPage />,
  list: () => <ListPage />,
  market: () => <MarketPage />,
};

export function App() {
  const { route, anchor } = useRoute();
  const last = useRef<string | null>(null);

  useEffect(() => {
    // Keyed by place, not by run: StrictMode runs effects twice, and the second run must not read as a navigation.
    const key = `${route}#${anchor ?? ""}`;
    if (last.current === key) return;
    const wasFirst = last.current === null;
    last.current = key;
    const target = anchor ? document.getElementById(anchor) : null;
    if (target) {
      target.scrollIntoView({ block: "start" });
    } else if (!wasFirst) {
      window.scrollTo(0, 0);
    }
    // A new page moves focus to the page, so a screen reader starts at its top; the first load leaves focus alone.
    if (!wasFirst) document.getElementById("main")?.focus({ preventScroll: true });
  }, [route, anchor]);

  return (
    <Shell route={route}>
      <Suspense fallback={<EggLoader />}>{PAGES[route]()}</Suspense>
    </Shell>
  );
}
