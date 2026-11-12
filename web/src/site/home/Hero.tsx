// Home part 1: the promise with the gold egg as the O of "Only" (it carries your limit), one sentence and the Ask on
// the left; on the right, the tale scene (TaleScene.tsx): the goose and the golden egg, retold as one purchase.
// A dollar figure typed in the Ask reprints the limit on both eggs.
import { usdOf } from "@goose/core/money";
import { useState } from "react";
import { hrefOf } from "../route.ts";
import { usePaymentMode } from "../live/usePaymentMode.ts";
import { useServer } from "../live/useServer.ts";
import { EggMark } from "../ui/Egg.tsx";
import { AskBox } from "./AskBox.tsx";
import { HeroScene } from "./HeroScene.tsx";
import { TaleScene } from "./TaleScene.tsx";
import "./hero.css";

const shop = (words: string) => {
  try { sessionStorage.setItem("gg-ask", words); } catch { /* storage blocked: Shop opens with an empty Ask */ }
  window.location.hash = hrefOf("shop");
};

/** `paint`: the build's first paint (first-paint.tsx) is the first screen only, without the story player below it. Its
 *  practice line is true on any server (the payment mode is read from /api/health, which a static page can't). */
export function Hero({ paint = false }: { paint?: boolean }) {
  const server = useServer();
  const pay = usePaymentMode();
  const [hold, setHold] = useState(0);
  const [limit, setLimit] = useState("$60");

  const onWords = (w: string) => {
    const m = w.match(/\$\s?(\d{1,5})/);
    if (m) setLimit(usdOf(m[1]!));
  };

  return (
    <section id="hero" className="hx" aria-labelledby="hero-title">
      <div className="wrap hx-grid">
        <div className="hx-copy">
          <h1 id="hero-title" className="hx-title" aria-label="Your agent shops. Only your tap pays.">
            <span className="hx-line" aria-hidden="true">Your agent shops.</span>
            <span className="hx-line" aria-hidden="true"><span className="hx-o"><EggMark shine="once" art="s" /></span>nly your tap pays.</span>
          </h1>
          <p className="hx-lede">Tell Goose what you want and the most you’ll pay. It tests every seller, sets aside notes that try to give it orders, and haggles in plain code. Then it waits for your tap in PayPal.</p>
          <div className="hx-ask" onFocusCapture={() => setHold((h) => h + 1)}>
            <AskBox onShop={shop} onWords={onWords} live={server === "live"} server={server} />
          </div>
          <p className="hx-fine">{paint ? "Fictional sellers. Nothing moves until you tap." : pay === "sandbox" ? "Fictional sellers. Payments run on PayPal's sandbox, and nothing moves until you tap." : "Fictional sellers. Practice payments use a stand-in for PayPal, no real money moves, and nothing happens until you tap."}</p>
        </div>

        <TaleScene limit={limit} />
      </div>

      {paint ? null : <div className="wrap hx-story">
        <div className="hx-story-head">
          <h2 className="hx-story-title">One purchase, start to finish</h2>
          <p className="hx-story-note">Recorded week 1, replayed from the ledger. Every seller is fictional; every number is the code’s own.</p>
        </div>
        <HeroScene hold={hold} />
      </div>}
    </section>
  );
}
