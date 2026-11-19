"use client";

import { Logo } from "@/components/brand/logo";
import { hourStyle, LIGHT, type HourName } from "@/components/scene/hours";
import { BANDS } from "@/lib/bands";
import { cn } from "@/lib/cn";
import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The journey, in the product's own words: music becomes a signal, then a sound.
 *
 * Four stages, not six. Preferences and listening context are one stage — the
 * rail does not advance between `/tune` and `/world`, because answering
 * questions and saying where you listen are the same piece of work — and the
 * sound profile is no longer a destination of its own: it arrives beside the
 * matches it explains.
 */
export const FLOW_STEPS = [
  { key: "music", label: "Music" },
  { key: "analysis", label: "Signal" },
  { key: "tune", label: "Preferences" },
  { key: "match", label: "Your sound" },
] as const;

export type FlowStep = "start" | "world" | (typeof FLOW_STEPS)[number]["key"];

/**
 * The hour each step is held at: the evening moves on as the journey does.
 * You begin at golden hour and meet your sound after dark.
 */
const STEP_HOUR: Record<FlowStep, HourName> = {
  start: "golden",
  music: "sunset",
  analysis: "dusk",
  tune: "blue",
  world: "blue",
  match: "night",
};

export function FlowShell({
  step,
  children,
  aside,
  wide = false,
  fit = false,
  bleed = false,
}: {
  step: FlowStep;
  /** Kept for hosts that compose their own scene; the site's afterglow is global now. */
  scene?: boolean;
  children: ReactNode;
  aside?: ReactNode;
  wide?: boolean;
  /**
   * The page must fit the viewport exactly and own its own internal layout.
   * Without this the shell guarantees a scrollbar: `min-h-dvh` plus an in-flow
   * header and the main's own padding always add up to more than one screen.
   */
  fit?: boolean;
  /**
   * The page composes its own width and padding. Used by pages whose sections
   * need to run edge to edge; they place their content with `.shell`.
   */
  bleed?: boolean;
}) {
  // `/world` belongs to the preferences stage, so the rail holds there.
  const resolved = step === "world" ? "tune" : step;
  const index = FLOW_STEPS.findIndex((s) => s.key === resolved);
  // "start" is before the first named step, but the journey has begun, so the rule
  // shows a sliver rather than nothing.
  const progress = index < 0 ? 0.05 : (index + 1) / FLOW_STEPS.length;
  const hour = STEP_HOUR[step];
  return (
    <div
      className={cn("flex flex-col", fit ? "h-dvh overflow-hidden" : "min-h-dvh")}
      style={hourStyle(hour) as React.CSSProperties}
      data-hour={hour}
    >
      <header className="sticky top-0 z-40 bg-canvas/55 backdrop-blur-2xl backdrop-saturate-150">
        <div className="shell flex h-16 items-center justify-between gap-6">
          <Logo />
          {/* The journey as a numbered index. The stage you are on is the only
              one in full ink; what is behind you stays legible, what is ahead
              recedes. */}
          <ol className="hidden items-center lg:flex" aria-label="Progress">
            {FLOW_STEPS.map((s, i) => (
              <li key={s.key} className="flex items-center">
                <span
                  className={cn(
                    "relative flex items-baseline gap-2 px-3 py-2 font-marquee text-[13px] font-semibold tracking-[0.14em] uppercase transition-colors duration-700",
                    i === index ? "text-ink" : i < index ? "text-ink-muted" : "text-ink-faint/80",
                  )}
                  aria-current={i === index ? "step" : undefined}
                >
                  <span
                    className={cn(
                      "numeric text-[10px] tracking-[0.14em] transition-colors duration-700",
                      i === index ? "text-(--hour-accent)" : "text-ink-faint",
                    )}
                  >
                    0{i + 1}
                  </span>
                  {s.label}
                  {i === index && (
                    <motion.span
                      layoutId="flow-step-mark"
                      className="absolute inset-x-3 -bottom-px h-px bg-(--hour-accent) shadow-[0_0_10px_var(--hour-accent)]"
                      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                </span>
                {i < FLOW_STEPS.length - 1 && (
                  <span
                    className={cn(
                      "h-px w-6 transition-colors duration-700",
                      i < index ? "bg-white/25" : "bg-white/8",
                    )}
                  />
                )}
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-4">
            {index >= 0 && (
              <span className="flex items-baseline gap-2 text-[12px] text-ink-muted lg:hidden">
                <span className="numeric text-[10px] tracking-[0.14em] text-(--hour-accent)">
                  0{index + 1}
                  <span className="text-ink-faint">/0{FLOW_STEPS.length}</span>
                </span>
                {FLOW_STEPS[index].label}
              </span>
            )}
            {aside ?? (
              <Link
                href="/"
                className="link-draw pb-0.5 text-[13px] text-ink-faint transition-colors hover:text-ink"
              >
                Exit
              </Link>
            )}
          </div>
        </div>
        {/* The journey as a horizon: the light runs from the gold of the first
            step to this step's hour, and a small sun travels along it. */}
        <div className="relative h-px overflow-x-clip bg-hairline" title={LIGHT[hour].label}>
          <motion.div
            className="relative h-px"
            style={{ background: "linear-gradient(90deg, #ffc977, #ff7a59 40%, var(--hour-accent))" }}
            initial={false}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <span
              aria-hidden="true"
              className="absolute top-1/2 right-0 size-[7px] translate-x-1/2 -translate-y-1/2 rounded-full bg-(--hour-accent)"
              style={{ boxShadow: "0 0 10px 2px var(--hour-accent), 0 0 24px 6px rgb(255 122 89 / 0.35)" }}
            />
          </motion.div>
        </div>
      </header>
      <main
        className={cn(
          "flex w-full flex-1 flex-col",
          !bleed && "mx-auto px-5 sm:px-10",
          !bleed && (fit ? "min-h-0 pt-5 pb-5 sm:pt-7 sm:pb-7" : "pt-10 pb-24 sm:pt-14"),
          !bleed && (wide ? "max-w-[88rem]" : "max-w-3xl"),
          bleed && fit && "min-h-0",
        )}
      >
        {children}
      </main>
    </div>
  );
}

/**
 * Centered, quiet loading state for flow pages: the nine bands, breathing as a
 * slow wave rather than bouncing as a meter.
 */
export function FlowLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="grid flex-1 place-items-center py-24" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-7">
        <div className="flex h-12 items-center gap-[5px]" aria-hidden="true">
          {BANDS.map((band, i) => (
            <span
              key={band.key}
              className="w-[3px] origin-center rounded-full"
              style={{
                height: "100%",
                background: band.color,
                animation: `eq-bar 1.5s ${i * 0.11}s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate`,
              }}
            />
          ))}
        </div>
        <span className="eyebrow">{label}</span>
      </div>
    </div>
  );
}
