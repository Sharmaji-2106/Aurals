"use client";

import { CARD, type Engraving, type Face } from "@/components/card/artwork";
import type { ArtDirection } from "@/components/card/commission";
import { useEffect, useRef } from "react";

/**
 * A flat proof of one face of the card: every stroke, at its width, in the
 * card's own colours. It is how the artwork is reviewed and the lineup test is
 * run before anything is lit or animated — if twelve flat proofs look alike, no
 * camera move will save them.
 */
export function Proof({
  engraving,
  art,
  side,
  time = 1,
  className,
}: {
  engraving: Engraving;
  art: ArtDirection;
  side: "front" | "back";
  /** 0–1: draw only what the laser has reached by then. */
  time?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const scale = 2;
    canvas.width = CARD.w * scale;
    canvas.height = CARD.h * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    draw(ctx, side === "front" ? engraving.front : engraving.back, art, time);
  }, [engraving, art, side, time]);
  return <canvas ref={ref} className={className} style={{ aspectRatio: `${CARD.w} / ${CARD.h}` }} />;
}

function draw(ctx: CanvasRenderingContext2D, face: Face, art: ArtDirection, time: number) {
  ctx.clearRect(0, 0, CARD.w, CARD.h);
  ctx.save();
  roundRect(ctx, 0, 0, CARD.w, CARD.h, CARD.radius);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, 0, CARD.w, CARD.h);
  grad.addColorStop(0, art.palette.base);
  grad.addColorStop(1, shade(art.palette.base, -0.18));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD.w, CARD.h);

  for (const win of face.windows) {
    const sky = ctx.createLinearGradient(0, win.y, 0, win.y + win.h);
    art.hour.sky.forEach((c, i) => sky.addColorStop(i / (art.hour.sky.length - 1), c));
    ctx.fillStyle = sky;
    roundRect(ctx, win.x, win.y, win.w, win.h, win.r);
    ctx.fill();
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const glowy = art.material === "acrylic" || art.material === "glass";
  for (const s of face.strokes) {
    const times = s.times ?? s.points.map(() => 0);
    if (times[0] > time) continue;
    ctx.globalAlpha = 0.55 + 0.45 * s.tone;
    ctx.strokeStyle = glowy ? art.palette.glow : art.palette.cut;
    for (let i = 1; i < s.points.length; i++) {
      if (times[i] > time) break;
      ctx.lineWidth = (s.widths[i - 1] + s.widths[i]) / 2;
      ctx.beginPath();
      ctx.moveTo(s.points[i - 1][0], s.points[i - 1][1]);
      ctx.lineTo(s.points[i][0], s.points[i][1]);
      ctx.stroke();
    }
  }
  // Lettering and dots: filled, foil in the wordmark's gradient.
  const foil = ctx.createLinearGradient(0, 0, CARD.w * 0.7, CARD.h * 0.3);
  foil.addColorStop(0, "#f4a8ba");
  foil.addColorStop(0.5, "#f1b49c");
  foil.addColorStop(1, "#e6c483");
  for (const f of face.fills) {
    if ((f.time ?? 0) > time) continue;
    ctx.globalAlpha = 0.6 + 0.4 * f.tone;
    ctx.fillStyle = f.foil ? foil : glowy ? art.palette.glow : art.palette.cut;
    ctx.beginPath();
    for (const poly of f.polys) {
      ctx.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
      ctx.closePath();
    }
    ctx.fill("nonzero");
  }
  ctx.globalAlpha = 1;
  if (face.stamp && time >= 1) {
    const { x, y, size, modules } = face.stamp;
    const cell = size / modules.length;
    ctx.fillStyle = glowy ? art.palette.glow : art.palette.cut;
    modules.forEach((row, r) =>
      row.forEach((on, c) => {
        if (on) ctx.fillRect(x + c * cell, y + r * cell, cell + 0.2, cell + 0.2);
      }),
    );
  }
  ctx.restore();
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

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(Math.max(0, Math.min(255, v + amount * 255)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r} ${g} ${b})`;
}
