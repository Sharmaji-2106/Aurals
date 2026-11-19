"use client";

import { useEffect, useRef } from "react";
import { dpr } from "./gl";
import { ARTWORK, cover, rand, spectral } from "./material";
import { Headphones, Listening, useFrame } from "./primitives";
import { clamp, easeInExpo, easeOutExpo, lerp, span, type Sequence } from "./sequence";

/**
 * 02 — CONCENTRIC MOTION
 *
 * Five rings, each with its own radius, rate and phase, drawn as one body rather
 * than five. Covers ride the two middle rings; the outer rings carry only marks,
 * which is what keeps it a composition instead of a planetarium.
 *
 * Canvas, because the scene is dozens of small marks with trails: one draw call
 * per frame beats dozens of composited layers, and the trails are free.
 */

const RINGS = [
  { r: 0.13, turns: 0.9, phase: 0.0, marks: 3, covers: 0, leave: 0.74 },
  { r: 0.21, turns: -0.62, phase: 0.31, marks: 0, covers: 5, leave: 0.68 },
  { r: 0.3, turns: 0.44, phase: 0.14, marks: 0, covers: 4, leave: 0.6 },
  { r: 0.385, turns: -0.3, phase: 0.52, marks: 9, covers: 0, leave: 0.53 },
  { r: 0.465, turns: 0.21, phase: 0.78, marks: 14, covers: 0, leave: 0.47 },
];

const TAU = Math.PI * 2;
const SQUASH = 0.82;

export function ConcentricMotion({ seq }: { seq: Sequence }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const images = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    const loaded = ARTWORK.slice(0, 10).map((art) => {
      const img = new Image();
      img.decoding = "async";
      img.src = cover(art);
      return img;
    });
    images.current = loaded;
    return () => {
      images.current = [];
    };
  }, []);

  useFrame(seq, (t) => {
    const el = canvas.current;
    if (!el) return;
    const ratio = dpr();
    const rect = el.getBoundingClientRect();
    const w = Math.round(rect.width * ratio);
    const h = Math.round(rect.height * ratio);
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    const ctx = el.getContext("2d");
    if (!ctx || !w || !h) return;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const cw = rect.width;
    const ch = rect.height;
    ctx.clearRect(0, 0, cw, ch);

    const unit = Math.min(cw, ch);
    const arrive = span(t, 0.02, 0.22);
    const handoff = span(t, 0.62, 0.8);
    // A slow camera drift gives the layers parallax without moving the frame.
    const driftX = Math.sin(t * 2.1) * unit * 0.012;
    const driftY = Math.cos(t * 1.6) * unit * 0.008;
    const cx = cw / 2 + driftX;
    const cy = ch / 2 + driftY;

    ctx.lineCap = "round";

    RINGS.forEach((ring, index) => {
      const open = span(t, 0.03 + index * 0.035, 0.26 + index * 0.05);
      const dissolve = span(t, ring.leave - 0.16, ring.leave + 0.1);
      const alive = open * (1 - dissolve);
      if (alive < 0.004) return;

      // Parallax: the outer rings move fractionally more than the inner ones.
      const parallax = 1 + index * 0.1;
      const radius = unit * ring.r * (1 + 0.9 * easeOutExpo(dissolve)) * lerp(1.18, 1, easeOutExpo(open));
      const rx = radius * parallax;
      const ry = radius * SQUASH * parallax;
      const angle = (ring.phase + t * ring.turns) * TAU;

      ctx.save();
      ctx.translate(cx + driftX * index * 0.4, cy + driftY * index * 0.4);

      // The path itself: a hairline, brighter where the ring is nearest.
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
      ctx.strokeStyle = spectral(0.12 + index * 0.17);
      ctx.globalAlpha = alive * 0.38;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Marks travelling the path, each trailing the arc it just crossed.
      for (let m = 0; m < ring.marks; m += 1) {
        const at = angle + (m / ring.marks) * TAU;
        const tint = spectral(clamp(0.1 + index * 0.16 + rand(index * 31 + m) * 0.12));
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, at - 0.16, at);
        ctx.strokeStyle = tint;
        ctx.globalAlpha = alive * 0.62;
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(Math.cos(at) * rx, Math.sin(at) * ry, 1.9, 0, TAU);
        ctx.fillStyle = tint;
        ctx.globalAlpha = alive * 0.9;
        ctx.fill();
      }

      // Covers riding the two middle rings.
      const edge = unit * (index === 1 ? 0.082 : 0.064);
      for (let c = 0; c < ring.covers; c += 1) {
        const at = angle + (c / ring.covers) * TAU;
        const img = images.current[(index * 4 + c) % Math.max(1, images.current.length)];
        const depth = 0.88 + 0.16 * Math.sin(at);
        const size = edge * depth;
        const x = Math.cos(at) * rx - size / 2;
        const y = Math.sin(at) * ry - size / 2;
        ctx.globalAlpha = alive * (0.55 + 0.45 * depth);
        if (img?.complete && img.naturalWidth) {
          const crop = Math.min(img.naturalWidth, img.naturalHeight);
          ctx.save();
          ctx.beginPath();
          roundRect(ctx, x, y, size, size, size * 0.2);
          ctx.clip();
          ctx.drawImage(
            img,
            (img.naturalWidth - crop) / 2,
            (img.naturalHeight - crop) / 2,
            crop,
            crop,
            x,
            y,
            size,
            size,
          );
          ctx.restore();
        } else {
          ctx.fillStyle = "#15151a";
          roundRect(ctx, x, y, size, size, size * 0.2);
          ctx.fill();
        }
        ctx.strokeStyle = "rgba(255,255,255,0.14)";
        ctx.lineWidth = 1;
        roundRect(ctx, x, y, size, size, size * 0.2);
        ctx.stroke();
      }
      ctx.restore();
    });

    // The centre: one cover, which the handoff draws down into the silhouette.
    const hero = images.current[0];
    const heroSize = unit * 0.15 * lerp(0.6, 1, easeOutExpo(arrive)) * (1 - 0.5 * easeInExpo(handoff));
    ctx.globalAlpha = arrive * (1 - handoff);
    if (hero?.complete && hero.naturalWidth) {
      const crop = Math.min(hero.naturalWidth, hero.naturalHeight);
      ctx.save();
      roundRect(ctx, cx - heroSize / 2, cy - heroSize / 2, heroSize, heroSize, heroSize * 0.16);
      ctx.clip();
      ctx.drawImage(
        hero,
        (hero.naturalWidth - crop) / 2,
        (hero.naturalHeight - crop) / 2,
        crop,
        crop,
        cx - heroSize / 2,
        cy - heroSize / 2,
        heroSize,
        heroSize,
      );
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  });

  return (
    <div className="absolute inset-0 overflow-hidden">
      <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden="true" />
      <Headphones
        seq={seq}
        variant="rings"
        from={0.68}
        to={0.87}
        className="absolute top-[40%] left-1/2 w-[min(44%,18rem)] -translate-x-1/2 -translate-y-1/2"
      />
      <Listening
        seq={seq}
        variant="lower"
        from={0.85}
        count={ARTWORK.length}
        className="absolute bottom-[15%] left-[8%] pr-8"
      />
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
