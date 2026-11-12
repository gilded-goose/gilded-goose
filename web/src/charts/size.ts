// A chart sized by its own box, never the window (Track D; Lead-9: "sized by its container, no page assumptions"), so
// the same component fits a page column, a phone, or an AG Studio widget's cell.

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/** The box's width in CSS pixels, kept current as the box resizes; 0 until the first layout. */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => { if (e) setW(e.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Below this width a chart drops its quieter labels and uses its phone sizes. */
export const NARROW_PX = 560;
