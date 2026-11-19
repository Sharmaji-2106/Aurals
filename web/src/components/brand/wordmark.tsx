import { WORDMARK } from "@/components/brand/wordmark-data";
import { cn } from "@/lib/cn";
import { useId, type CSSProperties } from "react";

/**
 * The AURALS wordmark: drawn with a pointed pen, not set in a script font
 * (`design/brand/wordmark.py` holds the pen paths). Hairline upstrokes, full
 * downstrokes, and the tail of the s running back beneath the word as one slow
 * wave — a horizon, and a sound.
 *
 * Finishes:
 * - `ivory`  — the everyday mark, in the page's ink.
 * - `sunset` — foil: sun-gold through coral and flamingo to orchid.
 * - `gold`   — champagne foil, for the keepsakes (the Sound Card, the Edition).
 * - `neon`   — a lit tube, for after dark.
 *
 * With `draw`, it writes itself: each stroke revealed along its own centreline,
 * in the order a hand makes them, at a hand's even speed.
 */

export type WordmarkTone = "ivory" | "sunset" | "gold" | "neon";

const [, , W, H] = WORDMARK.viewBox;

/** Seconds per unit of pen travel: about 600 units a second, as a confident hand. */
const SPEED = 600;

export function Wordmark({
  tone = "ivory",
  draw = false,
  delay = 0,
  speed = SPEED,
  className,
  style,
  title = "AURALS",
}: {
  tone?: WordmarkTone;
  draw?: boolean;
  /** Seconds before the first stroke starts. */
  delay?: number;
  speed?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const paint = tone === "ivory" ? "currentColor" : tone === "neon" ? "#ffe3ec" : `url(#${id}-foil)`;

  let at = delay;
  const timing = WORDMARK.strokes.map((s) => {
    const duration = s.length / speed;
    const start = at;
    at += duration + 0.04;
    return { start, duration };
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
      className={cn("block h-auto overflow-visible", tone === "neon" && "wordmark-neon", className)}
      style={style}
      data-wordmark={tone}
    >
      {title && <title>{title}</title>}
      <defs>
        {tone === "sunset" && (
          <linearGradient id={`${id}-foil`} x1="0" y1="0" x2={W} y2={H * 0.4} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffd391" />
            <stop offset="0.3" stopColor="#ff8a62" />
            <stop offset="0.62" stopColor="#ff5c8a" />
            <stop offset="1" stopColor="#c86be0" />
          </linearGradient>
        )}
        {tone === "gold" && (
          <linearGradient id={`${id}-foil`} x1="0" y1="0" x2={W} y2={H} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f7e6bd" />
            <stop offset="0.35" stopColor="#dcb46c" />
            <stop offset="0.6" stopColor="#f3d79c" />
            <stop offset="1" stopColor="#b98a4b" />
          </linearGradient>
        )}
        {draw &&
          WORDMARK.strokes.map((s, i) => (
            <mask
              key={s.name}
              id={`${id}-m${i}`}
              maskUnits="userSpaceOnUse"
              x="-20"
              y="-20"
              width={W + 40}
              height={H + 40}
            >
              <path
                d={s.centre}
                fill="none"
                stroke="#fff"
                strokeWidth={s.width + 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: 1,
                  animation: `wordmark-draw ${timing[i].duration}s cubic-bezier(0.45, 0.05, 0.4, 1) ${timing[i].start}s forwards`,
                }}
              />
            </mask>
          ))}
      </defs>
      {WORDMARK.strokes.map((s, i) => (
        <path key={s.name} d={s.outline} fill={paint} mask={draw ? `url(#${id}-m${i})` : undefined} />
      ))}
    </svg>
  );
}

/** How long the full write takes, for choreographing what follows it. */
export function wordmarkSeconds(speed = SPEED) {
  return WORDMARK.strokes.reduce((t, s) => t + s.length / speed + 0.04, 0);
}
