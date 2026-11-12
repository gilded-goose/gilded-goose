// The egg on the page: a WebGL render when it can, a still gold egg in CSS when it can't (no WebGL, or until the
// three.js chunk lands), so the mark is never missing. The canvas is the same element across every beat; the page moves
// it with a transform, so the egg travels instead of being swapped.
import { useEffect, useRef } from "react";
import type { EggHandle, EggMood } from "./egg.ts";

export function Egg({ mood, className, label }: { mood: EggMood; className?: string; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<EggHandle | null>(null);
  const moodRef = useRef(mood);
  moodRef.current = mood;

  useEffect(() => {
    let gone = false;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    void import("./egg.ts").then(({ mountEgg }) => {
      if (gone || !canvas.current) return;
      const h = mountEgg(canvas.current, { still });
      if (!h) return;
      handle.current = h;
      h.setMood(moodRef.current);
      canvas.current.dataset.live = "1";
    }).catch(() => {});
    // The egg leans toward the pointer: a decorative spring, so only on a fine pointer and never for reduced motion.
    const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    const onMove = (e: PointerEvent) => handle.current?.look((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    if (fine && !still) addEventListener("pointermove", onMove, { passive: true });
    return () => { gone = true; removeEventListener("pointermove", onMove); handle.current?.destroy(); handle.current = null; };
  }, []);

  useEffect(() => { handle.current?.setMood(mood); }, [mood]);

  return (
    <div className={`gg-egg ${className ?? ""}`} data-mood={mood} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span className="gg-egg-css" />
      <canvas ref={canvas} className="gg-egg-gl" />
      <span className="gg-egg-shadow" />
    </div>
  );
}
