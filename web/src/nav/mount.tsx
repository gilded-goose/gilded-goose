// The one nav on a page of its own that draws it as markup (S1, Joshua Fri 3:40 PM): the developer mic test
// (voice-test-2.html). Loads the nav's sheet and puts the real menu button, with its panel, in the markup's slot.

import { createRoot } from "react-dom/client";
import { MenuButton } from "../menu/MenuButton.tsx";
import "../desk/tokens.css"; // this dev page's only entry; every public page's entry CSS @imports the tokens once (run.css, safe.css, 404.css)
import "./nav.css";
import "../menu/menu-button.css";
import "../brand/lockup.css"; // B-11's lockup in the markup bar (S1-13 part 3)

const slot = document.querySelector("[data-gn-menu]");
if (slot) createRoot(slot).render(<MenuButton className="dk-menu" />);
