"use client";

import { TONAL, type Offsets } from "@/components/tuning/adaptive";
import type { TuningPlayer } from "@/components/tuning/player";
import { motion } from "motion/react";
import { useEffect, useId, useRef, type RefObject } from "react";

/**
 * The listening flow's pictures: a sound as one line from deep bass to air, and
 * light that breathes with what is playing.
 */

const W = 600;
const H = 200;
const MID = H / 2;
const PER_DB = 11;

/** A tuning as a smooth path (fixed command count, so paths morph into each other). */
export function curvePath(o: Offsets, perDb = PER_DB, w = W, mid = MID) {
  const pts = TONAL.map((d, i) => [20 + (i / (TONAL.length - 1)) * (w - 40), mid - o[d] * perDb] as const);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Points along a tuning's smooth curve (Catmull-Rom), evenly in x. */
function sample(o: Offsets, per = 8) {
  const pts = TONAL.map((d, i) => [20 + (i / (TONAL.length - 1)) * (W - 40), MID - o[d] * PER_DB]);
  const out: number[][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (k: 0 | 1) =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([at(0), at(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** The band between two tunings (an uncertainty range), as one closed path. */
export function bandPath(lower: Offsets, upper: Offsets) {
  const top = sample(upper);
  const bottom = sample(lower).reverse();
  return (
    [...top, ...bottom].map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") +
    " Z"
  );
}

/** A large live curve: the sound being heard, with the reference dashed beneath. */
export function LiveCurve({
  offsets,
  band,
  className,
  labels = true,
}: {
  offsets: Offsets;
  band?: { lower: Offsets; upper: Offsets } | null;
  className?: string;
  labels?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox={`0 0 ${W} ${H + (labels ? 26 : 0)}`} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-line`} x1="0" x2="1">
          <stop offset="0" stopColor="#ff8a62" />
          <stop offset="0.45" stopColor="#f1d39b" />
          <stop offset="0.75" stopColor="#9fb6ef" />
          <stop offset="1" stopColor="#b9a6ff" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-10%" y="-40%" width="120%" height="180%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <line x1="20" x2={W - 20} y1={MID} y2={MID} stroke="rgb(255 236 222 / 0.22)" strokeDasharray="5 7" />
      {band && (
        <motion.path
          initial={false}
          animate={{ d: bandPath(band.lower, band.upper) }}
          transition={{ type: "spring", stiffness: 70, damping: 18 }}
          fill={`url(#${id}-line)`}
          opacity={0.14}
        />
      )}
      <motion.path
        initial={false}
        animate={{ d: curvePath(offsets) }}
        transition={{ type: "spring", stiffness: 90, damping: 16 }}
        fill="none"
        stroke={`url(#${id}-line)`}
        strokeWidth={10}
        opacity={0.35}
        filter={`url(#${id}-glow)`}
      />
      <motion.path
        initial={false}
        animate={{ d: curvePath(offsets) }}
        transition={{ type: "spring", stiffness: 90, damping: 16 }}
        fill="none"
        stroke={`url(#${id}-line)`}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      {labels && (
        <g
          fill="rgb(255 236 222 / 0.45)"
          fontSize="13"
          letterSpacing="2.4"
          style={{ textTransform: "uppercase" }}
        >
          <text x="20" y={H + 20}>
            BASS
          </text>
          <text x={W / 2} y={H + 20} textAnchor="middle">
            MIDS
          </text>
          <text x={W - 20} y={H + 20} textAnchor="end">
            TREBLE
          </text>
        </g>
      )}
    </svg>
  );
}

/** A small curve for a card. */
export function MiniCurve({ offsets, active }: { offsets: Offsets; active?: boolean }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" aria-hidden="true">
      <line
        x1="20"
        x2={W - 20}
        y1={MID}
        y2={MID}
        stroke="rgb(255 236 222 / 0.18)"
        strokeDasharray="6 9"
        strokeWidth={3}
      />
      <path
        d={curvePath(offsets)}
        fill="none"
        stroke={active ? "#f1d39b" : "rgb(255 236 222 / 0.75)"}
        strokeWidth={active ? 12 : 9}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Writes the playing sound's level (0–1) to a CSS variable on an element, every
 * frame, without re-rendering React: rings and glows read `--level`.
 */
export function useLevel(player: TuningPlayer | null, target: RefObject<HTMLElement | null>, on: boolean) {
  const smooth = useRef(0);
  useEffect(() => {
    if (!player || !on) return;
    const bins = new Uint8Array(new ArrayBuffer(player.analyser.frequencyBinCount));
    let frame = 0;
    const tick = () => {
      const raw = player.playing ? player.level(bins) : 0;
      smooth.current += (Math.min(1, raw * 2.6) - smooth.current) * 0.25;
      target.current?.style.setProperty("--level", smooth.current.toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [player, target, on]);
}
