"use client";

import { BANDS, MAX_HZ, MIN_HZ, type BandKey } from "@/lib/bands";
import { cn } from "@/lib/cn";
import { useElementSize } from "@/lib/use-element-size";
import { motion } from "motion/react";
import { useRef, type KeyboardEvent, type ReactNode } from "react";

function pos(hz: number) {
  return Math.log(hz / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ);
}

/**
 * The nine bands as a row aligned with a SignatureStage's log axis (full width, no side
 * padding). Works as a tab list when `onSelect` is given.
 */
export function BandRail({
  active,
  onSelect,
  onHover,
  labels = "short",
  render,
  className,
}: {
  active?: BandKey | null;
  onSelect?: (key: BandKey) => void;
  onHover?: (key: BandKey | null) => void;
  labels?: "short" | "none";
  /** Extra content under each band label (values, markers). */
  render?: (key: BandKey) => ReactNode;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [rail, { width: railWidth }] = useElementSize<HTMLDivElement>();
  const interactive = Boolean(onSelect);

  const onKeyDown = (event: KeyboardEvent) => {
    if (!onSelect) return;
    const index = Math.max(
      0,
      BANDS.findIndex((b) => b.key === active),
    );
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + BANDS.length) % BANDS.length;
    onSelect(BANDS[next].key);
    refs.current[next]?.focus();
  };

  return (
    <div
      role={interactive ? "tablist" : undefined}
      aria-label={interactive ? "Frequency bands" : undefined}
      onKeyDown={onKeyDown}
      ref={rail}
      onPointerLeave={onHover ? () => onHover(null) : undefined}
      className={cn("relative flex w-full", className)}
    >
      {BANDS.map((b, i) => {
        const width = (pos(b.high) - pos(b.low)) * 100;
        const isActive = b.key === active;
        // Hide labels that can't fit their segment (narrow rails), except the active one.
        const fits = railWidth === 0 || (width / 100) * railWidth >= b.short.length * 6.2 + 6;
        const content = (
          <>
            <span className="absolute inset-x-[1px] top-0 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ background: b.color }}
                initial={false}
                animate={{ opacity: isActive ? 1 : active ? 0.25 : 0.55 }}
                transition={{ duration: 0.4 }}
              />
            </span>
            {labels === "short" && (fits || isActive) && (
              <span
                className={cn(
                  "truncate px-0.5 text-[10px] transition-colors sm:text-[11px]",
                  isActive ? "text-ink" : "text-ink-faint group-hover:text-ink-muted",
                )}
              >
                {b.short}
              </span>
            )}
            {render?.(b.key)}
          </>
        );
        const shared = {
          style: { width: `${width.toFixed(3)}%` },
          onPointerEnter: onHover ? () => onHover(b.key) : undefined,
          className: cn(
            "group relative flex min-w-0 flex-col items-center pt-3 text-center",
            interactive && "cursor-pointer",
          ),
        };
        return interactive ? (
          <button
            key={b.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={b.label}
            tabIndex={isActive || (!active && i === 0) ? 0 : -1}
            onClick={() => onSelect?.(b.key)}
            {...shared}
          >
            {content}
          </button>
        ) : (
          <div key={b.key} {...shared}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
