"use client";

import { LivingStill } from "@/components/landing/living-still";

/**
 * The name page's world: the same sea as the homepage, from where the ascent
 * leaves you — high above it, the sun ahead in its clouds, the glitter far
 * below. The ascent's last frame, alive (`LivingStill`), under a veil that
 * keeps the words readable. The ascent ends on exactly this picture and veil,
 * so arriving here is not a cut.
 */

export const ASCENT_LAST = "/film/ascent/frames/0096.webp";
/** Where the horizon sits in that frame (measured: row 751 of 1080). */
export const ASCENT_HORIZON = 751 / 1080;
/** Darker where the words are (left and low), clear over the sun. */
export const START_VEIL =
  "linear-gradient(90deg, rgb(14 10 20 / 0.82) 0%, rgb(14 10 20 / 0.58) 40%, rgb(14 10 20 / 0.42) 70%, rgb(14 10 20 / 0.5) 100%), linear-gradient(0deg, rgb(14 10 20 / 0.5) 0%, transparent 45%)";

export function StartScene() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-[5] bg-canvas">
      <LivingStill src={ASCENT_LAST} horizon={ASCENT_HORIZON} />
      <div className="absolute inset-0" style={{ background: START_VEIL }} />
    </div>
  );
}
