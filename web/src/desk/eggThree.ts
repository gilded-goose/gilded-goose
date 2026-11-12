// The golden egg as a real object (Joshua's final direction §4): a lathe-turned egg in physically based polished gold,
// lit by a small jeweler's studio made in code (emissive soft boxes, pre-filtered into an environment map), so no
// HDR file is fetched. The egg is round about its own axis, so the light moving across it (with scroll and the cursor)
// is the studio turning around it. Loaded only after first paint; the caller owns the loop, draws only while something
// moves, and stops offscreen, on a hidden tab, or on a slow device. The warm light the egg casts on the velvet, which
// the glass surfaces catch, is a static CSS layer (tokens.css, --egg-light), not this canvas: it costs no frames.
import {
  ACESFilmicToneMapping, Color, DoubleSide, LatheGeometry, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, PMREMGenerator,
  PerspectiveCamera, PlaneGeometry, Scene, SRGBColorSpace, Vector2, WebGLRenderer,
} from "three";
import { GL_ATTRS, eggContext } from "./gl.ts";

export type EggPose = { yaw: number; pitch: number; spin: number; glow: number };
export type EggScene = { draw(p: EggPose): void; resize(): void; dispose(): void };

const A = 0.6, B = 0.86, K = 0.2; // half-width, half-height, taper (the top narrower than the bottom)
const GOLD = new Color(1.0, 0.73, 0.31); // polished yellow gold, linear

function studio(): Scene {
  const s = new Scene();
  s.background = new Color(0.05, 0.035, 0.03); // the case at night, warm and dim
  const box = (w: number, h: number, x: number, y: number, z: number, c: [number, number, number]) => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(...c), side: DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  box(2.2, 7, -3.4, 1.0, 2.9, [5.5, 5.2, 4.8]);    // key: one tall soft strip, front left
  box(1.0, 7, 4.0, 0.6, -2.0, [2.4, 2.25, 2.05]);  // rim: a thin strip, back right
  box(7, 5, 0, 5.0, 0.6, [1.5, 1.42, 1.32]);       // overhead soft box, wide
  // §10.2's lift (B-11, scripts/brand/lift.ts): the three boxes below light the lower half, so below the equator the
  // body reads gold (#b98a1c or lighter), not brown; the lower half of a mirror egg reflects the floor.
  box(7, 2.4, 0.4, -1.6, 4.6, [2.0, 1.85, 1.65]);     // broad front fill, low, so the body reads gold not brown
  box(4, 7, -4.6, 0, -1.8, [0.7, 0.66, 0.6]);      // left back panel
  box(6, 4.2, 1.4, 1.3, 5.4, [0.8, 0.72, 0.62]);   // dim front wash: the gap between the boxes reflects as soft shade, not a dark door
  box(12, 12, 0, -4.5, 0, [0.5, 0.36, 0.24]);    // warm floor bounce
  return s;
}

function eggProfile(n = 96): Vector2[] {
  const pts: Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI, y = -B * Math.cos(t);
    pts.push(new Vector2(Math.max(1e-4, A * Math.sin(t) * (1 - K * y)), y));
  }
  return pts;
}

/** After the next frame, in a task of its own: the page's frames run between the egg's two heavy halves. */
const nextTask = () => new Promise<void>((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));

/** A drawing egg on `canvas`, or null where WebGL2 isn't available or draws in software (the still picture stays;
 *  gl.ts decides that, before this file is even fetched). `gl` is the context the caller already made on the canvas
 *  (eggContext), so none is created twice; without it, one is made and checked here.
 *  In two tasks, never one: the studio's light (PMREM) was 157 ms and the first draw, mostly shader compiling, 171 ms,
 *  one long task inside the phone's opening (P's trace, Nov 6). The light is baked, a frame passes, the shaders compile
 *  in parallel where the GPU can (compileAsync, KHR_parallel_shader_compile), then the first draw. The still covers it. */
export async function mountEgg(canvas: HTMLCanvasElement, maxDpr = 2, gl: WebGL2RenderingContext | null = eggContext(canvas)): Promise<EggScene | null> {
  if (!gl) return null;
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ canvas, context: gl, ...GL_ATTRS }); }
  catch { return null; }
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(studio(), 0.035).texture;
  pmrem.dispose();
  scene.environment = env;

  const mat = new MeshPhysicalMaterial({ color: GOLD, metalness: 1, roughness: 0.17, envMapIntensity: 1, emissive: GOLD, emissiveIntensity: 0 });
  const geo = new LatheGeometry(eggProfile(), 128);
  const egg = new Mesh(geo, mat);
  scene.add(egg);
  const camera = new PerspectiveCamera(22, 1, 0.1, 50);
  camera.position.set(0, 0.04, 5.1);
  let last: EggPose = { yaw: 0, pitch: 0, spin: 0, glow: 0 };

  const draw = (p: EggPose) => {
    last = p;
    egg.rotation.set(p.pitch, 0, -p.yaw * 0.55);             // leans toward the cursor
    scene.environmentRotation.set(0, p.spin + p.yaw * 0.8, 0); // the light moves across the gold
    mat.emissiveIntensity = 0.07 * p.glow;                     // one soft gold pulse when Goose protects you
    mat.envMapIntensity = 1 + 0.18 * p.glow;
    renderer.render(scene, camera);
  };
  const resize = () => {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxDpr));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    draw(last);
  };
  await nextTask();
  await renderer.compileAsync(scene, camera).catch(() => {}); // a failed early compile is the first draw's to do, as before
  resize();
  return {
    draw, resize,
    dispose: () => { geo.dispose(); mat.dispose(); env.dispose(); renderer.dispose(); renderer.forceContextLoss(); },
  };
}
