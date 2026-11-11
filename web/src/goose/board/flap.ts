// One split flap: a character on a drum of leaves. Changing it turns the drum forward one leaf at a time, each turn two
// half-leaves on the compositor (Web Animations, transform only). A new target mid-turn re-routes from the leaf showing,
// so a number that starts toward one value can be sent back (the limit "jam"). Plain DOM: a board is ~150 of these.

/** The drum's leaves, in turning order. Anything not on it is shown as a blank. */
export const DRUM = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$.,:'-&/+";
const MAX_STEPS = 6;

/** The leaves a flap shows on its way from `from` to `to`, the last one being `to`. Long trips skip to the last few. */
export function route(from: string, to: string): string[] {
  if (from === to) return [];
  const a = DRUM.indexOf(from), b = DRUM.indexOf(to);
  if (a < 0 || b < 0) return [to];
  const n = (b - a + DRUM.length) % DRUM.length;
  const first = n <= MAX_STEPS ? 1 : n - MAX_STEPS + 1;
  const out: string[] = [];
  for (let i = first; i <= n; i++) out.push(DRUM[(a + i) % DRUM.length]!);
  return out;
}

export const onDrum = (c: string): string => (DRUM.includes(c.toUpperCase()) ? c.toUpperCase() : " ");

const half = (cls: string, ch: string) => {
  const s = document.createElement("span");
  s.className = `gg-flap-half ${cls}`;
  const g = document.createElement("span");
  g.className = "gg-flap-glyph";
  g.textContent = ch;
  s.append(g);
  return s;
};
const put = (el: HTMLElement, ch: string) => { (el.firstChild as HTMLElement).textContent = ch; };

export class Flap {
  readonly el: HTMLSpanElement;
  private cur: string;
  private target: string;
  private busy = false;
  private wait = 0;
  private readonly top: HTMLElement;
  private readonly bot: HTMLElement;
  private readonly fall: HTMLElement;
  private readonly rise: HTMLElement;

  constructor(ch = " ", private readonly stepMs = 74) {
    this.cur = this.target = onDrum(ch);
    this.el = document.createElement("span");
    this.el.className = "gg-flap";
    this.top = half("gg-flap-top", this.cur);
    this.bot = half("gg-flap-bot", this.cur);
    this.fall = half("gg-flap-top gg-flap-fall", this.cur);
    this.rise = half("gg-flap-bot gg-flap-rise", this.cur);
    this.el.append(this.top, this.bot, this.fall, this.rise);
  }

  /** Show `ch` at once, no turning (reduced motion, a resize, a first paint). */
  set(ch: string) {
    clearTimeout(this.wait);
    this.cur = this.target = onDrum(ch);
    for (const h of [this.top, this.bot, this.fall, this.rise]) put(h, this.cur);
  }

  /** Turn toward `ch`, starting after `delay` ms unless already turning (then the new target is taken on the next leaf). */
  to(ch: string, delay = 0) {
    this.target = onDrum(ch);
    if (this.busy || this.target === this.cur) return;
    this.busy = true;
    clearTimeout(this.wait);
    this.wait = window.setTimeout(() => void this.run(), delay);
  }

  private async run() {
    while (this.target !== this.cur) {
      const next = route(this.cur, this.target)[0]!;
      await this.turn(next);
      this.cur = next;
    }
    this.busy = false;
  }

  private async turn(next: string) {
    const d = this.stepMs / 2;
    put(this.top, next);
    put(this.fall, this.cur);
    put(this.rise, next);
    this.el.dataset.turning = "1";
    const a = this.fall.animate([{ transform: "rotateX(0deg)" }, { transform: "rotateX(-90deg)" }], { duration: d, easing: "cubic-bezier(0.55, 0, 1, 0.45)", fill: "forwards" });
    await a.finished.catch(() => {});
    const b = this.rise.animate([{ transform: "rotateX(90deg)" }, { transform: "rotateX(-6deg)", offset: 0.82 }, { transform: "rotateX(0deg)" }], { duration: d * 1.15, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" });
    await b.finished.catch(() => {});
    put(this.bot, next);
    delete this.el.dataset.turning;
    a.cancel(); b.cancel();
  }

  destroy() { clearTimeout(this.wait); this.target = this.cur; }
}
