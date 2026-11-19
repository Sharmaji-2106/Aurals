"use client";

import type { Recommendation } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { warmSpectral } from "@/lib/grain/palette";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * A portrait of an earphone, drawn from the only thing Auralis actually knows
 * about it: its measured frequency response.
 *
 * There are no product photographs in the catalogue — it was built from AutoEq
 * measurement files, and inventing imagery would be inventing the product. What
 * each earphone does have is its own 1/6-octave deviation from the reference
 * target, which is genuinely different for every one of them. So the measurement
 * *is* the portrait: a stack of contours whose width follows the curve, bass at
 * the base and air at the crown, lit from above.
 *
 * Two earphones never look alike here, and nothing in the image is decoration —
 * a bulge at the bottom is real bass lift, a flare at the top is real air.
 */

const RINGS = 42;
const POINTS = 64;
const TAU = Math.PI * 2;

/** Band deviations resampled to a smooth curve the contours can read. */
function curveOf(bands: Recommendation["bands"]) {
  const values = bands.map((b) => b.measured_db ?? 0);
  if (!values.length) return () => 0;
  return (t: number) => {
    const x = Math.min(0.9999, Math.max(0, t)) * (values.length - 1);
    const i = Math.floor(x);
    const f = x - i;
    const a = values[i];
    const b = values[Math.min(values.length - 1, i + 1)];
    // Smoothstep between bands: the measurement is band-limited, so a straight
    // line between centres would imply detail the data does not carry.
    const e = f * f * (3 - 2 * f);
    return a + (b - a) * e;
  };
}

export function IemPortrait({
  recommendation,
  className,
  intensity = 1,
  animate = true,
}: {
  recommendation: Recommendation;
  className?: string;
  /** Lets a collection card sit quieter than the spotlight without changing shape. */
  intensity?: number;
  /**
   * Whether the contours drift.
   *
   * Each portrait keeps its own `requestAnimationFrame` loop, which is right
   * for one hero and wrong for nine of them side by side: the selection rail
   * showed nine at once and spent most of its frame budget redrawing canvases
   * nobody was looking at. Switched off, it draws once and holds — the same
   * picture, at no cost.
   */
  animate?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const bands = recommendation.bands;
  // A stable per-product phase, so the same earphone always looks the same.
  const seedKey = recommendation.slug;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const curve = curveOf(bands);
    let seed = 0;
    for (let i = 0; i < seedKey.length; i += 1) seed = (seed * 31 + seedKey.charCodeAt(i)) % 9973;
    const phase = (seed / 9973) * TAU;

    let frame = 0;
    let running = false;
    let onScreen = true;
    let clock = 0;
    let last = performance.now();
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      el.width = Math.max(1, Math.round(width * dpr));
      el.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const render = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      if (!reduced) clock += dt / 1000;

      ctx.clearRect(0, 0, width, height);
      if (!width || !height) return;

      const cx = width / 2;
      const top = height * 0.1;
      const span = height * 0.8;
      const unit = Math.min(width, height);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 0; i < RINGS; i += 1) {
        // 0 at the base (sub-bass) to 1 at the crown (air).
        const t = i / (RINGS - 1);
        const y = top + span * (1 - t);
        const db = curve(t);

        // The silhouette: a wide body that the measurement pushes in and out.
        const taper = Math.sin(Math.PI * (0.12 + t * 0.82));
        const base = unit * 0.3 * taper;
        const rx = base * (1 + db * 0.055);
        const ry = Math.max(2, unit * 0.045 * taper * (1 + db * 0.03));
        if (rx <= 1) continue;

        ctx.beginPath();
        for (let p = 0; p <= POINTS; p += 1) {
          const a = (p / POINTS) * TAU;
          // A slow breath around the ring, so the object has life without
          // ever misrepresenting the curve it is built from.
          const breath = 1 + 0.035 * Math.sin(a * 2 + phase + clock * 0.35 + t * 3.1);
          const x = cx + Math.cos(a) * rx * breath;
          const yy = y + Math.sin(a) * ry * breath;
          if (p === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.closePath();

        const tint = warmSpectral(t);
        // Lit from above: the crown reads brighter, the base recedes.
        const lift = 0.3 + 0.7 * Math.pow(t, 0.7);
        ctx.strokeStyle = tint;
        ctx.globalAlpha = 0.1 * lift * intensity;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.globalAlpha = (0.3 + 0.45 * lift) * intensity;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // The core: where the body is densest, a soft light behind the contours.
      const glow = ctx.createRadialGradient(cx, top + span * 0.55, 0, cx, top + span * 0.55, unit * 0.42);
      glow.addColorStop(0, `rgb(255 150 90 / ${0.1 * intensity})`);
      glow.addColorStop(1, "rgb(255 150 90 / 0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      render(now);
      if (onScreen && !reduced && animate) frame = requestAnimationFrame(loop);
      else running = false;
    };
    const start = () => {
      if (running || reduced || !onScreen || !animate) return;
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
  }, [bands, seedKey, reduced, intensity, animate]);

  return (
    <canvas
      ref={canvas}
      className={cn("size-full", className)}
      role="img"
      aria-label={`A portrait of the ${recommendation.brand} ${recommendation.model}, drawn from its measured frequency response`}
    />
  );
}
