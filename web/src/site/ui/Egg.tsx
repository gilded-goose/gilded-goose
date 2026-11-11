// The golden egg, your limit: one rendered gold egg (public/site/egg.webp, made in three.js) everywhere on the site, from
// the 28px mark to the hero. When the engraving carries a figure, the limit is set into it. At its two moments
// (approve, receipt) it settles once and a band of light crosses it; as the loader it rocks and the light keeps
// crossing. Reduced motion shows it settled (ui.css).
import { useId } from "react";
import "./ui.css";

const EGG_SRC = `${import.meta.env.BASE_URL}site/egg.webp`;
/** The mark's render at its drawn size (the Nov 11 speed gate): 240 px (7 KB) for a mark in a line of type, 640 px
 *  (22 KB) otherwise; the 1680 px render (69 KB) stays for the large eggs only. */
const MARK_SRC = { s: `${import.meta.env.BASE_URL}site/egg-s.webp`, m: `${import.meta.env.BASE_URL}site/egg-m.webp`, full: EGG_SRC } as const;
/** Each Egg size's render (ui.css): 24 and 96 px take the 240 px one, 240 px the 640 px one, full width the 1680 px one. */
const ART_OF: Record<EggSize, keyof typeof MARK_SRC> = { s: "s", m: "s", l: "m", xl: "full" };

export type EggSize = "s" | "m" | "l" | "xl";
export type EggMoment = "still" | "approve" | "receipt";
/** A band of light across the shell: once (a moment), or on repeat (the loader only). */
export type EggShine = "once" | "loop";

/** Egg outline in a 200 × 240 frame, wider toward the base. */
export const EGG_PATH = "M100 8 C150 8 190 90 190 148 C190 200 150 232 100 232 C50 232 10 200 10 148 C10 90 50 8 100 8 Z";

/** "Your nest egg · $60" → "$60": the one figure the egg prints. */
export const limitOf = (engraving?: string): string | null => engraving?.match(/\$\s?\d[\d,]*(?:\.\d{2})?/)?.[0].replace(/\s/g, "") ?? null;

export function EggMark({ limit, className, shine, art = "m" }: { limit?: string | null; className?: string; shine?: EggShine; art?: keyof typeof MARK_SRC }) {
  const src = MARK_SRC[art];
  const id = useId().replace(/:/g, "");
  const clip = `egg-clip-${id}`;
  const shell = `egg-shell-${id}`;
  const glint = `egg-glint-${id}`;
  const size = !limit ? 0 : limit.length > 5 ? 32 : limit.length > 3 ? 40 : 50;
  return (
    <svg className={className ? `egg-art ${className}` : "egg-art"} viewBox="0 0 200 240" aria-hidden="true" focusable="false">
      {/* The render's egg body (1068 x 1430 px at 300,42) fitted to the 224-unit egg height, centred; its floor shadow cut off. */}
      <clipPath id={clip}><rect x="-40" y="0" width="280" height="232" /></clipPath>
      <image href={src} x="-30.6" y="1.4" width="263.2" height="241.1" preserveAspectRatio="none" clipPath={`url(#${clip})`} />
      {shine ? (
        <>
          {/* The light stays on the shell: masked by the render's own alpha, not the outline (the render is narrower). */}
          <mask id={shell} style={{ maskType: "alpha" }}>
            <image href={src} x="-30.6" y="1.4" width="263.2" height="241.1" preserveAspectRatio="none" clipPath={`url(#${clip})`} />
          </mask>
          <linearGradient id={glint} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.6" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <g mask={`url(#${shell})`}>
            <rect className="egg-glint" data-shine={shine} x="-90" y="-20" width="70" height="280" fill={`url(#${glint})`} transform="skewX(-16)" />
          </g>
        </>
      ) : null}
      {limit ? <text className="egg-num" x="100" y="156" textAnchor="middle" fontSize={size} fill="#3a2a0e" fillOpacity="0.8">{limit}</text> : null}
    </svg>
  );
}

export function Egg({ size, engraving, moment = "still" }: { size: EggSize; engraving?: string; moment?: EggMoment }) {
  const label = engraving ? `Gold egg: ${engraving}` : undefined;
  return (
    <span className="egg" data-size={size} data-moment={moment} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <EggMark className="egg-img" art={ART_OF[size]} limit={size === "s" ? null : limitOf(engraving)} {...(moment === "still" ? {} : { shine: "once" as const })} />
    </span>
  );
}

/** The loading screen: the egg rocking on its base while light crosses it, and the words saying what is on its way. */
export function EggLoader({ label = "Loading", fill = true }: { label?: string; fill?: boolean }) {
  return (
    <div className="egg-loader" data-fill={fill ? "" : undefined} role="status">
      <EggMark className="egg-loader-art" shine="loop" />
      <span className="egg-loader-label">{label}</span>
    </div>
  );
}
