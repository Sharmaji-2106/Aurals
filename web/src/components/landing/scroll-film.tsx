"use client";

import { FilmCanvas } from "@/components/landing/film-canvas";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef, useState, type ReactNode } from "react";

/**
 * A section the scroll plays.
 *
 * The section is taller than the screen; while you scroll through it a
 * full-screen stage stays pinned and `children` receive the scroll progress
 * (0–1 through the section) to choreograph the words. With a `src`, a film
 * (`FilmCanvas`) plays behind them with that progress and dissolves over the
 * last stretch into whatever is behind the page; without one — or until it
 * exists — `fallback` is drawn instead, with the same progress. With neither,
 * the stage is transparent: the page's own background shows through.
 *
 * Under reduced motion the section is one screen tall, the film holds its
 * first frame and the words are simply there.
 */
export function ScrollFilm({
  src,
  length = "240vh",
  fallback,
  children,
}: {
  src?: string;
  length?: string;
  fallback?: (progress: MotionValue<number>) => ReactNode;
  children: (progress: MotionValue<number>, film: boolean) => ReactNode;
}) {
  const section = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  // The last stretch dissolves the film into the evening behind the page, so
  // the hand-off is a cross-fade rather than an edge.
  const backdrop = useTransform(scrollYProgress, (p) => 1 - Math.min(1, Math.max(0, (p - 0.84) / 0.16)));
  const [film, setFilm] = useState(false);
  const behind = fallback?.(scrollYProgress) ?? null;

  return (
    <section
      ref={section}
      className="relative"
      style={{ height: reduce ? "100svh" : length }}
      data-scroll-film={film ? "film" : "fallback"}
    >
      <div className="sticky top-0 h-svh overflow-hidden">
        {(src || behind) && (
          <motion.div className="absolute inset-0" style={{ opacity: backdrop }}>
            {src ? (
              <FilmCanvas
                src={src}
                progress={scrollYProgress}
                hold={Boolean(reduce)}
                fallback={behind}
                onFilm={setFilm}
              />
            ) : (
              behind
            )}
          </motion.div>
        )}
        {children(scrollYProgress, film)}
      </div>
    </section>
  );
}
