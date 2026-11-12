// The demo player (spec §6.1 part 1): recorded week 1 as one purchase in about 25 seconds, six moments. A theatre of two
// halves: the story column says what is happening in big words (and lists the six steps), the stage beside it shows it
// at full size. The limit is the golden egg: large on its own in the first moment, then docked above every moment after.
// One GSAP timeline plays it; the step list, Back, Forward, Pause and Replay drive the same timeline. With reduced motion
// there is no timeline: the settled moment shows, and stepping jumps instantly.
// The recording ends at the approve card: nobody tapped, so the last moment says so and makes no payment up.
import { usdOf } from "@goose/core/money";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { gsap } from "gsap";
import kettle from "virtual:goose-kettle";
import { Egg } from "../ui/Egg.tsx";
import { Nest } from "../ui/Nest.tsx";
import { Stamp } from "../ui/Stamp.tsx";
import { Provenance } from "../ui/Provenance.tsx";
import { CheckIcon, ClockIcon } from "../ui/icons.tsx";
import { PayPalMark } from "../ui/PayPalMark.tsx";
import { useReducedMotion } from "../ui/motion.ts";
import { hrefOf } from "../route.ts";
import { SCENES, SCENE_LABELS, captionOf, heroBeats, momentOf, stepTo, type HeroBeat, type Scene } from "./hero-beats.ts";
import { loadMotion } from "./gsap-lazy.ts";
import "./demo.css";

// When each moment starts, when it has settled (where Back/Forward land), and the end. Seconds.
const START = [0, 3.2, 7.8, 12.6, 16.8, 21.2] as const;
const SETTLE = [2.2, 7.6, 11.6, 16.2, 20.6, 24.2] as const;
const END = 25;
const LAST = SCENES.length - 1;

const GOOSE = `${import.meta.env.BASE_URL}site/goose-320.webp`;

const BEATS = heroBeats(kettle);
const of = <K extends HeroBeat["kind"]>(kind: K) => BEATS.filter((b): b is Extract<HeroBeat, { kind: K }> => b.kind === kind);
const BRIEF = of("brief")[0]!;
const SELLERS = of("seller");
const TICKS = of("haggle")[0]!.ticks;
const APPROVE = of("approve")[0]!;
const LIMIT_CENTS = Math.round(Number(BRIEF.limit.slice(1)) * 100);
const TOTAL_CENTS = Math.round(Number(APPROVE.total) * 100);
const CAPTIONS = SCENES.map((s) => captionOf(s, BEATS));
const MOMENTS = SCENES.map((s) => momentOf(s, BEATS));
const ENGRAVING = `Your nest egg · ${BRIEF.limit}`;

const sceneAt = (t: number): number => {
  let i = 0;
  for (let j = 0; j < START.length; j++) if (t >= START[j]! - 0.001) i = j;
  return i;
};

/** Dev only: `?beat=<n>` opens the scene settled on moment n, for screenshots of the middle of the purchase. */
const devBeat = (): number | null => {
  if (!import.meta.env.DEV) return null;
  const n = Number(new URLSearchParams(window.location.search).get("beat"));
  return Number.isInteger(n) && n >= 0 && n <= LAST && window.location.search.includes("beat=") ? n : null;
};

/** Dev only: `?t=<seconds>` parks the timeline at that second, for frames from the start, middle and end of a moment. */
const devTime = (): number | null => {
  if (!import.meta.env.DEV) return null;
  const raw = new URLSearchParams(window.location.search).get("t");
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= END ? n : null;
};

// The leaf over a gilded seller: six shards that meet along the crack lines, in the card's own percentages.
const SHARDS = [
  "0% 0%, 38% 0%, 30% 46%, 0% 58%",
  "38% 0%, 72% 0%, 62% 38%, 30% 46%",
  "72% 0%, 100% 0%, 100% 44%, 62% 38%",
  "0% 58%, 30% 46%, 44% 100%, 0% 100%",
  "30% 46%, 62% 38%, 76% 100%, 44% 100%",
  "62% 38%, 100% 44%, 100% 100%, 76% 100%",
] as const;
const CRACKS = ["38,0 30,46 0,58", "72,0 62,38 100,44", "30,46 62,38", "30,46 44,100", "62,38 76,100"] as const;
const FALL = [
  { x: -10, y: 36, rotation: -14 }, { x: -4, y: 28, rotation: 8 }, { x: 8, y: 40, rotation: 18 },
  { x: -6, y: 56, rotation: -10 }, { x: 4, y: 48, rotation: 12 }, { x: 10, y: 60, rotation: -6 },
] as const;

export function HeroScene({ hold }: { hold: number }) {
  const reduced = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const userPaused = useRef(false);
  const [scene, setScene] = useState<number>(() => devBeat() ?? (reduced ? LAST : 0));
  const [playing, setPlaying] = useState(false);
  const [stepped, setStepped] = useState(false);
  // GSAP loads after the first paint: the stage stays armed (hidden) until the timeline exists, and `seen` remembers
  // whether the scene was already on screen by then, so it still starts playing.
  const [armed, setArmed] = useState(() => !reduced);
  const seen = useRef(false);

  useEffect(() => {
    if (reduced) { tl.current = null; setArmed(false); return; }
    let ctx: { revert: () => void } | null = null;
    let gone = false;
    loadMotion().then(({ gsap, ease }) => {
      if (gone || !root.current) return;
      const { out: OUT, inOut: IN_OUT, drawer: DRAWER } = ease;
      ctx = gsap.context(() => {
        const t = gsap.timeline({
          paused: true,
          onUpdate: () => setScene(sceneAt(t.time())),
          onComplete: () => setPlaying(false),
        });
        // The stamp's press (spec §7): 90ms, down past flat, then back.
        const strike = (target: string, at: number) => {
          t.fromTo(target, { scale: 1.12, opacity: 0 }, { scale: 0.97, opacity: 1, duration: 0.063, ease: OUT }, at);
          t.to(target, { scale: 1, duration: 0.027, ease: OUT }, at + 0.063);
        };

        // 1. The limit: the egg arrives, the goose steps up beside it, then the item it is shopping for.
        t.fromTo(".hs-bh-egg", { y: 20, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: OUT }, 0.1);
        t.fromTo(".hs-bh-goose", { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.7, ease: OUT }, 0.35);
        t.fromTo(".hs-bh-tag", { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: OUT }, 0.9);

        // 2. Every seller drawn across the stage: the card slides as its streak is drawn; a fair one is struck Clear.
        SELLERS.forEach((s, i) => {
          const at = START[1] + 0.2 + i * 1.25;
          const card = `.hs-card[data-i="${i}"]`;
          t.fromTo(card, { xPercent: -4, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.6, ease: OUT }, at);
          t.fromTo(`${card} .hs-streak`, { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: IN_OUT }, at);
          if (s.verdict === "aside") {
            t.fromTo(`${card} .hs-sheen`, { xPercent: -120 }, { xPercent: 120, duration: 0.9, ease: IN_OUT }, at + 0.6);
            strike(`${card} .hs-strike`, START[2] + 3);
          } else {
            strike(`${card} .hs-strike`, at + 0.75);
          }
        });

        // 3. The refusal: the others step back, the leaf cracks and falls, the flagged sentences light, the egg shudders
        //    and holds at the limit, then the stamp.
        const r = START[2];
        t.to(".hs-card:not([data-gilded])", { opacity: 0.4, duration: 0.32, ease: OUT }, r + 0.1);
        t.fromTo(".hs-crack-lines", { clipPath: "inset(0% 100% 0% 0%)", opacity: 1 }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.45, ease: IN_OUT }, r + 0.4);
        // The flakes fall under gravity but fade fast, so the words are never left half-lit on half a coat of gold.
        t.to(".hs-shard", { x: (i: number) => FALL[i]!.x, y: (i: number) => FALL[i]!.y, rotation: (i: number) => FALL[i]!.rotation, duration: 0.8, ease: "power2.in", stagger: 0.05 }, r + 0.9);
        t.to(".hs-shard", { opacity: 0, duration: 0.45, ease: OUT, stagger: 0.05 }, r + 0.9);
        t.to(".hs-crack-lines", { opacity: 0, duration: 0.2 }, r + 1.3);
        t.fromTo(".hs-card[data-gilded]", { "--cracked": 0 }, { "--cracked": 1, duration: 0.2, ease: OUT }, r + 1.15);
        t.fromTo(".hs-flag", { "--lit": 0 }, { "--lit": 1, duration: 0.4, ease: OUT, stagger: 0.6 }, r + 1.8);
        t.to(".hs-dock-egg", { keyframes: { x: [0, -3, 3, -2, 1, 0], rotation: [0, -2, 2, -1, 0.5, 0] }, duration: 0.5, ease: "none" }, r + 1.8);
        t.fromTo(".hs-ring", { scale: 0.8, opacity: 0.7 }, { scale: 1.6, opacity: 0, duration: 0.7, ease: OUT, immediateRender: false }, r + 1.9);
        // "Held" stays beside the limit until the haggle begins.
        t.fromTo(".hs-dock", { "--held": 0 }, { "--held": 1, duration: 0.2, ease: OUT }, r + 1.9);
        t.to(".hs-dock", { "--held": 0, duration: 0.3, ease: OUT }, START[3]);

        // 4. The haggle: each round's ask arrives, its bar drawn against the limit, the big figure counting down with it;
        //    round 3's AI suggestion is struck through where code offered less.
        TICKS.forEach((tick, i) => {
          const at = START[3] + 0.2 + i * 1.1;
          t.fromTo(`.hs-rung[data-i="${i}"]`, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.32, ease: OUT }, at);
          t.fromTo(`.hs-rung[data-i="${i}"] .hs-bar-fill`, { scaleX: 0 }, { scaleX: Math.round(Number(tick.price) * 100) / LIMIT_CENTS, duration: 0.6, ease: OUT }, at + 0.05);
          const from = i === 0 ? Number(tick.price) : Number(TICKS[i - 1]!.price);
          const counter = { v: from };
          t.fromTo(counter, { v: i === 0 ? Number(tick.price) : from }, {
            v: Number(tick.price), duration: 0.6, ease: OUT,
            // The text node React rendered, changed in place, so React's own node stays the one on the page.
            onUpdate: () => { const text = root.current?.querySelector(".hs-now")?.firstChild; if (text) text.nodeValue = usdOf(counter.v.toFixed(2)); },
          }, at);
          if (tick.goose?.proposed) t.fromTo(`.hs-rung[data-i="${i}"] .hs-was-line`, { scaleX: 0 }, { scaleX: 1, duration: 0.32, ease: IN_OUT }, at + 0.6);
        });
        t.fromTo(".hs-haggle-head", { opacity: 0 }, { opacity: 1, duration: 0.32, ease: OUT }, START[3] + 0.2);

        // 5. The approve card rises like the sheet it is, the goose waits beside it, then its lines, then light crosses Approve.
        const a = START[4];
        t.fromTo(".hs-sheet", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: DRAWER }, a + 0.1);
        t.fromTo(".hs-ap-goose", { x: -20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: OUT }, a + 0.4);
        t.fromTo(".hs-sheet-line", { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.32, ease: OUT, stagger: 0.05 }, a + 0.12);
        t.fromTo(".hs-sheet .nest", { "--share": 0 }, { "--share": TOTAL_CENTS / LIMIT_CENTS, duration: 0.8, ease: OUT }, a + 0.7);
        t.fromTo(".hs-plate-sheen", { xPercent: -120 }, { xPercent: 120, duration: 0.9, ease: IN_OUT }, a + 1.4);

        // 6. The outcome: nobody tapped. The egg stays whole, the goose sits beside it, each line lands as a plain fact.
        const o = START[5];
        t.fromTo(".hs-out-egg", { y: 16, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: OUT }, o + 0.1);
        t.fromTo(".hs-out-goose", { x: -20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: OUT }, o + 0.3);
        t.fromTo(".hs-out-line", { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.36, ease: OUT, stagger: 0.18 }, o + 0.5);
        t.fromTo(".hs-out-actions", { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.36, ease: OUT }, o + 1.4);

        // The step list's fill follows the timeline, one segment per moment.
        START.forEach((s, i) => t.fromTo(`.hs-seg[data-i="${i}"] .hs-seg-fill`, { scaleX: 0 }, { scaleX: 1, duration: (START[i + 1] ?? END) - s, ease: "none" }, s));
        t.set({}, {}, END);

        tl.current = t;
        const at = devTime();
        if (at !== null) {
          userPaused.current = true;
          t.seek(at, false);
          setScene(sceneAt(at));
        }
        const dev = at === null ? devBeat() : null;
        if (dev !== null) {
          userPaused.current = true;
          t.seek(SETTLE[dev]!, false);
          setScene(dev);
        }
      }, root);
      setArmed(false);
      if (seen.current && !userPaused.current) { tl.current?.play(); setPlaying(true); }
    }, () => { if (!gone) { setArmed(false); setScene(LAST); } });
    return () => { gone = true; ctx?.revert(); tl.current = null; };
  }, [reduced]);

  // Play while the scene is on screen; pause while it isn't, unless the visitor paused it themselves.
  useEffect(() => {
    if (reduced || !root.current) return;
    const io = new IntersectionObserver(([e]) => {
      seen.current = e?.isIntersecting === true;
      const t = tl.current;
      if (!t || userPaused.current) return;
      if (e?.isIntersecting && t.progress() < 1) { t.play(); setPlaying(true); }
      else if (!e?.isIntersecting) { t.pause(); setPlaying(false); }
    }, { threshold: 0.35 });
    io.observe(root.current);
    return () => io.disconnect();
  }, [reduced]);

  // The scene stops when the visitor starts on the Ask box.
  useEffect(() => {
    if (hold === 0) return;
    userPaused.current = true;
    tl.current?.pause();
    setPlaying(false);
  }, [hold]);

  const go = (i: number) => {
    setStepped(true);
    userPaused.current = true;
    setPlaying(false);
    if (tl.current) { tl.current.pause(); tl.current.seek(SETTLE[i]!, false); }
    setScene(i);
  };
  const toggle = () => {
    const t = tl.current;
    if (!t) return;
    if (t.isActive()) { userPaused.current = true; t.pause(); setPlaying(false); return; }
    userPaused.current = false;
    if (t.progress() >= 1) t.restart(); else t.play();
    setPlaying(true);
  };
  const replay = () => {
    const t = tl.current;
    if (!t) { go(0); return; }
    userPaused.current = false;
    t.restart();
    setPlaying(true);
  };

  const name = SCENES[scene] as Scene;
  const done = !reduced && !playing && scene === LAST;
  const moment = MOMENTS[scene]!;
  return (
    <figure ref={root} className="hs" data-mode={reduced ? "still" : "play"} data-scene={name} data-arm={armed ? "" : undefined} aria-labelledby="hs-title" aria-describedby="hs-line">
      <div className="hs-story">
        <div className="hs-head">
          <p className="hs-kicker">
            <Provenance kind="recorded" />
            <span className="hs-step-count">Step {scene + 1} of {SCENES.length}</span>
          </p>
          <div className="hs-words">
            <h3 id="hs-title" className="hs-title" aria-live={stepped || reduced ? "polite" : "off"}><span key={name} className="hs-in">{moment.title}</span></h3>
            <p id="hs-line" className="hs-line"><span key={name} className="hs-in">{moment.line}</span></p>
          </div>
          <p className="vh" aria-live="polite">{stepped || reduced ? CAPTIONS[scene] : ""}</p>
        </div>

        <figcaption className="hs-foot">
          <ol className="hs-steps" role="list" aria-label="The six steps of the purchase">
            {SCENES.map((s, i) => (
              <li key={s} className="hs-step" data-past={i < scene ? "" : undefined} data-now={i === scene ? "" : undefined}>
                <button type="button" className="hs-step-btn" onClick={() => go(i)} aria-current={i === scene ? "step" : undefined}>
                  <span className="hs-step-n figure" aria-hidden="true">{i < scene ? <CheckIcon size={14} /> : i + 1}</span>
                  {/* The name is the visible words, the step's number said first (axe: label-content-name-mismatch). */}
                  <span className="vh">Step {i + 1}: </span><span className="hs-step-l">{SCENE_LABELS[s]}</span>
                </button>
                <span className="hs-seg" data-i={i} aria-hidden="true"><span className="hs-seg-fill" /></span>
              </li>
            ))}
          </ol>
          <div className="hs-buttons">
            <SceneButton label="Back one step" onClick={() => go(stepTo(scene, -1, SCENES.length))} disabled={scene === 0}><BackIcon /></SceneButton>
            {reduced ? null : (
              <SceneButton label={playing ? "Pause" : done ? "Play again" : "Play"} onClick={toggle}>{playing ? <PauseIcon /> : <PlayIcon />}</SceneButton>
            )}
            <SceneButton label="Forward one step" onClick={() => go(stepTo(scene, 1, SCENES.length))} disabled={scene === LAST}><ForwardIcon /></SceneButton>
            {reduced ? null : <SceneButton label="Replay from the start" onClick={replay}><ReplayIcon /></SceneButton>}
          </div>
        </figcaption>
      </div>

      <div className="hs-stage">
        <BriefHero />
        <Dock />
        <div className="hs-panels">
          <ol className="hs-sellers" role="list" aria-label="Sellers tested" data-panel="sellers">
            {SELLERS.map((s, i) => <SellerCard key={s.name} seller={s} i={i} />)}
          </ol>
          <Haggle />
          <ApproveCard />
          <Outcome />
        </div>
      </div>
    </figure>
  );
}

function GooseArt({ className }: { className: string }) {
  return <img className={className} src={GOOSE} alt="" width={216} height={320} decoding="async" draggable={false} />;
}

function BriefHero() {
  return (
    <div className="hs-brief" data-panel="brief">
      <div className="hs-bh-pair">
        <GooseArt className="hs-bh-goose" />
        <span className="hs-bh-egg"><Egg size="l" engraving={ENGRAVING} /></span>
      </div>
      <p className="hs-bh-tag"><span>Shopping for</span> <strong>{BRIEF.item}</strong></p>
    </div>
  );
}

/** The limit, settled above every moment after the first: the egg that cannot be raised, and the item it is for. */
function Dock() {
  return (
    <div className="hs-dock" aria-hidden="true">
      <span className="hs-dock-egg"><span className="hs-ring" /><Egg size="m" engraving={ENGRAVING} /></span>
      <span className="hs-dock-words">
        <span className="hs-dock-k">Your limit</span>
        <strong className="hs-dock-limit figure">{BRIEF.limit}</strong>
      </span>
      <span className="hs-dock-held">Held</span>
      <span className="hs-dock-item">{BRIEF.item}</span>
    </div>
  );
}

function SellerCard({ seller, i }: { seller: Extract<HeroBeat, { kind: "seller" }>; i: number }) {
  const gilded = seller.verdict === "aside";
  const [plain, fiction] = splitFiction(seller.name);
  return (
    <li className="hs-card" data-i={i} data-verdict={seller.verdict} data-gilded={gilded ? "" : undefined}>
      {gilded ? (
        <span className="hs-leaf" aria-hidden="true">
          {SHARDS.map((p) => <span key={p} className="hs-shard" style={{ clipPath: `polygon(${p})` }} />)}
          <span className="hs-sheen" />
          <svg className="hs-crack-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
            {CRACKS.map((p) => <polyline key={p} className="hs-crack" points={p} />)}
          </svg>
        </span>
      ) : null}
      <div className="hs-card-row">
        <span className="hs-name">{plain}{fiction ? <span className="hs-fiction"> {fiction}</span> : null}</span>
        <span className="hs-price figure">{usdOf(seller.price)}</span>
      </div>
      {seller.note ? (
        <p className="hs-note">
          “{seller.note.map((n, j) => (
            <span key={j}>{j > 0 ? " " : ""}{n.flagged ? <mark className="hs-flag">{n.text}</mark> : n.text}</span>
          ))}”
        </p>
      ) : null}
      <span className="hs-strike"><Stamp verdict={seller.verdict} {...(seller.reason ? { reason: seller.reason } : {})} /></span>
      <span className="hs-streak" aria-hidden="true" />
    </li>
  );
}

function Haggle() {
  const deal = splitFiction(APPROVE.seller);
  const last = TICKS.at(-1)!;
  return (
    <div className="hs-haggle" data-panel="haggle">
      <div className="hs-haggle-head">
        <span className="hs-haggle-who">
          <span className="hs-haggle-k">Now asking</span>
          <span className="hs-name">{deal[0]}{deal[1] ? <span className="hs-fiction"> {deal[1]}</span> : null}</span>
        </span>
        <span className="hs-now figure" aria-hidden="true">{usdOf(last.price)}</span>
      </div>
      <ol className="hs-ladder" role="list" aria-label="The haggle, round by round">
        {TICKS.map((t, i) => (
          <li key={t.round} className="hs-rung" data-i={i} data-deal={i === TICKS.length - 1 ? "" : undefined}>
            <span className="hs-round">Round {t.round}</span>
            <span className="hs-bar" aria-hidden="true">
              <span className="hs-bar-fill" style={{ transform: `scaleX(${Math.round(Number(t.price) * 100) / LIMIT_CENTS})` }} />
            </span>
            <span className="hs-ask"><span className="hs-ask-k">Asks</span> <strong className="figure">{usdOf(t.price)}</strong></span>
            {t.goose ? (
              <span className="hs-goose">
                {t.goose.proposed ? (
                  <>
                    <span className="hs-was">{t.goose.proposed.ai ? "AI" : "Rule"} suggested <span className="hs-was-figure figure">{usdOf(t.goose.proposed.price)}<span className="hs-was-line" aria-hidden="true" /></span></span>
                    <span className="hs-dot" aria-hidden="true">·</span>
                    <span className="hs-code">code offered <strong className="figure">{usdOf(t.goose.price)}</strong></span>
                  </>
                ) : (
                  <span>Goose offered <span className="figure">{usdOf(t.goose.price)}</span></span>
                )}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="hs-limit-key" aria-hidden="true"><span className="hs-limit-tick" />A full bar is your {BRIEF.limit} limit</p>
    </div>
  );
}

function ApproveCard() {
  const [plain, fiction] = splitFiction(APPROVE.seller);
  return (
    <div className="hs-approve" data-panel="approve">
      <GooseArt className="hs-ap-goose" />
      <div className="hs-sheet">
        <p className="hs-sheet-line hs-sheet-k">You approve</p>
        <p className="hs-sheet-line hs-payee">{plain}{fiction ? <span className="hs-fiction"> {fiction}</span> : null}</p>
        <p className="hs-sheet-line hs-total figure">{usdOf(APPROVE.total)}</p>
        <div className="hs-sheet-line"><Nest limit={LIMIT_CENTS} spend={TOTAL_CENTS} spendWords="if you approve" /></div>
        <ul className="hs-facts" role="list">
          <li className="hs-sheet-line"><span><span className="figure">{usdOf(APPROVE.below)}</span> below their ask</span></li>
          <li className="hs-sheet-line"><ClockIcon size={16} /> Expires in {APPROVE.minutes} minutes</li>
        </ul>
        <div className="hs-sheet-line hs-plate">
          <span className="hs-plate-sheen" aria-hidden="true" />
          <PayPalMark />
          <span className="hs-plate-words">Approve {usdOf(APPROVE.total)}</span>
        </div>
      </div>
    </div>
  );
}

/** What the recording really ends with: the approve card was never tapped. Nothing here is a payment, a receipt or an id. */
function Outcome() {
  return (
    <div className="hs-outcome" data-panel="outcome">
      <div className="hs-out-pair">
        <GooseArt className="hs-out-goose" />
        <span className="hs-out-egg"><Egg size="l" engraving={ENGRAVING} /></span>
      </div>
      <dl className="hs-out-facts">
        <div className="hs-out-line"><dt>Your tap</dt><dd>Not given</dd></div>
        <div className="hs-out-line"><dt>PayPal order</dt><dd>None made</dd></div>
        <div className="hs-out-line"><dt>Money moved</dt><dd>None</dd></div>
        <div className="hs-out-line"><dt>Your limit</dt><dd><span className="figure">{BRIEF.limit}</span>, still yours</dd></div>
      </dl>
      <p className="hs-out-actions">
        <a className="hs-cta" href={hrefOf("shop")}>Try it yourself</a>
        <a className="hs-out-link" href={hrefOf("proof", "sources")}>See the recorded sandbox payments</a>
      </p>
    </div>
  );
}

/** "Reedbank Outfitters (fictional)" → ["Reedbank Outfitters", "(fictional)"], so the label keeps its own quieter ink. */
function splitFiction(name: string): [string, string | null] {
  const m = /^(.*?)\s*(\(fictional\))$/.exec(name);
  return m ? [m[1]!, m[2]!] : [name, null];
}

function SceneButton({ label, onClick, disabled, children }: { label: string; onClick(): void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className="hs-btn" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

const Svg = ({ children }: { children: ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
);
const BackIcon = () => <Svg><path d="M15 6l-6 6 6 6" /></Svg>;
const ForwardIcon = () => <Svg><path d="M9 6l6 6-6 6" /></Svg>;
const PauseIcon = () => <Svg><path d="M9 6v12M15 6v12" /></Svg>;
const PlayIcon = () => <Svg><path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none" /></Svg>;
const ReplayIcon = () => <Svg><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /></Svg>;
