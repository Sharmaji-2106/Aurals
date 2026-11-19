"use client";

import { BANDS, MAX_HZ, MIN_HZ, mixHex } from "@/lib/bands";
import { BAND_STORIES } from "@/lib/band-stories";
import { cn } from "@/lib/cn";
import { formatHz } from "@/lib/format";
import { AnimatePresence, motion, useReducedMotion, type MotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * One renderer serves both the restrained landing field and its departure. The
 * departure does not swap to another set of strokes: it expands these same seeded
 * spectral strands into a deeper, full-bleed coordinate space.
 */
const LINES = 64;
const POINTS = 128;
const RESTING_LINES = 42;

type Hover = { x: number; y: number; hz: number; band: (typeof BANDS)[number] } | null;

const freqAt = (t: number) => MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/** Smoothstep over a window of the shared departure clock. */
const phase = (value: number, from: number, to: number) => {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

const movingSpectrum = (ctx: CanvasRenderingContext2D, width: number, progress: number) => {
  const gradient = ctx.createLinearGradient(width * 1.2, 0, -width * 0.2, 0);
  const drift = progress * 0.34;
  const sample = (position: number) => {
    const wrapped = ((position % 1) + 1) % 1;
    const scaled = wrapped * (BANDS.length - 1);
    const index = Math.min(BANDS.length - 2, Math.floor(scaled));
    return mixHex(BANDS[index].color, BANDS[index + 1].color, scaled - index);
  };
  for (let stop = 0; stop <= 20; stop += 1) {
    gradient.addColorStop(stop / 20, sample(stop / 20 + drift));
  }
  return gradient;
};

export function SoundField({
  className,
  converge,
  depart,
  interactive = true,
  clearing = true,
}: {
  className?: string;
  converge?: MotionValue<number>;
  depart?: MotionValue<number>;
  interactive?: boolean;
  /**
   * Whether the field opens a quiet area for a headline set over it. The
   * landing page needs one; a field used purely as a backdrop does not.
   */
  clearing?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<Hover>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.closest("section") ?? canvas?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let wide = true;
    let baseGradient: CanvasGradient | null = null;
    let frame = 0;
    let running = false;
    let onScreen = true;
    let visible = true;
    let last = performance.now();
    let clock = 0;
    const pointer = { t: 0.5, strength: 0, target: 0 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      wide = width >= 900;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      baseGradient = ctx.createLinearGradient(0, 0, width, 0);
      BANDS.forEach((band, index) => baseGradient!.addColorStop(1 - index / (BANDS.length - 1), band.color));
    };

    const rand = (index: number, salt = 0) => {
      const value = Math.sin(index * 127.1 + salt * 311.7) * 43_758.5453;
      return value - Math.floor(value);
    };

    // Shared, deterministic material for both the quiet landing field and the
    // departure. Neighboring strands intentionally have related phase and wavelength
    // so they read as one body of sound instead of independent random lines.
    const seeds = Array.from({ length: LINES }, (_, index) => ({
      phase: rand(index + 1, 1) * Math.PI * 2,
      gain: 0.65 + rand(index + 1, 2) * 0.55,
      wavelength: 1.05 + rand(index + 1, 3) * 0.8,
      offset: rand(index + 1, 4) * 2 - 1,
      speed: 0.8 + rand(index + 1, 5) * 0.25,
    }));

    // The landing field's song-like spectrum. Its clock is deliberately slow; the
    // camera and scale, rather than fast oscillation, supply departure momentum.
    const landingShape = (line: number, t: number, flow: number) => {
      const seed = seeds[line];
      let value = 0.24 * Math.exp(-(((t - 0.16) / 0.24) ** 2)) - 0.08 * t;
      for (let peak = 0; peak < 3; peak += 1) {
        const center = 0.1 + peak * 0.27 + 0.05 * Math.sin(flow * 0.16 + peak + seed.phase * 0.1);
        const width = 0.06 + peak * 0.018;
        value += seed.gain * (0.32 - peak * 0.055) * Math.exp(-(((t - center) / width) ** 2));
      }
      return value;
    };

    // The landing composition. `t` here runs from the loud end of the line to the
    // quiet one, so 0 is the right-hand side of the screen.
    //
    // The resonances are spaced down the length rather than stacked at one end:
    // the crest sits inboard of the edge so nothing clips, and the far side keeps
    // a small long-wavelength motion so it reads as calm water, not ruled paper.
    const restingShape = (line: number, t: number, flow: number) => {
      const seed = seeds[line];
      // The body of the field: a wide swell with its crest a little inside the edge.
      let value = 0.5 * Math.exp(-(((t - 0.2) / 0.3) ** 2)) - 0.05 * t;
      const centers = [0.14, 0.33, 0.55];
      const widths = [0.085, 0.1, 0.12];
      const weights = [0.58, 0.44, 0.3];
      for (let peak = 0; peak < 3; peak += 1) {
        const center = centers[peak] + 0.045 * Math.sin(flow * (0.45 + peak * 0.22) + peak * 1.7);
        const pulse = 0.6 + 0.4 * Math.sin(flow * (0.9 + 0.18 * peak) + peak * 2.1 + seed.phase * 0.2);
        value += seed.gain * weights[peak] * pulse * Math.exp(-(((t - center) / widths[peak]) ** 2));
      }
      // The quiet side is never flat: one slow, long wave carries across it.
      value += (0.055 + 0.03 * seed.gain) * Math.sin(t * 3.1 + flow * 0.6 + seed.phase) * phase(t, 0.3, 0.95);
      value += 0.022 * Math.sin(t * 17 + flow * 1.3) * Math.sin(t * 5 - flow * 0.7);
      return value;
    };

    const fieldShape = (line: number, t: number, flow: number, depth: number) => {
      const seed = seeds[line];
      const broad = Math.sin(t * Math.PI * seed.wavelength + flow + seed.phase) * (0.75 + depth * 0.25);
      const swell =
        Math.sin(t * Math.PI * (2.05 + seed.wavelength * 0.3) - flow * 0.72 + seed.phase * 0.35) * 0.24;
      const detail = Math.sin(t * Math.PI * 4.2 + seed.phase * 0.4 - flow * 0.35) * 0.065;
      return (broad + swell + detail) * seed.gain;
    };

    const render = (time: number) => {
      const dt = Math.min(64, time - last);
      last = time;
      // Ambient and departure geometry share this deliberately slow musical clock.
      if (!reduced) clock += (dt / 1000) * 0.2;

      pointer.strength += (pointer.target - pointer.strength) * 0.06;
      const merge = clamp(converge?.get() ?? 0);
      const merged = merge * merge * (3 - 2 * merge);
      const leaving = clamp(depart?.get() ?? 0);
      const awakening = phase(leaving, 0.015, 0.18);
      const push = phase(leaving, 0.08, 0.48);
      const drop = phase(leaving, 0.3, 0.74);
      const clear = phase(leaving, 0.82, 1);
      const gradient = leaving > 0 ? movingSpectrum(ctx, width, leaving) : baseGradient;

      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // The exit is a dissolve, not a wipe. Nothing is clipped and no edge is
      // drawn: each strand simply gives out on its own short stagger while the
      // field keeps travelling, so the scene diffuses into the dark.

      for (let line = 0; line < LINES; line += 1) {
        const seed = seeds[line];
        if (leaving === 0 && line >= RESTING_LINES) continue;
        const restingDepth = line / ((leaving === 0 ? RESTING_LINES : LINES) - 1);
        let depth = restingDepth + push * 0.92;
        depth %= 1;
        const near = Math.pow(depth, 1.22);
        const passing = clamp((depth - 0.84) / 0.16) * phase(leaving, 0.18, 0.78);

        // Quiet landing coordinates. These are the same strands that ease into the
        // full departure field as awakening rises.
        // Eased spacing: the far strands crowd and the near ones open out, which
        // is what gives the stack depth instead of the look of ruled paper.
        const spaced = Math.pow(restingDepth, 1.18);
        const landingBaseY =
          leaving === 0
            ? height * (wide ? 0.2 : 0.3) + spaced * height * (wide ? 0.76 : 0.66)
            : lerp(height * (wide ? 0.28 : 0.4), height * 0.9, Math.pow(restingDepth, 1.28)) +
              phase(merge, 0.15, 1) * height * 0.08;
        const landingSpan =
          leaving === 0 ? width - (1 - restingDepth) * width * 0.12 : wide ? width * 0.96 : width * 1.02;
        const landingX0 =
          leaving === 0
            ? (1 - restingDepth) * width * 0.06
            : width * (wide ? 0.02 : -0.02) - restingDepth * width * 0.08;
        const landingX1 = landingX0 + landingSpan;

        // Overscanned field coordinates. Every layer extends beyond both edges, which
        // prevents malformed endpoints and gives foreground strands room to pass by.
        const span = width * (0.92 + near * 1.45) * (1 + push * 0.75);
        const fieldCenter = width * (0.5 + Math.sin(clock * 0.018 + seed.offset * 0.2) * 0.035);
        const fieldX0 = fieldCenter - span * 0.5;
        const fieldX1 = fieldCenter + span * 0.5;
        const layerBase = height * (0.055 + near * 0.89);
        const layerFall =
          drop * height * (0.05 + near * 0.64) + Math.sin(line * 0.18 + seed.phase) * drop * height * 0.06;
        const amplitude = height * (0.055 + near * 0.095) * seed.gain * (1 + push * 0.5);
        const fieldFlow = clock * 0.035 * seed.speed + seed.phase * 0.1;
        const transitionMix = awakening;
        const xs: number[] = [];
        const ys: number[] = [];

        ctx.beginPath();
        for (let point = 0; point <= POINTS; point += 1) {
          const t = point / POINTS;
          const edge = Math.pow(Math.sin(Math.PI * t), 0.42);
          // The shape is read from the far end of the line: prominent, organic
          // formations on the right, settling into calm lines toward the left.
          const u = 1 - t;
          const landingValue =
            leaving === 0
              ? restingShape(line, u, clock * 0.5 + seed.phase) * (0.3 + 0.7 * (1 - phase(u, 0.1, 0.98))) +
                pointer.strength * 0.7 * restingDepth * Math.exp(-(((t - pointer.t) / 0.05) ** 2))
              : landingShape(line, u, clock * 0.1 + seed.phase);
          const landingX = lerp(landingX0, landingX1, t);
          const landingY =
            landingBaseY -
            Math.max(0, landingValue) *
              (leaving === 0 ? Math.min(190, height * 0.42) : height * 0.18) *
              edge *
              (leaving === 0 ? 0.45 + 0.55 * restingDepth : 1);

          const signal = fieldShape(line, u, fieldFlow, near);
          const broadBend = Math.sin(t * Math.PI) * Math.sin(fieldFlow + seed.phase) * height * 0.035;
          const staggeredBend = Math.sin(t * Math.PI * 2 + seed.phase) * drop * height * 0.075;
          const fieldX =
            lerp(fieldX0, fieldX1, t) + Math.sin(t * Math.PI + seed.phase) * drop * width * 0.045;
          const fieldY =
            layerBase + layerFall + signal * amplitude * (1 + drop * 0.55) + broadBend + staggeredBend;

          const x = lerp(landingX, fieldX, transitionMix);
          const y = lerp(landingY, fieldY, transitionMix);
          xs.push(x);
          ys.push(y);
          if (point === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        // The exit: each strand gives out on its own stagger, nearest first, so
        // the field diffuses rather than fading as one flat sheet.
        const gone = clamp((clear - (1 - near) * 0.45) / 0.55);
        // Lower-alpha under-strokes establish depth without a costly blur filter on
        // every strand. The main stroke uses the exact same sampled coordinates.
        const alpha =
          leaving > 0
            ? Math.min(0.95, 0.16 + near * 0.7 + awakening * 0.16 + push * 0.08) *
              (1 - passing * 0.28) *
              (1 - gone)
            : Math.min(0.9, 0.06 + Math.pow(restingDepth, 2.2) * 0.84) * (1 - 0.9 * merged);
        if (alpha < 0.008) continue;

        ctx.strokeStyle = gradient ?? "#fff";
        ctx.globalAlpha = alpha * 0.13;
        ctx.lineWidth =
          leaving === 0 ? (0.6 + restingDepth * 0.9) * 4.5 : (0.8 + near * 1.9 + passing * 2.4) * 4.5;
        ctx.stroke();
        ctx.beginPath();
        xs.forEach((x, index) => {
          if (index === 0) ctx.moveTo(x, ys[index]);
          else ctx.lineTo(x, ys[index]);
        });
        ctx.globalAlpha = alpha;
        ctx.lineWidth = leaving === 0 ? 0.6 + restingDepth * 0.9 : 0.45 + near * 1.2 + passing * 1.7;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Preserve the quiet landing composition around the headline. The transition
      // veil handles separation after click, so this mask is never used to hide the
      // departure field or create its vertical exit.
      if (leaving === 0 && clearing) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.globalAlpha = 1;
        if (wide) {
          ctx.save();
          ctx.translate(width * 0.12, height * 0.42);
          ctx.scale(1.5, 1);
          const quiet = ctx.createRadialGradient(0, 0, 0, 0, 0, width * 0.3);
          quiet.addColorStop(0, "rgba(0,0,0,0.95)");
          quiet.addColorStop(0.6, "rgba(0,0,0,0.75)");
          quiet.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = quiet;
          ctx.fillRect(-width, -height, width * 2, height * 2);
          ctx.restore();
        } else {
          const quiet = ctx.createLinearGradient(0, 0, 0, height);
          quiet.addColorStop(0, "rgba(0,0,0,1)");
          quiet.addColorStop(0.45, "rgba(0,0,0,0.9)");
          quiet.addColorStop(0.62, "rgba(0,0,0,0)");
          ctx.fillStyle = quiet;
          ctx.fillRect(0, 0, width, height);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
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

    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const t = (event.clientX - rect.left) / rect.width;
      const y = event.clientY - rect.top;
      const inField = t >= 0 && t <= 1 && y >= rect.height * (wide ? 0.3 : 0.55) && y <= rect.height;
      const overText = wide && t < 0.46 && y < rect.height * 0.78;
      if (!inField || overText || event.pointerType !== "mouse") {
        pointer.target = 0;
        setHover(null);
        return;
      }
      pointer.t = t;
      pointer.target = 1;
      const hz = freqAt(1 - t);
      const band =
        BANDS.find((candidate) => hz >= candidate.low && hz < candidate.high) ?? BANDS[BANDS.length - 1];
      setHover({ x: t, y, hz, band });
      if (reduced) render(performance.now());
    };
    const onLeave = () => {
      pointer.target = 0;
      setHover(null);
    };

    resize();
    render(performance.now());
    start();

    const redraw = () => {
      if (reduced || !running) render(performance.now());
    };
    const unsubscribe = [converge?.on("change", redraw), depart?.on("change", redraw)];
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
    if (interactive) {
      host.addEventListener("pointermove", onMove as EventListener);
      host.addEventListener("pointerleave", onLeave);
    }

    return () => {
      cancelAnimationFrame(frame);
      unsubscribe.forEach((off) => off?.());
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (interactive) {
        host.removeEventListener("pointermove", onMove as EventListener);
        host.removeEventListener("pointerleave", onLeave);
      }
    };
  }, [reduced, converge, depart, interactive, clearing]);

  return (
    <div className={cn("pointer-events-none", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden="true" />
      <AnimatePresence>
        {hover && (
          <motion.div
            key="readout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${hover.x * 100}%`, top: Math.max(0, hover.y - 110) }}
          >
            <span className="rounded-full border border-hairline-strong bg-canvas/85 px-3 py-1.5 text-[11px] whitespace-nowrap text-ink backdrop-blur">
              <span className="numeric text-ink-muted">{formatHz(hover.hz)} Hz</span>
              <span
                className="mx-2 inline-block size-1.5 rounded-full align-middle"
                style={{ background: hover.band.color }}
              />
              {hover.band.label}
              <span className="text-ink-faint"> · {BAND_STORIES[hover.band.key].hear}</span>
            </span>
            <span className="h-20 w-px bg-linear-to-b from-white/40 to-transparent" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
