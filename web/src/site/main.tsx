// The new site's entry (served by web/goose.html until Task 8 makes it /).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./fonts.ts";
import "./tokens.css";
import "./base.css";
import { App } from "./App.tsx";
import { routeOf } from "./route.ts";
import { receiptHref } from "./shop/returns.ts";
import { keepEarlyWords } from "./early-words.ts";

// PayPal sends the shopper back with no hash (server back(), main.ts:2149-2160): open that run's receipt on Shop.
const back = receiptHref(location);
if (back && routeOf(location.hash).route === "home") history.replaceState(null, "", back);

// The first paint (site-paint.ts) may hold words already typed into its Ask box: keep them before React replaces it.
const root = document.getElementById("root")!;
keepEarlyWords(root);
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
