"use client";

import { WORDMARK } from "@/components/brand/wordmark-data";
import { cn } from "@/lib/cn";
import { useInView, useReducedMotion } from "motion/react";
import { useId, useRef } from "react";

/**
 * The wordmark as a neon sign over the city: dark until it is seen, then lit
 * the way a sign shop lights one — a letter at a time. Each letter's tube
 * stutters on, catches, and holds: A, u, r, a, l, s. Last, the long wave
 * beneath the word fills with light from its end, and the whole sign settles
 * into a slow hum.
 *
 * The script is drawn in two pen strokes (`brand/wordmark-data.ts`): the A,
 * and everything after it in one line. A letter is the stretch of a stroke's
 * centreline it occupies (measured from the pen path, as fractions of its
 * length); each is lit through a mask that paints only that stretch.
 */

type Letter = { stroke: number; from: number; to: number };

/** Where each letter lies along its pen stroke, in order of lighting. */
const LETTERS: Letter[] = [
  { stroke: 0, from: 0, to: 1 }, // A
  { stroke: 1, from: 0, to: 0.062 }, // the A's crossbar, lit with it
  { stroke: 1, from: 0.062, to: 0.215 }, // u
  { stroke: 1, from: 0.215, to: 0.3 }, // r
  { stroke: 1, from: 0.3, to: 0.475 }, // a
  { stroke: 1, from: 0.475, to: 0.69 }, // l
  { stroke: 1, from: 0.69, to: 0.8 }, // s
];
/** Which beat each letter lights on (the crossbar shares the A's). */
const BEAT = [0, 0, 1, 2, 3, 4, 5];
const STEP = 0.42; // seconds between letters
const TAIL = { stroke: 1, from: 0.8, to: 1 };

const [, , W, H] = WORDMARK.viewBox;

export function NeonSign({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const tailAt = (BEAT.at(-1)! + 1) * STEP + 0.2;

  const band = (l: Letter) => (
    <path
      d={WORDMARK.strokes[l.stroke].centre}
      fill="none"
      stroke="#fff"
      strokeWidth={WORDMARK.strokes[l.stroke].width + 4}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={1}
      // Only this letter's stretch of the pen line: a dash from `from` to `to`.
      strokeDasharray={`0 ${l.from} ${l.to - l.from} 2`}
    />
  );

  return (
    <div ref={ref} className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="AURALS"
        className="block h-auto w-full overflow-visible"
      >
        <defs>
          {LETTERS.map((l, i) => (
            <mask
              key={i}
              id={`${id}-l${i}`}
              maskUnits="userSpaceOnUse"
              x="-20"
              y="-20"
              width={W + 40}
              height={H + 40}
            >
              {band(l)}
            </mask>
          ))}
          {/* The wave fills from its far end back under the word, like gas reaching the tube's end. */}
          <mask id={`${id}-tail`} maskUnits="userSpaceOnUse" x="-20" y="-20" width={W + 40} height={H + 40}>
            <path
              d={WORDMARK.strokes[TAIL.stroke].centre}
              fill="none"
              stroke="#fff"
              strokeWidth={WORDMARK.strokes[TAIL.stroke].width + 4}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={`0 ${TAIL.from} ${TAIL.to - TAIL.from} 2`}
              className={seen && !reduce ? "neon-tail" : undefined}
              style={
                seen && !reduce
                  ? ({ animationDelay: `${tailAt}s` } as React.CSSProperties)
                  : { opacity: seen ? 1 : 0 }
              }
            />
          </mask>
        </defs>

        {/* The unlit tubes, always there. */}
        {WORDMARK.strokes.map((s) => (
          <path key={s.name} d={s.outline} fill="rgb(255 255 255 / 0.06)" />
        ))}

        {/* Each letter, lit on its beat. */}
        <g className="wordmark-neon">
          {LETTERS.map((l, i) => (
            <g
              key={i}
              mask={`url(#${id}-l${i})`}
              className={cn(seen ? (reduce ? "" : "neon-letter") : "opacity-0")}
              style={seen && !reduce ? { animationDelay: `${BEAT[i] * STEP}s` } : undefined}
            >
              <path d={WORDMARK.strokes[l.stroke].outline} fill="#ffe3ec" />
            </g>
          ))}
          <g mask={`url(#${id}-tail)`} className={seen ? undefined : "opacity-0"}>
            <path d={WORDMARK.strokes[TAIL.stroke].outline} fill="#ffe3ec" />
          </g>
        </g>
      </svg>
      {/* Once every tube is lit, the sign hums: a slow breath of glow. */}
      {seen && !reduce && (
        <div
          aria-hidden="true"
          className="neon-hum pointer-events-none absolute inset-[-8%] rounded-[50%] blur-3xl"
          style={{ animationDelay: `${tailAt + 1.2}s, ${tailAt + 2.4}s` }}
        />
      )}
    </div>
  );
}
