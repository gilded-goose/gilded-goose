// W4: the unknown path's page (web/404.html). Its bar is markup; the menu button becomes the real one, with its panel,
// here, as on safe.html (safe-main.tsx).
import { createRoot } from "react-dom/client";
import "./404.css";
import "./nav/nav.css";
import "./menu/menu-button.css";
import { wireSkip } from "./skip.ts";

// The bar's "Skip to content" (S1-13 part 3, the Lead's rail sweep): the 404 wires it like every other page.
wireSkip();

const menuSlot = document.querySelector("[data-gn-menu]");
if (menuSlot) void import("./menu/MenuButton.tsx").then(({ MenuButton }) => createRoot(menuSlot).render(<MenuButton className="dk-menu" />));
// Track R: the page-wide states (offline, waking, a chunk lost to a deploy), their own chunk, after the page has loaded.
const states = () => void import("./states/mount.ts").then((m) => m.mountStates(), () => {});
if (document.readyState === "complete") states(); else addEventListener("load", states, { once: true });
