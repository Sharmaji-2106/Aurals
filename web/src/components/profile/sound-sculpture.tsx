"use client";

import type { SoundProfile } from "@/lib/api/client";
import { BANDS } from "@/lib/bands";
import { cn } from "@/lib/cn";
import { logX } from "@/lib/scale";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * The Sound DNA: the listener's profile drawn as one twisting ribbon.
 *
 * Every property of it is a function of the profile's real numbers, so two listeners
 * with the same profile get the same sculpture and nobody gets a shape that means
 * nothing:
 *
 * | the ribbon's…    | comes from                                                  |
 * | ---------------- | ----------------------------------------------------------- |
 * | spine            | `preference_curve[].offset_db` — your target, band by band   |
 * | thickness        | `high_db - low_db` — how much the evidence actually pins down |
 * | number of strands| the `detail` dimension                                       |
 * | depth and twist  | the `soundstage` dimension                                   |
 * | sway             | the `energy` dimension                                       |
 * | grain of the sway| the `naturalness` dimension                                  |
 * | colour           | frequency, on the same spectral scale as every other chart   |
 * | phase            | the profile id, so your sculpture is yours                   |
 *
 * It is a drawing of the profile, not a measurement of anything. The curve itself,
 * with its numbers, is directly below it on the page.
 */
const SAMPLES = 180;

type Shape = {
  spine: number[]; // dB offset at each sample
  spread: number[]; // dB width of the credible range at each sample
  strands: number;
  depth: number;
  sway: number;
  grain: number;
  phase: number;
};

function dimension(sound: SoundProfile, key: string) {
  // `value` is a population percentile in [0,1]; 0.5 is the middle of the population.
  return sound.data.dimensions.find((d) => d.key === key)?.value ?? 0.5;
}

/** Linear interpolation of a band curve onto a log-frequency sample grid. */
function resample(points: { center_hz: number; value: number }[]): number[] {
  const xs = points.map((p) => logX(p.center_hz));
  const out: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    let k = 0;
    while (k < xs.length - 2 && xs[k + 1] < t) k++;
    const span = xs[k + 1] - xs[k] || 1;
    const u = Math.min(1, Math.max(0, (t - xs[k]) / span));
    const smooth = u * u * (3 - 2 * u);
    out.push(points[k].value + (points[k + 1].value - points[k].value) * smooth);
  }
  return out;
}

function shapeOf(sound: SoundProfile): Shape {
  const curve = sound.data.preference_curve;
  const spine = resample(curve.map((c) => ({ center_hz: c.center_hz, value: c.offset_db })));
  const spread = resample(
    curve.map((c) => ({ center_hz: c.center_hz, value: Math.max(0.4, c.high_db - c.low_db) })),
  );
  let phase = 0;
  for (const ch of sound.id) phase = (phase * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    spine,
    spread,
    strands: Math.round(14 + dimension(sound, "detail") * 22),
    depth: 0.45 + dimension(sound, "soundstage") * 1.1,
    sway: dimension(sound, "energy"),
    grain: 1 - dimension(sound, "naturalness"),
    phase: (phase % 1000) / 1000,
  };
}

export function SoundSculpture({ sound, className }: { sound: SoundProfile; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { spine, spread, strands, depth, sway, grain, phase } = shapeOf(sound);

    let width = 0;
    let height = 0;
    let gradient: CanvasGradient | null = null;
    let frame = 0;
    let running = false;
    let visible = true;
    let onScreen = true;
    let last = performance.now();
    let clock = 0;
    // The entrance: the ribbon arrives flat and settles into its own shape.
    let settle = reduced ? 1 : 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gradient = ctx.createLinearGradient(0, 0, width, 0);
      BANDS.forEach((b, i) => gradient!.addColorStop(i / (BANDS.length - 1), b.color));
    };

    const render = (time: number) => {
      const dt = Math.min(64, time - last);
      last = time;
      if (!reduced) {
        clock += dt / 1000;
        settle = Math.min(1, settle + dt / 1400);
      }
      const ease = settle * settle * (3 - 2 * settle);

      ctx.clearRect(0, 0, width, height);
      const midY = height * 0.5;
      // 12 dB of offset spans most of the frame; the curve rarely needs more.
      const dbToPx = Math.min(height * 0.05, 14);
      const thickness = height * 0.56 * depth;

      // The spine itself is drawn last and brightest, so the curve the numbers
      // describe stays legible inside the form.
      for (let s = 0; s <= strands; s++) {
        const spineLine = s === strands;
        const u = spineLine ? 0.5 : strands === 1 ? 0.5 : s / (strands - 1);
        const across = u - 0.5;
        ctx.beginPath();
        let front = 0;
        for (let i = 0; i < SAMPLES; i++) {
          const t = i / (SAMPLES - 1);
          // The ribbon turns about its own length, so it shows its face and then
          // its edge; the listener's own phase decides where those turns land.
          const twist = t * Math.PI * 3.4 + phase * Math.PI * 2 + clock * 0.22;
          // Sway: how much the whole ribbon breathes, from the energy dimension.
          const breath = Math.sin(t * 5.2 + clock * (0.5 + sway * 0.7) + phase * 7) * (0.25 + sway * 0.75);
          // Grain: an unsettled, less natural profile gets a finer tremor on top.
          const tremor = Math.sin(t * 29 + clock * 1.7) * grain * 0.3;
          const half = (thickness * (0.35 + (spread[i] / 12) * 0.65)) / 2;
          const y =
            midY -
            spine[i] * dbToPx * ease +
            across * half * Math.cos(twist) * ease +
            (breath + tremor) * height * 0.035 * ease;
          const z = across * Math.sin(twist); // -0.5..0.5, towards or away
          const x = t * width + z * width * 0.022 * depth * ease;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          front += z;
        }
        // Strands at the front of the twist are brighter than those behind it.
        const facing = front / SAMPLES;
        ctx.strokeStyle = gradient ?? "#fff";
        ctx.globalAlpha = spineLine ? 0.95 * ease : (0.06 + 0.62 * (0.5 + facing)) * (0.3 + 0.7 * ease);
        ctx.lineWidth = spineLine ? 2.2 : 0.7 + 0.8 * (0.5 + facing);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const loop = (time: number) => {
      render(time);
      if (visible && !reduced) frame = requestAnimationFrame(loop);
      else running = false;
    };
    const start = () => {
      if (running || reduced || !visible) return;
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
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      visible = onScreen && document.visibilityState === "visible";
      start();
    });
    io.observe(canvas);
    const onVisibility = () => {
      visible = onScreen && document.visibilityState === "visible";
      start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced, sound]);

  return (
    <div className={cn("relative", className)}>
      <canvas
        ref={canvasRef}
        className="h-48 w-full sm:h-60 lg:h-72"
        role="img"
        aria-label={`A ribbon drawn from ${sound.data.summary[0] ?? "your sound profile"}`}
      />
    </div>
  );
}

/** Says, in words, what the shape is made of — and what it is not. */
export function SculptureLegend({ className }: { className?: string }) {
  const rows = [
    ["its line", "your target, band by band"],
    ["its thickness", "how much your evidence pins down"],
    ["its strands and depth", "detail and space, from your answers"],
    ["its colour", "frequency: bass warm, air violet"],
  ];
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <dl className="flex flex-wrap gap-x-6 gap-y-1.5 text-[11px] text-ink-faint">
        {rows.map(([term, meaning]) => (
          <div key={term} className="flex gap-1.5">
            <dt className="text-ink-muted">{term}</dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-ink-faint">
        A drawing of your profile, not a measurement. The numbers behind it are below.
      </p>
    </div>
  );
}
