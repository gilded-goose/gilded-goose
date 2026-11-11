// Every page's frame: skip link, header, the page, footer, and the Judge in 60 seconds overlay they both open.
import { useState, type ReactNode } from "react";
import type { Route } from "../route.ts";
import { JudgeOverlay } from "../judge/Judge.tsx";
import { Header } from "./Header.tsx";
import { Footer } from "./Footer.tsx";
import "./shell.css";

/** `paint`: the build's first paint (first-paint.tsx) draws the header and the page only; the app adds the rest below. */
export function Shell({ route, children, paint = false }: { route: Route; children: ReactNode; paint?: boolean }) {
  const [judge, setJudge] = useState(false);
  const open = () => setJudge(true);
  return (
    <>
      {/* The hash is the router's, so the skip link moves focus itself instead of changing it. */}
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to the page</a>
      <Header route={route} onJudge={open} />
      <main id="main" tabIndex={-1} className="main">
        {children}
      </main>
      {paint ? null : <Footer onJudge={open} />}
      {paint ? null : <JudgeOverlay open={judge} onClose={() => setJudge(false)} />}
    </>
  );
}
