"use client";

import { sampler, shapeOf } from "@/components/results/sound-portrait";
import type { SoundProfile } from "@/lib/api/client";
import { warmSpectral } from "@/lib/grain/palette";
import { portrait } from "@/lib/portrait";
import { Download } from "lucide-react";
import { useState } from "react";

/**
 * The Sound DNA card: the portrait as something you can keep.
 *
 * Drawn offscreen at poster size from the same profile the page reads, so the
 * card and the page can never disagree. It carries the portrait, the words, and
 * the band figures that produced it.
 *
 * What it deliberately leaves out is the listener's music. Track titles, covers
 * and playlist links are private, and this image is made to be shared, so none
 * of that is drawn on it — only the shape that came out the other end.
 */

const W = 1200;
const H = 1500;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw(ctx: CanvasRenderingContext2D, sound: SoundProfile, name: string) {
  const shape = shapeOf(sound);
  const line = sampler(shape.curve);
  const band = sampler(shape.spread);
  const words = portrait(sound.data.dimensions);

  ctx.fillStyle = "#08080a";
  ctx.fillRect(0, 0, W, H);

  // A wash of light behind the portrait, as on the page.
  const wash = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, W * 0.75);
  wash.addColorStop(0, "rgb(255 255 255 / 0.05)");
  wash.addColorStop(1, "rgb(255 255 255 / 0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  const pad = 96;
  const ramp = ctx.createLinearGradient(pad, 0, W - pad, 0);
  for (let g = 0; g <= 8; g += 1) ramp.addColorStop(g / 8, warmSpectral(g / 8));

  // Masthead.
  ctx.fillStyle = "rgb(255 255 255 / 0.5)";
  ctx.font = "500 22px ui-monospace, monospace";
  ctx.letterSpacing = "6px";
  ctx.fillText("AURALS", pad, pad + 20);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "rgb(255 255 255 / 0.95)";
  ctx.font = '600 76px Georgia, "Times New Roman", serif';
  ctx.fillText(`${name}’s sound`, pad, pad + 140);

  // The portrait, drawn at poster scale.
  const top = 400;
  const span = 460;
  const mid = top + span / 2;
  const amp = span * 0.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let s = 0; s < shape.strands; s += 1) {
    const k = shape.strands === 1 ? 0.5 : s / (shape.strands - 1);
    const offset = (k - 0.5) * 2;
    const depth = 1 - Math.abs(offset);
    ctx.beginPath();
    for (let p = 0; p <= 300; p += 1) {
      const t = p / 300;
      const x = pad + t * (W - pad * 2);
      const ridge = line(t) * (amp / 9);
      const haze = band(t) * (amp / 16) * offset * shape.parting;
      const sway =
        Math.sin(t * Math.PI * (1.4 + k * 0.8) + shape.seed * 6.28 + k * 4.2) * amp * 0.07 * (0.3 + depth);
      const y = mid - ridge + haze + sway;
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = ramp;
    ctx.globalAlpha = 0.05 + depth * 0.09;
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.globalAlpha = 0.2 + depth * 0.5;
    ctx.lineWidth = 1.6 + depth * 1.8;
    ctx.stroke();
  }
  // The ridge itself.
  ctx.beginPath();
  for (let p = 0; p <= 300; p += 1) {
    const t = p / 300;
    const x = pad + t * (W - pad * 2);
    const y = mid - line(t) * (amp / 9);
    if (p === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = ramp;
  ctx.globalAlpha = 1;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // The words.
  ctx.font = '400 40px Georgia, "Times New Roman", serif';
  ctx.fillStyle = "rgb(255 255 255 / 0.92)";
  words.slice(0, 3).forEach((w, i) => ctx.fillText(w, pad, 980 + i * 62));

  // The bands that produced it, as a readable strip.
  const stripY = 1180;
  const stripW = (W - pad * 2) / shape.curve.length;
  shape.curve.forEach((db, i) => {
    const t = shape.curve.length === 1 ? 0.5 : i / (shape.curve.length - 1);
    const x = pad + i * stripW;
    // The strip has to be readable as a shape, not a row of dashes: scale the
    // deviation to the space available rather than to a fixed factor.
    const peak = Math.max(1.5, ...shape.curve.map((v) => Math.abs(v)));
    const h = Math.max(8, (Math.abs(db) / peak) * 85);
    ctx.fillStyle = warmSpectral(t);
    ctx.globalAlpha = 0.85;
    roundRect(ctx, x + stripW * 0.2, db >= 0 ? stripY - h : stripY, stripW * 0.6, h, 3);
    ctx.fill();
  });
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = "rgb(255 255 255 / 0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, stripY);
  ctx.lineTo(W - pad, stripY);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.font = "400 20px ui-monospace, monospace";
  ctx.fillStyle = "rgb(255 255 255 / 0.4)";
  ctx.fillText("20 Hz", pad, stripY + 118);
  ctx.textAlign = "right";
  ctx.fillText("20 kHz", W - pad, stripY + 118);
  ctx.textAlign = "left";

  // What it is, and what it is not.
  ctx.font = "400 22px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "rgb(255 255 255 / 0.45)";
  ctx.fillText(
    `Your target relative to the Harman in-ear reference · ${sound.data.model_version}`,
    pad,
    H - pad - 34,
  );
  ctx.fillText("A drawing of a listening profile, not a measurement of a sound.", pad, H - pad);
}

export function DnaCardButton({ sound, name }: { sound: SoundProfile; name: string }) {
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      draw(ctx, sound, name);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aurals-sound-dna-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={save}
      disabled={busy}
      className="flex items-center gap-2 rounded-full border border-hairline-strong px-3 py-1.5 text-[12px] text-ink-faint transition-colors hover:border-white/25 hover:text-ink disabled:opacity-50"
    >
      <Download className="size-3.5" />
      {busy ? "Drawing…" : "Save your Sound DNA card"}
    </button>
  );
}
