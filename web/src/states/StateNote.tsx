// Track R: the states kit's one block (brand.md §10.9). It stands in the content column where the missing content would
// go: what happened (one short sentence), the cause (one sentence) and one action (an outline pill), or less. No card,
// no box, no icon. Only the waking state carries the vector egg (10.2). Surface owners place it, or the named states in
// index.ts, for their own loading, empty, error, offline, rate-limited and waking moments.
import { appHref } from "../menu/href.ts";
import { useId, type ReactNode } from "react";
import "./states.css";

export type StateKind = "loading" | "empty" | "error" | "offline" | "limited" | "waking" | "updated" | "notfound";

/** A button (`onClick`) or a link (`href`, drawn with "›"). `disabled` keeps it focusable with aria-disabled, the cause
 *  as its description (§10.9), and its click does nothing. */
export type StateAction = { label: string; onClick: () => void; disabled?: boolean | undefined } | { label: string; href: string };

/** The vector egg (brand.md 10.1), inline so the gradient travels with it: one path on one radial gradient. */
export function StateEgg({ className = "st-egg" }: { className?: string }) {
  const g = `st-egg-${useId().replace(/:/g, "")}`;
  return (
    <svg className={className} viewBox="4.4 2.2 15.2 18.8" aria-hidden="true" focusable="false">
      <radialGradient id={g} cx="38%" cy="30%" r="78%">
        <stop offset="0" stopColor="#fff3c4" /><stop offset=".34" stopColor="#f0cb62" />
        <stop offset=".74" stopColor="#b98a1c" /><stop offset="1" stopColor="#6e4f06" />
      </radialGradient>
      <path d="M12 2.2c-4.2 0-7.6 6.3-7.6 11.2a7.6 7.6 0 0 0 15.2 0C19.6 8.5 16.2 2.2 12 2.2Z" fill={`url(#${g})`} />
    </svg>
  );
}

export function StateNote(p: { kind: StateKind; title: string; line?: ReactNode | undefined; action?: StateAction | undefined; egg?: "dim" | "lit" | undefined; className?: string | undefined; live?: boolean | undefined }) {
  const lineId = useId();
  const a = p.action;
  const off = !!a && !("href" in a) && !!a.disabled;
  return (
    <div className={`st-note${p.className ? ` ${p.className}` : ""}`} data-kind={p.kind} data-lit={p.egg === "lit" ? "" : undefined} role={p.kind === "error" ? "alert" : "status"} aria-live={p.live === false ? "off" : p.kind === "error" ? undefined : "polite"}>
      {p.egg ? <StateEgg /> : null}
      <p className="st-note-title">{p.title}</p>
      {p.line ? <p className="st-note-line" id={lineId}>{p.line}</p> : null}
      {!a ? null : "href" in a ? (
        <a className="st-note-action" href={appHref(a.href)}>{a.label} <span aria-hidden="true">›</span></a>
      ) : (
        <button type="button" className="st-note-action" aria-disabled={off ? "true" : undefined} aria-describedby={off && p.line ? lineId : undefined} onClick={() => { if (!off) a.onClick(); }}>{a.label}</button>
      )}
    </div>
  );
}
