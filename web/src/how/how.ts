// How it works (`?desk=how`; Track SYS, launch program): the five steps a purchase passes through, each with the one
// sentence that says what it does and the real file that does it. The words and the files are Track C's
// (docs/launch/how-it-works.md, the press release's words; C's row c-launch-how checks that file). Every line is a docs/claims.md row (`sys-how-*`) whose probe re-reads
// the code it names, and core/test/sys-pages.test.ts fails if a file named here is gone. Pure data: no React, so the test
// and the claims gate read the same words the page draws.

export interface Stage {
  id: "you" | "goose" | "watcher" | "guard" | "paypal";
  name: string;
  /** What kind of thing does this step: the shopper, an AI, plain code, or PayPal. Gold marks code. An AI tag's sentence
   *  says when the AI runs ("When it's on": only with a key). */
  kind: "Shopper" | "AI" | "Code" | "PayPal sandbox";
  line: string;
  files: readonly string[];
}

export const HOW_TITLE = "How it works";
export const HOW_LEAD = "Money moves only after your tap.";

export const STAGES: readonly Stage[] = [
  { id: "you", name: "You", kind: "Shopper", line: "You ask in your words, and only your tap can pay.", files: ["web/src/desk/Desk.tsx"] },
  { id: "goose", name: "Goose", kind: "AI", line: "When it's on, Claude Haiku 5.5 reads your ask and proposes moves, never a payment.", files: ["server/src/adapters/claude.ts"] },
  { id: "watcher", name: "The Watcher", kind: "Code", line: "Plain code reads seller words as data, sets aside the gift-card asks, other ways to pay and orders to the agent it recognizes, holds any other mention of gift cards or another way to pay, asks you first about cash in person, and can miss one.", files: ["trust/src/watch.ts"] },
  { id: "guard", name: "The guard", kind: "Code", line: "Code holds your limits and locks one exact cart for fifteen minutes.", files: ["trust/src/guard.ts"] },
  { id: "paypal", name: "PayPal", kind: "PayPal sandbox", line: "PayPal holds the money, code re-checks the cart, then PayPal takes it or releases it.", files: ["trust/src/paypal.ts"] },
];

/** The one path back: the shopper's tap, the only approval (drawn under the five boxes). */
export const TAP_LINE = "Your tap in PayPal: the only approval";

/** The diagram's text alternative, read by a screen reader in place of the picture (the visible list says it in full). */
export const HOW_DESC = `${STAGES.map((s) => s.name).join(", then ")}. ${TAP_LINE}.`;

/** Every file the page names, once, for the drift test and the claims gate. */
export const HOW_FILES: readonly string[] = [...new Set(STAGES.flatMap((s) => s.files))];
