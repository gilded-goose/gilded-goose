// The gold egg: Gilded Goose's mark and its one character. A real PBR render (three.js), lit by a small studio built
// in code (green walls, white softboxes) so the gold reflects the page it sits on. It has no face; it acts through
// motion and light: it leans toward you, spins up while it works, turns a red edge toward a scam, and catches one
// bright glint when you pay.
import {
  ACESFilmicToneMapping, BackSide, Color, DoubleSide, LatheGeometry, Mesh, MeshBasicMaterial, MeshPhysicalMaterial,
  PerspectiveCamera, PlaneGeometry, PMREMGenerator, PointLight, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Vector2, WebGLRenderer,
} from "three";

export type EggMood = "idle" | "listening" | "working" | "guarding" | "paid";

/** Critically damped by default; `zeta` < 1 only where momentum earned a recoil. */
class Spring {
  v = 0;
  constructor(public x: number, public target = x, private stiffness = 120, private zeta = 1) {}
  step(dt: number) {
    const k = this.stiffness, c = 2 * this.zeta * Math.sqrt(k);
    this.v += (k * (this.target - this.x) - c * this.v) * dt;
    this.x += this.v * dt;
  }
  get settled() { return Math.abs(this.target - this.x) < 1e-4 && Math.abs(this.v) < 1e-4; }
}

/** Egg profile: a sine lathe pushed wider toward the base, 0.75 wide for 1 tall, like a hen's egg. */
function eggGeometry() {
  const pts: Vector2[] = [];
  const n = 96;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI;
    pts.push(new Vector2(0.75 * Math.sin(t) * (1 + 0.13 * Math.cos(t)), -Math.cos(t)));
  }
  return new LatheGeometry(pts, 160);
}

/**
 * The studio the gold reflects, baked once into an env map: a dome that is bright and warm overhead, dark (the page's
 * green) at the horizon and warm again at the floor, so the shell reads as gold with a dark band across it, the way
 * product photographs light gold. Two tall strip lights give it its edges. No small panels: three bright spots on an
 * egg read as a face, and Goose has no face.
 */
function studio(renderer: WebGLRenderer) {
  const room = new Scene();
  const dome = new ShaderMaterial({
    side: BackSide, depthWrite: false,
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `varying vec3 vDir;
      void main(){
        float y = vDir.y;
        vec3 sky = vec3(1.0, 0.93, 0.80) * 1.55;
        vec3 horizon = vec3(0.012, 0.045, 0.03);
        vec3 floorWarm = vec3(1.0, 0.78, 0.46) * 0.9;
        vec3 c = y > 0.0 ? mix(horizon, sky, smoothstep(0.04, 0.75, y)) : mix(horizon, floorWarm, smoothstep(-0.03, -0.5, y));
        gl_FragColor = vec4(c * (0.85 + 0.15 * vDir.x), 1.0);
      }`,
  });
  room.add(new Mesh(new SphereGeometry(10, 64, 32), dome));
  const strip = (w: number, h: number, power: number, x: number, y: number, z: number) => {
    // lookAt turns the plane's front (+Z) toward the egg, so it's drawn two-sided to be seen from the middle.
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(1, 0.97, 0.92).multiplyScalar(power), side: DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); room.add(m);
  };
  strip(1.1, 7, 5, -6, 1.5, 3);   // key: a tall strip left and in front
  strip(0.5, 7, 3, 6.5, 0.5, -2); // rim: a narrow strip right and behind
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(room, 0.035).texture;
  pmrem.dispose();
  return env;
}

export interface EggHandle {
  setMood(mood: EggMood): void;
  /** Pointer as -1..1 across the viewport; the egg leans toward it. */
  look(x: number, y: number): void;
  destroy(): void;
}

/** Mounts the egg into `canvas`. Returns null when WebGL isn't there; the caller keeps its CSS egg. */
export function mountEgg(canvas: HTMLCanvasElement, opts: { still: boolean }): EggHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new Scene();
  scene.environment = studio(renderer);
  const camera = new PerspectiveCamera(20, 1, 0.1, 50);
  camera.position.set(0, 0.15, 7.4);
  camera.lookAt(0, 0, 0);

  // Gold's measured reflectance (linear F0 ≈ 1.00, 0.77, 0.34), a fine polish.
  const gold = new MeshPhysicalMaterial({ metalness: 1, roughness: 0.17, color: new Color().setRGB(1, 0.77, 0.34), envMapIntensity: 1 });
  const egg = new Mesh(eggGeometry(), gold);
  scene.add(egg);
  // The guard's red edge: a real light, so the gold catches it only where the surface faces it.
  const warn = new PointLight(new Color(1, 0.22, 0.12), 0, 9, 1.4);
  warn.position.set(2.6, 0.6, 2.2);
  scene.add(warn);

  const spin = new Spring(0.18, 0.18, 30);      // yaw speed, rad/s
  const tiltX = new Spring(0, 0, 90), tiltZ = new Spring(0, 0, 90);
  const lean = new Spring(0, 0, 60);            // toward a threat (guarding), radians of yaw offset
  const envTurn = new Spring(0, 0, 18);         // sweeps the studio's highlights across the shell
  const red = new Spring(0, 0, 70);
  const glow = new Spring(1, 1, 50);            // env intensity
  let yaw = 0.6, mood: EggMood = "idle";

  const size = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(size);
  ro.observe(canvas);
  size();

  let visible = true, raf = 0, last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const s of [spin, tiltX, tiltZ, lean, envTurn, red, glow]) s.step(dt);
    yaw += spin.x * dt;
    egg.rotation.set(tiltX.x, yaw + lean.x, tiltZ.x);
    scene.environmentRotation.set(0, envTurn.x, 0);
    scene.environmentIntensity = glow.x;
    warn.intensity = red.x * 40;
    renderer.render(scene, camera);
    raf = visible && !opts.still ? requestAnimationFrame(frame) : 0;
  };
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; if (visible) kick(); });
  io.observe(canvas);
  kick();

  return {
    setMood(next) {
      if (next === mood) return;
      mood = next;
      spin.target = next === "working" ? 1.6 : next === "listening" ? 0.08 : next === "guarding" ? 0 : 0.18;
      lean.target = next === "guarding" ? -0.9 : 0;
      red.target = next === "guarding" ? 1 : 0;
      glow.target = next === "listening" ? 1.25 : next === "paid" ? 1.4 : 1;
      if (next === "paid") envTurn.target += Math.PI * 2; // one full sweep of light: the glint
      if (next === "working") envTurn.target += Math.PI * 0.5;
      if (opts.still) requestAnimationFrame(frame); else kick();
    },
    look(x, y) {
      if (opts.still) return;
      tiltX.target = y * 0.18;
      tiltZ.target = -x * 0.12;
      kick();
    },
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      egg.geometry.dispose(); gold.dispose();
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}
