"use client";

import { setMuted, setVolume, useVolume } from "@/lib/audio/volume";
import { cn } from "@/lib/cn";
import { Volume, Volume1, Volume2, VolumeX } from "lucide-react";
import { motion } from "motion/react";
import { useRef, type KeyboardEvent, type PointerEvent, type RefObject, type WheelEvent } from "react";

/**
 * Volume, as AURALS draws it.
 *
 * - `VolumeRail`: a tall glass column fixed to the right edge for the listening
 *   session — the fill rises in the sunset's colours, the scale breathes with
 *   the music (`--level`, set by whoever owns the meter), and it answers to
 *   drag, wheel, arrow keys and a tap on the speaker to mute.
 * - `VolumeInline`: the same control laid flat, for a player bar.
 *
 * Both drive the one master volume (`lib/audio/volume`), so a change anywhere
 * is a change everywhere.
 */

function Speaker({ level, muted, className }: { level: number; muted: boolean; className?: string }) {
  const Icon = muted || level < 0.01 ? VolumeX : level < 0.34 ? Volume : level < 0.67 ? Volume1 : Volume2;
  return <Icon className={className} />;
}

function keys(e: KeyboardEvent, level: number) {
  const step = e.shiftKey ? 0.2 : 0.05;
  const to =
    e.key === "ArrowUp" || e.key === "ArrowRight"
      ? level + step
      : e.key === "ArrowDown" || e.key === "ArrowLeft"
        ? level - step
        : e.key === "PageUp"
          ? level + 0.2
          : e.key === "PageDown"
            ? level - 0.2
            : e.key === "Home"
              ? 0
              : e.key === "End"
                ? 1
                : null;
  if (to === null) return;
  e.preventDefault();
  setVolume(to);
}

function useDrag(axis: "x" | "y") {
  const track = useRef<HTMLDivElement>(null);
  const at = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    const v = axis === "y" ? (r.bottom - e.clientY) / r.height : (e.clientX - r.left) / r.width;
    setVolume(v);
  };
  return {
    track,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        at(e);
      },
      onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) at(e);
      },
    },
  };
}

export function VolumeRail({
  meter,
  className,
}: {
  meter?: RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const { level, muted } = useVolume();
  const { track, handlers } = useDrag("y");
  const shown = muted ? 0 : level;
  const pct = Math.round(shown * 100);
  const wheel = (e: WheelEvent) => setVolume(level - Math.sign(e.deltaY) * 0.04);

  return (
    <motion.div
      ref={meter}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "fixed top-1/2 right-4 z-40 flex -translate-y-1/2 flex-col items-center gap-3 rounded-full px-2 pt-4 pb-2 sm:right-6",
        "bg-[linear-gradient(180deg,rgb(255_255_255/0.07),rgb(255_255_255/0.025))] shadow-[inset_0_1px_0_rgb(255_255_255/0.12),inset_0_0_0_1px_rgb(255_255_255/0.08),0_30px_60px_-30px_rgb(0_0_0/0.8)] backdrop-blur-xl",
        className,
      )}
      onWheel={wheel}
      data-volume-rail=""
    >
      <span className="numeric w-9 text-center text-[11px] text-ink-muted tabular-nums">{pct}</span>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={muted ? "Muted" : `${pct}%`}
        onKeyDown={(e) => keys(e, level)}
        {...handlers}
        className="group relative flex h-[min(42vh,17rem)] w-10 cursor-ns-resize touch-none justify-center rounded-full outline-none focus-visible:ring-1 focus-visible:ring-sun/60"
      >
        {/* The scale: nine hairlines that brighten below the level and breathe with the music. */}
        <div className="pointer-events-none absolute inset-y-2 left-0 flex flex-col justify-between">
          {Array.from({ length: 9 }, (_, i) => {
            const v = 1 - i / 8;
            const lit = v <= shown + 1e-6;
            return (
              <span
                key={i}
                className="block h-px rounded-full transition-colors duration-300"
                style={{
                  width: i % 4 === 0 ? 8 : 5,
                  background: lit ? "rgb(255 214 170 / 0.75)" : "rgb(255 255 255 / 0.14)",
                  transform: lit ? `scaleX(calc(1 + var(--level, 0) * ${0.6 + v}))` : undefined,
                  transformOrigin: "left",
                }}
              />
            );
          })}
        </div>
        {/* The channel and its fill. */}
        <div className="relative my-2 w-1.5 overflow-hidden rounded-full bg-white/[0.09]">
          <div
            className="absolute inset-x-0 bottom-0 rounded-full bg-linear-to-t from-flamingo via-coral to-sun transition-[height] duration-150"
            style={{
              height: `${pct}%`,
              boxShadow: "0 0 calc(6px + var(--level, 0) * 22px) rgb(255 138 98 / 0.75)",
            }}
          />
        </div>
        {/* The knob: a lit bead riding the fill. */}
        <span
          className="pointer-events-none absolute left-1/2 size-4 -translate-x-1/2 translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff,#ffe6d2_45%,#f2a07c)] shadow-[0_0_0_3px_rgb(16_11_22/0.9),0_0_calc(10px+var(--level,0)*26px)_rgb(255_170_120/0.8)] transition-[bottom,transform] duration-150 group-active:scale-110"
          style={{ bottom: `calc(0.5rem + (100% - 1rem) * ${shown})` }}
        />
      </div>
      <button
        type="button"
        onClick={() => setMuted(!muted)}
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        className="grid size-9 place-items-center rounded-full text-ink-muted transition-colors hover:bg-white/[0.07] hover:text-ink"
      >
        <Speaker level={level} muted={muted} className="size-4" />
      </button>
    </motion.div>
  );
}

export function VolumeInline({ className }: { className?: string }) {
  const { level, muted } = useVolume();
  const { track, handlers } = useDrag("x");
  const shown = muted ? 0 : level;
  const pct = Math.round(shown * 100);
  return (
    <div className={cn("flex items-center gap-2", className)} data-volume-inline="">
      <button
        type="button"
        onClick={() => setMuted(!muted)}
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        className="grid size-8 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-white/[0.07] hover:text-ink"
      >
        <Speaker level={level} muted={muted} className="size-4" />
      </button>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={muted ? "Muted" : `${pct}%`}
        onKeyDown={(e) => keys(e, level)}
        onWheel={(e) => setVolume(level - Math.sign(e.deltaY) * 0.04)}
        {...handlers}
        className="group relative flex h-6 w-24 cursor-ew-resize touch-none items-center outline-none focus-visible:ring-1 focus-visible:ring-sun/60"
      >
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/[0.12]">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-flamingo via-coral to-sun"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span
          className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff,#ffe6d2_45%,#f2a07c)] shadow-[0_0_0_2px_rgb(16_11_22/0.9)] transition-transform group-active:scale-125"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}
