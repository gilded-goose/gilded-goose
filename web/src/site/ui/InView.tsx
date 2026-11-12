// Draws its children only once their place comes within `margin` of the screen (the Nov 11 speed gate: a heavy part
// below the fold, like the hood's AG Grid ledger, costs nothing on the first load). Until then it holds `reserve` px, so
// what's below doesn't jump when it arrives. Without IntersectionObserver it draws at once.
import { useEffect, useRef, useState, type ReactNode } from "react";

export function InView({ children, reserve, margin = 600 }: { children: ReactNode; reserve: number; margin?: number }) {
  const spot = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (near || !spot.current) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: `${margin}px 0px` });
    io.observe(spot.current);
    return () => io.disconnect();
  }, [near, margin]);
  return near ? <>{children}</> : <div ref={spot} style={{ minHeight: reserve }} aria-hidden="true" />;
}
