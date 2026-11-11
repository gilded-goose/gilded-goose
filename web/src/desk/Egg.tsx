// The hero object (Joshua's final direction §4-5): the golden egg, the one precious thing on the page. First paint is a
// still picture of the same render (egg.webp, made by eggThree itself), so nothing waits on it. After the page has
// painted and gone idle, three.js loads and draws the live egg over it: a lean toward the cursor through a spring, the
// light shifting as you scroll, and one soft gold pulse when Goose protects you. A phone's tilt is used only after the
// shopper taps the egg (and iOS grants motion). The egg moves only when the shopper does (brand.md, motion): no idle
// turn, and once the spring has settled it stops drawing until the cursor, the page or the phone moves again, so a still
// page costs no frames. It also stops offscreen and on a hidden tab, falls back to the still on a slow device, never
// starts on software GL (no GPU: gl.ts decides on the real canvas before three.js is even fetched), and under reduced
// motion three.js never loads.
// On the session's first visit it plays the opening (opening.ts): the egg starts dark where the page's first paint drew
// its silhouette, lights as the page loads (three.js loads at once then, not on idle), and glides here. The live egg's
// first WebGL setup is one long main-thread task, so it runs only once the opening is still; the still picture is the
// egg until then, and the live one fades in over it.
import { useEffect, useRef, useState } from "react";
import { eggContext } from "./gl.ts";
import { loaded, opening, playOpening, whenStill } from "./opening.ts";
import still from "./egg.webp";

type Orientation = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
const MAX_YAW = 0.42, MAX_PITCH = 0.2; // radians
const PULSE_S = 2.4, REST = 1e-3; // the protection pulse's length (s); how close (radians, rad/s) the spring counts as settled: 0.06°, unseen
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** `glow` turns true when Goose protects the shopper: the egg pulses once. */
export default function Egg({ glow = false }: { glow?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [dead, setDead] = useState(false); // no live egg on this visit (no WebGL, software GL, or a context lost): the canvas leaves, so no browser placeholder can show
  const [broken, setBroken] = useState(false); // the picture failed to load: show nothing rather than a broken-image box
  const [canTilt, setCanTilt] = useState(false);
  const [tilting, setTilting] = useState(false);
  const target = useRef<[number, number]>([0, 0]);
  const pulse = useRef(0); // time the last protection pulse began, ms

  const wake = useRef(() => {}); // restarts the drawing loop after it has settled
  useEffect(() => { if (glow) { pulse.current = performance.now(); wake.current(); } }, [glow]);
  useEffect(() => playOpening(), []);

  useEffect(() => {
    if (calm()) return;
    let gone = false, raf = 0, idle = 0, seen = true;
    let egg: import("./eggThree.ts").EggScene | null = null;
    const pos: [number, number] = [0, 0], vel: [number, number] = [0, 0];
    const cleanups: (() => void)[] = [];
    let t0 = 0, drawnY = NaN, drawn = false;
    const slow: number[] = [];
    let unwait = () => {};

    const step = (t: number) => {
      raf = 0;
      if (!egg || !seen || document.hidden) return;
      const dt = Math.min(0.05, t0 ? (t - t0) / 1000 : 0.016);
      // A slow device gets the still: if its first moving frames run under ~30 fps, stop and keep the picture. Only
      // back-to-back frames count; the first frame after a rest has no honest interval. Never mid-pulse: the egg would
      // snap to the still at the one moment its glow matters.
      if (t0 && slow.length < 90 && !(pulse.current > 0 && (t - pulse.current) / 1000 < PULSE_S)) {
        slow.push(dt);
        if (slow.length === 90 && (slow.slice(30).sort((a, b) => a - b)[30] ?? 0) > 0.034) { stop(); return; }
      }
      t0 = t;
      // A spring toward the target: stiff enough to follow, damped so it settles without wobble.
      let moving = false;
      for (const i of [0, 1] as const) {
        const a = 60 * (target.current[i] - pos[i]) - 15 * vel[i];
        vel[i] += a * dt; pos[i] += vel[i] * dt;
        if (Math.abs(target.current[i] - pos[i]) > REST || Math.abs(vel[i]) > REST) moving = true;
        else { pos[i] = target.current[i]; vel[i] = 0; }
      }
      const since = (t - pulse.current) / 1000;
      const pulsing = pulse.current > 0 && since < PULSE_S;
      const g = pulsing ? Math.sin(Math.min(1, since / PULSE_S) * Math.PI) : 0;
      const y = scrollY;
      egg.draw({ yaw: pos[0], pitch: pos[1], spin: y * 0.0016, glow: g });
      drawnY = y;
      // The still hides only once the canvas holds a real picture, so there is never a frame with no egg.
      if (!drawn) { drawn = true; setLive(true); }
      // Settled, not pulsing, and the page hasn't scrolled since this frame: stop until something moves.
      if (moving || pulsing) raf = requestAnimationFrame(step);
      else t0 = 0;
    };
    const go = () => { if (!raf && egg && seen && !document.hidden) raf = requestAnimationFrame(step); };
    wake.current = go;
    // Any failure hands the egg back to the still picture for the rest of the visit.
    const stop = () => { cancelAnimationFrame(raf); raf = 0; egg?.dispose(); egg = null; drawn = false; setLive(false); setDead(true); };

    const mount = async (mountEgg: typeof import("./eggThree.ts").mountEgg, gl: WebGL2RenderingContext) => {
      const c = canvas.current;
      if (gone || !c) return;
      // Two tasks with a frame between (eggThree.ts): the page can leave meanwhile, and then the new egg goes too.
      const made = await mountEgg(c, matchMedia("(pointer: coarse)").matches ? 1.5 : 2, gl);
      if (gone) { made?.dispose(); return; }
      egg = made;
      if (!egg) { setDead(true); return; } // the renderer failed on a context that was fine: the still picture is the egg, and the canvas leaves
      // The GPU can drop the context (a driver reset, memory pressure, a tab in the background on a phone): the
      // canvas goes blank, so the still comes back at once and stays.
      const lost = (e: Event) => { e.preventDefault(); stop(); };
      c.addEventListener("webglcontextlost", lost);
      // Resizing a WebGL canvas clears it, and the loop is asleep at rest: redraw once after every resize (a window
      // resize, a phone's toolbar, a full-page capture), or the canvas would sit blank over a hidden still.
      const ro = new ResizeObserver(() => { egg?.resize(); t0 = 0; if (!drawn) go(); }); // resize() redraws the last frame
      ro.observe(c);
      // Draw only while the egg is on screen.
      const io = new IntersectionObserver((es) => { seen = es[0]?.isIntersecting ?? true; t0 = 0; go(); });
      io.observe(c);
      cleanups.push(() => { ro.disconnect(); io.disconnect(); c.removeEventListener("webglcontextlost", lost); });
      go();
    };
    // The live egg's code arriving is the opening's last loading step (or its failure: then the picture is the egg).
    // First the context, on the real canvas (gl.ts): no WebGL2, or software GL, and there is nothing to load: the
    // picture is the egg, the canvas leaves, and three.js's 116 KB never download. The context it makes is the one
    // three.js then draws with.
    const start = () => {
      const c = canvas.current;
      if (gone || !c) return;
      const gl = eggContext(c);
      if (!gl) { loaded("egg"); setDead(true); return; }
      void import("./eggThree.ts").then(({ mountEgg }) => {
        loaded("egg");
        unwait = whenStill(() => void mount(mountEgg, gl).catch(() => { if (!gone) setDead(true); }));
      }).catch(() => loaded("egg"));
    };
    const ric = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    idle = opening() ? window.setTimeout(start, 0) : ric ? ric(start, { timeout: 1800 }) : window.setTimeout(start, 400);

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !body.current) return;
      const r = body.current.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / innerWidth, y = (e.clientY - (r.top + r.height / 2)) / innerHeight;
      target.current = [Math.max(-1, Math.min(1, x * 1.6)) * MAX_YAW, Math.max(-1, Math.min(1, y * 1.6)) * MAX_PITCH];
      go();
    };
    const onScroll = () => { if (scrollY !== drawnY) go(); };
    const onVis = () => { t0 = 0; go(); };
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    setCanTilt(matchMedia("(pointer: coarse)").matches && typeof DeviceOrientationEvent !== "undefined");
    return () => {
      gone = true; cancelAnimationFrame(raf); wake.current = () => {};
      removeEventListener("pointermove", onMove); removeEventListener("scroll", onScroll); document.removeEventListener("visibilitychange", onVis);
      (globalThis as { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback?.(idle); clearTimeout(idle);
      unwait(); cleanups.forEach((f) => f()); egg?.dispose();
    };
  }, []);

  // A phone's tilt, only once the shopper asks for it by tapping the egg.
  useEffect(() => {
    if (!tilting) return;
    const onTurn = (e: DeviceOrientationEvent) => {
      const g = (e.gamma ?? 0) / 35, b = ((e.beta ?? 45) - 45) / 35;
      target.current = [Math.max(-1, Math.min(1, g)) * MAX_YAW, Math.max(-1, Math.min(1, b)) * MAX_PITCH];
      wake.current();
    };
    addEventListener("deviceorientation", onTurn);
    return () => removeEventListener("deviceorientation", onTurn);
  }, [tilting]);

  async function askTilt() {
    if (tilting) { setTilting(false); target.current = [0, 0]; wake.current(); return; }
    const O = DeviceOrientationEvent as Orientation;
    const ok = typeof O.requestPermission === "function" ? (await O.requestPermission().catch(() => "denied")) === "granted" : true;
    setTilting(ok);
  }

  // The body stays one element (the opening moves it, and three.js draws into its canvas); on a phone the tilt button
  // lies over it rather than replacing it, which would remount the canvas under a live renderer.
  return (
    <div ref={body} className="dk-egg">
      <div className="dk-egg-body">
        {!broken && <img className="dk-egg-dark" src={still} alt="" width={600} height={720} aria-hidden="true" onError={() => setBroken(true)} />}
        <span className="dk-egg-lit" aria-hidden="true">
          {!broken && <img className="dk-egg-still" src={still} alt="" width={600} height={720} decoding="async" onError={() => setBroken(true)} />}
          {!dead && <canvas ref={canvas} className={`dk-egg-gl${live ? " dk-on" : ""}`} />}
        </span>
        {canTilt && live && <button type="button" className="dk-egg-tilt" aria-pressed={tilting} aria-label={tilting ? "Stop tilting the golden egg" : "Tilt the golden egg with your phone"} onClick={() => void askTilt()} />}
      </div>
      <div className="dk-egg-shadow" aria-hidden="true" />
    </div>
  );
}
