"use client";

import { FilmCanvas } from "@/components/landing/film-canvas";
import { LivingStill } from "@/components/landing/living-still";
import { EveningSky } from "@/components/scene/evening-sky";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useState } from "react";

/**
 * The evening the whole landing page is set in.
 *
 * A film the page's scroll plays (`public/film/sea`, rendered in Blender by
 * `design/film/sea/build_sea.py` and finished by `grade.py`): a slow drift
 * over open sea from golden hour, through the sun meeting the water and the
 * afterglow, into a night of stars, a crescent moon and a distant coast
 * lighting up. The top of the page is golden hour; the bottom is night.
 *
 * It sits fixed behind everything. The scroll drives it through a spring, so
 * the light changes like light rather than like a fader. A veil keeps it
 * under the words once the opening has passed, and thins again at night,
 * when the film is dark enough on its own. Until the film exists, the calm
 * drawn sky plays the same hours instead.
 */

/** Piecewise-linear through (xs, ys), clamped at both ends. */
function through(v: number, xs: number[], ys: number[]) {
  if (v <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (v <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (v - xs[i - 1])) / (xs[i] - xs[i - 1]);
  }
  return ys[ys.length - 1];
}

/** The film's first frame, and where its horizon sits (measured: row 651 of 1080). */
const SEA_FIRST = "/film/sea/frames/0001.webp";
const SEA_HORIZON = 651 / 1080;

export function LandingScene() {
  const { scrollYProgress } = useScroll();
  const reduce = useReducedMotion();
  const progress = useSpring(scrollYProgress, { stiffness: 40, damping: 24, mass: 0.8 });
  const p = reduce ? scrollYProgress : progress;
  // Functions, not keyframe ranges, so none is ever handed to the browser's
  // scroll timeline (which mis-maps ranges on a pinned page).
  const hour = useTransform(p, (v) =>
    through(v, [0, 0.2, 0.45, 0.7, 0.9, 1], [0.15, 1.6, 2.6, 3.2, 3.85, 4]),
  );
  const horizon = useTransform(p, (v) => through(v, [0, 0.2, 0.6, 1], [0.34, 0.27, 0.3, 0.22]));
  const veil = useTransform(p, (v) =>
    through(v, [0, 0.12, 0.22, 0.7, 0.88, 1], [0, 0, 0.42, 0.38, 0.18, 0.12]),
  );
  // At rest at the top, the first frame lives (water rolling in, glitter,
  // clouds); the moment the page moves, the film itself takes over.
  const alive = useTransform(p, (v) => 1 - Math.min(1, Math.max(0, v / 0.012)));
  const [resting, setResting] = useState(true);
  useMotionValueEvent(alive, "change", (v) => setResting(v > 0.001));
  // The portrait cut of the film is a different frame: the living still is landscape only.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const check = () => setWide(window.innerHeight / window.innerWidth <= 1.15);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-canvas">
      <FilmCanvas
        src="/film/sea"
        progress={p}
        hold={Boolean(reduce)}
        fallback={<EveningSky hour={hour} horizon={horizon} calm className="absolute inset-0" />}
      />
      {wide && !reduce && (
        <motion.div className="absolute inset-0" style={{ opacity: alive }}>
          <LivingStill src={SEA_FIRST} horizon={SEA_HORIZON} active={resting} />
        </motion.div>
      )}
      <motion.div className="absolute inset-0 bg-canvas" style={{ opacity: veil }} />
    </div>
  );
}
