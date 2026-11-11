import { createRoot } from "react-dom/client";
import { mount } from "./hydrate.ts";
import "./safe.css";
import "./nav/nav.css";
import "./menu/menu-button.css";
import { Safe } from "./Safe.tsx";
import { Held } from "./held.tsx";
import { wireSkip } from "./skip.ts";

wireSkip();

mount(document.getElementById("root")!, <Held><Safe /></Held>);
// The one nav (S1): the page's markup draws it; the menu button becomes the real one, with its panel, here.
const menuSlot = document.querySelector("[data-gn-menu]");
if (menuSlot) void import("./menu/MenuButton.tsx").then(({ MenuButton }) => createRoot(menuSlot).render(<MenuButton className="dk-menu" />));

// As on the main page (main.tsx): motion only after load, never under reduced motion (011 §5).
const still = matchMedia("(prefers-reduced-motion: reduce)");
const move = () => document.documentElement.classList.toggle("motion", !still.matches);
if (document.readyState === "complete") move(); else addEventListener("load", move, { once: true });
still.addEventListener("change", () => { if (document.readyState === "complete") move(); });
// Track R: the page-wide states (offline, waking, a chunk lost to a deploy), their own chunk, after the page has loaded.
const states = () => void import("./states/mount.ts").then((m) => m.mountStates(), () => {});
if (document.readyState === "complete") states(); else addEventListener("load", states, { once: true });
