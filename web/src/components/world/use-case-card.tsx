"use client";

import { cn } from "@/lib/cn";
import type { Motif } from "@/lib/use-cases";
import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

/**
 * One listening context, with a small visual that stands for what the listener is
 * after. Five motifs are shared across the eight cards rather than giving each one a
 * bespoke animation, and they only move while the card is hovered, focused or chosen —
 * eight looping animations on one screen would be noise.
 */
export function UseCaseCard({
  title,
  wants,
  motif,
  selected,
  primary,
  onToggle,
  dense = false,
}: {
  title: string;
  wants: string;
  motif: Motif;
  selected: boolean;
  primary: boolean;
  onToggle: () => void;
  /** Seven to a row: a smaller title, and the reason on one line. */
  dense?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "group/use relative flex h-full min-h-0 w-full flex-col items-start overflow-hidden rounded-[1.25rem] text-left transition-[background-color,box-shadow,transform] duration-700 ease-(--ease-out-expo) sm:rounded-[1.5rem]",
        "hover:-translate-y-0.5 focus-visible:outline-offset-4",
        // Chosen is unmistakable: the plate is lit from within, not outlined.
        selected
          ? "bg-umber shadow-[inset_0_0_0_1px_rgb(255_107_61/0.65),0_24px_50px_-28px_rgb(255_107_61/0.75)]"
          : "bg-white/[0.022] shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.045)] hover:bg-white/[0.045]",
      )}
    >
      {/* The light inside a chosen plate. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-700",
          selected ? "opacity-100" : "opacity-0",
        )}
        style={{
          background: "radial-gradient(90% 70% at 50% 28%, rgb(255 122 58 / 0.2), transparent 70%)",
        }}
      />

      <span className="relative flex w-full shrink-0 items-center justify-between px-3 pt-3 sm:px-5 sm:pt-4">
        {primary ? <span className="eyebrow text-[9px] text-ember-soft">Primary</span> : <span />}
        <span
          className={cn(
            "grid size-[1.125rem] shrink-0 place-items-center rounded-full transition-[background-color,box-shadow] duration-300",
            selected ? "bg-ember text-canvas" : "shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]",
          )}
          aria-hidden="true"
        >
          {selected && <Check className="size-3" strokeWidth={3} />}
        </span>
      </span>

      <span
        className={cn(
          "relative grid min-h-8 w-full flex-1 place-items-center overflow-hidden px-3 transition-colors duration-500 sm:px-6",
          selected ? "text-ember-soft" : "text-ink-faint group-hover/use:text-ink-muted",
        )}
      >
        <Visual motif={motif} active={selected} />
      </span>

      <span
        className={cn(
          "relative block w-full shrink-0 px-3 pb-3",
          dense ? "sm:px-4 sm:pb-4" : "sm:px-5 sm:pb-5",
        )}
      >
        <span
          className={cn(
            "block font-display text-[1.0625rem] leading-[1.1] text-ink",
            dense ? "sm:text-[1.2rem]" : "sm:text-[1.5rem]",
          )}
        >
          {title}
        </span>
        {/* Clamped rather than allowed to spill: on a phone the card is only
            as tall as the grid row it was given. */}
        <span
          className={cn(
            "mt-1 line-clamp-1 block text-[10px] leading-snug text-ink-faint sm:mt-1.5",
            dense ? "sm:text-[11px]" : "sm:line-clamp-2 sm:text-[12px]",
          )}
        >
          {wants}
        </span>
      </span>
    </button>
  );
}

const EASE = [0.16, 1, 0.3, 1] as const;

function Visual({ motif, active }: { motif: Motif; active: boolean }) {
  const reduced = useReducedMotion();
  // Movement only on a card that is chosen or under the pointer, and never under
  // reduced motion: the still state of each motif is already distinct.
  const run = active && !reduced;

  if (motif === "rings") {
    return (
      <svg viewBox="0 0 120 56" className="h-full w-full" fill="none" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.ellipse
            key={i}
            cx="60"
            cy="28"
            rx={14 + i * 16}
            ry={7 + i * 8}
            stroke="currentColor"
            strokeWidth="1.1"
            initial={false}
            animate={run ? { opacity: [0.75 - i * 0.18, 0.15, 0.75 - i * 0.18] } : { opacity: 0.7 - i * 0.2 }}
            transition={{ duration: 2.8, delay: i * 0.35, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </svg>
    );
  }

  if (motif === "pulse") {
    return (
      <svg viewBox="0 0 120 56" className="h-full w-full" fill="none" aria-hidden="true">
        <motion.circle
          cx="60"
          cy="28"
          r="11"
          fill="currentColor"
          initial={false}
          animate={run ? { scale: [1, 1.22, 1], opacity: [0.9, 0.6, 0.9] } : { scale: 1, opacity: 0.85 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "60px 28px" }}
        />
        {[20, 30].map((r, i) => (
          <motion.circle
            key={r}
            cx="60"
            cy="28"
            r={r}
            stroke="currentColor"
            strokeWidth="1"
            initial={false}
            animate={run ? { opacity: [0.5, 0.05, 0.5] } : { opacity: 0.25 }}
            transition={{ duration: 1.4, delay: 0.14 + i * 0.14, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: "60px 28px" }}
          />
        ))}
      </svg>
    );
  }

  if (motif === "precision") {
    // A line that reads the same everywhere: nothing lifted, nothing lost.
    return (
      <svg viewBox="0 0 120 56" className="h-full w-full" fill="none" aria-hidden="true">
        <path d="M6 28h108" stroke="currentColor" strokeWidth="1.4" strokeDasharray="1 5" opacity="0.5" />
        <motion.path
          d="M6 28c14 0 14-11 28-11s14 22 28 22 14-16 28-16 14 5 24 5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          initial={false}
          animate={run ? { pathLength: [0.15, 1], opacity: [0.4, 1] } : { pathLength: 1, opacity: 0.8 }}
          transition={{ duration: 2.4, repeat: Infinity, repeatType: "reverse", ease: EASE }}
        />
      </svg>
    );
  }

  if (motif === "position") {
    return (
      <svg viewBox="0 0 120 56" className="h-full w-full" fill="none" aria-hidden="true">
        <circle cx="60" cy="28" r="4" fill="currentColor" opacity="0.9" />
        {[
          [22, 16],
          [98, 20],
          [34, 44],
          [92, 42],
        ].map(([x, y], i) => (
          <motion.g
            key={i}
            initial={false}
            animate={run ? { opacity: [0.2, 1, 0.2] } : { opacity: 0.45 }}
            transition={{ duration: 2.6, delay: i * 0.55, repeat: Infinity, ease: "easeInOut" }}
          >
            <line x1="60" y1="28" x2={x} y2={y} stroke="currentColor" strokeWidth="0.9" />
            <circle cx={x} cy={y} r="2.6" fill="currentColor" />
          </motion.g>
        ))}
      </svg>
    );
  }

  if (motif === "bars") {
    // A small equaliser: a polished mix, every band busy.
    const heights = [16, 30, 22, 40, 28, 18, 34, 24, 14];
    return (
      <svg viewBox="0 0 120 56" className="h-full w-full" fill="none" aria-hidden="true">
        {heights.map((h, i) => (
          <motion.rect
            key={i}
            x={20 + i * 9.5}
            width="4"
            rx="2"
            fill="currentColor"
            initial={false}
            animate={
              run
                ? { y: [28 - h / 2, 28 - h / 3, 28 - h / 2], height: [h, (h * 2) / 3, h] }
                : { y: 28 - h / 2, height: h }
            }
            transition={{
              duration: 0.9 + (i % 3) * 0.18,
              delay: i * 0.06,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            opacity={0.55 + (i % 2) * 0.3}
          />
        ))}
      </svg>
    );
  }

  if (motif === "spike") {
    // A hard-edged wave: attack you can see.
    return (
      <svg viewBox="0 0 120 56" className="h-full w-full" fill="none" aria-hidden="true">
        <motion.path
          d="M6 28h14l5-18 6 36 6-30 5 22 5-14 4 6h10l5-20 6 34 5-26 5 18 4-8h28"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={false}
          animate={run ? { pathLength: [0, 1], opacity: [0.5, 1] } : { pathLength: 1, opacity: 0.8 }}
          transition={{ duration: 1.6, repeat: Infinity, repeatType: "loop", ease: EASE }}
        />
      </svg>
    );
  }

  if (motif === "strings") {
    // Four strings, one of them sounding.
    return (
      <svg viewBox="0 0 120 56" className="h-full w-full" fill="none" aria-hidden="true">
        {[14, 24, 34, 44].map((y, i) => (
          <motion.path
            key={y}
            stroke="currentColor"
            strokeWidth={1.4 - i * 0.2}
            strokeLinecap="round"
            initial={false}
            animate={
              run && i === 1
                ? { d: [`M8 ${y} Q60 ${y - 6} 112 ${y}`, `M8 ${y} Q60 ${y + 6} 112 ${y}`] }
                : { d: `M8 ${y} Q60 ${y} 112 ${y}` }
            }
            transition={{ duration: 0.18, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
            opacity={i === 1 ? 0.95 : 0.45}
          />
        ))}
      </svg>
    );
  }

  // steady: a calm, even line that breathes rather than performs
  return (
    <svg viewBox="0 0 120 56" className="h-full w-full" fill="none" aria-hidden="true">
      <motion.path
        d="M6 28c12 0 12-7 24-7s12 14 24 14 12-10 24-10 12 6 24 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        initial={false}
        animate={run ? { opacity: [0.55, 1, 0.55] } : { opacity: 0.75 }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}
