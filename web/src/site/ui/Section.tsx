// A home or page section: its h2, the one plain summary, then its content. The id is the anchor routes point at.
import type { ReactNode } from "react";
import "./ui.css";

export function Section({ id, title, summary, children }: { id: string; title: string; summary?: string; children?: ReactNode }) {
  const head = `${id}-title`;
  return (
    <section id={id} className="section" aria-labelledby={head}>
      <div className="wrap">
        <header className="section-head">
          <h2 id={head}>{title}</h2>
          {summary ? <p className="lede">{summary}</p> : null}
        </header>
        {children}
      </div>
    </section>
  );
}
