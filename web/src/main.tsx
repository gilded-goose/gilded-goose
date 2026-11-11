import { appHref } from "./menu/href.ts";
import { createRoot } from "react-dom/client";
import { mount } from "./hydrate.ts";
import { PRACTICE, walletMode } from "@goose/core/wallet-flag";
import { deskByDefault, deskCanonical } from "@goose/core/menu-hash";
import { wireSkip } from "./skip.ts";
import { roomArrived } from "./desk/room-first.ts";
import { Held, HeldLine, TryAgain } from "./held.tsx";
import { titleOnHashChange } from "./brand/title.ts";
// W7: the classic page's static header stays in this first-screen bundle (it paints velvet before any script, and the
// market wears it too; what React draws under .cv is run-cv.css, App's own, gate seat 7), while App's code is a lazy chunk like every other page's, so the haggle and the other
// routes no longer parse the classic page before their own chunk loads (B-10 measured it on the haggle's phone h1).
import "./run.css";
// The one nav (S1, Joshua Fri 3:40 PM): index.html draws it for the classic page and the market before any script, so
// its sheet (and the menu button's) load with the first screen's own; the Desk's routes share them.
import "./nav/nav.css";
import "./menu/menu-button.css";
// S1-13: the bar's lockup (B-11's Lockup.tsx) with them, so its sheet is in main.css and SiteNav's chunk carries none
// (the Desk's first paint keeps its two stylesheets: prerender.ts).
import "./brand/lockup.css";

// W7: "Skip to content" on the markup bars works from the first script, not only once a page's own chunk has wired it
// (App, Wallet, StoreSync and safe-main call it too; it wires once).
wireSkip();
titleOnHashChange(window);

// A3: the wallet home only with its flag (`?wallet=1`, or a `VITE_WALLET=1` build); the current home stays the default.
// The wallet is its own chunk, so the default first screen loads nothing new.
// PayPal additions 5: `?market=1` is the Store Sync-shaped market's own page, its own chunk; nothing else changes.
// Round 1: an unknown `?desk=` or `?studio=force` alone means a Desk page, never the old wallet (index.html's first
// script rewrites it before the first paint; this repeats it in case that script didn't run).
const canonical = deskCanonical(location.search, location.pathname);
if (canonical) history.replaceState(history.state, "", canonical + location.hash);
const market = new URLSearchParams(location.search).get("market") === "1";
// Desk slice 1: `?desk=1` is the Desk's own page and chunk; the classic chrome hides before anything renders.
// Joshua, Oct 30: the bare address opens the Desk too, so no visitor lands on the old look; the wallet (`?wallet=1`),
// the classic page (`?wallet=0`) and the market keep their own links, and every PayPal return names its page. Only at
// the root path, where our server is: the static mirror (under /gilded-goose/, no /api) keeps the wallet, since the
// Desk can't shop without a server. index.html's first <body> script applies the same rule before the first paint.
// Round 1: "bare" means no parameter that names another page (`deskByDefault`), so `/?utm_source=devpost` is the Desk too.
const desk = !market && (new URLSearchParams(location.search).get("desk") === "1" || (location.pathname === "/" && deskByDefault(location.search)));
// The back room, each page its own chunk and a Desk page too (the classic chrome hides; each draws its own header with
// "Practice only"): Behind the scenes (`?desk=ledger`, Desk-B-3/4, with AG Grid), the Proof panel (`?desk=proof`, Joshua,
// Fri Oct 30), the haggle (`?desk=haggle`, Track H, Joshua Fri 2:30 PM; its AG Charts ladder is a further lazy chunk) and the
// judge tour (`?desk=tour`, S1).
// One table, so a new page adds a line and not another render branch to the first screen's chunk.
// AG Studio (Track AS, 044): Behind the scenes is the AG Studio dashboard when the build's licence facts allow it, else
// the Community ledger; web/src/studio/pick.ts decides, so the gate's code never rides in this first-screen chunk.
const BACK = new Map<string | null, [() => Promise<{ default: () => React.JSX.Element }>, string]>([
  ["ledger", [() => import("./studio/pick.ts").then((m) => m.pick()), "The ledger"]],
  ["studio", [() => import("./studio/pick.ts").then((m) => m.pick()), "The ledger"]],
  ["proof", [() => import("./Proof.tsx"), "The Proof panel"]],
  ["haggle", [() => import("./Haggle.tsx"), "The haggle"]],
  // The judge tour (Joshua, Fri Oct 30, item 1; S1): a Desk page in the velvet (index.html), every feature one tap each.
  ["tour", [() => import("./tour/Tour.tsx"), "The tour"]],
  // The living design system (unlisted, noindex) and How it works (Track SYS, launch program).
  ["system", [() => import("./system/System.tsx"), "The design system"]],
  ["how", [() => import("./how/How.tsx"), "How it works"]],
  ["builders", [() => import("./builders/Builders.tsx"), "For builders"]],
  // The Christmas list (Track X): its own chunk, so no other page pays for it.
  ["list", [() => import("./list/List.tsx"), "The Christmas list"]],
]);
const back = market ? undefined : BACK.get(new URLSearchParams(location.search).get("desk"));
if (desk || back) document.body.classList.add("desk-on");
// W4 (Round 2's judges): the bench's own heading (index.html's .brand) only where the bench is the page; every other page
// here has its own h1 (index.html removes it before paint on the Desk's routes and the wallet's first paint).
if (market || desk || back || walletMode(location.search, import.meta.env.VITE_WALLET) !== "off") document.querySelector(".page > .brand")?.remove();
const mode = market || back || desk ? "off" : walletMode(location.search, import.meta.env.VITE_WALLET);
if (mode !== "off") {
  document.body.classList.add("wallet-on");
  // W59: the wallet's one practice line is the banner's (the footer says which payments run); set before React renders.
  const banner = document.querySelector(".gn-foot");
  if (banner) banner.textContent = PRACTICE;
}
// W64: the wallet is the hosted first screen, so it renders once its chunk is here rather than through Suspense (React
// holds a resolved boundary back about 300 ms), and the recorded week's chunk loads alongside it, not after it mounts.
const rootEl = document.getElementById("root")!;
// Track F: the pages the build draws to their own file (web/prerender-routes.ts) hydrate what's on screen. A chunk that
// didn't load leaves that first paint up, with no way forward, so its message takes the whole page as before.
const lost = (what: string) => createRoot(rootEl).render(<HeldLine>{what} didn't load. <TryAgain />.</HeldLine>);
// A cover over the page (the opening, a room arriving by its address) would hide the only thing left to read.
const uncover = () => { document.documentElement.classList.remove("dk-opening"); roomArrived(); };
if (market) void import("./StoreSync.tsx").then(({ default: StoreSync }) => mount(rootEl, <Held><StoreSync /></Held>), () => lost("The market"));
else if (back) void back[0]().then(({ default: Page }) => mount(rootEl, <Held><Page /></Held>), () => lost(back[1]));
else {
  const root = createRoot(rootEl);
  if (desk) void import("./desk/Desk.tsx").then(({ default: Desk }) => root.render(<Held onThrow={uncover}><Desk /></Held>), () => { uncover(); root.render(<HeldLine>The Desk didn't load. <TryAgain />.</HeldLine>); });
  else if (mode === "off") void import("./App.tsx").then(({ App }) => root.render(<Held><App /></Held>), () => root.render(<HeldLine>The classic page didn't load. <TryAgain />.</HeldLine>));
  else void Promise.all([import("./Wallet.tsx"), import("./wallet-week.ts")]).then(async ([{ default: Wallet }, off]) => {
    // W64b: the week is read before the first render, so React draws the deal straight over the built page's first paint
    // (no "Loading your week…" between them). If it can't be read, the wallet reads it again and says so in its words.
    const home = await off.walletWeek(mode === "empty").catch(() => null);
    root.render(<Held><Wallet mode={mode} first={home ? { home, limit: off.entryLimit().limit } : undefined} /></Held>);
  }, () => root.render(<WalletMissed />));
}

// The classic page and the market wear index.html's nav: its menu button is inert markup until the real one, with its
// panel, is put in its place here (its own small chunk).
const menuSlot = market || (!desk && !back && mode === "off") ? document.querySelector(".page > .gn [data-gn-menu]") : null;
if (menuSlot) void import("./menu/MenuButton.tsx").then(({ MenuButton }) => createRoot(menuSlot).render(<MenuButton className="dk-menu" />));

// The wallet's chunk didn't arrive (a dropped connection, or a deploy that replaced it mid-visit): never a blank page.
// It lives here, in the page's own bundle, so it can't be missing too; the classic page needs no chunk. It says nothing
// about payments: this may be PayPal's return, where one was just made.
function WalletMissed() {
  return (
    <main className="held">
      <div role="alert">
        <h1>The wallet didn't load.</h1>
        <p><TryAgain />, or <a href={appHref("?wallet=0")}>open the classic page</a>.</p>
      </div>
    </main>
  );
}

// Motion turns on only once the page has loaded, so nothing slides into place on the first paint, and never for a
// visitor who asked for reduced motion (011 §5).
const still = matchMedia("(prefers-reduced-motion: reduce)");
const move = () => document.documentElement.classList.toggle("motion", !still.matches);
if (document.readyState === "complete") move(); else addEventListener("load", move, { once: true });
still.addEventListener("change", () => { if (document.readyState === "complete") move(); });
// Track R: the page-wide states (offline, waking, a chunk lost to a deploy), their own chunk, after the page has loaded.
const states = () => void import("./states/mount.ts").then((m) => m.mountStates(), () => {});
if (document.readyState === "complete") states(); else addEventListener("load", states, { once: true });
