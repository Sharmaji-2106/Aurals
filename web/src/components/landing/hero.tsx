"use client";

import { Wordmark, wordmarkSeconds } from "@/components/brand/wordmark";
import { useDepart } from "@/components/landing/depart";
import { ScrollFilm } from "@/components/landing/scroll-film";
import { ButtonLink } from "@/components/ui/button";
import { ArrowDown, ArrowRight } from "lucide-react";
import { motion, useTransform, type MotionValue } from "motion/react";

/**
 * The opening, over the first stretch of the page's sea film (`LandingScene`):
 * golden hour on open water, the sun low over its glitter path. The name
 * writes itself over it; as you scroll, the words lift away and one quiet line
 * crosses the middle of the shot while the film drifts on toward sunset. The
 * hero paints no sky of its own — the film behind the whole page shows through.
 */

const WRITE = wordmarkSeconds();
const AFTER = 0.35 + WRITE * 0.72;

const enter = (i: number) => ({
  initial: { opacity: 0, y: 18, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 1.3, delay: AFTER + i * 0.14, ease: [0.16, 1, 0.3, 1] as const },
});

/** 0 before `a`, 1 after `b`, linear between. */
function ramp(p: number, a: number, b: number) {
  return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

function Words({
  progress,
  leaving,
  depart,
}: {
  progress: MotionValue<number>;
  leaving: boolean;
  depart: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  // Written as functions, not keyframe ranges: a range on a scroll value can be
  // handed to the browser's own scroll timeline, which mapped these wrongly
  // (the words faded out, then back in). A function is always computed here.
  const out = useTransform(progress, (p) => 1 - ramp(p, 0.12, 0.3));
  const lift = useTransform(progress, (p) => -80 * ramp(p, 0.08, 0.32));
  const lineIn = useTransform(progress, (p) => ramp(p, 0.4, 0.5) * (1 - ramp(p, 0.66, 0.76)));
  const lineY = useTransform(progress, (p) => 30 - 60 * ramp(p, 0.4, 0.76));
  const cue = useTransform(progress, (p) => 1 - ramp(p, 0, 0.08));

  return (
    <>
      {/* Shade for the words over a bright sky. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 80% at 20% 52%, rgb(11 9 19 / 0.5), rgb(11 9 19 / 0.17) 62%, transparent 88%), radial-gradient(42% 32% at 16% 84%, rgb(11 9 19 / 0.38), transparent 80%), linear-gradient(180deg, rgb(11 9 19 / 0.35), transparent 24%)",
        }}
      />

      <motion.div
        style={{ opacity: out, y: lift }}
        className="shell relative z-10 flex h-full flex-col pt-28 pb-10 sm:pt-[clamp(8rem,18vh,11rem)]"
      >
        <motion.div
          initial={false}
          animate={{
            opacity: leaving ? 0 : 1,
            y: leaving ? -24 : 0,
            filter: leaving ? "blur(6px)" : "blur(0px)",
          }}
          transition={{ duration: 0.55, ease: [0.4, 0, 1, 1] }}
          className="max-w-[44rem]"
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.4, delay: 0.1 }}
            className="eyebrow eyebrow-rule text-ink/70"
          >
            Personal audio intelligence
          </motion.p>
          <h1 className="mt-5">
            <span className="sr-only">AURALS — beyond what you hear.</span>
            <Wordmark
              draw
              delay={0.35}
              title=""
              className="w-[clamp(15rem,38vw,34rem)] text-bone drop-shadow-[0_6px_28px_rgb(11_9_19/0.45)]"
            />
            <motion.span
              aria-hidden="true"
              {...enter(0)}
              className="marquee mt-4 block text-[clamp(2rem,3.6vw,3.4rem)] text-ink"
            >
              Beyond what <em className="voice text-sunset">you hear.</em>
            </motion.span>
          </h1>
          <motion.p {...enter(1)} className="mt-6 max-w-[29rem] text-[16.5px] leading-[1.65] text-ink/80">
            AURALS listens to the music you love, finds the shape of your sound in it, and draws it as a
            single line. Then it finds the earphones that draw the same one.
          </motion.p>
          <motion.div {...enter(2)} className="mt-9 flex flex-wrap items-center gap-x-3 gap-y-4">
            <ButtonLink href="/start" size="lg" onClick={depart}>
              Find my sound <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink
              href="#journey"
              size="lg"
              variant="secondary"
              className="bg-[rgb(11_9_19/0.22)] backdrop-blur-md"
            >
              See how it works
            </ButtonLink>
          </motion.div>
          <motion.p
            {...enter(3)}
            className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink/75 [text-shadow:0_1px_10px_rgb(11_9_19/0.6)]"
          >
            <span>About two minutes</span>
            <span className="size-[3px] rounded-full bg-ink/30" aria-hidden="true" />
            <span>No sign-up</span>
            <span className="size-[3px] rounded-full bg-ink/30" aria-hidden="true" />
            <span>Yours to delete</span>
          </motion.p>
        </motion.div>

        <motion.a
          href="#journey"
          style={{ opacity: cue }}
          className="group mt-auto hidden items-center gap-2 self-start text-[12px] text-ink/60 transition-colors hover:text-ink md:flex"
        >
          <ArrowDown className="size-3.5 transition-transform duration-500 ease-(--ease-out-expo) group-hover:translate-y-0.5" />
          Scroll
        </motion.a>
      </motion.div>

      {/* One line, crossing the middle of the shot — through the sun, so it
          brings its own shade, which comes and goes with it. */}
      <motion.div
        aria-hidden="true"
        style={{
          opacity: lineIn,
          background:
            "radial-gradient(52% 24% at 50% 44%, rgb(11 9 19 / 0.5), rgb(11 9 19 / 0.22) 58%, transparent 82%)",
        }}
        className="pointer-events-none absolute inset-0"
      />
      <motion.p
        aria-hidden="true"
        style={{ opacity: lineIn, y: lineY }}
        className="marquee pointer-events-none absolute inset-x-0 top-[40%] z-10 px-6 text-center text-[clamp(2.2rem,5vw,4.6rem)] text-ink drop-shadow-[0_4px_30px_rgb(11_9_19/0.5)]"
      >
        Every song you love <em className="voice text-sunset">has a shape.</em>
      </motion.p>
    </>
  );
}

export function Hero() {
  const { leaving, depart } = useDepart();

  return (
    <div className="relative -mt-16" data-hour="golden">
      <ScrollFilm length="230vh">
        {(progress) => <Words progress={progress} leaving={leaving} depart={depart} />}
      </ScrollFilm>
    </div>
  );
}
