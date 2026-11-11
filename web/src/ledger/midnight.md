# ledger/midnight.css: the notes

The pages take that sheet as raw text (`?raw`), so a comment in it reaches every visitor. Its notes live here, in the order they stood.

Behind the scenes, Midnight (Desk-B-4; Joshua, Fri Oct 30): the ledger's own palette, so a palette flip is this one file. The same jewelry case as the shopper's plum velvet, with the lights lowered: a flat, matte aubergine black with a fine grain (no gradient, no glow), cream text, one muted neutral, and one warm gold that appears only for protection (a skipped seller's sheet line) and the soft flash of a row arriving. Red is only ever a small marker dot. Loaded only with the ledger's lazy chunk, so these names never reach another page. Type and the face come from Desk-A's tokens (web/src/desk/tokens.css, "Archivo Goose"); sizes here sit on an 8 px grid.

Midnight's palette and glass are Track B's (desk/tokens.css, `.dk[data-palette="midnight"]`), which the back room's roots (.lx, .pf) carry; Every decision's full screen takes the glass alone (data-glass="midnight"). The --lx-* names below are aliases of those tokens there. The literals on :root are the same values, kept only for pages outside the back room that still read --lx-* (they carry no Midnight palette).

The same light on every back-room page (Joshua, Fri Oct 30: "all Midnight, same light"), and since the Design Director's ruling the Desk's own: B's --egg-light, at Midnight's --egg-at, static (no motion, never an orb). Declared here, not on :root: --egg-light lives on this palette, and a var() resolves where it is declared.

A fine velvet grain, drawn once as SVG noise: flat texture, no gradient.

The page's light: a fixed layer under everything, over the grain.

No `@import "../desk/tokens.css"` (Track F, tokens stage 2, Nov 6): every page that loads this sheet already has the tokens in main.css (run.css), and the import put a second copy in BackRoom's chunk and in Specimens' inline sheet. The `?raw` readers still strip any `@import`.
