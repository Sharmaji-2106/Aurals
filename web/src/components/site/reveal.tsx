"use client";

import { cn } from "@/lib/cn";
import { motion, useInView } from "motion/react";
import { Children, useRef, type CSSProperties, type ReactNode } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Fade and rise into view once, as the section scrolls in. */
export function Reveal({
  children,
  delay = 0,
  className,
  y = 24,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 1, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A headline that arrives one line at a time, each rising from behind its own
 * baseline.
 *
 * Every direct child is one line, so the breaks are the author's: a headline
 * broken for its sense, not wherever the viewport happened to wrap it. From a
 * client component a line can be a fragment; from a server component it must
 * be a real element (a `<span>`), because a fragment crossing the server/client
 * boundary arrives flattened and every text run inside it becomes its own line.
 * The
 * motion is CSS, which keeps it running through hydration instead of waiting
 * for it, and the reduced-motion rule in the stylesheet settles it instantly.
 *
 * `onView` holds the lines back until the heading scrolls in; without it they
 * play as the page opens.
 */
export function Lines({
  children,
  delay = 0,
  stagger = 0.09,
  onView = false,
  className,
}: {
  children: ReactNode;
  delay?: number;
  stagger?: number;
  onView?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: "-12% 0px" });
  const play = !onView || seen;
  return (
    <span ref={ref} className={cn("block", className)}>
      {Children.toArray(children).map((line, i) => (
        <span key={i} className="line-mask">
          <span
            style={
              {
                "--line-delay": `${delay + i * stagger}s`,
                animationPlayState: play ? "running" : "paused",
              } as CSSProperties
            }
          >
            {line}
            {/* Lines are blocks, so nothing separates them in the text itself:
                without this, "has a" / "signature" reads as "hasa signature". */}{" "}
          </span>
        </span>
      ))}
    </span>
  );
}

/** A hairline that draws itself from its left edge as it scrolls into view. */
export function DrawnRule({
  className,
  spectral = false,
  delay = 0,
}: {
  className?: string;
  spectral?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      aria-hidden="true"
      className={cn("h-px origin-left", spectral ? "rule-spectral" : "bg-hairline-strong", className)}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 1.6, delay, ease: EASE }}
    />
  );
}
