"use client";

import { dpr } from "@/lib/grain/gl";
import { useMotionValueEvent, type MotionValue } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * An image-sequence film drawn to a canvas, at the position a motion value
 * chooses (0 = first frame, 1 = last). Whatever drives that value — a
 * section's scroll, the whole page's — plays the film: forward, back, paused
 * when it pauses. The two frames either side of the position are cross-faded,
 * so it stays smooth at any speed, and a fast scroll never shows a hole: the
 * nearest frame already loaded stands in until the right one arrives.
 *
 * `src` is a folder holding `manifest.json` and `frames/` (a `portrait`
 * subfolder is preferred on tall screens when there is one). Until a film
 * exists there, `fallback` is drawn instead. `hold` pins the first frame (for
 * reduced motion).
 */

export type FilmManifest = { count: number; width: number; height: number; ext: string; digits: number };

export function FilmCanvas({
  src,
  progress,
  hold = false,
  fallback = null,
  onFilm,
  className = "absolute inset-0 size-full",
}: {
  src: string;
  progress: MotionValue<number>;
  hold?: boolean;
  fallback?: ReactNode;
  /** Told once whether a film was found at `src`. */
  onFilm?: (present: boolean) => void;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [film, setFilm] = useState<{ base: string; manifest: FilmManifest } | null>(null);
  const frames = useRef<(HTMLImageElement | null)[]>([]);
  const pending = useRef(0);

  // Which film, if any: the portrait cut on tall screens when there is one.
  useEffect(() => {
    let live = true;
    const tall = window.innerHeight / window.innerWidth > 1.15;
    const tryLoad = async (base: string) => {
      const res = await fetch(`${base}/manifest.json`, { cache: "force-cache" });
      if (!res.ok) return null;
      return { base, manifest: (await res.json()) as FilmManifest };
    };
    (async () => {
      let chosen: { base: string; manifest: FilmManifest } | null = null;
      try {
        chosen = (tall && (await tryLoad(`${src}/portrait`))) || (await tryLoad(src));
      } catch {
        /* no film yet: the fallback stays */
      }
      if (!live) return;
      setFilm(chosen);
      onFilm?.(Boolean(chosen));
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const draw = (at01: number) => {
    const el = canvas.current;
    if (!el || !film) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const ratio = dpr(2);
    const w = Math.round(el.clientWidth * ratio);
    const h = Math.round(el.clientHeight * ratio);
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    const at = Math.max(0, Math.min(1, at01)) * (film.manifest.count - 1);
    const nearest = (i: number) => {
      for (let d = 0; d < film.manifest.count; d++) {
        const a = frames.current[i - d];
        if (a?.complete && a.naturalWidth) return a;
        const b = frames.current[i + d];
        if (b?.complete && b.naturalWidth) return b;
      }
      return null;
    };
    const a = nearest(Math.floor(at));
    if (!a) return;
    const scale = Math.max(w / a.naturalWidth, h / a.naturalHeight);
    const dw = a.naturalWidth * scale;
    const dh = a.naturalHeight * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    ctx.globalAlpha = 1;
    ctx.drawImage(a, dx, dy, dw, dh);
    const f = at - Math.floor(at);
    const next = frames.current[Math.ceil(at)];
    if (f > 0.02 && next?.complete && next.naturalWidth && next !== a) {
      ctx.globalAlpha = f;
      ctx.drawImage(next, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
    }
  };

  const position = () => (hold ? 0 : progress.get());

  // Load every frame: the ones nearest the current position first, then
  // outward, a few at a time, so a page opened mid-way is not waiting on dawn.
  useEffect(() => {
    if (!film) return;
    const { base, manifest } = film;
    const url = (i: number) =>
      `${base}/frames/${String(i + 1).padStart(manifest.digits, "0")}.${manifest.ext}`;
    frames.current = new Array(manifest.count).fill(null);
    const start = Math.round(position() * (manifest.count - 1));
    const order = Array.from({ length: manifest.count }, (_, i) => i).sort(
      (a, b) => Math.abs(a - start) - Math.abs(b - start) || a - b,
    );
    let cancelled = false;
    let next = 0;
    const load = () => {
      if (cancelled || next >= order.length) return;
      const i = order[next++];
      const img = new Image();
      img.decoding = "async";
      img.src = url(i);
      frames.current[i] = img;
      img.onload = img.onerror = () => {
        if (cancelled) return;
        if (Math.abs(i - position() * (manifest.count - 1)) < 2) draw(position());
        load();
      };
    };
    for (let k = 0; k < 6; k++) load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [film]);

  useMotionValueEvent(progress, "change", () => {
    if (!film || hold) return;
    cancelAnimationFrame(pending.current);
    pending.current = requestAnimationFrame(() => draw(position()));
  });

  useEffect(() => {
    if (!film) return;
    const redraw = () => draw(position());
    redraw();
    window.addEventListener("resize", redraw);
    return () => window.removeEventListener("resize", redraw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [film, hold]);

  return film ? <canvas ref={canvas} aria-hidden="true" className={className} /> : <>{fallback}</>;
}
