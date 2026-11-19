"use client";

import { motion } from "motion/react";
import { useId } from "react";

/**
 * A measured response against the reference target (and the listener's own, when
 * known), on a log-frequency axis. Both are aligned at 500 Hz, as scored.
 */

const W = 640;
const H = 260;
const PAD = { l: 34, r: 12, t: 14, b: 28 };
const DB = 15;

const x = (hz: number) =>
  PAD.l + ((Math.log10(hz) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20))) * (W - PAD.l - PAD.r);
const y = (db: number) => PAD.t + ((DB - Math.max(-DB, Math.min(DB, db))) / (2 * DB)) * (H - PAD.t - PAD.b);

function path(freqs: number[], db: (number | null)[]) {
  let d = "";
  let pen = false;
  freqs.forEach((f, i) => {
    const v = db[i];
    if (v == null || f < 20 || f > 20000) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(f).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
  });
  return d;
}

export function FrChart({
  freqs,
  measured,
  target,
  personal,
}: {
  freqs: number[];
  measured: (number | null)[];
  target: number[];
  personal?: number[] | null;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ticks = [20, 100, 1000, 10000, 20000];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Measured frequency response against the target"
    >
      <defs>
        <linearGradient id={`${id}-m`} x1="0" x2="1">
          <stop offset="0" stopColor="#ff8a62" />
          <stop offset="0.5" stopColor="#f1d39b" />
          <stop offset="1" stopColor="#b9a6ff" />
        </linearGradient>
      </defs>
      {[-10, -5, 0, 5, 10].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="rgb(255 236 222 / 0.07)" />
          <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="rgb(255 236 222 / 0.35)">
            {v > 0 ? `+${v}` : v}
          </text>
        </g>
      ))}
      {ticks.map((t) => (
        <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize="9" fill="rgb(255 236 222 / 0.35)">
          {t >= 1000 ? `${t / 1000}k` : t}
        </text>
      ))}
      <path
        d={path(freqs, target)}
        fill="none"
        stroke="rgb(255 236 222 / 0.38)"
        strokeDasharray="5 5"
        strokeWidth={1.4}
      />
      {personal && (
        <path d={path(freqs, personal)} fill="none" stroke="#f1d39b" strokeOpacity={0.55} strokeWidth={1.6} />
      )}
      <motion.path
        d={path(freqs, measured)}
        fill="none"
        stroke={`url(#${id}-m)`}
        strokeWidth={2.4}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}
