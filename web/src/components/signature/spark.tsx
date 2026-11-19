import { SPECTRAL_STOPS } from "@/lib/bands";
import { cn } from "@/lib/cn";
import { logX, smoothPath, type Point } from "@/lib/scale";
import { useId } from "react";

/** A tiny spectrum: one song's signature, in the same visual language as the stage. */
export function Spark({
  freqs,
  values,
  width = 64,
  height = 20,
  domain = [-32, 14],
  className,
  active = false,
}: {
  freqs: readonly number[];
  values: readonly number[];
  width?: number;
  height?: number;
  domain?: [number, number];
  className?: string;
  active?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const pts: Point[] = freqs
    .map((f, i) => [f, values[i]] as const)
    .filter(([, v]) => Number.isFinite(v))
    .map(([f, v]) => {
      const t = (Math.min(domain[1], Math.max(domain[0], v)) - domain[0]) / (domain[1] - domain[0]);
      return [logX(f) * width, height - 1 - t * (height - 2)] as const;
    });
  return (
    <svg
      width={width}
      height={height}
      className={cn("shrink-0 overflow-visible", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" x2={width} y1="0" y2="0">
          {SPECTRAL_STOPS.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      <path
        d={smoothPath(pts, 0.5)}
        fill="none"
        stroke={active ? "#eeebe5" : `url(#${id})`}
        strokeWidth={active ? 1.5 : 1.25}
        strokeLinecap="round"
        opacity={active ? 1 : 0.85}
      />
    </svg>
  );
}
