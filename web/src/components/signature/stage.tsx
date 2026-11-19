"use client";

/**
 * The Signature Stage: Auralis's recurring visual language.
 *
 * One log-frequency canvas (20 Hz – 20 kHz) on which the product draws the same line in
 * its different lives: song traces, a listening signature, a preference being shaped, a
 * final sound, a measured earphone. Layers are composable children that read the
 * shared scales from context.
 */
import { BANDS, MAX_HZ, MIN_HZ, SPECTRAL_STOPS, type BandKey } from "@/lib/bands";
import { cn } from "@/lib/cn";
import { formatHz } from "@/lib/format";
import { bandPath, linear, logX, smoothPath, type Point } from "@/lib/scale";
import { useElementSize } from "@/lib/use-element-size";
import { motion } from "motion/react";
import { createContext, useContext, useId, useMemo, type ReactNode } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

type Pad = { top: number; right: number; bottom: number; left: number };

export type StageContext = {
  width: number;
  height: number;
  pad: Pad;
  innerW: number;
  innerH: number;
  x: (hz: number) => number;
  y: (v: number) => number;
  hzAt: (px: number) => number;
  ids: { spectral: string; fade: string; fadeMask: string; glow: string };
};

const Ctx = createContext<StageContext | null>(null);

export function useStage() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Stage layers must be rendered inside <SignatureStage>");
  return ctx;
}

export function bandAt(hz: number) {
  return BANDS.find((b) => hz >= b.low && hz < b.high) ?? BANDS[BANDS.length - 1];
}

export function SignatureStage({
  height,
  domain,
  pad: padOverride,
  label,
  className,
  children,
  overlay,
  onPointerBand,
}: {
  height: number | string;
  domain: [number, number];
  pad?: Partial<Pad>;
  label: string;
  className?: string;
  children: ReactNode;
  /** HTML rendered above the SVG with access to the scales (tooltips, labels). */
  overlay?: (ctx: StageContext) => ReactNode;
  onPointerBand?: (band: BandKey | null) => void;
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const raw = useId().replace(/[^a-zA-Z0-9]/g, "");
  const pad = { top: 16, right: 0, bottom: 16, left: 0, ...padOverride };

  const ctx = useMemo<StageContext>(() => {
    const innerW = Math.max(0, size.width - pad.left - pad.right);
    const innerH = Math.max(0, size.height - pad.top - pad.bottom);
    const yScale = linear(domain, [pad.top + innerH, pad.top]);
    return {
      width: size.width,
      height: size.height,
      pad,
      innerW,
      innerH,
      x: (hz) => pad.left + logX(Math.min(MAX_HZ, Math.max(MIN_HZ, hz))) * innerW,
      y: (v) => yScale(Math.min(domain[1], Math.max(domain[0], v))),
      hzAt: (px) => MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, Math.min(1, Math.max(0, (px - pad.left) / innerW))),
      ids: { spectral: `${raw}s`, fade: `${raw}f`, fadeMask: `${raw}m`, glow: `${raw}g` },
    };
    // pad is rebuilt each render from primitives; list them explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, domain[0], domain[1], pad.top, pad.right, pad.bottom, pad.left, raw]);

  return (
    <div
      ref={ref}
      className={cn("relative w-full select-none", className)}
      style={{ height }}
      onPointerMove={
        onPointerBand
          ? (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              onPointerBand(bandAt(ctx.hzAt(e.clientX - rect.left)).key);
            }
          : undefined
      }
      onPointerLeave={onPointerBand ? () => onPointerBand(null) : undefined}
    >
      {size.width > 0 && (
        <>
          <svg
            width={size.width}
            height={size.height}
            role="img"
            aria-label={label}
            className="absolute inset-0 overflow-visible"
          >
            <defs>
              <linearGradient
                id={ctx.ids.spectral}
                gradientUnits="userSpaceOnUse"
                x1={pad.left}
                x2={pad.left + ctx.innerW}
                y1="0"
                y2="0"
              >
                {SPECTRAL_STOPS.map((s) => (
                  <stop key={s.offset} offset={s.offset} stopColor={s.color} />
                ))}
              </linearGradient>
              <linearGradient id={ctx.ids.fade} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="white" stopOpacity="0.32" />
                <stop offset="1" stopColor="white" stopOpacity="0" />
              </linearGradient>
              <mask id={ctx.ids.fadeMask}>
                <rect width={size.width} height={size.height} fill={`url(#${ctx.ids.fade})`} />
              </mask>
              <filter id={ctx.ids.glow} x="-10%" y="-50%" width="120%" height="200%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>
            <Ctx.Provider value={ctx}>{children}</Ctx.Provider>
          </svg>
          {overlay?.(ctx)}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Layers                                                                                */
/* ------------------------------------------------------------------------------------ */

export type Series = { freqs: readonly number[]; values: readonly (number | null)[] };

function toPoints(ctx: StageContext, s: Series): Point[] {
  const pts: Point[] = [];
  s.freqs.forEach((f, i) => {
    const v = s.values[i];
    if (v !== null && v !== undefined && Number.isFinite(v)) pts.push([ctx.x(f), ctx.y(v)]);
  });
  return pts;
}

/** The colour of what the listener said, wherever it is drawn. */
export const SAID_COLOR = "#ff9466";

/** The protagonist: a spectral-gradient line with an optional soft glow. */
export function StageLine({
  series,
  variant = "primary",
  tension = 0.5,
  glow = variant === "primary",
  draw = false,
  opacity = 1,
  width,
  delay = 0,
}: {
  series: Series;
  /**
   * primary: the protagonist (spectral) · ghost: a dashed spectral echo ·
   * measured: dotted ink, a measurement · white: solid ink, the music's suggestion ·
   * said: dashed ember, what the listener told us.
   */
  variant?: "primary" | "ghost" | "measured" | "white" | "said";
  tension?: number;
  glow?: boolean;
  /** Animate the stroke drawing in on mount. */
  draw?: boolean;
  opacity?: number;
  width?: number;
  delay?: number;
}) {
  const ctx = useStage();
  const d = smoothPath(toPoints(ctx, series), tension);
  if (!d) return null;
  const stroke =
    variant === "primary" || variant === "ghost"
      ? `url(#${ctx.ids.spectral})`
      : variant === "measured"
        ? "rgb(238 235 229 / 0.85)"
        : variant === "said"
          ? SAID_COLOR
          : "#eeebe5";
  // The measured response has to hold its own against the spectral target it is
  // drawn over: a sparse 2-5 dot at 1.75 disappeared into the glow. Heavier, with
  // longer dashes, it stays plainly a different kind of line without competing.
  const strokeWidth =
    width ?? (variant === "primary" ? 2.5 : variant === "ghost" ? 1.5 : variant === "measured" ? 2.2 : 1.75);
  const dash =
    variant === "ghost" ? "4 6" : variant === "measured" ? "7 5" : variant === "said" ? "5 5" : undefined;
  const transition = { d: { duration: 1.1, ease: EASE }, opacity: { duration: 0.8, delay } };
  return (
    <g>
      {glow && (
        <motion.path
          initial={{ d, opacity: 0 }}
          animate={{ d, opacity: 0.55 * opacity }}
          transition={transition}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth * 3}
          filter={`url(#${ctx.ids.glow})`}
        />
      )}
      <motion.path
        // pathLength drives stroke-dasharray, so dashed variants fade in instead of drawing.
        initial={draw && !dash ? { d, pathLength: 0, opacity } : { d, opacity: 0 }}
        animate={
          dash ? { d, opacity: variant === "ghost" ? 0.6 * opacity : opacity } : { d, pathLength: 1, opacity }
        }
        transition={{ ...transition, pathLength: { duration: 1.8, ease: EASE, delay } }}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Soft area under a line, fading downwards. */
export function StageArea({
  series,
  tension = 0.5,
  opacity = 1,
}: {
  series: Series;
  tension?: number;
  opacity?: number;
}) {
  const ctx = useStage();
  const pts = toPoints(ctx, series);
  if (pts.length < 2) return null;
  const bottom = ctx.pad.top + ctx.innerH;
  const d = `${smoothPath(pts, tension)}L${pts[pts.length - 1][0]},${bottom}L${pts[0][0]},${bottom}Z`;
  return (
    <motion.path
      initial={{ d, opacity: 0 }}
      animate={{ d, opacity }}
      transition={{ duration: 1.1, ease: EASE }}
      fill={`url(#${ctx.ids.spectral})`}
      mask={`url(#${ctx.ids.fadeMask})`}
    />
  );
}

/** Region between two series: uncertainty, spread, or a change. */
export function StageBand({
  freqs,
  lower,
  upper,
  opacity = 0.16,
  tension = 0.5,
  fill,
}: {
  freqs: readonly number[];
  lower: readonly number[];
  upper: readonly number[];
  opacity?: number;
  tension?: number;
  fill?: string;
}) {
  const ctx = useStage();
  const up: Point[] = [];
  const lo: Point[] = [];
  freqs.forEach((f, i) => {
    if (Number.isFinite(lower[i]) && Number.isFinite(upper[i])) {
      up.push([ctx.x(f), ctx.y(upper[i])]);
      lo.push([ctx.x(f), ctx.y(lower[i])]);
    }
  });
  if (up.length < 2) return null;
  const d = bandPath(up, lo, tension);
  return (
    <motion.path
      initial={{ d, opacity: 0 }}
      animate={{ d, opacity }}
      transition={{ duration: 1.1, ease: EASE }}
      fill={fill ?? `url(#${ctx.ids.spectral})`}
    />
  );
}

/** Many faint traces (songs). Highlighted ids are drawn bright and on top. */
export function StageTraces({
  freqs,
  traces,
  highlight,
  opacity = 0.22,
}: {
  freqs: readonly number[];
  traces: { id: string; values: readonly number[] }[];
  highlight?: string | null;
  opacity?: number;
}) {
  const ctx = useStage();
  const ordered = highlight
    ? [...traces.filter((t) => t.id !== highlight), ...traces.filter((t) => t.id === highlight)]
    : traces;
  return (
    <g>
      {ordered.map((t) => {
        const d = smoothPath(toPoints(ctx, { freqs, values: t.values }), 0.5);
        const hot = t.id === highlight;
        return (
          <motion.path
            key={t.id}
            initial={{ d, opacity: 0 }}
            animate={{ d, opacity: hot ? 1 : highlight ? opacity * 0.5 : opacity }}
            transition={{ opacity: { duration: hot ? 0.2 : 0.9 }, d: { duration: 1.1, ease: EASE } }}
            fill="none"
            stroke={hot ? "#eeebe5" : `url(#${ctx.ids.spectral})`}
            strokeWidth={hot ? 1.75 : 1}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

/** Horizontal reference line (0 dB / neutral). */
export function StageReference({ value = 0, label }: { value?: number; label?: string }) {
  const ctx = useStage();
  const yy = ctx.y(value);
  return (
    <g>
      <line
        x1={ctx.pad.left}
        x2={ctx.pad.left + ctx.innerW}
        y1={yy}
        y2={yy}
        stroke="white"
        strokeOpacity={0.12}
        strokeDasharray="1 5"
      />
      {label && (
        <text
          x={ctx.pad.left + ctx.innerW}
          y={yy - 6}
          textAnchor="end"
          className="numeric fill-ink-muted text-[11px]"
        >
          {label}
        </text>
      )}
    </g>
  );
}

/** Quiet level marks along the left edge, so the vertical scale is stated, not implied. */
export function StageScale({ values, unit = "dB" }: { values: number[]; unit?: string }) {
  const ctx = useStage();
  return (
    <g aria-hidden="true">
      {values.map((v) => {
        const yy = ctx.y(v);
        return (
          <g key={v}>
            <line
              x1={ctx.pad.left}
              x2={ctx.pad.left + ctx.innerW}
              y1={yy}
              y2={yy}
              stroke="white"
              strokeOpacity={0.05}
            />
            <text x={ctx.pad.left + 2} y={yy - 5} className="numeric fill-ink-muted text-[11px]">
              {v > 0 ? "+" : v < 0 ? "−" : ""}
              {Math.abs(v)} {unit}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Band columns: faint separators, with the active band tinted in its own colour. */
export function StageBands({ active }: { active?: BandKey | null }) {
  const ctx = useStage();
  const top = ctx.pad.top;
  const h = ctx.innerH;
  return (
    <g pointerEvents="none">
      {BANDS.map((b, i) => {
        const x0 = ctx.x(b.low);
        const x1 = ctx.x(b.high);
        return (
          <g key={b.key}>
            {i > 0 && <line x1={x0} x2={x0} y1={top} y2={top + h} stroke="white" strokeOpacity={0.045} />}
            <motion.rect
              x={x0}
              y={top}
              width={Math.max(0, x1 - x0)}
              height={2}
              initial={false}
              animate={{ opacity: b.key === active ? 0.9 : 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              fill={b.color}
            />
            <motion.rect
              x={x0}
              y={top}
              width={Math.max(0, x1 - x0)}
              height={h}
              initial={false}
              animate={{ opacity: b.key === active ? 0.1 : 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              fill={b.color}
            />
          </g>
        );
      })}
    </g>
  );
}

/** A veil over everything outside the active band. Render it after the lines. */
export function StageFocus({
  active,
  range,
  strength = 0.6,
  fill = "var(--stage-veil, #08080a)",
}: {
  active?: BandKey | null;
  /** Alternatively, a frequency range [lowHz, highHz] to keep lit. */
  range?: [number, number] | null;
  strength?: number;
  /**
   * The colour of the surface behind the stage, so the veil reads as shade, not
   * as a panel. Defaults to the canvas; a stage set into a darker surface can
   * also set `--stage-veil` on any ancestor, which lets it change by breakpoint.
   */
  fill?: string;
}) {
  const ctx = useStage();
  const band = BANDS.find((b) => b.key === active);
  const span = range ?? (band ? ([band.low, band.high] as [number, number]) : null);
  const left = ctx.pad.left;
  const right = ctx.pad.left + ctx.innerW;
  const x0 = span ? ctx.x(span[0]) : left;
  const x1 = span ? ctx.x(span[1]) : left;
  const y0 = 0;
  const h = ctx.height;
  return (
    <g pointerEvents="none">
      <motion.rect
        y={y0}
        height={h}
        initial={false}
        animate={{ x: left - 2, width: Math.max(0, x0 - left + 2), opacity: span ? strength : 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        fill={fill}
      />
      <motion.rect
        y={y0}
        height={h}
        initial={false}
        animate={{ x: x1, width: Math.max(0, right - x1 + 2), opacity: span ? strength : 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        fill={fill}
      />
    </g>
  );
}

/** Frequency labels along the bottom edge. */
export function StageAxis({ ticks = [20, 100, 1000, 10000, 20000], y }: { ticks?: number[]; y?: number }) {
  const ctx = useStage();
  const yy = y ?? ctx.height - 2;
  // Keep the last tick; drop inner ticks that would collide with their neighbours.
  const shown = ticks.filter((f, i) => {
    if (i === 0 || i === ticks.length - 1) return true;
    const x = ctx.x(f);
    return x - ctx.x(ticks[i - 1]) > 40 && ctx.x(ticks[ticks.length - 1]) - x > 56;
  });
  return (
    <g>
      {shown.map((f, i) => (
        <text
          key={f}
          x={ctx.x(f)}
          y={yy}
          textAnchor={i === 0 ? "start" : i === shown.length - 1 ? "end" : "middle"}
          className="numeric fill-ink-muted text-[11px]"
        >
          {formatHz(f)}
          {i === shown.length - 1 ? " Hz" : ""}
        </text>
      ))}
    </g>
  );
}

/** Dots at given points (e.g. band centres of a preference curve). */
export function StageDots({ series, colors, r = 3.5 }: { series: Series; colors?: string[]; r?: number }) {
  const ctx = useStage();
  return (
    <g>
      {series.freqs.map((f, i) => {
        const v = series.values[i];
        if (v === null || v === undefined) return null;
        const cx = ctx.x(f);
        const cy = ctx.y(v);
        return (
          <motion.circle
            key={f}
            initial={{ cx, cy, r: 0 }}
            animate={{ cx, cy, r }}
            transition={{ duration: 0.9, ease: EASE, r: { delay: 0.3 + i * 0.04 } }}
            fill="#08080a"
            stroke={colors?.[i] ?? "#eeebe5"}
            strokeWidth={1.75}
          />
        );
      })}
    </g>
  );
}
