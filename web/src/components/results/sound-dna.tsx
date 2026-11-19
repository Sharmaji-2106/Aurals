"use client";

import { shapeOf } from "@/components/results/sound-portrait";
import type { SoundProfile } from "@/lib/api/client";
import { BANDS, type BandKey } from "@/lib/bands";
import { cn } from "@/lib/cn";
import { formatSigned } from "@/lib/format";
import { warmSpectral } from "@/lib/grain/palette";
import { logX } from "@/lib/scale";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

/**
 * Sound DNA: the listener's profile at the scale it deserves.
 *
 * The same reading of the stored profile as the Sound Portrait, drawn as a
 * chart you can also enjoy rather than a picture you have to take on trust:
 *
 *   the bright line     the nine-band target (offset_db), on the log-frequency
 *                       axis every other chart in Auralis uses
 *   the strands         fanned across the range the evidence allows
 *                       (low_db to high_db), so the width of the weave *is*
 *                       the uncertainty — to scale, against the marked dB axis
 *   how many strands    `detail`
 *   how it moves        `energy`
 *   the grain on it     1 − `naturalness`
 *   the seed            the profile id, so it is stable across reloads
 *
 * The vertical scale is fitted to the profile and then stated: the gridlines
 * are labelled in dB. A small offset is drawn large because the page is about
 * it, not because it has been exaggerated without saying so.
 */

const POINTS = 240;
const TAU = Math.PI * 2;
/** How far above and below the reference the tallest feature may reach, as a share of the height. */
const REACH = 0.36;

type Curve = SoundProfile["data"]["preference_curve"];

/** Smoothstep through band centres on the log axis, held flat beyond the outer bands. */
function along(curve: Curve, pick: (point: Curve[number]) => number) {
  const xs = curve.map((c) => logX(c.center_hz));
  const vs = curve.map(pick);
  return (t: number) => {
    if (!xs.length) return 0;
    if (t <= xs[0]) return vs[0];
    const last = xs.length - 1;
    if (t >= xs[last]) return vs[last];
    let i = 0;
    while (i < last - 1 && t > xs[i + 1]) i += 1;
    const f = (t - xs[i]) / (xs[i + 1] - xs[i]);
    const e = f * f * (3 - 2 * f);
    return vs[i] + (vs[i + 1] - vs[i]) * e;
  };
}

/** A whole-number step that puts two or three gridlines either side of the reference. */
function stepFor(peak: number) {
  if (peak <= 2.4) return 1;
  if (peak <= 5) return 2;
  if (peak <= 10) return 4;
  return 6;
}

export function SoundDna({ sound, className }: { sound: SoundProfile; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const curve = sound.data.preference_curve;

  // The scale is decided once, from the profile, and shared by the drawing and
  // the labels so the two can never disagree.
  const peak = useMemo(
    () =>
      Math.max(
        1.5,
        ...curve.flatMap((c) => [Math.abs(c.offset_db), Math.abs(c.low_db), Math.abs(c.high_db)]),
      ),
    [curve],
  );
  const step = stepFor(peak);
  const marks = useMemo(() => {
    const out: number[] = [];
    for (let v = step; v <= peak; v += step) out.push(v, -v);
    return out;
  }, [peak, step]);
  const top = (db: number) => `${(0.5 - (db / peak) * REACH) * 100}%`;

  useEffect(() => {
    const el = canvas.current;
    const frameEl = plot.current;
    if (!el || !frameEl) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const shape = shapeOf(sound);
    const line = along(curve, (c) => c.offset_db);
    const low = along(curve, (c) => c.low_db);
    const high = along(curve, (c) => c.high_db);
    const phase = shape.seed * TAU;

    let frame = 0;
    let running = false;
    let onScreen = true;
    let clock = 0;
    let last = performance.now();
    let width = 0;
    let height = 0;
    let x0 = 0;
    let span = 0;
    let ramp: CanvasGradient | null = null;

    const resize = () => {
      const rect = el.getBoundingClientRect();
      const inner = frameEl.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      // The plotted span is the labelled area; the canvas runs past it on both
      // sides so the line arrives from, and leaves into, the edge of the page.
      x0 = inner.left - rect.left;
      span = inner.width;
      el.width = Math.max(1, Math.round(width * dpr));
      el.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ramp = ctx.createLinearGradient(x0, 0, x0 + span, 0);
      for (let g = 0; g <= 10; g += 1) ramp.addColorStop(g / 10, warmSpectral(g / 10));
    };

    const render = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      if (!reduced) clock += (dt / 1000) * shape.motion * 0.2;

      ctx.clearRect(0, 0, width, height);
      if (!width || !height || !ramp) return;

      const mid = height * 0.5;
      const perDb = (height * REACH) / peak;
      const y = (db: number) => mid - db * perDb;
      // t runs past [0, 1] so the tails reach the canvas edge.
      const tMin = -x0 / span;
      const tMax = (width - x0) / span;
      const xAt = (t: number) => x0 + t * span;
      const tAt = (p: number) => tMin + (p / POINTS) * (tMax - tMin);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // What lies between the line and the reference: lift above it, cut below.
      ctx.beginPath();
      ctx.moveTo(xAt(tMin), y(0));
      for (let p = 0; p <= POINTS; p += 1) {
        const t = tAt(p);
        ctx.lineTo(xAt(t), y(line(t)));
      }
      ctx.lineTo(xAt(tMax), y(0));
      ctx.closePath();
      ctx.fillStyle = ramp;
      ctx.globalAlpha = 0.07;
      ctx.fill();

      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = ramp;

      for (let s = 0; s < shape.strands; s += 1) {
        const k = shape.strands === 1 ? 0.5 : s / (shape.strands - 1);
        // 1 at the centre of the weave, 0 at its edges.
        const depth = 1 - Math.abs(k - 0.5) * 2;
        const drift = Math.sin(clock * (0.6 + k * 0.5) + phase + k * 4.2);
        const xs: number[] = [];
        const ys: number[] = [];
        ctx.beginPath();
        for (let p = 0; p <= POINTS; p += 1) {
          const t = tAt(p);
          // Each strand holds its place between the two edges of the range the
          // evidence allows. The sway is a few pixels of life on top of it.
          const value = low(t) + (high(t) - low(t)) * k;
          const sway =
            Math.sin(t * Math.PI * (1.6 + k * 0.9) + drift * 1.5 + phase) * height * 0.011 * (0.4 + depth);
          const texture =
            shape.grain > 0.02
              ? Math.sin(t * 61 + k * 9.1 + phase) * Math.sin(t * 23 - clock) * height * 0.008 * shape.grain
              : 0;
          const px = xAt(t);
          const py = y(value) + sway + texture;
          xs.push(px);
          ys.push(py);
          if (p === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.globalAlpha = 0.03 + depth * 0.05;
        ctx.lineWidth = 9;
        ctx.stroke();
        ctx.beginPath();
        xs.forEach((px, i) => (i ? ctx.lineTo(px, ys[i]) : ctx.moveTo(px, ys[i])));
        ctx.globalAlpha = 0.12 + depth * 0.34;
        ctx.lineWidth = 0.6 + depth * 0.7;
        ctx.stroke();
      }

      // The line itself: a wide soft pass, a tighter one, then the stroke.
      const trace = () => {
        ctx.beginPath();
        for (let p = 0; p <= POINTS; p += 1) {
          const t = tAt(p);
          if (p === 0) ctx.moveTo(xAt(t), y(line(t)));
          else ctx.lineTo(xAt(t), y(line(t)));
        }
      };
      trace();
      ctx.globalAlpha = 0.07;
      ctx.lineWidth = 26;
      ctx.stroke();
      trace();
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      trace();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // One node per band, where the stored value actually sits.
      curve.forEach((point, i) => {
        const t = logX(point.center_hz);
        const cx = xAt(t);
        const cy = y(point.offset_db);
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, TAU);
        ctx.fillStyle = "#08080a";
        ctx.fill();
        ctx.strokeStyle = warmSpectral(curve.length === 1 ? 0.5 : i / (curve.length - 1));
        ctx.lineWidth = 1.75;
        ctx.stroke();
        ctx.strokeStyle = ramp!;
      });
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      render(now);
      if (onScreen && !reduced) frame = requestAnimationFrame(loop);
      else running = false;
    };
    const start = () => {
      if (running || reduced || !onScreen) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };

    resize();
    render(performance.now());
    start();

    const ro = new ResizeObserver(() => {
      resize();
      render(performance.now());
    });
    ro.observe(el);
    ro.observe(frameEl);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      start();
    });
    io.observe(el);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
    };
  }, [sound, curve, peak, reduced]);

  const byBand = useMemo(() => new Map(curve.map((c, i) => [c.band, i])), [curve]);
  const point = active === null ? null : curve[active];
  const activeBand = point ? BANDS.find((b) => b.key === point.band) : undefined;

  const onKeyDown = (event: KeyboardEvent) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta || !curve.length) return;
    event.preventDefault();
    setActive((current) => ((current ?? (delta > 0 ? -1 : 0)) + delta + curve.length) % curve.length);
  };

  return (
    <div className={cn("relative", className)}>
      {/* The canvas bleeds past the labelled plot; the mask lets it dissolve. */}
      <div
        className="absolute inset-0"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 7%, black 93%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 7%, black 93%, transparent)",
        }}
      >
        <canvas
          ref={canvas}
          className="size-full"
          role="img"
          aria-label="Your sound profile: your target in each of nine frequency bands, with the range your evidence allows"
        />
      </div>

      <div className="shell absolute inset-0">
        <div
          ref={plot}
          className="relative size-full outline-none"
          tabIndex={0}
          role="group"
          aria-label="Your target, band by band. Use the left and right arrow keys to step through the bands."
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
        >
          {/* The stated scale. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div
              className="absolute inset-x-0 border-t border-dashed border-white/15"
              style={{ top: top(0) }}
            >
              <span className="numeric absolute -top-5 right-0 text-[10px] tracking-[0.1em] text-ink-muted">
                reference
              </span>
            </div>
            {marks.map((db) => (
              <div
                key={db}
                className="absolute inset-x-0 border-t border-white/[0.045]"
                style={{ top: top(db) }}
              >
                <span className="numeric absolute -top-5 left-0 text-[10px] tracking-[0.1em] text-ink-faint">
                  {db > 0 ? "+" : "−"}
                  {Math.abs(db)} dB
                </span>
              </div>
            ))}
          </div>

          {/* One column per band: the pointer target, and the light it turns on. */}
          {BANDS.map((band) => {
            const index = byBand.get(band.key as BandKey);
            if (index === undefined) return null;
            const left = logX(band.low) * 100;
            const width = (logX(band.high) - logX(band.low)) * 100;
            const on = active === index;
            return (
              <div
                key={band.key}
                className="absolute inset-y-0"
                style={{ left: `${left}%`, width: `${width}%` }}
                onPointerEnter={() => setActive(index)}
                onPointerDown={() => setActive(index)}
              >
                <div
                  className="absolute inset-0 transition-opacity duration-500"
                  style={{
                    opacity: on ? 1 : 0,
                    background: `linear-gradient(180deg, transparent, color-mix(in oklab, ${band.color} 13%, transparent) 50%, transparent)`,
                  }}
                />
              </div>
            );
          })}

          <AnimatePresence>
            {point && activeBand && (
              <motion.div
                key={point.band}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center pb-4"
                style={{
                  left: `clamp(5.5rem, ${logX(point.center_hz) * 100}%, calc(100% - 5.5rem))`,
                  top: top(point.offset_db),
                }}
                aria-live="polite"
              >
                <div className="surface rounded-xl px-4 py-3 text-center whitespace-nowrap backdrop-blur-md">
                  <p className="flex items-center justify-center gap-2 text-[12px] text-ink-muted">
                    <span className="size-1.5 rounded-full" style={{ background: activeBand.color }} />
                    {point.label}
                  </p>
                  <p className="numeric mt-1 text-[1.375rem] leading-none text-ink">
                    {formatSigned(point.offset_db)}
                    <span className="ml-1 text-[11px] text-ink-faint">dB</span>
                  </p>
                  <p className="numeric mt-1.5 text-[10px] tracking-[0.06em] text-ink-faint">
                    range {formatSigned(point.low_db)} to {formatSigned(point.high_db)}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** The nine bands under the drawing, each with the value the line passes through. */
export function DnaBandRow({ sound, className }: { sound: SoundProfile; className?: string }) {
  const values = new Map(sound.data.preference_curve.map((c) => [c.band as string, c.offset_db]));
  return (
    <div className={cn("relative flex w-full", className)} aria-hidden="true">
      {BANDS.map((band) => {
        const width = (logX(band.high) - logX(band.low)) * 100;
        const value = values.get(band.key);
        return (
          <div
            key={band.key}
            className="relative flex min-w-0 flex-col items-center gap-1 pt-3 text-center"
            style={{ width: `${width.toFixed(3)}%` }}
          >
            <span
              className="absolute inset-x-[1px] top-0 h-[3px] rounded-full opacity-70"
              style={{ background: band.color }}
            />
            <span className="hidden truncate text-[11px] text-ink-muted md:block">{band.short}</span>
            {value !== undefined && (
              <span className="numeric hidden text-[11px] text-ink-faint lg:block">
                {formatSigned(value)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** What each property of the drawing is actually reading. */
export function DnaKey({ className }: { className?: string }) {
  const items = [
    ["the line", "your target, band by band"],
    ["the weave", "the range your evidence allows"],
    ["its density", "how much detail you asked for"],
    ["the colour", "frequency: bass warm, air violet"],
  ];
  return (
    <div className={cn("text-[12px] leading-relaxed text-ink-faint", className)}>
      <p className="flex flex-wrap gap-x-1.5 gap-y-0.5">
        {items.map(([name, what], i) => (
          <span key={name}>
            {i > 0 && <span className="mr-1.5 text-ink-faint/50">·</span>}
            <span className="text-ink-muted">{name}</span> {what}
          </span>
        ))}
      </p>
      <p className="mt-1">A drawing of your profile, not a measurement of a sound.</p>
    </div>
  );
}
