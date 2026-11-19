"use client";

import { FilmCanvas } from "@/components/landing/film-canvas";
import { motion, useTransform, type MotionValue } from "motion/react";

/**
 * The two doorways of the journey, each driven by the transition's clock
 * (`departure`, 0→1 over the transition's length).
 *
 * **The ascent** (home → name). The homepage is a sea at golden hour; leaving
 * it, the camera dives forward over the swells, rises, and turns into the sun
 * (`public/film/ascent`, rendered from the same Blender scene, so its first
 * frame is the homepage's first frame). Left from further down the page — at
 * sunset, or after dark — the evening first runs back to golden hour, so the
 * cut is never a jump in time. The sun then blooms over everything and the
 * name page comes up out of the light.
 *
 * **The name** (name → music). The name just given is written large, a line —
 * the product's one line — draws beneath it, catches a pulse as if it were
 * listening, and the whole thing lifts away into the music page.
 */

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const x = clamp(v);
  return x * x * (3 - 2 * x);
};

/* ----------------------------------------------------------------- ascent -- */

/**
 * Leaving the homepage: **the horizon becomes your line.**
 *
 * The sea holds still on exactly the frame on screen. A thread of light
 * ignites at the sun and runs out along the horizon; then the world parts
 * there — the sky lifts away, the sea falls away — and the thread, left
 * hanging in the gap, starts to move like sound. Through the opening is the
 * name page: the same sea, from high above. Nothing streams in mid-shot (the
 * frame is the one already shown), so it cannot stutter.
 *
 * (Kept as `AscentField`/`ascentTiming` so the transition provider is unchanged.)
 */
const SEA = { width: 1920, height: 1080, count: 144, horizon: 651 };
const T_IN = 0.22;
const T_IGNITE = 0.3;
const IGNITE = 0.55;
const T_PART = 0.78;
const PART = 1.25;
const T_OUT = 2.15;
const OUT = 0.5;
const TOTAL = T_OUT + OUT;

/** Unchanged signature: the moment leaves from no longer needs a rewind. */
export const rewindSeconds = (from: number) => (from > 1 ? 0 : 0);

export function ascentTiming(from: number) {
  void from;
  // The name page loads behind at once: the opening reveals it.
  return { duration: TOTAL * 1000, handoff: 0.3 * 1000 };
}

/** Slow to leave, slow to arrive. */
const glide = (x: number) => {
  const v = clamp(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};

/** The frame on screen, and where its horizon falls once cover-fitted to the window. */
function frameAt(from: number) {
  const i = Math.round(clamp(from) * (SEA.count - 1)) + 1;
  const w = typeof window === "undefined" ? 1440 : window.innerWidth;
  const h = typeof window === "undefined" ? 900 : window.innerHeight;
  const scale = Math.max(w / SEA.width, h / SEA.height);
  const y = (h - SEA.height * scale) / 2 + SEA.horizon * scale;
  // The sun sits a little right of centre in the film.
  const sunX = (w - SEA.width * scale) / 2 + SEA.width * 0.62 * scale;
  return { src: `/film/sea/frames/${String(i).padStart(4, "0")}.webp`, y, w, h, sunX };
}

const WAVE_N = 220;

/**
 * The thread as a plucked string: a ripple leaves the sun and travels both
 * ways along the horizon — each crest a little lower as it goes, nothing
 * moving where the wave has not yet reached — and the whole line slowly
 * settles. Smoothed through midpoints, so it reads as light, not as a graph.
 */
function threadPath(w: number, x0: number, tau: number, amp: number, shift = 0) {
  const pts: [number, number][] = [];
  const k = (Math.PI * 2) / (w * 0.16); // wavelength: a sixth of the screen
  const front = tau * w * 0.62; // how far the ripple has run
  for (let i = 0; i <= WAVE_N; i++) {
    const x = (i / WAVE_N) * w;
    // Softened at the source, so the two directions meet in a curve, not a kink.
    const dist = Math.hypot(x - x0, w * 0.012);
    const reached = Math.min(1, Math.max(0, (front - dist) / (w * 0.12)));
    const decay = Math.exp(-dist / (w * 0.55));
    const settle = Math.exp(-tau * 0.9);
    const y = amp * reached * decay * settle * Math.sin(dist * k - tau * 9 + shift);
    pts.push([x, y]);
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    d += ` Q${x.toFixed(1)},${y.toFixed(1)} ${((x + nx) / 2).toFixed(1)},${((y + ny) / 2).toFixed(1)}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return `${d} L${lx.toFixed(1)},${ly.toFixed(1)}`;
}

export function AscentField({ departure, from }: { departure: MotionValue<number>; from: number }) {
  const frame = frameAt(from);
  const t = (p: number) => p * TOTAL;

  const shown = useTransform(departure, (p) => smooth(t(p) / T_IN) * (1 - smooth((t(p) - T_OUT) / OUT)));
  const ignite = useTransform(departure, (p) => smooth((t(p) - T_IGNITE) / IGNITE));
  const part = useTransform(departure, (p) => glide((t(p) - T_PART) / PART));
  const skyY = useTransform(part, (v) => -v * (frame.y + 60));
  const seaY = useTransform(part, (v) => v * (frame.h - frame.y + 60));
  const tilt = useTransform(part, (v) => 1 + v * 0.06);
  const dim = useTransform(part, (v) => `brightness(${1 - v * 0.35}) blur(${(v * 3).toFixed(2)}px)`);
  // The thread: flat while it ignites, sound once the world has parted.
  // Plucked as the world parts; the ripple's own clock starts then.
  const tau = (p: number) => Math.max(0, t(p) - T_PART + 0.1);
  const pluck = (p: number) => smooth((t(p) - T_PART + 0.1) / 0.35) * 30;
  const d = useTransform(departure, (p) => threadPath(frame.w, frame.sunX, tau(p), pluck(p)));
  // Two fainter strands, a beat apart: the string's shimmer.
  const dWarm = useTransform(departure, (p) =>
    threadPath(frame.w, frame.sunX, tau(p), pluck(p) * 0.78, 0.55),
  );
  const dCool = useTransform(departure, (p) =>
    threadPath(frame.w, frame.sunX, tau(p), pluck(p) * 0.62, -0.6),
  );
  const lineOpacity = useTransform(
    departure,
    (p) => smooth((t(p) - T_IGNITE) / 0.15) * (1 - smooth((t(p) - T_OUT + 0.25) / 0.4)),
  );
  const reach = useTransform(ignite, (v) => v);
  const flare = useTransform(departure, (p) => {
    const x = (t(p) - T_IGNITE) / 0.9;
    return x <= 0 ? 0 : Math.max(0, 1 - Math.abs(x - 0.3) / 0.7);
  });
  const origin = `${((frame.sunX / frame.w) * 100).toFixed(1)}% 50%`;

  return (
    <motion.div className="absolute inset-0" style={{ opacity: shown }} data-ascent="horizon">
      {/* The sky, lifting away. */}
      <motion.div
        className="absolute inset-0 overflow-hidden"
        style={{ y: skyY, clipPath: `inset(0 0 ${frame.h - frame.y}px 0)`, filter: dim }}
      >
        <motion.img
          src={frame.src}
          alt=""
          className="absolute inset-0 size-full object-cover"
          style={{ scale: tilt, transformOrigin: `${origin.split(" ")[0]} ${frame.y}px` }}
        />
      </motion.div>
      {/* The sea, falling away. */}
      <motion.div
        className="absolute inset-0 overflow-hidden"
        style={{ y: seaY, clipPath: `inset(${frame.y}px 0 0 0)`, filter: dim }}
      >
        <motion.img
          src={frame.src}
          alt=""
          className="absolute inset-0 size-full object-cover"
          style={{ scale: tilt, transformOrigin: `${origin.split(" ")[0]} ${frame.y}px` }}
        />
      </motion.div>
      {/* Light spilling out of the opening. */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 mix-blend-screen"
        style={{
          top: frame.y - 220,
          height: 440,
          opacity: useTransform(part, (v) => Math.min(1, v * 2.2) * (1 - v * 0.6)),
          background:
            "radial-gradient(60% 50% at 50% 50%, rgb(255 214 170 / 0.5), rgb(255 138 98 / 0.15) 45%, transparent 75%)",
        }}
      />
      {/* The thread: ignites at the sun, runs the horizon, then moves like sound. */}
      <motion.svg
        className="pointer-events-none absolute inset-x-0 overflow-visible"
        style={{
          top: frame.y,
          opacity: lineOpacity,
          filter: "drop-shadow(0 0 6px rgb(255 214 170 / 0.9)) drop-shadow(0 0 22px rgb(255 138 98 / 0.6))",
        }}
        width={frame.w}
        height={1}
        viewBox={`0 0 ${frame.w} 1`}
      >
        <defs>
          <linearGradient id="thread" x1="0" x2={frame.w} y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ff8a62" stopOpacity="0" />
            <stop offset="0.25" stopColor="#ffb07a" />
            <stop offset="0.6" stopColor="#fff2df" />
            <stop offset="0.85" stopColor="#ff8aa4" />
            <stop offset="1" stopColor="#c86be0" stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.g style={{ scaleX: reach, transformOrigin: `${frame.sunX}px 0px` }}>
          {/* A wide, soft bloom under the core. */}
          <motion.path
            d={d}
            fill="none"
            stroke="rgb(255 190 140 / 0.28)"
            strokeWidth={9}
            strokeLinecap="round"
            style={{ filter: "blur(5px)" }}
          />
          <motion.path
            d={dWarm}
            fill="none"
            stroke="rgb(255 176 122 / 0.55)"
            strokeWidth={1.1}
            strokeLinecap="round"
          />
          <motion.path
            d={dCool}
            fill="none"
            stroke="rgb(242 167 184 / 0.45)"
            strokeWidth={1}
            strokeLinecap="round"
          />
          <motion.path d={d} fill="none" stroke="url(#thread)" strokeWidth={2} strokeLinecap="round" />
          <motion.path
            d={d}
            fill="none"
            stroke="rgb(255 250 242 / 0.9)"
            strokeWidth={0.7}
            strokeLinecap="round"
          />
        </motion.g>
      </motion.svg>
      {/* The spark where it begins. */}
      <motion.div
        className="pointer-events-none absolute size-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen"
        style={{
          left: frame.sunX,
          top: frame.y,
          opacity: flare,
          background:
            "radial-gradient(circle, rgb(255 250 240 / 0.95) 0%, rgb(255 214 170 / 0.5) 18%, transparent 62%)",
        }}
      />
    </motion.div>
  );
}

/* ------------------------------------------------------------------- dive -- */

/**
 * **The dive** (music → analysis). The journey began by rising off the sea into
 * the sun; handing over the music, it goes back down. The ascent runs in
 * reverse — out of the light, down over the swells to the water — then the
 * waterline climbs the screen and the camera is under the surface, light
 * moving overhead, as the songs are taken in. The deep water settles into the
 * analysis page's own dusk, so the page comes up dark onto dark.
 */
const D_IN = 0.35;
const D_FILM = 2.4;
const D_PLUNGE_AT = 2.15;
const D_PLUNGE = 0.85;
const D_SETTLE_AT = 3.25;
const D_SETTLE = 0.55;
const D_OUT_AT = 3.8;
const D_OUT = 0.5;
const D_TOTAL = D_OUT_AT + D_OUT;

export const DIVE_TIMING = { duration: D_TOTAL * 1000, handoff: (D_PLUNGE_AT + 0.75) * 1000 };

/** The waterline: a wavy edge, drawn once, raised by transform. */
const WATERLINE = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const x = (i / 48) * 1000;
    const y = 40 + 14 * Math.sin(i * 0.55) + 7 * Math.sin(i * 1.7 + 1.3);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M0,1000 L${pts.join(" L")} L1000,1000 Z`;
})();

export function DiveField({ departure }: { departure: MotionValue<number> }) {
  const t = (p: number) => p * D_TOTAL;
  const shown = useTransform(departure, (p) => smooth(t(p) / D_IN) * (1 - smooth((t(p) - D_OUT_AT) / D_OUT)));
  // Down out of the sky: the ascent, backwards, easing into the water.
  const descent = useTransform(departure, (p) => 1 - smooth((t(p) - D_IN * 0.5) / D_FILM));
  const plunge = useTransform(departure, (p) => smooth((t(p) - D_PLUNGE_AT) / D_PLUNGE));
  const rise = useTransform(plunge, (v) => `${(1 - v) * 105 - 8}%`);
  const under = useTransform(plunge, (v) => smooth((v - 0.55) / 0.45));
  const drift = useTransform(departure, (p) => `${-t(p) * 22}px`);
  const settle = useTransform(departure, (p) => smooth((t(p) - D_SETTLE_AT) / D_SETTLE));
  const words = useTransform(
    departure,
    (p) => smooth((t(p) - D_PLUNGE_AT - 0.55) / 0.4) * (1 - smooth((t(p) - D_SETTLE_AT - 0.1) / 0.35)),
  );

  return (
    <motion.div className="absolute inset-0 bg-[#0b0913]" style={{ opacity: shown }} data-dive>
      <FilmCanvas src="/film/ascent" progress={descent} />
      {/* The waterline, climbing the screen: the camera going under. */}
      <motion.svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 h-[130%] w-full"
        style={{ top: rise }}
      >
        <defs>
          <linearGradient id="dive-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgb(200 232 236)" stopOpacity="0.42" />
            <stop offset="0.035" stopColor="rgb(52 104 128)" stopOpacity="0.78" />
            <stop offset="0.14" stopColor="rgb(20 52 76)" stopOpacity="0.94" />
            <stop offset="0.5" stopColor="rgb(12 30 50)" />
            <stop offset="1" stopColor="rgb(8 14 30)" />
          </linearGradient>
        </defs>
        <path d={WATERLINE} fill="url(#dive-water)" />
        {/* The meniscus: a thin line of light where air meets water. */}
        <path
          d={WATERLINE.replace(/^M0,1000 L/, "M").replace(/ L1000,1000 Z$/, "")}
          fill="none"
          stroke="rgb(235 248 250 / 0.7)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </motion.svg>
      {/* Under the surface: light moving overhead, shafts reaching down. */}
      <motion.div className="pointer-events-none absolute inset-0" style={{ opacity: under }}>
        <div className="absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_-10%,rgb(70_150_170/0.55),rgb(14_40_62/0.95)_55%,rgb(8_14_30))]" />
        <motion.div
          className="absolute inset-0 opacity-40 mix-blend-screen"
          style={{
            backgroundPositionX: drift,
            backgroundImage:
              "repeating-radial-gradient(ellipse 140px 60px at 30% 0%, rgb(170 230 240 / 0.18) 0 2px, transparent 3px 26px), repeating-radial-gradient(ellipse 200px 80px at 70% 4%, rgb(170 230 240 / 0.14) 0 2px, transparent 3px 34px)",
          }}
        />
        <div className="absolute inset-0 bg-[conic-gradient(from_180deg_at_50%_-20%,transparent_42%,rgb(160_220_235/0.12)_46%,transparent_50%,rgb(160_220_235/0.1)_53%,transparent_57%)]" />
      </motion.div>
      <motion.p
        className="pointer-events-none absolute inset-x-0 top-[46%] text-center font-display text-[clamp(1.6rem,3.4vw,3rem)] text-[rgb(220_240_244/0.9)] italic"
        style={{ opacity: words }}
      >
        Under the surface of your music.
      </motion.p>
      {/* The deep water becomes the analysis page's dusk. */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: settle,
          background:
            "radial-gradient(60% 50% at 85% 100%, rgb(150 70 48 / 0.45), transparent 75%), radial-gradient(90% 70% at 50% 40%, rgb(38 24 34), rgb(16 11 22) 70%)",
        }}
      />
    </motion.div>
  );
}

/* ------------------------------------------------------------------- name -- */

export const NAME_TIMING = { duration: 3600, handoff: 2200 };

const W = 1000;
const H = 180;
const N = 96;

/** The product's one line: a gentle sound signature, as the landing draws it. */
function signature(x: number) {
  return (
    H / 2 -
    26 * Math.exp(-(((x - 0.1) / 0.12) ** 2)) +
    10 * Math.exp(-(((x - 0.42) / 0.16) ** 2)) -
    18 * Math.exp(-(((x - 0.72) / 0.07) ** 2)) +
    8 * Math.exp(-(((x - 0.9) / 0.06) ** 2))
  );
}

/** The same line, listening: a waveform swelling through the middle. */
function listening(x: number, phase: number) {
  const envelope = Math.sin(Math.PI * x) ** 1.6;
  return signature(x) * 0.25 + (H / 2) * 0.75 + 46 * envelope * Math.sin(2 * Math.PI * (x * 15 + phase));
}

function path(y: (x: number) => number) {
  let d = "";
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    d += `${i ? "L" : "M"}${(x * W).toFixed(1)} ${y(x).toFixed(1)} `;
  }
  return d.trim();
}

const LINE = path(signature);
const WAVE_A = path((x) => listening(x, 0));
const WAVE_B = path((x) => listening(x, 0.5));
const ease = [0.16, 1, 0.3, 1] as const;

export function NameRite({ departure, name }: { departure: MotionValue<number>; name: string }) {
  const T = NAME_TIMING.duration / 1000;
  const shown = useTransform(
    departure,
    (p) => smooth((p * T) / 0.35) * (1 - smooth((p * T - (T - 0.6)) / 0.6)),
  );
  const lift = useTransform(departure, (p) => -90 * smooth((p * T - 2.55) / 1.0));
  const blur = useTransform(departure, (p) => `blur(${(10 * smooth((p * T - 2.75) / 0.8)).toFixed(2)}px)`);
  const letters = Array.from(name.trim() || "you");

  return (
    <motion.div
      className="absolute inset-0 grid place-items-center overflow-hidden bg-canvas"
      style={{ opacity: shown }}
      data-name-rite
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 55% at 50% 62%, rgb(255 138 98 / 0.18), transparent 70%), radial-gradient(40% 30% at 50% 40%, rgb(255 201 119 / 0.10), transparent 75%)",
        }}
      />
      <motion.div
        className="relative flex w-full flex-col items-center px-6"
        style={{ y: lift, filter: blur }}
      >
        <motion.p
          initial={{ opacity: 0, letterSpacing: "0.5em" }}
          animate={{ opacity: 1, letterSpacing: "0.32em" }}
          transition={{ duration: 1.2, delay: 0.15, ease }}
          className="text-[11px] text-ink-faint uppercase"
        >
          Welcome
        </motion.p>
        <h2 className="marquee mt-5 max-w-[92vw] text-center text-[clamp(3.6rem,11vw,10rem)] leading-[0.9] text-ink">
          {letters.map((ch, i) => (
            <motion.span
              key={i}
              className="inline-block whitespace-pre"
              initial={{ opacity: 0, y: "0.35em", filter: "blur(10px)" }}
              animate={{ opacity: 1, y: "0em", filter: "blur(0px)" }}
              transition={{ duration: 0.9, delay: 0.3 + i * 0.05, ease }}
            >
              {ch}
            </motion.span>
          ))}
          <motion.em
            className="voice text-sunset inline-block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.35 + letters.length * 0.05 }}
          >
            .
          </motion.em>
        </h2>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mt-8 h-auto w-[min(62rem,88vw)] overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="rite-line" x1="0" x2="1">
              <stop offset="0" stopColor="#ff7a59" />
              <stop offset="0.45" stopColor="#ffc977" />
              <stop offset="1" stopColor="#b9a6ff" />
            </linearGradient>
            <filter id="rite-glow" x="-10%" y="-60%" width="120%" height="220%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          {[true, false].map((glow) => (
            <motion.path
              key={String(glow)}
              d={LINE}
              fill="none"
              stroke="url(#rite-line)"
              strokeWidth={glow ? 7 : 2.4}
              strokeLinecap="round"
              filter={glow ? "url(#rite-glow)" : undefined}
              initial={{ pathLength: 0, opacity: 0, d: LINE }}
              animate={{
                pathLength: 1,
                opacity: glow ? 0.55 : 1,
                d: [LINE, LINE, WAVE_A, WAVE_B, WAVE_A, LINE],
              }}
              transition={{
                pathLength: { duration: 1.1, delay: 0.85, ease },
                opacity: { duration: 0.2, delay: 0.85 },
                d: { duration: 3.4, times: [0, 0.55, 0.66, 0.76, 0.86, 1], ease: "easeInOut" },
              }}
            />
          ))}
        </svg>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1.85, ease }}
          className="lede mt-6 text-center text-ink-muted"
        >
          Now, the music you love.
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
