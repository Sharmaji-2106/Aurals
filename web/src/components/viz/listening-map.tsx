"use client";

import { colorForFrequency } from "@/lib/bands";
import { cn } from "@/lib/cn";
import { useElementSize } from "@/lib/use-element-size";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

export type MapPoint = {
  id: string;
  x: number; // brightness, 0-1
  y: number; // energy, 0-1
  title: string;
  subtitle?: string | null;
  cluster?: number;
  muted?: boolean;
};

export const CLUSTER_COLORS = ["#ff7a3a", "#85cfe6", "#f5c678", "#a88cf6", "#86d6ad"];

const PAD = 28;

/** Brightness × energy scatter. 0.5 on each axis is "typical" for the reference corpus. */
export function ListeningMap({
  points,
  height = 340,
  colorBy = "brightness",
  highlight,
  focusId,
  className,
}: {
  points: MapPoint[];
  height?: number;
  colorBy?: "brightness" | "cluster";
  highlight?: number | null;
  focusId?: string | null;
  className?: string;
}) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<MapPoint | null>(null);
  const w = Math.max(0, width - PAD * 2);
  const h = height - PAD * 2;
  const px = (v: number) => PAD + Math.min(1, Math.max(0, v)) * w;
  const py = (v: number) => PAD + (1 - Math.min(1, Math.max(0, v))) * h;
  const colorOf = (p: MapPoint) =>
    colorBy === "cluster" && p.cluster !== undefined
      ? CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length]
      : colorForFrequency(40 * Math.pow(400, p.x));

  return (
    // The tooltip is centred on a clamped point but is wider than the clamp, so
    // it can reach past either end. Clipped horizontally; it never needs to
    // paint outside the stage.
    <div ref={ref} className={cn("relative w-full overflow-x-clip", className)} style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Listening map: each song placed by brightness and energy"
        >
          <rect
            x={PAD}
            y={PAD}
            width={w}
            height={h}
            rx={16}
            fill="white"
            fillOpacity={0.012}
            stroke="white"
            strokeOpacity={0.06}
          />
          {[0.25, 0.5, 0.75].map((t) => (
            <g
              key={t}
              stroke="white"
              strokeOpacity={t === 0.5 ? 0.1 : 0.04}
              strokeDasharray={t === 0.5 ? undefined : "2 5"}
            >
              <line x1={px(t)} x2={px(t)} y1={PAD} y2={PAD + h} />
              <line x1={PAD} x2={PAD + w} y1={py(t)} y2={py(t)} />
            </g>
          ))}
          <text x={PAD + 4} y={PAD + h + 18} className="fill-ink-faint text-[10px]">
            Darker
          </text>
          <text x={PAD + w - 4} y={PAD + h + 18} textAnchor="end" className="fill-ink-faint text-[10px]">
            Brighter
          </text>
          <text
            x={PAD - 10}
            y={PAD + h}
            textAnchor="start"
            transform={`rotate(-90 ${PAD - 10} ${PAD + h})`}
            className="fill-ink-faint text-[10px]"
          >
            Calmer
          </text>
          <text
            x={PAD - 10}
            y={PAD}
            textAnchor="end"
            transform={`rotate(-90 ${PAD - 10} ${PAD})`}
            className="fill-ink-faint text-[10px]"
          >
            More energetic
          </text>

          <AnimatePresence>
            {points.map((p) => {
              const dim =
                p.muted ||
                (highlight != null && p.cluster !== highlight) ||
                (focusId != null && p.id !== focusId);
              const color = colorOf(p);
              return (
                <motion.g
                  key={p.id}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: dim ? 0.25 : 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                >
                  <circle cx={px(p.x)} cy={py(p.y)} r={11} fill={color} opacity={0.12} />
                  <circle
                    cx={px(p.x)}
                    cy={py(p.y)}
                    r={hover?.id === p.id || focusId === p.id ? 6.5 : 4}
                    fill={color}
                    stroke="#08080a"
                    strokeWidth={1.5}
                    className="cursor-pointer transition-[r] duration-200"
                    onPointerEnter={() => setHover(p)}
                    onPointerLeave={() => setHover(null)}
                  />
                </motion.g>
              );
            })}
          </AnimatePresence>
        </svg>
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-60 -translate-x-1/2 -translate-y-full rounded-xl border border-hairline-strong bg-canvas/95 px-3 py-2 text-[12px] shadow-2xl backdrop-blur"
          style={{ left: Math.min(width - 100, Math.max(100, px(hover.x))), top: py(hover.y) - 12 }}
        >
          <p className="line-clamp-2 text-ink">{hover.title}</p>
          {hover.subtitle && <p className="mt-0.5 truncate text-ink-faint">{hover.subtitle}</p>}
          <p className="numeric mt-1.5 text-[10px] text-ink-muted">
            brightness {hover.x.toFixed(2)} · energy {hover.y.toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
}
