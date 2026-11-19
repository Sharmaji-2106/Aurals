"use client";

import type { SoundProfile } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { warmSpectral } from "@/lib/grain/palette";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * The Sound Portrait: a listener's profile as a single piece of generated art.
 *
 * Every property of the image is read from the stored profile, so two people
 * never get the same picture and the same person always gets theirs back:
 *
 *   the ridge line      the nine-band preference curve (offset_db)
 *   the band of haze    the 10–90 interval on that curve (high_db − low_db),
 *                       so an uncertain profile is literally less definite
 *   how many strands    `detail`
 *   how far they part   `soundstage`
 *   how hard it moves   `energy`
 *   the grain on it     1 − `naturalness`
 *   the warm/cool axis  frequency, left to right, as everywhere else
 *   the seed            the profile id, so it is stable across reloads
 *
 * Deliberately a landscape: the earphone portraits beside it are objects, and
 * keeping one horizon-like and the other sculptural is what stops the page
 * reading as two of the same picture.
 *
 * It is a drawing of a profile. It is not a measurement of a sound, and the
 * caption beneath it says so.
 */

const POINTS = 220;
const TAU = Math.PI * 2;

export type Shape = {
  curve: number[];
  spread: number[];
  strands: number;
  parting: number;
  motion: number;
  grain: number;
  seed: number;
};

export function shapeOf(sound: SoundProfile): Shape {
  const dims = Object.fromEntries(sound.data.dimensions.map((d) => [d.key, d.value]));
  const pick = (key: string, fallback = 0.5) => dims[key] ?? fallback;
  let seed = 0;
  for (let i = 0; i < sound.id.length; i += 1) seed = (seed * 33 + sound.id.charCodeAt(i)) % 65_521;
  return {
    curve: sound.data.preference_curve.map((c) => c.offset_db),
    spread: sound.data.preference_curve.map((c) => Math.max(0, c.high_db - c.low_db)),
    strands: Math.round(7 + pick("detail") * 13),
    parting: 0.35 + pick("soundstage") * 1.5,
    motion: 0.25 + pick("energy") * 0.9,
    grain: 1 - pick("naturalness"),
    seed: seed / 65_521,
  };
}

/** Smoothstep interpolation along a band curve. */
export function sampler(values: number[]) {
  return (t: number) => {
    if (!values.length) return 0;
    const x = Math.min(0.9999, Math.max(0, t)) * (values.length - 1);
    const i = Math.floor(x);
    const f = x - i;
    const e = f * f * (3 - 2 * f);
    return values[i] + (values[Math.min(values.length - 1, i + 1)] - values[i]) * e;
  };
}

export function SoundPortrait({ sound, className }: { sound: SoundProfile; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const shape = shapeOf(sound);
    const line = sampler(shape.curve);
    const band = sampler(shape.spread);
    const phase = shape.seed * TAU;

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
      if (!reduced) clock += (dt / 1000) * shape.motion * 0.22;

      ctx.clearRect(0, 0, width, height);
      if (!width || !height) return;

      const mid = height * 0.52;
      const amp = height * 0.3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let s = 0; s < shape.strands; s += 1) {
        const k = shape.strands === 1 ? 0.5 : s / (shape.strands - 1);
        // Strands part around the ridge by as much as the soundstage allows.
        const offset = (k - 0.5) * 2;
        const depth = 1 - Math.abs(offset);
        const drift = Math.sin(clock * (0.6 + k * 0.5) + phase + k * 4.2);

        ctx.beginPath();
        const xs: number[] = [];
        const ys: number[] = [];
        for (let p = 0; p <= POINTS; p += 1) {
          const t = p / POINTS;
          const x = width * (0.03 + t * 0.94);
          // The ridge is the preference curve; the haze around it is its own
          // uncertainty, so a profile that rests on little is visibly softer.
          const ridge = line(t) * (amp / 9);
          const haze = band(t) * (amp / 16) * offset * shape.parting;
          const sway =
            Math.sin(t * Math.PI * (1.4 + k * 0.8) + drift * 1.6 + phase) * amp * 0.07 * (0.3 + depth);
          const texture =
            shape.grain > 0.02
              ? Math.sin(t * 61 + k * 9.1 + phase) * Math.sin(t * 23 - clock) * amp * 0.035 * shape.grain
              : 0;
          const y = mid - ridge + haze + sway + texture;
          xs.push(x);
          ys.push(y);
          if (p === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        // Colour follows frequency across the width, as it does everywhere else
        // in Auralis: warm lows on the left, air on the right.
        const ramp = ctx.createLinearGradient(0, 0, width, 0);
        for (let g = 0; g <= 8; g += 1) ramp.addColorStop(g / 8, warmSpectral(g / 8));

        ctx.strokeStyle = ramp;
        ctx.globalAlpha = 0.05 + depth * 0.09;
        ctx.lineWidth = 7;
        ctx.stroke();

        ctx.beginPath();
        xs.forEach((x, i) => (i ? ctx.lineTo(x, ys[i]) : ctx.moveTo(x, ys[i])));
        ctx.globalAlpha = 0.18 + depth * 0.5;
        ctx.lineWidth = 0.7 + depth * 0.9;
        ctx.stroke();
      }

      // The ridge itself, drawn last and brightest: this is the profile's line.
      ctx.beginPath();
      for (let p = 0; p <= POINTS; p += 1) {
        const t = p / POINTS;
        const x = width * (0.03 + t * 0.94);
        const y = mid - line(t) * (amp / 9);
        if (p === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      const ramp = ctx.createLinearGradient(0, 0, width, 0);
      for (let g = 0; g <= 8; g += 1) ramp.addColorStop(g / 8, warmSpectral(g / 8));
      ctx.strokeStyle = ramp;
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 2;
      ctx.stroke();
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
  }, [sound, reduced]);

  return (
    <canvas
      ref={canvas}
      className={cn("size-full", className)}
      role="img"
      aria-label="Your sound profile, drawn as a single generated image"
    />
  );
}

/** What each property of the portrait is actually reading. */
export function PortraitKey({ className }: { className?: string }) {
  const items = [
    ["the ridge", "your target, band by band"],
    ["its softness", "how much your evidence pins it down"],
    ["the strands", "detail and space, from your answers"],
    ["the colour", "frequency: bass warm, air violet"],
  ];
  return (
    <div className={cn("text-[11px] leading-relaxed text-ink-faint", className)}>
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
